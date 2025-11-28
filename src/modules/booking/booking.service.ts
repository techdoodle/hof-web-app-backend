import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection, In } from 'typeorm';
import { BookingEntity } from './booking.entity';
import { BookingSlotEntity, BookingSlotStatus } from './booking-slot.entity';
import { SlotLockService } from './slot-lock.service';
import {
    BookingStatus,
    PaymentStatus,
    CreateBookingDto,
    CancelBookingDto,
    InitiatePaymentDto,
    PaymentCallbackDto,
    RefundStatus,
    VerifySlotsDto
} from '../../common/types/booking.types';
import { RefundService } from '../payment/refund.service';
import { RazorpayService } from '../payment/razorpay.service';
import { PaymentService } from '../payment/payment.service';
import { BookingUserService } from './booking-user.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/interfaces/notification.interface';
import { generateBookingReference } from 'src/common/utils/reference.util';
import { User } from '../user/user.entity';
import { SlotAvailabilityMonitorService } from '../waitlist/slot-availability-monitor.service';
import { MatchParticipant } from '../match-participants/match-participants.entity';
import { Match } from '../matches/matches.entity';
import { PromoCodesService } from '../promo-codes/promo-codes.service';

@Injectable()
export class BookingService {
    private readonly logger = new Logger(BookingService.name);

    /**
     * Normalize phone numbers to a consistent 10-digit format so that
     * team mappings and player lookups don't break due to formatting differences.
     */
    private normalizePhone(raw: string | null | undefined): string {
        if (!raw) return '';
        let digits = String(raw).replace(/\D/g, '');
        // If exactly 10 digits, assume it's a local mobile number
        if (digits.length === 10) return digits;
        // If starts with 91 and 12 digits, strip country code
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        // Fallback: keep last 10 digits if longer
        if (digits.length > 10) return digits.slice(-10);
        return digits;
    }

    constructor(
        @InjectRepository(BookingEntity)
        private bookingRepository: Repository<BookingEntity>,
        @InjectRepository(BookingSlotEntity)
        private bookingSlotRepository: Repository<BookingSlotEntity>,
        @InjectRepository(MatchParticipant)
        private matchParticipantRepository: Repository<MatchParticipant>,
        @InjectRepository(Match)
        private matchRepository: Repository<Match>,
        private connection: Connection,
        private slotLockService: SlotLockService,
        private refundService: RefundService,
        private razorpayService: RazorpayService,
        private paymentService: PaymentService,
        private bookingUserService: BookingUserService,
        private notificationService: NotificationService,
        @Inject(forwardRef(() => SlotAvailabilityMonitorService))
        private slotAvailabilityMonitor: SlotAvailabilityMonitorService,
        @Inject(forwardRef(() => PromoCodesService))
        private promoCodesService: PromoCodesService,
    ) { }

