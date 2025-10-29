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
    RefundStatus
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

@Injectable()
export class BookingService {
    private readonly logger = new Logger(BookingService.name);

    constructor(
        @InjectRepository(BookingEntity)
        private bookingRepository: Repository<BookingEntity>,
        @InjectRepository(BookingSlotEntity)
        private bookingSlotRepository: Repository<BookingSlotEntity>,
        private connection: Connection,
        private slotLockService: SlotLockService,
        private refundService: RefundService,
        private razorpayService: RazorpayService,
        private paymentService: PaymentService,
        private bookingUserService: BookingUserService,
        private notificationService: NotificationService,
        @Inject(forwardRef(() => SlotAvailabilityMonitorService))
        private slotAvailabilityMonitor: SlotAvailabilityMonitorService,
    ) { }

    async createBooking(dto: CreateBookingDto, tokenUser?: any): Promise<BookingEntity> {
        // Validate input
        if (!dto.slotNumbers?.length) {
            throw new BadRequestException('No slots selected');
        }

        if (dto.slotNumbers.length !== dto.totalSlots) {
            throw new BadRequestException('Slot count mismatch');
        }


        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Try to acquire locks on all requested slots
            const lockResult = await this.slotLockService.tryLockSlots(
                dto.matchId,
                dto.slotNumbers,
                queryRunner
            );

            if (!lockResult.success) {
                throw new ConflictException('Some slots are no longer available');
            }

            // Get available slot numbers
            const availableSlots = await this.getAvailableSlotNumbers(Number(dto.matchId), dto.totalSlots, queryRunner);

            if (availableSlots.length < dto.totalSlots) {
                throw new ConflictException(`Only ${availableSlots.length} slots available`);
            }

            // Create booking
            const booking = this.bookingRepository.create({
                matchId: Number(dto.matchId),
                userId: dto.userId ? Number(dto.userId) : undefined,
                email: dto.email,
                bookingReference: generateBookingReference(),
                totalSlots: dto.totalSlots,
                amount: dto.metadata?.amount || 0, // Amount in rupees from frontend
                status: BookingStatus.INITIATED,
                paymentStatus: PaymentStatus.INITIATED,
                metadata: {
                    ...dto.metadata,
                    lockKey: lockResult.lockKey
                },
            });

            const savedBooking = await queryRunner.manager.save(booking);

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

                // For the first player (main user), get phone from token user
                // For additional players, use provided phone
                let phoneToUse = player.phone;

                if (i === 0 && tokenUser?.phoneNumber) {
                    // First player is the main user - get their phone from JWT token
                    phoneToUse = tokenUser.phoneNumber;
                }

                const user = await this.bookingUserService.findOrCreateUserByPhone(phoneToUse, {
                    firstName: player.firstName,
                    lastName: player.lastName,
                    email: i === 0 ? dto.email : undefined // Only pass email for the primary user
                });
                playerUsers.push(user);
            }

            // Create booking slots with assigned slot numbers and player IDs
            const bookingSlots = availableSlots.slice(0, dto.totalSlots).map((slotNumber, index) => {
                const player = dto.players[index];
                const playerUser = playerUsers[index];

                // Use phone from token user for first player, provided phone for others
                let phoneToUse = player.phone;
                if (index === 0 && tokenUser?.phoneNumber) {
                    phoneToUse = tokenUser.phoneNumber;
                }

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
            await queryRunner.rollbackTransaction();
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

        // Debug: Log the first booking to see what fields are available
        if (bookings.length > 0) {
            console.log('🔍 First booking data:', {
                id: bookings[0].id,
                metadata: bookings[0].metadata,
                venue_name: bookings[0].venue_name,
                venue_address: bookings[0].venue_address,
                availableFields: Object.keys(bookings[0])
            });
        }

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
            const booking = await this.getBookingById(bookingId);

            if (booking.status !== BookingStatus.PAYMENT_PENDING) {
                throw new BadRequestException('Invalid booking status for payment callback');
            }

            // Verify Razorpay signature
            const isValidSignature = await this.razorpayService.verifyPaymentSignature(
                dto.razorpay_order_id,
                dto.razorpay_payment_id,
                dto.razorpay_signature
            );

            if (!isValidSignature) {
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

            // Increment booked_slots when payment succeeds
            await queryRunner.query(
                `UPDATE matches 
                 SET booked_slots = booked_slots + $1
                 WHERE match_id = $2`,
                [booking.totalSlots, booking.matchId]
            );

            // Remove lock from matches table and update booked_slots
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

            // Send booking confirmation notifications
            await this.sendBookingConfirmationNotifications(booking);

            return booking;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            const booking = await this.getBookingById(bookingId);
            booking.status = BookingStatus.PAYMENT_FAILED;
            await this.bookingRepository.save(booking);
            throw new BadRequestException(`Payment verification failed: ${error.message}`);
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Handle Razorpay webhook for payment events
     */
    async handlePaymentWebhook(webhookData: any) {
        try {
            this.logger.log('🔔 Received Razorpay webhook:', webhookData);

            // Verify webhook signature (implement based on Razorpay webhook verification)
            const isValidWebhook = await this.verifyWebhookSignature(webhookData);
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
        const orderId = payment.order_id;

        // Find booking by Razorpay order ID
        const booking = await this.bookingRepository.findOne({
            where: {
                metadata: {
                    razorpayOrderId: orderId
                }
            }
        });

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
        const orderId = payment.order_id;

        // Find booking by Razorpay order ID
        const booking = await this.bookingRepository.findOne({
            where: {
                metadata: {
                    razorpayOrderId: orderId
                }
            }
        });

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
    private async verifyWebhookSignature(webhookData: any): Promise<boolean> {
        try {
            const crypto = require('crypto');
            console.log("webhookData", webhookData);
            console.log("webhookSecret", process.env.RAZORPAY_WEBHOOK_SECRET);
            const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

            if (!webhookSecret) {
                this.logger.warn('❌ RAZORPAY_WEBHOOK_SECRET not configured');
                return false;
            }

            // Extract signature from headers (you'll need to modify the controller to pass headers)
            const signature = webhookData.signature || '';
            const payload = JSON.stringify(webhookData);

            // Create expected signature
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(payload)
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
            // Update booking status to failed
            booking.status = BookingStatus.PAYMENT_FAILED;
            await queryRunner.manager.save(booking);

            // Update booking slots status from PENDING_PAYMENT to CANCELLED
            await queryRunner.manager.update(
                BookingSlotEntity,
                { bookingId: booking.id },
                { status: BookingSlotStatus.CANCELLED }
            );

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
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
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

        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Calculate refund amount
            const perSlotAmount = booking.amount / booking.totalSlots;
            const refundAmount = perSlotAmount * (slotNumbers.length || booking.totalSlots);

            if (slotNumbers.length > 0) {
                // Partial cancellation
                await queryRunner.manager.update(
                    BookingSlotEntity,
                    { bookingId: dto.bookingId, slotNumber: In(slotNumbers) },
                    { status: BookingSlotStatus.CANCELLED_REFUND_PENDING }
                );

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

            // Validate payment ID before initiating refund
            const razorpayPaymentId = booking.metadata?.razorpayPaymentId || booking.metadata?.paymentId;
            if (!razorpayPaymentId) {
                throw new BadRequestException('Payment ID not found. Cannot process refund.');
            }

            // Initiate refund
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
                    cancellationType: 'PARTIAL'
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