    async createBooking(dto: CreateBookingDto, tokenUser?: any): Promise<BookingEntity> {
        // Validate input
        this.logger.log(`[createBooking] received dto: matchId=${dto.matchId}, userId=${dto.userId}, totalSlots=${dto.totalSlots}, slotNumbers=${JSON.stringify(dto.slotNumbers)}`);
        if (!Array.isArray(dto.slotNumbers)) {
            this.logger.warn('[createBooking] slotNumbers is not an array');
        }
        if (!dto.slotNumbers?.length) {
            throw new BadRequestException('No slots selected');
        }

        if (dto.slotNumbers.length !== dto.totalSlots) {
            throw new BadRequestException('Slot count mismatch');
        }

        // Ensure player details provided for each slot
        if (!Array.isArray(dto.players) || dto.players.length !== dto.totalSlots) {
            throw new BadRequestException('Player details are required for each slot');
        }

        // Ensure slot numbers are unique
        const uniqueCount = new Set(dto.slotNumbers).size;
        if (uniqueCount !== dto.slotNumbers.length) {
            throw new BadRequestException('Duplicate slot numbers provided');
        }

        // Validate team selections for confirmed bookings (not waitlist)
        if (!dto.isWaitlist) {
            // Fetch match details to get team names
            const matchResult = await this.connection.query(
                `SELECT team_a_name, team_b_name, player_capacity FROM matches WHERE match_id = $1`,
                [Number(dto.matchId)]
            );

            if (!matchResult.length) {
                throw new BadRequestException('Match not found');
            }

            const match = matchResult[0];
            const validTeamNames = [match.team_a_name, match.team_b_name];

            // Ensure each player has a team selection
            for (let i = 0; i < dto.players.length; i++) {
                const player = dto.players[i];
                if (!player.teamName) {
                    throw new BadRequestException(`Team selection is required for player ${i + 1}`);
                }

                if (!validTeamNames.includes(player.teamName)) {
                    throw new BadRequestException(
                        `Invalid team name "${player.teamName}" for player ${i + 1}. Must be either "${match.team_a_name}" or "${match.team_b_name}"`
                    );
                }
            }

            // Check team capacity limits
            const perTeamCapacity = Math.floor(match.player_capacity / 2);

            // Get current team counts from match_participants
            const teamCountsResult = await this.connection.query(
                `SELECT team_name, COUNT(*) as count
                 FROM match_participants
                 WHERE match_id = $1 AND team_name IN ($2, $3)
                 GROUP BY team_name`,
                [Number(dto.matchId), match.team_a_name, match.team_b_name]
            );

            const currentTeamACount = teamCountsResult.find(t => t.team_name === match.team_a_name)?.count || 0;
            const currentTeamBCount = teamCountsResult.find(t => t.team_name === match.team_b_name)?.count || 0;

            // Count how many slots are being requested for each team
            const requestedTeamACount = dto.players.filter(p => p.teamName === match.team_a_name).length;
            const requestedTeamBCount = dto.players.filter(p => p.teamName === match.team_b_name).length;

            // Validate capacity for each team
            if (parseInt(currentTeamACount) + requestedTeamACount > perTeamCapacity) {
                throw new BadRequestException(
                    `Team "${match.team_a_name}" capacity exceeded. Available slots: ${perTeamCapacity - parseInt(currentTeamACount)}`
                );
            }

            if (parseInt(currentTeamBCount) + requestedTeamBCount > perTeamCapacity) {
                throw new BadRequestException(
                    `Team "${match.team_b_name}" capacity exceeded. Available slots: ${perTeamCapacity - parseInt(currentTeamBCount)}`
                );
            }
        }


        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // CRITICAL: Lock the match row first to prevent race conditions
            const matchLock = await queryRunner.query(
                `SELECT match_id, player_capacity, booked_slots, locked_slots 
                 FROM matches 
                 WHERE match_id = $1 
                 FOR UPDATE`,
                [Number(dto.matchId)]
            );

            if (!matchLock.length) {
                throw new BadRequestException('Match not found');
            }

            const currentMatch = matchLock[0];

            // Validate overall capacity BEFORE locking slots
            // CRITICAL: Account for both booked AND locked slots
            const currentBookedSlots = currentMatch.booked_slots || 0;
            const lockedSlots = currentMatch.locked_slots || {};
            const currentTime = new Date();

            // Count all currently locked slots (excluding expired locks)
            let currentlyLockedSlotCount = 0;
            Object.values(lockedSlots).forEach((lockData: any) => {
                if (new Date(lockData.expires_at) > currentTime) {
                    currentlyLockedSlotCount += (lockData.slots?.length || 0);
                }
            });

            const requestedSlots = dto.totalSlots;
            const totalOccupiedSlots = currentBookedSlots + currentlyLockedSlotCount;
            const availableSlots = currentMatch.player_capacity - totalOccupiedSlots;

            this.logger.log(
                `[createBooking] Capacity check: ` +
                `capacity=${currentMatch.player_capacity}, ` +
                `booked=${currentBookedSlots}, ` +
                `locked=${currentlyLockedSlotCount}, ` +
                `available=${availableSlots}, ` +
                `requested=${requestedSlots}`
            );

            if (requestedSlots > availableSlots) {
                throw new BadRequestException(
                    `Insufficient slots available. Requested: ${requestedSlots}, Available: ${availableSlots}`
                );
            }

            // Get actual available slot numbers (excluding both booked AND locked slots)
            // This prevents conflicts when multiple users book simultaneously
            const actualSlotNumbers = await this.getAvailableSlotNumbersExcludingLocked(
                Number(dto.matchId),
                requestedSlots,
                queryRunner
            );

            if (actualSlotNumbers.length < requestedSlots) {
                throw new ConflictException(
                    `Only ${actualSlotNumbers.length} slots available. Another booking may be in progress.`
                );
            }

            this.logger.log(
                `[createBooking] Auto-assigned slot numbers: ${actualSlotNumbers.join(', ')}`
            );

            // Try to acquire locks on the auto-assigned available slots
            const lockResult = await this.slotLockService.tryLockSlots(
                dto.matchId,
                actualSlotNumbers,  // Use actual available slots, not frontend placeholder
                queryRunner
            );
            this.logger.log(`[createBooking] lockResult.success=${lockResult.success}`);

            if (!lockResult.success) {
                throw new ConflictException('Slots are no longer available. Please try again.');
            }

            // Use the actual assigned slot numbers (not the frontend placeholder)
            const assignedSlotNumbers = actualSlotNumbers;

            // NOTE: Slots are now locked with the auto-assigned slot numbers.
            // We use these actual slot numbers for booking slots creation.

            // Determine whether it's valid to auto-use the token user's phone for the first slot
            // Only prevent if user has an ACTIVE slot from a CONFIRMED booking
            // Allow booking again if previous bookings are failed/cancelled
            let canUseTokenUserAsFirst = true;
            if (tokenUser?.id) {
                const rows: Array<{ exists: number }> = await queryRunner.query(
                    `SELECT 1 as exists 
                     FROM booking_slots bs 
                     JOIN bookings b ON bs.booking_id = b.id 
                     WHERE b.match_id = $1 
                       AND bs.player_id = $2 
                       AND bs.status = $3 
                       AND b.status = $4
                     LIMIT 1`,
                    [Number(dto.matchId), Number(tokenUser.id), 'ACTIVE', BookingStatus.CONFIRMED]
                );
                canUseTokenUserAsFirst = rows.length === 0;
            }
            this.logger.log(`[createBooking] canUseTokenUserAsFirst=${canUseTokenUserAsFirst}`);

            // Compute final phone numbers for each player (after applying token user logic)
            const finalPlayerPhones: string[] = dto.players.map((player, index) => {
                let phoneToUse = (player.phone || '').trim();

                if (
                    index === 0 &&
                    tokenUser?.phoneNumber &&
                    canUseTokenUserAsFirst &&
                    (!phoneToUse || phoneToUse === String(tokenUser.phoneNumber).trim())
                ) {
                    // First player is the main user - use token user's phone only if
                    // player phone is empty or matches token user's phone
                    phoneToUse = String(tokenUser.phoneNumber).trim();
                }

                return this.normalizePhone(phoneToUse);
            });

            // Handle promo code validation and application
            let finalAmount = dto.metadata?.amount || 0;
            let discountAmount = 0;
            let originalAmount = finalAmount;
            let promoCodeId: number | null = null;

            if (dto.promoCode && !dto.isWaitlist) {
                const userId = tokenUser?.userId || (dto.userId ? Number(dto.userId) : null);
                const cityId = tokenUser?.city?.id || null;

                const validation = await this.promoCodesService.validatePromoCode(
                    dto.promoCode,
                    userId,
                    originalAmount,
                    cityId
                );

                if (validation.valid && validation.promoCode) {
                    discountAmount = validation.discountAmount;
                    finalAmount = validation.finalAmount;
                    promoCodeId = validation.promoCode.id;
                } else {
                    throw new BadRequestException(validation.message || 'Invalid promo code');
                }
            }

            // Create booking
            const booking = this.bookingRepository.create({
                matchId: Number(dto.matchId),
                userId: dto.userId ? Number(dto.userId) : undefined,
                email: dto.email,
                bookingReference: generateBookingReference(),
                totalSlots: dto.totalSlots,
                amount: finalAmount, // Use discounted amount
                originalAmount: originalAmount, // Store original amount
                discountAmount: discountAmount, // Store discount amount
                promoCodeId: promoCodeId, // Store promo code ID
                status: BookingStatus.INITIATED,
                paymentStatus: PaymentStatus.INITIATED,
                metadata: {
                    ...dto.metadata,
                    lockKey: lockResult.lockKey,
                    // Store team selections for each player (phone -> team mapping) using FINAL normalized phone numbers
                    teamSelections: dto.players.map((p, index) => ({
                        phone: finalPlayerPhones[index],
                        teamName: p.teamName || 'Unassigned',
                    })),
                    promoCode: dto.promoCode || null,
                },
            });

            const savedBooking = await queryRunner.manager.save(booking);

            // Apply promo code usage record if promo code was used
            if (dto.promoCode && promoCodeId && !dto.isWaitlist) {
                try {
                    await this.promoCodesService.applyPromoCode(
                        dto.promoCode,
                        tokenUser?.userId || (dto.userId ? Number(dto.userId) : null),
                        savedBooking.id,
                        originalAmount
                    );
                } catch (error) {
                    this.logger.warn(`Failed to record promo code usage: ${error.message}`);
                    // Don't fail the booking if promo code usage recording fails
                }
            }

            // Don't update booked_slots yet - only when payment succeeds
            // Just increment version for the lock
            await queryRunner.query(
                `UPDATE matches 
                 SET version = version + 1
                 WHERE match_id = $1`,
                [dto.matchId]
            );

            // Create or find users for each player
            const playerUsers: User[] = [];
            for (let i = 0; i < dto.players.length; i++) {
                const player = dto.players[i];
                const phoneToUse = finalPlayerPhones[i];

                const user = await this.bookingUserService.findOrCreateUserByPhone(phoneToUse, {
                    firstName: player.firstName,
                    lastName: player.lastName,
                    // Only pass email when first slot belongs to the token user (initial booking),
                    // for additional bookings (canUseTokenUserAsFirst === false) don't attach email to friend users
                    email: i === 0 && canUseTokenUserAsFirst ? dto.email : undefined
                });
                playerUsers.push(user);
            }
            console.log("playerUsers", playerUsers);
            console.log("dto.players", dto.players);
            console.log("dto.totalSlots", dto.totalSlots);
            // Create booking slots with the auto-assigned slot numbers
            const bookingSlots = assignedSlotNumbers.map((slotNumber, index) => {
                const playerUser = playerUsers[index] || playerUsers[0];
                const phoneToUse = finalPlayerPhones[index] || finalPlayerPhones[0] || '';

                return this.bookingSlotRepository.create({
                    bookingId: savedBooking.id,
                    slotNumber,
                    playerId: playerUser.id,
                    playerName: `${playerUser.firstName} ${playerUser.lastName}`, // Use user's name from database
                    playerEmail: dto.email, // Use main booking email
                    playerPhone: phoneToUse,
                    status: BookingSlotStatus.PENDING_PAYMENT, // Pending payment until confirmed
                });
            });
            this.logger.log(`[createBooking] creating bookingSlots: ${bookingSlots.map(s => `#${s.slotNumber}->player:${s.playerId}`).join(', ')}`);

            await queryRunner.manager.save(bookingSlots);
            await queryRunner.commitTransaction();

            // Handle email updates outside the transaction to avoid timeouts
            for (let i = 0; i < playerUsers.length; i++) {
                const user = playerUsers[i];
                if ((user as any).needsEmailUpdate && i === 0) {
                    // Only update email for the primary user
                    await this.bookingUserService.updateUserEmail(user.id, (user as any).needsEmailUpdate);
                }
            }

            return savedBooking;
        } catch (error) {
            this.logger.error('[createBooking] failed', error?.stack || error);

            // Try to rollback, but don't fail if transaction already rolled back
            // (e.g., due to statement_timeout or deadlock)
            try {
                await queryRunner.rollbackTransaction();
            } catch (rollbackError) {
                // Transaction might already be rolled back by PostgreSQL
                // This is fine - just log it
                this.logger.warn('[createBooking] Rollback failed (transaction may already be aborted):', rollbackError.message);
            }

            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    private async getAvailableSlotNumbers(matchId: number, requestedSlots: number, queryRunner: any): Promise<number[]> {
        // Get all currently active slot numbers for this match
        const activeSlots = await queryRunner.query(`
            SELECT bs.slot_number 
            FROM booking_slots bs 
            JOIN bookings b ON bs.booking_id = b.id 
            WHERE b.match_id = $1 AND bs.status = $2
        `, [matchId, BookingSlotStatus.ACTIVE]);

        const bookedSlotNumbers = activeSlots.map(row => row.slot_number);

        // Get match capacity
        const match = await queryRunner.query(`
            SELECT player_capacity FROM matches WHERE match_id = $1
        `, [matchId]);

        const totalCapacity = match[0]?.player_capacity || 0;

        // Generate all possible slot numbers
        const allSlots = Array.from({ length: totalCapacity }, (_, i) => i + 1);

        // Find available slots
        const availableSlots = allSlots.filter(slot => !bookedSlotNumbers.includes(slot));

        return availableSlots;
    }

    /**
     * Get available slot numbers excluding both ACTIVE slots and currently LOCKED slots
     * This prevents conflicts during concurrent bookings
     */
    private async getAvailableSlotNumbersExcludingLocked(
        matchId: number,
        requestedSlots: number,
        queryRunner: any
    ): Promise<number[]> {
        // Get currently ACTIVE slot numbers
        const activeSlots = await queryRunner.query(`
            SELECT bs.slot_number 
            FROM booking_slots bs 
            JOIN bookings b ON bs.booking_id = b.id 
            WHERE b.match_id = $1 AND bs.status = $2
        `, [matchId, BookingSlotStatus.ACTIVE]);

        const bookedSlotNumbers = new Set(activeSlots.map((row: any) => row.slot_number));

        // Get currently LOCKED slot numbers from matches.locked_slots
        const match = await queryRunner.query(`
            SELECT player_capacity, locked_slots FROM matches WHERE match_id = $1
        `, [matchId]);

        if (!match.length) {
            throw new BadRequestException('Match not found');
        }

        const totalCapacity = match[0]?.player_capacity || 0;
        const lockedSlots = match[0]?.locked_slots || {};
        const currentTime = new Date();

        // Get all currently locked slot numbers (excluding expired locks)
        Object.values(lockedSlots).forEach((lockData: any) => {
            if (new Date(lockData.expires_at) > currentTime) {
                lockData.slots?.forEach((slotNum: number) => {
                    bookedSlotNumbers.add(slotNum);
                });
            }
        });

        // Generate all possible slot numbers
        const allSlots = Array.from({ length: totalCapacity }, (_, i) => i + 1);

        // Find truly available slots (not booked AND not locked)
        const availableSlots = allSlots.filter(slot => !bookedSlotNumbers.has(slot));

        this.logger.log(
            `[getAvailableSlotNumbersExcludingLocked] Match ${matchId}: ` +
            `total=${totalCapacity}, booked+locked=${bookedSlotNumbers.size}, ` +
            `available=${availableSlots.length}, requested=${requestedSlots}`
        );

        return availableSlots.slice(0, requestedSlots);
    }

    async getBookingById(bookingId: string): Promise<any> {
        const booking = await this.bookingRepository.findOne({
            where: { id: Number(bookingId) },
            relations: ['slots'],
        });

        if (!booking) {
            throw new NotFoundException(`Booking with ID ${bookingId} not found`);
        }

        // Fetch match and venue details for this booking
        const matchRows = await this.connection.query(
            `SELECT m.start_time, m.end_time, v.name as venue_name, v.address as venue_address
             FROM matches m
             LEFT JOIN venues v ON m.venue = v.id
             WHERE m.match_id = $1`,
            [booking.matchId]
        );
        const match = matchRows[0] || {};

        // Normalize response for frontend consistency and add matchDetails
        return {
            ...booking,
            bookingReference: (booking as any).bookingReference || (booking as any).booking_reference || `BK-${booking.id}`,
            totalSlots: (booking as any).totalSlots ?? (booking as any).total_slots ?? booking.totalSlots,
            amount: (booking as any).amount ?? (booking as any).total_amount ?? booking.amount,
            createdAt: (booking as any).createdAt ?? (booking as any).created_at ?? booking.createdAt,
            slots: (booking.slots || []).map((s: any) => ({
                slotNumber: s.slotNumber ?? s.slot_number,
                playerName: s.playerName ?? s.player_name,
                status: s.status,
            })),
            matchDetails: {
                venueName: match.venue_name || 'TBD',
                venueAddress: match.venue_address || 'TBD',
                startTime: match.start_time,
                endTime: match.end_time,
            },
        };
    }

    // Overloads to support calls with or without tokenUser
    async verifySlots(dto: VerifySlotsDto): Promise<{ isValid: boolean; conflicts: any[]; message: string }>;
    async verifySlots(dto: VerifySlotsDto, tokenUser?: any): Promise<{ isValid: boolean; conflicts: any[]; message: string }>;
    async verifySlots(dto: VerifySlotsDto, tokenUser?: any) {
        const { matchId, slots } = dto;

        if (!slots || slots.length === 0) {
            throw new BadRequestException('No slots provided for verification');
        }

        // Extract unique phone numbers from slots
        const phoneNumbers = Array.from(new Set(slots.map(slot => slot.phone?.trim()).filter(Boolean)));

        if (phoneNumbers.length === 0) {
            throw new BadRequestException('No valid phone numbers found in slots');
        }

        // Use Map to track conflicts by phone number (merge duplicates)
        const conflictsMap = new Map<string, {
            phone: string;
            userId?: number;
            reasons: string[];
            sources: Array<'match_participant' | 'booking_slot'>;
        }>();

        // Look up users by phone numbers
        const users = await this.connection.query(
            `SELECT id, phone_number, first_name, last_name 
             FROM users 
             WHERE phone_number = ANY($1::text[])`,
            [phoneNumbers]
        );

        const phoneToUserIdMap = new Map<string, number>();
        users.forEach((user: any) => {
            phoneToUserIdMap.set(user.phone_number, user.id);
        });

        const userIds = Array.from(phoneToUserIdMap.values());

        if (userIds.length === 0) {
            // No users found with these phone numbers - they're new users, so no conflicts
            return {
                isValid: true,
                conflicts: [],
                message: 'All users can be cleared for booking'
            };
        }

        // Check match_participants table
        const existingParticipants = await this.matchParticipantRepository.find({
            where: {
                match: { matchId: Number(matchId) },
                user: { id: In(userIds) }
            },
            relations: ['user']
        });

        existingParticipants.forEach(participant => {
            const phone = users.find((u: any) => u.id === participant.user.id)?.phone_number;
            if (phone) {
                if (!conflictsMap.has(phone)) {
                    conflictsMap.set(phone, {
                        phone: phone,
                        userId: participant.user.id,
                        reasons: [],
                        sources: []
                    });
                }
                const conflict = conflictsMap.get(phone)!;
                if (!conflict.sources.includes('match_participant')) {
                    conflict.sources.push('match_participant');
                    conflict.reasons.push('User is already a participant in this match');
                }
            }
        });

        // Check booking_slots with ACTIVE status
        const activeSlots = await this.connection.query(
            `SELECT DISTINCT bs.player_id as "playerId", bs.player_phone as "playerPhone", b.match_id as "matchId"
             FROM booking_slots bs
             INNER JOIN bookings b ON bs.booking_id = b.id
             WHERE b.match_id = $1 
             AND bs.status = $2 
             AND (bs.player_id = ANY($3::int[]) OR bs.player_phone = ANY($4::text[]))
             AND b.status = $5`,
            [Number(matchId), BookingSlotStatus.ACTIVE, userIds, phoneNumbers, BookingStatus.CONFIRMED]
        );

        activeSlots.forEach((slot: any) => {
            const userId = slot.playerId;
            const phone = slot.playerPhone;

            // Find the phone number for this conflict
            let conflictPhone = phone;
            if (userId && !conflictPhone) {
                const user = users.find((u: any) => u.id === userId);
                conflictPhone = user?.phone_number;
            }

            if (conflictPhone) {
                if (!conflictsMap.has(conflictPhone)) {
                    conflictsMap.set(conflictPhone, {
                        phone: conflictPhone,
                        userId: userId || undefined,
                        reasons: [],
                        sources: []
                    });
                }
                const conflict = conflictsMap.get(conflictPhone)!;
                if (!conflict.sources.includes('booking_slot')) {
                    conflict.sources.push('booking_slot');
                    conflict.reasons.push('User has an active booking slot for this match');
                }
                // Update userId if we have it from booking slot
                if (userId && !conflict.userId) {
                    conflict.userId = userId;
                }
            }
        });

        // Convert Map to array format
        let conflicts = Array.from(conflictsMap.values()).map(conflict => ({
            phone: conflict.phone,
            userId: conflict.userId,
            reason: conflict.reasons.join('; '),
            source: conflict.sources
        }));

        // Exclude the authenticated user from conflicts ONLY if they're not booking for themselves
        if (tokenUser?.id || tokenUser?.phoneNumber) {
            const tokenUserId = Number(tokenUser.id);
            const tokenUserPhone = (tokenUser.phoneNumber || '').trim();
            const isBookingForSelf = tokenUserPhone && phoneNumbers.includes(tokenUserPhone);

            if (!isBookingForSelf) {
                conflicts = conflicts.filter(c =>
                    (tokenUserId ? c.userId !== tokenUserId : true) &&
                    (tokenUserPhone ? c.phone !== tokenUserPhone : true)
                );
            }
        }

        return {
            isValid: conflicts.length === 0,
            conflicts: conflicts,
            message: conflicts.length === 0
                ? 'All users can be cleared for booking'
                : `${conflicts.length} user(s) already have active slots for this match`
        };
    }

    async getBookings(filters: { userId?: string; email?: string; status?: string }) {
        // Use raw query to get booking data with match and venue details
        console.log("filters", filters);
        let whereClause = '';
        const params: any[] = [];
        let paramIndex = 1;

        if (filters.userId) {
            whereClause += ` AND b.user_id = $${paramIndex}`;
            params.push(filters.userId);
            paramIndex++;
        }

        if (filters.email) {
            whereClause += ` AND b.email = $${paramIndex}`;
            params.push(filters.email);
            paramIndex++;
        }

        // Handle status filtering
        if (filters.status === 'all') {
            // No status filter
        } else if (filters.status === 'PAYMENT_FAILED') {
            whereClause += ` AND b.status = $${paramIndex}`;
            params.push('PAYMENT_FAILED');
            paramIndex++;
        } else if (filters.status === 'CANCELLED') {
            whereClause += ` AND b.status = $${paramIndex}`;
            params.push('CANCELLED');
            params.push('PARTIALLY_CANCELLED');
            paramIndex += 2;
        } else if (filters.status === 'WAITLISTED') {
            // For waitlisted bookings, fetch from waitlist_entries table
            console.log("fetching waitlisted bookings");
            return await this.getWaitlistedBookings(filters);
        } else {
            // Default: confirmed and partially cancelled bookings (active bookings)
            whereClause += ` AND (b.status = $${paramIndex} OR b.status = $${paramIndex + 1})`;
            params.push('CONFIRMED');
            params.push('PARTIALLY_CANCELLED');
            paramIndex += 2;
        }

        const query = `
            SELECT 
                b.*,
                m.start_time,
                m.end_time,
                v.name as venue_name,
                v.address as venue_address
            FROM bookings b
            LEFT JOIN matches m ON b.match_id = m.match_id
            LEFT JOIN venues v ON m.venue = v.id
            WHERE 1=1 ${whereClause}
            ORDER BY b.created_at DESC
        `;

        const bookings = await this.connection.query(query, params);

        // Get booking slots for each booking
        const bookingIds = bookings.map(b => b.id);
        let slots: any[] = [];
        if (bookingIds.length > 0) {
            const slotsQuery = `
                SELECT * FROM booking_slots 
                WHERE booking_id = ANY($1)
                ORDER BY slot_number
            `;
            slots = await this.connection.query(slotsQuery, [bookingIds]);
        }

        // Group slots by booking_id
        const slotsByBooking = slots.reduce((acc, slot) => {
            if (!acc[slot.booking_id]) {
                acc[slot.booking_id] = [];
            }
            acc[slot.booking_id].push(slot);
            return acc;
        }, {});

        // Transform the data to include match details and slots
        return bookings.map(booking => ({
            ...booking,
            slots: slotsByBooking[booking.id] || [],
            matchDetails: {
                venueName: booking.venue_name || 'TBD',
                venueAddress: booking.venue_address || 'TBD',
                startTime: booking.start_time,
                endTime: booking.end_time,
            }
        }));
    }

    private async getWaitlistedBookings(filters: { userId?: string; email?: string; status?: string }) {
        console.log("filters", filters);
        // Build where clause for waitlist entries
        let whereClause = '';
        const params: any[] = [];
        let paramIndex = 1;

        if (filters.userId) {
            whereClause += ` AND we.user_id = $${paramIndex}`;
            params.push(filters.userId);
            paramIndex++;
        }

        if (filters.email) {
            whereClause += ` AND we.email = $${paramIndex}`;
            params.push(filters.email);
            paramIndex++;
        }

        // Get active and notified waitlist entries
        whereClause += ` AND (we.status = $${paramIndex} OR we.status = $${paramIndex + 1})`;
        params.push('ACTIVE');
        params.push('NOTIFIED');
        paramIndex += 2;
        console.log("whereClause", whereClause);
        console.log("params", params);

        const query = `
            SELECT 
                we.id as waitlist_id,
                we.match_id,
                we.user_id,
                we.email,
                we.slots_required,
                we.status as waitlist_status,
                we.created_at,
                we.updated_at,
                we.metadata,
                m.start_time,
                m.end_time,
                v.name as venue_name,
                v.address as venue_address
            FROM waitlist_entries we
            LEFT JOIN matches m ON we.match_id = m.match_id
            LEFT JOIN venues v ON m.venue = v.id
            WHERE 1=1 ${whereClause}
            ORDER BY we.created_at DESC
        `;

        const waitlistEntries = await this.connection.query(query, params);

        // Transform waitlist entries to look like bookings for consistency
        return waitlistEntries.map(entry => ({
            id: entry.waitlist_id,
            bookingReference: `WAITLISTED-${entry.waitlist_id}`,
            matchId: entry.match_id,
            userId: entry.user_id,
            email: entry.email,
            totalSlots: entry.slots_required,
            amount: 0, // Waitlist entries are free
            status: 'WAITLISTED',
            createdAt: entry.created_at,
            updatedAt: entry.updated_at,
            metadata: entry.metadata,
            slots: [], // No slots for waitlist entries
            matchDetails: {
                venueName: entry.venue_name || 'TBD',
                venueAddress: entry.venue_address || 'TBD',
                startTime: entry.start_time,
                endTime: entry.end_time,
            }
        }));
    }

    async cancelBooking(bookingId: string) {
        const booking = await this.getBookingById(bookingId);

        if (booking.status === BookingStatus.CANCELLED) {
            throw new BadRequestException('Booking is already cancelled');
        }

        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Update booking status to cancelled using query
            await queryRunner.query(
                `UPDATE bookings 
                 SET status = $1
                 WHERE id = $2`,
                [BookingStatus.CANCELLED, bookingId]
            );

            // Update all booking slots to cancelled
            await queryRunner.manager.update(
                BookingSlotEntity,
                { bookingId: booking.id },
                { status: BookingSlotStatus.CANCELLED }
            );

            // Decrement booked_slots in matches table
            await queryRunner.query(
                `UPDATE matches 
                 SET booked_slots = booked_slots - $1
                 WHERE match_id = $2`,
                [booking.totalSlots, booking.matchId]
            );

            // Release locked slots if any
            if (booking.metadata?.lockKey) {
                const result = await queryRunner.query(
                    `SELECT locked_slots, version FROM matches WHERE match_id = $1 FOR UPDATE`,
                    [booking.matchId]
                );

                if (result?.length) {
                    const match = result[0];
                    const lockedSlots = match.locked_slots || {};
                    delete lockedSlots[booking.metadata.lockKey];

                    await queryRunner.query(
                        `UPDATE matches 
                         SET locked_slots = $1,
                             version = version + 1
                         WHERE match_id = $2 AND version = $3`,
                        [JSON.stringify(lockedSlots), booking.matchId, match.version]
                    );
                }
            }

            // Initiate refund for full cancellation
            await this.refundService.initiateRefund({
                bookingId: bookingId,
                amount: booking.amount,
                reason: 'Booking cancelled',
                razorpayPaymentId: booking.metadata?.razorpayPaymentId || booking.metadata?.paymentId,
                metadata: {
                    cancelledAt: new Date(),
                    originalAmount: booking.amount,
                    cancellationType: 'FULL'
                }
            }, queryRunner);

            // Check for available slots and notify waitlist users
            await this.slotAvailabilityMonitor.checkAndNotifyAvailableSlots(booking.matchId);

            await queryRunner.commitTransaction();
            return booking;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async initiatePayment(dto: InitiatePaymentDto & { bookingId: string }) {
        const booking = await this.getBookingById(dto.bookingId);

        if (booking.status !== BookingStatus.INITIATED && booking.status !== BookingStatus.PAYMENT_FAILED) {
            throw new BadRequestException('Invalid booking status for payment. Only INITIATED or PAYMENT_FAILED bookings can initiate payment.');
        }

        try {
            // If this is a retry (PAYMENT_FAILED), we need to re-lock the slots
            if (booking.status === BookingStatus.PAYMENT_FAILED) {
                await this.relockSlotsForRetry(booking);
            }

            // Create Razorpay order using PaymentService (saves to database)
            const order = await this.paymentService.createOrder({
                bookingId: dto.bookingId,
                amount: dto.amount,
                currency: dto.currency,
                receipt: `booking_${dto.bookingId}`,
                notes: {
                    bookingId: dto.bookingId,
                    matchId: booking.matchId
                }
            });

            // Update booking with Razorpay order details without persisting slots
            const newMetadata = {
                ...(booking as any).metadata,
                razorpayOrderId: order?.orderId,
                paymentAmount: dto.amount,
                paymentCurrency: dto.currency
            };

            await this.bookingRepository.update(Number(dto.bookingId), {
                status: BookingStatus.PAYMENT_PENDING,
                metadata: newMetadata as any,
            } as any);

            const updatedBooking = await this.bookingRepository.findOne({ where: { id: Number(dto.bookingId) } });

            return {
                booking: updatedBooking,
                razorpayOrder: {
                    id: order?.orderId,
                    amount: order?.amount,
                    currency: order?.currency,
                    receipt: `booking_${dto.bookingId}`
                }
            };
        } catch (error) {
            throw new BadRequestException(`Failed to initiate payment: ${error.message}`);
        }
    }

    async handlePaymentCallback(bookingId: string, dto: PaymentCallbackDto) {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            this.logger.log(`[handlePaymentCallback] bookingId=${bookingId}`);
            const booking = await this.getBookingById(bookingId);

            // Check booking status - allow PAYMENT_PENDING or PAYMENT_FAILED (retry), or already CONFIRMED (idempotency)
            if (booking.status === BookingStatus.CONFIRMED) {
                this.logger.log(`[handlePaymentCallback] Booking ${bookingId} already confirmed, skipping`);
                await queryRunner.rollbackTransaction();
                await this.refundService.initiateRefund({
                    bookingId: bookingId,
                    amount: booking.amount,
                    reason: 'Suucessfully Re-Initiated Payment for Booking',
                    razorpayPaymentId: booking.metadata?.razorpayPaymentId || booking.metadata?.paymentId,
                    metadata: {
                        reInitiatedAt: new Date(),
                        originalAmount: booking.amount,
                        reInitiationType: 'WEBHOOK'
                    }
                }, queryRunner);
                return booking;
            }

            if (booking.status !== BookingStatus.PAYMENT_PENDING && booking.status !== BookingStatus.PAYMENT_FAILED) {
                this.logger.warn(`[handlePaymentCallback] Booking ${bookingId} is in status ${booking.status}, expected PAYMENT_PENDING or PAYMENT_FAILED`);
                throw new BadRequestException(`Invalid booking status for payment callback: ${booking.status}`);
            }

            // Verify Razorpay signature
            const isValidSignature = await this.razorpayService.verifyPaymentSignature(
                dto.razorpay_order_id,
                dto.razorpay_payment_id,
                dto.razorpay_signature
            );

            if (!isValidSignature) {
                this.logger.warn(`[handlePaymentCallback] invalid signature for bookingId=${bookingId}`);
                console.log('Payment failed for booking:', bookingId);
                await queryRunner.query(
                    `UPDATE bookings 
                     SET status = $1
                     WHERE id = $2`,
                    [BookingStatus.PAYMENT_FAILED, bookingId]
                );

                // Release locked slots when payment signature fails
                const result = await queryRunner.query(
                    `SELECT locked_slots, version FROM matches WHERE match_id = $1 FOR UPDATE`,
                    [booking.matchId]
                );

                if (result?.length) {
                    const match = result[0];
                    const lockedSlots = match.locked_slots || {};

                    // Remove this booking's lock using the stored lock key
                    const lockKey = booking.metadata?.lockKey;
                    if (lockKey && lockedSlots[lockKey]) {
                        delete lockedSlots[lockKey];
                    } else {
                        // Fallback: try to find and remove any lock that matches this booking's slots
                        const bookingSlots = booking.slots?.map(slot => slot.slotNumber) || [];
                        Object.keys(lockedSlots).forEach(key => {
                            const lockData = lockedSlots[key];
                            if (lockData.slots && lockData.slots.some(slot => bookingSlots.includes(slot))) {
                                delete lockedSlots[key];
                            }
                        });
                    }

                    // Update match with removed lock
                    await queryRunner.query(
                        `UPDATE matches 
                         SET locked_slots = $1,
                             version = version + 1
                         WHERE match_id = $2 AND version = $3`,
                        [JSON.stringify(lockedSlots), booking.matchId, match.version]
                    );
                }

                await queryRunner.commitTransaction();
                throw new BadRequestException('Invalid payment signature');
            }

            // Get payment details from Razorpay
            const paymentDetails = await this.razorpayService.getPaymentDetails(dto.razorpay_payment_id);
            this.logger.log(`[handlePaymentCallback] paymentDetails.status=${paymentDetails?.status}, captured=${paymentDetails?.captured}`);

            // Update booking with payment details
            booking.status = BookingStatus.CONFIRMED;
            booking.amount = paymentDetails.amount / 100; // Convert from paise to rupees
            booking.metadata = {
                ...booking.metadata,
                razorpayPaymentId: dto.razorpay_payment_id,
                paymentStatus: paymentDetails.status,
                paymentCaptured: paymentDetails.captured,
                paymentMethod: paymentDetails.method,
                paymentDetails: paymentDetails
            };

            // Update booking status and metadata using query
            await queryRunner.query(
                `UPDATE bookings 
                 SET status = $1, total_amount = $2, metadata = $3
                 WHERE id = $4`,
                [BookingStatus.CONFIRMED, paymentDetails.amount / 100, JSON.stringify(booking.metadata), bookingId]
            );

            // Update booking slots status from PENDING_PAYMENT to ACTIVE
            await queryRunner.manager.update(
                BookingSlotEntity,
                { bookingId: Number(bookingId) },
                { status: BookingSlotStatus.ACTIVE }
            );

            // Sync match participants for each unique player in activated slots
            try {
                const activatedSlots: Array<{ slot_number: number; player_id: number; player_phone: string }> = await queryRunner.query(
                    `SELECT slot_number, player_id, player_phone FROM booking_slots WHERE booking_id = $1 AND status = $2`,
                    [bookingId, BookingSlotStatus.ACTIVE]
                );

                // Get team selections from booking metadata
                const teamSelections = booking.metadata?.teamSelections || [];

                // Build a normalized phone -> teamName map from teamSelections
                const phoneTeamMap = new Map<string, string>();
                (teamSelections as Array<{ phone?: string; teamName?: string }>).forEach((sel, index) => {
                    const normalized = this.normalizePhone(sel.phone);
                    if (normalized && sel.teamName) {
                        phoneTeamMap.set(normalized, sel.teamName);
                        this.logger.log(
                            `[handlePaymentCallback] Team selection ${index}: phone=${normalized}, team=${sel.teamName}`
                        );
                    }
                });

                this.logger.log(
                    `[handlePaymentCallback] Team selection map built. Total entries: ${phoneTeamMap.size}`
                );

                const uniquePlayerIds = Array.from(new Set(activatedSlots.map(s => s.player_id).filter(Boolean)));
                for (const pid of uniquePlayerIds) {
                    if (!pid) continue;
                    const existing = await queryRunner.manager.findOne(MatchParticipant, {
                        where: { match: { matchId: booking.matchId }, user: { id: pid } },
                    });
                    if (!existing) {
                        // Find the slot for this player to get their phone number
                        const playerSlot = activatedSlots.find(s => s.player_id === pid);
                        const playerPhoneRaw = playerSlot?.player_phone || '';
                        const normalizedPhone = this.normalizePhone(playerPhoneRaw);

                        // Get team name from the mapping, default to 'Unassigned'
                        const teamName = phoneTeamMap.get(normalizedPhone) || 'Unassigned';

                        this.logger.log(
                            `[handlePaymentCallback] Creating participant: user=${pid}, phoneRaw=${playerPhoneRaw}, normalized=${normalizedPhone}, team=${teamName}`
                        );

                        const participant = queryRunner.manager.create(MatchParticipant, {
                            match: { matchId: booking.matchId },
                            user: { id: pid },
                            teamName: teamName,
                        });
                        await queryRunner.manager.save(MatchParticipant, participant);
                    }
                }
            } catch (e) {
                this.logger.warn(`Participant sync on payment confirm failed for booking ${bookingId}: ${e?.message || e}`);
            }

            // CRITICAL: Lock match row and validate capacity before incrementing
            const matchLockResult = await queryRunner.query(
                `SELECT match_id, player_capacity, booked_slots, locked_slots, version 
                 FROM matches 
                 WHERE match_id = $1 
                 FOR UPDATE`,
                [booking.matchId]
            );

            if (!matchLockResult.length) {
                throw new BadRequestException('Match not found');
            }

            const match = matchLockResult[0];
            const currentBookedSlots = match.booked_slots || 0;
            const newBookedSlots = currentBookedSlots + booking.totalSlots;

            // Count currently locked slots (excluding this booking's lock which will be released)
            const lockedSlots = match.locked_slots || {};
            const currentTime = new Date();
            const lockKey = booking.metadata?.lockKey;

            let otherLockedSlotCount = 0;
            Object.entries(lockedSlots).forEach(([key, lockData]: [string, any]) => {
                // Skip this booking's lock and expired locks
                if (key !== lockKey && new Date(lockData.expires_at) > currentTime) {
                    otherLockedSlotCount += (lockData.slots?.length || 0);
                }
            });

            // Safety check: Prevent overbooking even if validation was bypassed
            // Account for other in-progress bookings (locked slots)
            const totalOccupiedAfterConfirm = newBookedSlots + otherLockedSlotCount;

            this.logger.log(
                `[handlePaymentCallback] Capacity validation: ` +
                `capacity=${match.player_capacity}, ` +
                `currentBooked=${currentBookedSlots}, ` +
                `thisBooking=${booking.totalSlots}, ` +
                `otherLocked=${otherLockedSlotCount}, ` +
                `totalAfterConfirm=${totalOccupiedAfterConfirm}`
            );

            if (totalOccupiedAfterConfirm > match.player_capacity) {
                this.logger.error(
                    `[handlePaymentCallback] CAPACITY BREACH PREVENTED: ` +
                    `Booking ${bookingId} would cause overbooking. ` +
                    `Current: ${currentBookedSlots}, Requested: ${booking.totalSlots}, ` +
                    `Capacity: ${match.player_capacity}`
                );

                // Mark booking as failed and initiate refund
                await queryRunner.query(
                    `UPDATE bookings 
                     SET status = $1, metadata = $2
                     WHERE id = $3`,
                    [
                        BookingStatus.PAYMENT_FAILED,
                        JSON.stringify({
                            ...booking.metadata,
                            failureReason: 'Capacity exceeded',
                            refundRequired: true
                        }),
                        bookingId
                    ]
                );

                // Cancel the booking slots
                await queryRunner.manager.update(
                    BookingSlotEntity,
                    { bookingId: Number(bookingId) },
                    { status: BookingSlotStatus.CANCELLED }
                );

                // Release the lock
                const lockedSlots = match.locked_slots || {};
                const lockKey = booking.metadata?.lockKey;
                if (lockKey && lockedSlots[lockKey]) {
                    delete lockedSlots[lockKey];
                    await queryRunner.query(
                        `UPDATE matches 
                         SET locked_slots = $1, version = version + 1
                         WHERE match_id = $2`,
                        [JSON.stringify(lockedSlots), booking.matchId]
                    );
                }

                await queryRunner.commitTransaction();

                throw new BadRequestException(
                    'Match capacity exceeded. Your payment will be refunded automatically.'
                );
            }

            // Increment booked_slots when payment succeeds
            this.logger.log(
                `[handlePaymentCallback] Incrementing booked_slots: ` +
                `${currentBookedSlots} + ${booking.totalSlots} = ${newBookedSlots}/${match.player_capacity}`
            );

            await queryRunner.query(
                `UPDATE matches 
                 SET booked_slots = $1
                 WHERE match_id = $2`,
                [newBookedSlots, booking.matchId]
            );

            // Remove lock from matches table (already have the match data from above)
            const result = matchLockResult;

            if (result?.length) {
                const match = result[0];
                const lockedSlots = match.locked_slots || {};

                // Remove this booking's lock using the stored lock key
                const lockKey = booking.metadata?.lockKey;
                if (lockKey && lockedSlots[lockKey]) {
                    delete lockedSlots[lockKey];
                } else {
                    // Fallback: try to find and remove any lock that matches this booking's slots
                    const bookingSlots = booking.slots?.map(slot => slot.slotNumber) || [];
                    Object.keys(lockedSlots).forEach(key => {
                        const lockData = lockedSlots[key];
                        if (lockData.slots && lockData.slots.some(slot => bookingSlots.includes(slot))) {
                            delete lockedSlots[key];
                        }
                    });
                }

                // Update match with removed lock
                await queryRunner.query(
                    `UPDATE matches 
                     SET locked_slots = $1,
                         version = version + 1
                     WHERE match_id = $2 AND version = $3`,
                    [JSON.stringify(lockedSlots), booking.matchId, match.version]
                );
            }

            await queryRunner.commitTransaction();

            // Send booking confirmation notifications
            await this.sendBookingConfirmationNotifications(booking);

            return booking;
        } catch (error) {
            this.logger.error('[handlePaymentCallback] failed', error?.stack || error);
            await queryRunner.rollbackTransaction();
            // Use update instead of save since getBookingById returns normalized object
            await this.bookingRepository.update(
                { id: Number(bookingId) },
                { status: BookingStatus.PAYMENT_FAILED }
            );
            throw new BadRequestException(`Payment verification failed: ${error.message}`);
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Handle Razorpay webhook for payment events
     */
    async handlePaymentWebhook(webhookData: any, signature: string, rawBody: string) {
        try {
            this.logger.log('🔔 Received Razorpay BOOKINGGG webhook:', webhookData.event, "for orderID", webhookData?.payload?.payment?.entity?.order_id, "signature", signature);

            // Verify webhook signature (implement based on Razorpay webhook verification)
            const isValidWebhook = await this.verifyWebhookSignature(signature, rawBody);
            if (!isValidWebhook) {
                this.logger.warn('❌ Invalid webhook signature');
                throw new BadRequestException('Invalid webhook signature');
            }

            const { event, payload } = webhookData;

            switch (event) {
                case 'payment.captured':
                    await this.handlePaymentCaptured(payload);
                    break;
                case 'payment.failed':
                    await this.handlePaymentFailed(payload);
                    break;
                default:
                    this.logger.log(`ℹ️ Unhandled webhook event: ${event}`);
            }

            return { status: 'success' };
        } catch (error) {
            this.logger.error('❌ Webhook processing failed:', error.stack);
            throw error;
        }
    }

    /**
     * Handle payment captured webhook
     */
    private async handlePaymentCaptured(payload: any) {
        const { payment } = payload;
        const orderId = payment.entity.order_id;
        console.log("orderId", orderId, "payment", payment);
        // Find booking by Razorpay order ID (metadata JSONB)
        const booking = await this.bookingRepository
            .createQueryBuilder('b')
            .where("b.metadata ->> 'razorpayOrderId' = :orderId", { orderId })
            .getOne();

        if (!booking) {
            this.logger.warn(`❌ No booking found for order: ${orderId}`);
            return;
        }

        if (booking.status !== BookingStatus.PAYMENT_PENDING) {
            this.logger.warn(`❌ Booking ${booking.id} is not in PAYMENT_PENDING status`);
            return;
        }

        // Process the payment callback
        await this.handlePaymentCallback(booking.id.toString(), {
            razorpay_payment_id: payment.id,
            razorpay_order_id: orderId,
            razorpay_signature: '' // Not needed for webhook
        });

        this.logger.log(`✅ Payment captured for booking ${booking.id}`);
    }

    /**
     * Handle payment failed webhook
     */
    private async handlePaymentFailed(payload: any) {
        const { payment } = payload;
        const orderId = payment.entity.order_id;
        console.log("orderId", orderId, "payment", payment);
        // Find booking by Razorpay order ID (metadata JSONB)
        const booking = await this.bookingRepository
            .createQueryBuilder('b')
            .where("b.metadata ->> 'razorpayOrderId' = :orderId", { orderId })
            .getOne();

        if (!booking) {
            this.logger.warn(`❌ No booking found for failed payment order: ${orderId}`);
            return;
        }

        // Update booking status to failed
        booking.status = BookingStatus.PAYMENT_FAILED;
        await this.bookingRepository.save(booking);

        // Release locked slots
        await this.releaseLockedSlots(booking);

        this.logger.log(`❌ Payment failed for booking ${booking.id}`);
    }

    /**
     * Verify Razorpay webhook signature
     */
    private async verifyWebhookSignature(signature: string, rawBody: string): Promise<boolean> {
        try {
            const crypto = require('crypto');
            console.log("webhookSecret", process.env.RAZORPAY_WEBHOOK_SECRET);
            const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

            if (!webhookSecret) {
                this.logger.warn('❌ RAZORPAY_WEBHOOK_SECRET not configured');
                return false;
            }

            // Create expected signature
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(rawBody)
                .digest('hex');

            const isValid = signature === expectedSignature;

            if (!isValid) {
                this.logger.warn('❌ Invalid webhook signature');
            }

            return isValid;
        } catch (error) {
            this.logger.error('❌ Webhook signature verification failed:', error);
            return false;
        }
    }

    /**
     * Release locked slots for a booking
     */
    private async releaseLockedSlots(booking: BookingEntity) {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const result = await queryRunner.query(
                `SELECT locked_slots, version FROM matches WHERE match_id = $1 FOR UPDATE`,
                [booking.matchId]
            );

            if (result?.length) {
                const match = result[0];
                const lockedSlots = match.locked_slots || {};

                // Remove this booking's lock
                const lockKey = booking.metadata?.lockKey;
                if (lockKey && lockedSlots[lockKey]) {
                    delete lockedSlots[lockKey];
                }

                // Update match with removed lock
                await queryRunner.query(
                    `UPDATE matches 
                     SET locked_slots = $1,
                         version = version + 1
                     WHERE match_id = $2 AND version = $3`,
                    [JSON.stringify(lockedSlots), booking.matchId, match.version]
                );
            }

            await queryRunner.commitTransaction();

            // Check for available slots and notify waitlist users
            await this.slotAvailabilityMonitor.checkAndNotifyAvailableSlots(booking.matchId);

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Re-lock slots for a retry payment attempt
     */
    private async relockSlotsForRetry(booking: BookingEntity) {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Get the booking slots to re-lock
            const bookingSlots = await queryRunner.query(
                `SELECT slot_number FROM booking_slots WHERE booking_id = $1`,
                [booking.id]
            );

            if (!bookingSlots.length) {
                throw new BadRequestException('No slots found for this booking');
            }

            const slotNumbers = bookingSlots.map(row => row.slot_number);

            // ✅ CRITICAL FIX: Clean up old lock before trying to re-lock
            // This ensures we can retry even if the old lock wasn't properly released
            const oldLockKey = booking.metadata?.lockKey;
            if (oldLockKey) {
                const matchResult = await queryRunner.query(
                    `SELECT locked_slots, version FROM matches WHERE match_id = $1 FOR UPDATE`,
                    [booking.matchId]
                );

                if (matchResult?.length) {
                    const match = matchResult[0];
                    const lockedSlots = match.locked_slots || {};

                    // Remove old lock if it exists
                    if (lockedSlots[oldLockKey]) {
                        delete lockedSlots[oldLockKey];
                        await queryRunner.query(
                            `UPDATE matches 
                             SET locked_slots = $1, version = version + 1
                             WHERE match_id = $2 AND version = $3`,
                            [JSON.stringify(lockedSlots), booking.matchId, match.version]
                        );
                        this.logger.log(`🧹 Cleaned up old lock ${oldLockKey} for retry booking ${booking.id}`);
                    }
                }
            }

            // Try to re-lock the slots
            const lockResult = await this.slotLockService.tryLockSlots(
                booking.matchId.toString(),
                slotNumbers,
                queryRunner
            );

            if (!lockResult.success) {
                throw new ConflictException('Slots are no longer available for retry');
            }

            // Update booking metadata with new lock key
            booking.metadata = {
                ...booking.metadata,
                lockKey: lockResult.lockKey
            };

            await queryRunner.manager.save(booking);
            await queryRunner.commitTransaction();

            this.logger.log(`🔒 Re-locked slots for retry booking ${booking.id}`);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async cancelPayment(bookingId: string) {
        const booking = await this.getBookingById(bookingId);

        if (booking.status !== BookingStatus.PAYMENT_PENDING) {
            throw new BadRequestException('Booking is not in payment pending status');
        }

        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            this.logger.log(`[cancelPayment] bookingId=${bookingId}`);
            // Update booking status to failed (avoid saving normalized object)
            await queryRunner.manager.update(
                BookingEntity,
                { id: booking.id },
                { status: BookingStatus.PAYMENT_FAILED }
            );

            // Update booking slots status from PENDING_PAYMENT to CANCELLED
            await queryRunner.manager.update(
                BookingSlotEntity,
                { bookingId: booking.id },
                { status: BookingSlotStatus.CANCELLED }
            );

            // Remove participants for all players from this booking (full cancellation)
            try {
                const cancelledSlots: Array<{ slot_number: number; player_id: number }> = await queryRunner.query(
                    `SELECT slot_number, player_id FROM booking_slots WHERE booking_id = $1`,
                    [booking.id]
                );
                const playerIds = Array.from(new Set(cancelledSlots.map(s => s.player_id).filter(Boolean)));
                for (const pid of playerIds) {
                    await queryRunner.manager.delete(MatchParticipant, {
                        match: { matchId: booking.matchId },
                        user: { id: pid },
                    } as any);
                }
            } catch (e) {
                this.logger.warn(`Participant removal on full cancel failed for booking ${bookingId}: ${e?.message || e}`);
            }

            // Release locked slots
            const result = await queryRunner.query(
                `SELECT locked_slots, version FROM matches WHERE match_id = $1 FOR UPDATE`,
                [booking.matchId]
            );

            if (result?.length) {
                const match = result[0];
                const lockedSlots = match.locked_slots || {};

                // Remove this booking's lock using the stored lock key
                const lockKey = booking.metadata?.lockKey;
                if (lockKey && lockedSlots[lockKey]) {
                    delete lockedSlots[lockKey];
                }

                // Update match with removed lock
                await queryRunner.query(
                    `UPDATE matches 
                     SET locked_slots = $1,
                         version = version + 1
                     WHERE match_id = $2 AND version = $3`,
                    [JSON.stringify(lockedSlots), booking.matchId, match.version]
                );
            }

            await queryRunner.commitTransaction();
            return booking;
        } catch (error) {
            this.logger.error('[cancelPayment] failed', error?.stack || error);
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get refund percentage based on hours until match start time
     * @param hoursUntilMatch - Hours until match start time
     * @returns Refund percentage (100, 50, or 0)
     */
    private getRefundPercentage(hoursUntilMatch: number): number {
        if (hoursUntilMatch > 6) {
            return 100; // Full refund
        } else if (hoursUntilMatch > 3) {
            return 50; // 50% refund
        }
        return 0; // No refund
    }

    /**
     * Calculate hours until match start time
     * @param matchStartTime - Match start time
     * @returns Hours until match (can be negative if match already started)
     */
    private getHoursUntilMatch(matchStartTime: Date): number {
        const now = new Date();
        const diffMs = matchStartTime.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        return diffHours;
    }

    /**
     * Calculate refund amount based on booking, slots to cancel, and match start time
     * @param booking - Booking entity
     * @param slotNumbers - Array of slot numbers to cancel (empty array means full cancellation)
     * @param match - Match entity with startTime
     * @returns Refund amount in rupees
     */
    private calculateRefundAmount(booking: BookingEntity, slotNumbers: number[], match: Match): number {
        const slotsToCancel = slotNumbers.length || booking.totalSlots;
        
        // Use original amount if available (for promo code bookings), otherwise use current amount
        const baseAmount = booking.originalAmount !== null && booking.originalAmount !== undefined
            ? parseFloat(booking.originalAmount.toString())
            : parseFloat(booking.amount.toString());
        
        const perSlotAmount = baseAmount / booking.totalSlots;
        const baseRefund = perSlotAmount * slotsToCancel;

        // Calculate hours until match
        const hoursUntilMatch = this.getHoursUntilMatch(match.startTime);
        const refundPercentage = this.getRefundPercentage(hoursUntilMatch);

        // Calculate time-based refund
        const timeBasedRefund = (baseRefund * refundPercentage) / 100;

        // If promo code was applied, the refund is calculated on original amount
        // The discount is not refunded (as per standard practice)
        return Math.round(timeBasedRefund * 100) / 100; // Round to 2 decimal places
    }

    /**
     * Get refund breakdown for a booking without processing cancellation
     * @param bookingId - Booking ID
     * @param slotNumbers - Optional array of slot numbers to cancel (empty means full cancellation)
     * @returns Refund breakdown information
     */
    async getRefundBreakdown(bookingId: string, slotNumbers?: number[]): Promise<any> {
        const booking = await this.bookingRepository.findOne({
            where: { id: Number(bookingId) },
        });

        if (!booking) {
            throw new NotFoundException(`Booking with ID ${bookingId} not found`);
        }

        // Fetch match details
        const match = await this.matchRepository.findOne({
            where: { matchId: booking.matchId },
        });

        if (!match) {
            throw new NotFoundException(`Match with ID ${booking.matchId} not found`);
        }

        const slotsToCancel = slotNumbers?.length || booking.totalSlots;
        const perSlotAmount = parseFloat(booking.amount.toString()) / booking.totalSlots;
        const baseRefundAmount = perSlotAmount * slotsToCancel;

        // Calculate hours until match
        const hoursUntilMatch = this.getHoursUntilMatch(match.startTime);
        const refundPercentage = this.getRefundPercentage(hoursUntilMatch);
        const refundAmount = (baseRefundAmount * refundPercentage) / 100;

        // Determine time window
        let timeWindow: 'FULL_REFUND' | 'PARTIAL_REFUND' | 'NO_REFUND';
        if (hoursUntilMatch > 6) {
            timeWindow = 'FULL_REFUND';
        } else if (hoursUntilMatch > 3) {
            timeWindow = 'PARTIAL_REFUND';
        } else {
            timeWindow = 'NO_REFUND';
        }

        return {
            refundPercentage,
            refundAmount: Math.round(refundAmount * 100) / 100,
            hoursUntilMatch: Math.round(hoursUntilMatch * 100) / 100,
            eligibleForRefund: refundPercentage > 0,
            perSlotAmount: Math.round(perSlotAmount * 100) / 100,
            totalSlotsToCancel: slotsToCancel,
            baseRefundAmount: Math.round(baseRefundAmount * 100) / 100,
            timeWindow,
        };
    }

    async cancelBookingSlots(dto: CancelBookingDto) {
        const booking = await this.getBookingById(dto.bookingId);
        const slotNumbers = dto.slotNumbers || [];

        if (!booking) {
            throw new NotFoundException(`Booking with ID ${dto.bookingId} not found`);
        }

        if (booking.status === BookingStatus.CANCELLED) {
            throw new BadRequestException('Booking is already cancelled');
        }

        // Fetch match details for refund calculation
        const match = await this.matchRepository.findOne({
            where: { matchId: booking.matchId },
        });

        if (!match) {
            throw new NotFoundException(`Match with ID ${booking.matchId} not found`);
        }

        // Calculate refund amount using time-based logic
        const refundAmount = this.calculateRefundAmount(booking, slotNumbers, match);

        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {

            if (slotNumbers.length > 0) {
                // Partial cancellation
                await queryRunner.manager.update(
                    BookingSlotEntity,
                    { bookingId: dto.bookingId, slotNumber: In(slotNumbers) },
                    { status: BookingSlotStatus.CANCELLED_REFUND_PENDING }
                );

                // Remove participants for each cancelled slot's player immediately (per-player)
                try {
                    const rows: Array<{ slot_number: number; player_id: number }> = await queryRunner.query(
                        `SELECT slot_number, player_id FROM booking_slots WHERE booking_id = $1 AND slot_number = ANY($2)`,
                        [dto.bookingId, slotNumbers]
                    );
                    const playerIdsToRemove = Array.from(new Set(rows.map(r => r.player_id).filter(Boolean)));
                    for (const pid of playerIdsToRemove) {
                        await queryRunner.manager.delete(MatchParticipant, {
                            match: { matchId: booking.matchId },
                            user: { id: pid },
                        } as any);
                    }
                } catch (e) {
                    this.logger.warn(`Participant removal on partial cancel failed for booking ${dto.bookingId}: ${e?.message || e}`);
                }

                // Set booking status to partially cancelled
                const remainingActiveSlots = await queryRunner.manager.count(
                    BookingSlotEntity,
                    { where: { bookingId: Number(dto.bookingId), status: BookingSlotStatus.ACTIVE } }
                );

                const newStatus = remainingActiveSlots > 0
                    ? BookingStatus.PARTIALLY_CANCELLED
                    : BookingStatus.CANCELLED;

                // Update booking status and refund status using query
                await queryRunner.query(
                    `UPDATE bookings 
                     SET status = $1, refund_status = $2
                     WHERE id = $3`,
                    [newStatus, RefundStatus.PENDING, dto.bookingId]
                );
            } else {
                // Full cancellation
                await queryRunner.manager.update(
                    BookingSlotEntity,
                    { bookingId: dto.bookingId },
                    { status: BookingSlotStatus.CANCELLED_REFUND_PENDING }
                );

                // Remove participants for all players in this booking
                try {
                    const rows: Array<{ slot_number: number; player_id: number }> = await queryRunner.query(
                        `SELECT slot_number, player_id FROM booking_slots WHERE booking_id = $1`,
                        [dto.bookingId]
                    );
                    const playerIds = Array.from(new Set(rows.map(r => r.player_id).filter(Boolean)));
                    for (const pid of playerIds) {
                        await queryRunner.manager.delete(MatchParticipant, {
                            match: { matchId: booking.matchId },
                            user: { id: pid },
                        } as any);
                    }
                } catch (e) {
                    this.logger.warn(`Participant removal on full cancel (partial API) failed for booking ${dto.bookingId}: ${e?.message || e}`);
                }

                // Update booking status and refund status using query
                await queryRunner.query(
                    `UPDATE bookings 
                     SET status = $1, refund_status = $2
                     WHERE id = $3`,
                    [BookingStatus.CANCELLED, RefundStatus.PENDING, dto.bookingId]
                );
            }

            // Decrement booked_slots in matches table for cancelled slots
            const cancelledSlotsCount = slotNumbers.length || booking.totalSlots;
            await queryRunner.query(
                `UPDATE matches 
                 SET booked_slots = booked_slots - $1
                 WHERE match_id = $2`,
                [cancelledSlotsCount, booking.matchId]
            );

            // Only initiate refund if refund amount > 0
            if (refundAmount > 0) {
                // Validate payment ID before initiating refund
                const razorpayPaymentId = booking.metadata?.razorpayPaymentId || booking.metadata?.paymentId;
                if (!razorpayPaymentId) {
                    throw new BadRequestException('Payment ID not found. Cannot process refund.');
                }

                // Initiate refund with calculated amount
                await this.refundService.initiateRefund({
                    bookingId: dto.bookingId,
                    amount: refundAmount,
                    reason: dto.reason || 'Booking cancelled',
                    razorpayPaymentId: razorpayPaymentId,
                    slots: slotNumbers,
                    metadata: {
                        cancelledAt: new Date(),
                        cancelledSlots: slotNumbers,
                        originalAmount: booking.amount,
                        cancellationType: slotNumbers.length > 0 ? 'PARTIAL' : 'FULL',
                        refundPercentage: this.getRefundPercentage(this.getHoursUntilMatch(match.startTime))
                    }
                }, queryRunner);
            } else {
                // No refund eligible - log and continue without refund
                this.logger.log(`[cancelBookingSlots] No refund eligible for booking ${dto.bookingId} - refund amount is 0 (cancelled within 3 hours of match)`);
            }

            // Check for available slots and notify waitlist users
            await this.slotAvailabilityMonitor.checkAndNotifyAvailableSlots(booking.matchId);

            await queryRunner.commitTransaction();
            return booking;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    private async sendBookingConfirmationNotifications(booking: BookingEntity) {
        try {
            // Get booking details with slots
            const bookingWithSlots = await this.getBookingById(booking.id.toString());

            // Get match details
            const matchDetails = await this.connection.query(
                `SELECT m.*, v.name as venue_name, v.address as venue_address, 
                        fc.first_name as fc_first_name, fc.last_name as fc_last_name, fc.phone_number as fc_phone
                 FROM matches m 
                 LEFT JOIN venues v ON m.venue = v.id
                 LEFT JOIN users fc ON m.football_chief = fc.id
                 WHERE m.match_id = $1`,
                [booking.matchId]
            );

            const match = matchDetails[0];

            console.log('📧 Sending booking confirmation email to:', booking.email);
            console.log('📧 Match details:', match);
            console.log('📧 Template data:', {
                bookingReference: booking.bookingReference,
                totalSlots: booking.totalSlots,
                amount: booking.amount / 100.0, // Convert paise to rupees
                matchId: booking.matchId,
                bookingId: booking.id,
                matchDetails: {
                    venueName: match?.venue_name || 'TBD',
                    venueAddress: match?.venue_address || 'TBD',
                    startTime: match?.start_time,
                    endTime: match?.end_time,
                },
                footballChief: {
                    name: `${match?.fc_first_name || ''} ${match?.fc_last_name || ''}`.trim() || 'Football Chief',
                    phone: match?.fc_phone || 'N/A'
                }
            });

            // Send email notification
            await this.notificationService.sendNotification({
                type: NotificationType.BOOKING_CONFIRMATION,
                recipient: {
                    email: booking.email,
                    name: bookingWithSlots.slots?.[0]?.playerName || 'User'
                },
                templateData: {
                    bookingReference: booking.bookingReference,
                    totalSlots: booking.totalSlots,
                    amount: booking.amount, // Convert paise to rupees
                    matchId: booking.matchId,
                    bookingId: booking.id,
                    matchDetails: {
                        venueName: match?.venue_name || 'TBD',
                        venueAddress: match?.venue_address || 'TBD',
                        startTime: match?.start_time ? new Date(match.start_time).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        }) : 'TBD',
                        endTime: match?.end_time ? new Date(match.end_time).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        }) : 'TBD',
                    },
                    footballChief: {
                        name: `${match?.fc_first_name || ''} ${match?.fc_last_name || ''}`.trim() || 'Football Chief',
                        phone: match?.fc_phone || 'N/A'
                    }
                }
            });

            // Send push notification (if user has device token)
            // This would require user device token from user profile
            // await this.notificationService.sendPushNotification(...)

            console.log(`✅ Booking confirmed: ${booking.bookingReference} - ${booking.totalSlots} slots for ₹${booking.amount}`);

        } catch (error) {
            // Log error but don't fail the booking
            console.error('Failed to send booking confirmation notifications:', error);
        }
    }
}