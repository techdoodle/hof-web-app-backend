import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindOptionsOrder, DataSource } from 'typeorm';
import { User } from '../user/user.entity';
import { Match } from '../matches/matches.entity';
import { MatchParticipant } from '../match-participants/match-participants.entity';
import { MatchParticipantStats } from '../match-participant-stats/match-participant-stats.entity';
import { FootballTeam } from '../football-teams/football-teams.entity';
import { City } from '../cities/cities.entity';
import { Venue } from '../venue/venue.entity';
import { VenueFormatEntity } from '../venue/venue-formats.entity';
import { VenueFormat } from '../venue/venue-format.enum';
import { MatchType } from '../match-types/match-types.entity';
import { CsvUploadService } from '../match-participant-stats/csv-upload.service';
import { BookingEntity } from '../booking/booking.entity';
import { BookingSlotEntity, BookingSlotStatus } from '../booking/booking-slot.entity';
import { BookingStatus, PaymentStatus } from '../../common/types/booking.types';
import { RefundService } from '../payment/refund.service';
import { generateBookingReference } from '../../common/utils/reference.util';
import { parseGoogleMapsUrl } from '../../common/utils/google-maps.util';
import * as csv from 'csv-parser';
import { Readable } from 'stream';
import { CreateUserDto, UpdateUserDto, UserFilterDto } from './dto/user.dto';
import { CreateMatchDto, MatchFilterDto, UpdateMatchDto } from './dto/match.dto';

@Injectable()
export class AdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Match)
        private readonly matchRepository: Repository<Match>,
        @InjectRepository(MatchParticipant)
        private readonly matchParticipantRepository: Repository<MatchParticipant>,
        @InjectRepository(MatchParticipantStats)
        private readonly matchParticipantStatsRepository: Repository<MatchParticipantStats>,
        @InjectRepository(FootballTeam)
        private readonly footballTeamRepository: Repository<FootballTeam>,
        @InjectRepository(City)
        private readonly cityRepository: Repository<City>,
        @InjectRepository(Venue)
        private readonly venueRepository: Repository<Venue>,
        @InjectRepository(VenueFormatEntity)
        private readonly venueFormatRepository: Repository<VenueFormatEntity>,
        @InjectRepository(MatchType)
        private readonly matchTypeRepository: Repository<MatchType>,
        @InjectRepository(BookingEntity)
        private readonly bookingRepository: Repository<BookingEntity>,
        @InjectRepository(BookingSlotEntity)
        private readonly bookingSlotRepository: Repository<BookingSlotEntity>,
        private readonly csvUploadService: CsvUploadService,
        private readonly dataSource: DataSource,
        private readonly refundService: RefundService,
    ) { }

    // User Management
    async getAllUsers(filters: UserFilterDto) {
        const queryBuilder = this.userRepository.createQueryBuilder('user')
            .leftJoinAndSelect('user.city', 'city')
            .leftJoinAndSelect('user.preferredTeam', 'preferredTeam');

        if (filters.search) {
            queryBuilder.where(
                'user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.phoneNumber ILIKE :search OR user.email ILIKE :search',
                { search: `%${filters.search}%` }
            );
        }

        if (filters.role) {
            // Handle multiple roles passed as comma-separated string
            const roles = filters.role.split(',');
            queryBuilder.andWhere('user.role IN (:...roles)', { roles });
        }

        if (filters.city) {
            queryBuilder.andWhere('city.id = :cityId', { cityId: filters.city });
        }

        if (filters.id) {
            // Handle both single ID and array of IDs
            const ids = Array.isArray(filters.id) ? filters.id : [filters.id];
            // Convert to numbers in case they come as strings
            const numericIds = ids.map(id => Number(id)).filter(id => !isNaN(id));
            if (numericIds.length > 0) {
                queryBuilder.andWhere('user.id IN (:...ids)', { ids: numericIds });
            }
        }

        const [users, total] = await queryBuilder
            .orderBy('user.createdAt', 'DESC')
            .limit(filters.id ? 1000 : filters.limit || 50)
            .offset(filters.offset || 0)
            .getManyAndCount();

        return {
            data: users,
            total: total
        };
    }

    async getUser(id: number) {
        const user = await this.userRepository.findOne({
            where: { id },
            relations: ['city', 'preferredTeam']
        });

        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        return user;
    }

    async createUser(createUserDto: CreateUserDto) {
        // Check if phone number already exists
        if (createUserDto.phoneNumber) {
            const existingUser = await this.userRepository.findOne({
                where: { phoneNumber: createUserDto.phoneNumber }
            });
            if (existingUser) {
                throw new BadRequestException('Phone number already exists');
            }
        }

        const user = this.userRepository.create(createUserDto);
        return this.userRepository.save(user);
    }

    async updateUser(id: number, updateUserDto: UpdateUserDto) {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        // Check if phone number already exists (if being updated)
        if (updateUserDto.phoneNumber && updateUserDto.phoneNumber !== user.phoneNumber) {
            const existingUser = await this.userRepository.findOne({
                where: { phoneNumber: updateUserDto.phoneNumber }
            });
            if (existingUser && existingUser.id !== id) {
                throw new BadRequestException('Phone number already exists');
            }
        }

        Object.assign(user, updateUserDto);
        return this.userRepository.save(user);
    }

    async deleteUser(id: number) {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        await this.userRepository.remove(user);
        return { message: 'User deleted successfully' };
    }

    // Match Management
    async getAllMatches(filters: MatchFilterDto) {
        const queryBuilder = this.matchRepository.createQueryBuilder('match')
            .leftJoinAndSelect('match.venue', 'venue')
            .leftJoinAndSelect('venue.city', 'city')
            .leftJoinAndSelect('match.footballChief', 'footballChief')
            .leftJoinAndSelect('match.matchTypeRef', 'matchTypeRef');

        if (filters.search) {
            queryBuilder.where('match.name ILIKE :search', { search: `%${filters.search}%` });
        }

        if (filters.venue && !Number.isNaN(Number(filters.venue))) {
            queryBuilder.andWhere('venue.id = :venueId', { venueId: filters.venue });
        }
        if ((filters as any).city && !Number.isNaN(Number((filters as any).city))) {
            queryBuilder.andWhere('city.id = :cityId', { cityId: (filters as any).city });
        }
        if ((filters as any).footballChief && !Number.isNaN(Number((filters as any).footballChief))) {
            queryBuilder.andWhere('footballChief.id = :fcId', { fcId: (filters as any).footballChief });
        }
        if ((filters as any).matchType) {
            queryBuilder.andWhere('match.match_type = :matchType', { matchType: (filters as any).matchType });
        }

        // Backward compatible filters
        // Accept dateFrom/dateTo (primary) and also startDate/startTime, endDate/endTime (back-compat)
        const startLower = (filters as any).dateFrom || (filters as any).startDate || (filters as any).startTime;
        const endUpper = (filters as any).dateTo || (filters as any).endDate || (filters as any).endTime;
        if (startLower) {
            queryBuilder.andWhere('match.start_time >= :startLower', { startLower });
            console.log('[AdminService] Applied startLower filter on start_time >=', startLower);
        }
        if (endUpper) {
            queryBuilder.andWhere('match.start_time <= :endUpper', { endUpper });
            // console.log('[AdminService] Applied endUpper filter on start_time <=', endUpper);
        }

        // (logs removed)

        // New generic date range filters
        if (filters.dateFrom) {
            queryBuilder.andWhere('match.start_time >= :dateFrom', { dateFrom: filters.dateFrom });
        }
        if (filters.dateTo) {
            queryBuilder.andWhere('match.start_time <= :dateTo', { dateTo: filters.dateTo });
        }

        // console.log('Match query filters:', filters);

        // Handle sorting with correct property name mapping
        let sortField = 'match.start_time'; // default sort
        if (filters.sort) {
            // Map frontend property names to database column names
            const columnMapping: { [key: string]: string } = {
                'id': 'match_id',
                'startTime': 'start_time',
                'endTime': 'end_time',
                'createdAt': 'created_at',
                'updatedAt': 'updated_at',
                'matchId': 'match_id',
                'dateTime': 'start_time'  // Map dateTime to start_time since that's what we use in frontend
            };
            sortField = `match.${columnMapping[filters.sort] || filters.sort}`;
        }
        const sortOrder = filters.order?.toUpperCase() || 'DESC';

        // (logs removed)

        try {
            const [matches, total] = await queryBuilder
                .orderBy(sortField, sortOrder as 'ASC' | 'DESC')
                .limit(filters.limit || 50)
                .offset(filters.offset || 0)
                .getManyAndCount();

            // (logs removed)

            // Safety net: locally filter by date window if provided
            const df = (filters as any).dateFrom || (filters as any).startDate || (filters as any).startTime;
            const dt = (filters as any).dateTo || (filters as any).endDate || (filters as any).endTime;
            let finalMatches = matches;
            if (df || dt) {
                const fromTs = df ? new Date(df).getTime() : Number.NEGATIVE_INFINITY;
                const toTs = dt ? new Date(dt).getTime() : Number.POSITIVE_INFINITY;
                finalMatches = matches.filter(m => {
                    const ts = new Date((m as any).startTime).getTime();
                    return ts >= fromTs && ts <= toTs;
                });
                // (logs removed)
            }

            // Get participant counts for all matches
            const matchIds = finalMatches.map(m => m.matchId);
            const countMap = new Map<number, number>();

            if (matchIds.length > 0) {
                // Use raw SQL query for more reliable column names
                const participantCounts = await this.dataSource.query(
                    `SELECT match_id as "matchId", COUNT(*) as count 
                     FROM match_participants 
                     WHERE match_id = ANY($1::int[])
                     GROUP BY match_id`,
                    [matchIds]
                );

                participantCounts.forEach((pc: any) => {
                    countMap.set(Number(pc.matchId), parseInt(pc.count, 10));
                });
            }

            // Map matchId to id for frontend compatibility
            const mappedMatches = finalMatches.map(match => ({
                ...match,
                id: match.matchId, // Add id field while keeping matchId
                matchTypeId: match.matchTypeRef?.id,
                participantCount: countMap.get(match.matchId) || 0
            }));

            return {
                data: mappedMatches,
                total: df || dt ? mappedMatches.length : total
            };
        } catch (error) {
            console.error('Match query error:', error);
            throw error;
        }
    }

    async createMatch(createMatchDto: CreateMatchDto) {
        let cityId = createMatchDto.city;

        // If venue is provided but city is not, get city from venue
        if (createMatchDto.venue && !cityId) {
            const venue = await this.venueRepository.findOne({
                where: { id: createMatchDto.venue },
                relations: ['city']
            });
            console.log("venuedebugging", venue);
            if (venue && venue.city) {
                cityId = venue.city.id;
            }
        }

        const matchType = await this.matchTypeRepository.findOne({ where: { id: Number(createMatchDto.matchTypeId) } });
        if (!matchType) {
            throw new NotFoundException(`Match type with ID ${createMatchDto.matchTypeId} not found`);
        }

        // Handle pricing validation and defaults
        let slotPrice = createMatchDto.slotPrice;
        let offerPrice = createMatchDto.offerPrice;

        // Set offer_price equal to slot_price if not provided or null
        if (slotPrice !== undefined && (offerPrice === undefined || offerPrice === null)) {
            offerPrice = slotPrice;
        }

        // Validate pricing if both are provided
        if (slotPrice !== undefined && offerPrice !== undefined) {
            this.validatePricing(slotPrice, offerPrice);
        }

        // Extract matchStatsId to exclude it from match creation
        // Also filter out any empty strings or null values that might be sent by the frontend
        const { matchStatsId, ...matchData } = createMatchDto;

        // Filter out empty strings and null values
        Object.keys(matchData).forEach(key => {
            if (matchData[key] === '' || matchData[key] === null) {
                delete matchData[key];
            }
        });

        const match = this.matchRepository.create({
            ...matchData,
            slotPrice,
            offerPrice,
            footballChief: { id: createMatchDto.footballChief },
            venue: createMatchDto.venue ? { id: createMatchDto.venue } : null,
            city: cityId ? { id: cityId } : null,
            matchTypeRef: matchType
        } as any);
        const savedMatch = await this.matchRepository.save(match) as unknown as Match;
        return { ...savedMatch, id: savedMatch.matchId };
    }

    async updateMatch(id: number, updateMatchDto: UpdateMatchDto) {
        try {
            console.log('updateMatch called with:', { id, updateMatchDto });

            const match = await this.matchRepository.findOne({ where: { matchId: id } });
            if (!match) {
                throw new NotFoundException(`Match with ID ${id} not found`);
            }

            if (updateMatchDto.venue && !updateMatchDto.city) {
                const venue = await this.venueRepository.findOne({
                    where: { id: updateMatchDto.venue },
                    relations: ['city']
                });
                console.log("venuedebugging", venue);
                if (venue && venue.city) {
                    updateMatchDto.city = venue.city.id;
                }
            }

            // Handle pricing updates
            if (updateMatchDto.slotPrice !== undefined || updateMatchDto.offerPrice !== undefined) {
                const slotPrice = updateMatchDto.slotPrice !== undefined ? updateMatchDto.slotPrice : match.slotPrice;
                let offerPrice = updateMatchDto.offerPrice !== undefined ? updateMatchDto.offerPrice : match.offerPrice;

                // Set offer_price equal to slot_price if offer_price is null
                if (slotPrice !== undefined && (offerPrice === null || offerPrice === undefined)) {
                    offerPrice = slotPrice;
                }

                if (slotPrice !== undefined && offerPrice !== undefined) {
                    this.validatePricing(slotPrice, offerPrice);
                }
            }

            // Handle entity references
            const updateData = {
                ...updateMatchDto,
                footballChief: updateMatchDto.footballChief ? { id: updateMatchDto.footballChief } as any : undefined,
                venue: updateMatchDto.venue ? { id: updateMatchDto.venue } as any : undefined,
                city: updateMatchDto.city ? { id: updateMatchDto.city } as any : undefined,
                matchType: updateMatchDto.matchType, // For recorded/non-recorded
                match_type_id: updateMatchDto.matchTypeId // For HOF Play/Select
            };

            console.log('updateData prepared:', updateData);

            Object.assign(match, updateData);
            console.log('match after assign:', match);

            const updatedMatch = await this.matchRepository.save(match);
            return { ...updatedMatch, id: updatedMatch.matchId };
        } catch (error) {
            console.error('updateMatch error:', error);
            throw error;
        }
    }


    // Match Participants Management
    async getAllMatchParticipants(query: any) {
        console.log('Query params:', query); // Debug log
        const queryBuilder = this.matchParticipantRepository.createQueryBuilder('mp')
            .leftJoinAndSelect('mp.user', 'user')
            .leftJoinAndSelect('mp.match', 'match')
            .leftJoinAndSelect('match.venue', 'venue');

        // Apply matchId filter from direct query params
        if (query.matchId) {
            queryBuilder.andWhere('match.matchId = :matchId', { matchId: query.matchId });
        }

        // Handle sorting with correct column mapping
        let sortField = 'mp.createdAt'; // default sort
        if (query.sort) {
            // Map frontend property names to database column names
            const columnMapping: { [key: string]: string } = {
                'id': 'matchParticipantId',
                'createdAt': 'createdAt',
                'updatedAt': 'updatedAt'
            };
            sortField = `mp.${columnMapping[query.sort] || query.sort}`;
        }
        const sortOrder = query.order?.toUpperCase() || 'DESC';

        try {
            const [participants, total] = await queryBuilder
                .orderBy(sortField, sortOrder as 'ASC' | 'DESC')
                .limit(query.limit || 50)
                .offset(query.offset || 0)
                .getManyAndCount();

            // Fetch all booking slots and bookings for these participants in one query
            const participantIds = participants
                .filter(p => p.match?.matchId && p.user?.id)
                .map(p => ({ matchId: p.match!.matchId, userId: p.user!.id }));

            let paymentMap = new Map<string, string>();
            if (participantIds.length > 0) {
                const matchIds = [...new Set(participantIds.map(p => p.matchId))];
                const userIds = [...new Set(participantIds.map(p => p.userId))];

                const bookingSlots = await this.bookingSlotRepository
                    .createQueryBuilder('bs')
                    .innerJoinAndSelect('bs.booking', 'booking')
                    .where('booking.matchId IN (:...matchIds)', { matchIds })
                    .andWhere('bs.playerId IN (:...userIds)', { userIds })
                    .andWhere('bs.status = :status', { status: BookingSlotStatus.ACTIVE })
                    .getMany();

                bookingSlots.forEach(slot => {
                    const key = `${slot.booking.matchId}-${slot.playerId}`;
                    paymentMap.set(key, slot.booking.paymentStatus === PaymentStatus.PAID_CASH 
                        ? 'Cash' 
                        : 'Online/Razorpay');
                });
            }

            // Map data for React Admin's ReferenceField compatibility
            // Include user data directly so football_chief can see it without accessing users endpoint
            const mappedParticipants = participants.map(participant => {
                const key = participant.match?.matchId && participant.user?.id 
                    ? `${participant.match.matchId}-${participant.user.id}` 
                    : null;
                const paymentType = key ? paymentMap.get(key) || 'N/A' : 'N/A';

                return {
                id: participant.matchParticipantId,
                teamName: participant.teamName,
                paidStatsOptIn: participant.paidStatsOptIn,
                    playernationVideoUrl: participant.playernationVideoUrl,
                    paymentType: paymentType,
                // Reference IDs for React Admin
                    matchId: participant.match?.matchId,
                    user: participant.user?.id,
                // Include user data directly for display (so football_chief can see it)
                    userData: participant.user ? {
                        id: participant.user.id,
                        firstName: (participant.user as any).firstName,
                        lastName: (participant.user as any).lastName,
                        phoneNumber: (participant.user as any).phoneNumber,
                        email: (participant.user as any).email,
                    } : null,
                // Keep creation/update timestamps
                createdAt: participant.createdAt,
                updatedAt: participant.updatedAt
                };
            });

            return {
                data: mappedParticipants,
                total: total
            };
        } catch (error) {
            console.error('Match participants query error:', error);
            throw error;
        }
    }

    async getMatch(id: number) {
        const match = await this.matchRepository.findOne({
            where: { matchId: id },
            relations: ['venue', 'venue.city', 'footballChief', 'matchTypeRef']
        });

        if (!match) {
            throw new NotFoundException(`Match with ID ${id} not found`);
        }

        return {
            ...match,
            id: match.matchId,
            matchTypeId: match.matchTypeRef?.id
        };
    }

    // Booking Slots Management
    async getActiveBookingSlots(filters?: { matchId?: number; bookingId?: number; userId?: number }) {
        const queryBuilder = this.bookingSlotRepository.createQueryBuilder('slot')
            .leftJoinAndSelect('slot.booking', 'booking')
            .where('slot.status = :status', { status: BookingSlotStatus.ACTIVE });

        if (filters?.matchId) {
            queryBuilder.andWhere('booking.matchId = :matchId', { matchId: filters.matchId });
        }

        if (filters?.bookingId) {
            queryBuilder.andWhere('booking.id = :bookingId', { bookingId: filters.bookingId });
        }

        if (filters?.userId) {
            queryBuilder.andWhere('booking.userId = :userId', { userId: filters.userId });
        }

        const slots = await queryBuilder
            .orderBy('slot.createdAt', 'DESC')
            .getMany();

        return {
            data: slots,
            total: slots.length
        };
    }

    async getMatchParticipants(matchId: number) {
        const participants = await this.matchParticipantRepository.find({
            where: { match: { matchId } },
            relations: ['user', 'match'],
        });
        
        // Include user data directly so football_chief can see it without accessing users endpoint
        return participants.map(participant => ({
            ...participant,
            userData: participant.user ? {
                id: participant.user.id,
                firstName: (participant.user as any).firstName,
                lastName: (participant.user as any).lastName,
                phoneNumber: (participant.user as any).phoneNumber,
                email: (participant.user as any).email,
            } : null,
        }));
    }

    /**
     * Get next available slot number for a match
     */
    private async getNextAvailableSlotNumber(matchId: number, queryRunner: any): Promise<number | null> {
        // Get all currently active slot numbers for this match
        const activeSlots = await queryRunner.query(`
            SELECT bs.slot_number 
            FROM booking_slots bs 
            JOIN bookings b ON bs.booking_id = b.id 
            WHERE b.match_id = $1 AND bs.status = $2
        `, [matchId, BookingSlotStatus.ACTIVE]);

        const bookedSlotNumbers = activeSlots.map((row: any) => row.slot_number);

        // Get match capacity
        const match = await queryRunner.query(`
            SELECT player_capacity FROM matches WHERE match_id = $1
        `, [matchId]);

        const totalCapacity = match[0]?.player_capacity || 0;

        // Generate all possible slot numbers
        const allSlots = Array.from({ length: totalCapacity }, (_, i) => i + 1);

        // Find first available slot
        const availableSlot = allSlots.find(slot => !bookedSlotNumbers.includes(slot));

        return availableSlot || null;
    }

    /**
     * Find booking slot for a participant
     */
    private async findBookingSlotForParticipant(matchId: number, userId: number): Promise<BookingSlotEntity | null> {
        return this.bookingSlotRepository
            .createQueryBuilder('bs')
            .innerJoin('bs.booking', 'b')
            .where('b.matchId = :matchId', { matchId })
            .andWhere('bs.playerId = :userId', { userId })
            .andWhere('bs.status = :status', { status: BookingSlotStatus.ACTIVE })
            .getOne();
    }

    /**
     * Check if user has existing online booking for this match
     */
    private async hasOnlineBooking(matchId: number, userId: number, queryRunner?: any): Promise<boolean> {
        const repository = queryRunner ? queryRunner.manager.getRepository(BookingEntity) : this.bookingRepository;

        const existingBooking = await repository.findOne({
            where: {
                matchId,
                userId,
                status: In([BookingStatus.CONFIRMED]),
            },
        });

        return !!existingBooking;
    }

    /**
     * Create booking and slot for cash payment
     */
    private async createBookingSlotForCashPayment(
        matchId: number,
        userId: number,
        user: User,
        cashAmount: number,
        queryRunner: any
    ): Promise<{ booking: BookingEntity; slot: BookingSlotEntity }> {
        // Get next available slot
        const slotNumber = await this.getNextAvailableSlotNumber(matchId, queryRunner);

        if (!slotNumber) {
            throw new ConflictException('No available slots for this match');
        }

        // Validate cash amount
        if (cashAmount < 0) {
            throw new BadRequestException('Cash amount cannot be negative');
        }

        // Create booking entity
        const booking = queryRunner.manager.create(BookingEntity, {
            matchId,
            userId,
            email: user.email || `${user.firstName}.${user.lastName}@cash.booking`,
            bookingReference: generateBookingReference(),
            totalSlots: 1,
            amount: cashAmount || 0, // Cash payment amount
            status: BookingStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PAID_CASH,
            metadata: {
                paymentMethod: 'CASH',
                addedByAdmin: true,
            },
        });

        const savedBooking = await queryRunner.manager.save(BookingEntity, booking);

        // Create booking slot
        const slot = queryRunner.manager.create(BookingSlotEntity, {
            bookingId: savedBooking.id,
            slotNumber,
            playerId: userId,
            playerName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            playerEmail: user.email || '',
            playerPhone: user.phoneNumber || '',
            status: BookingSlotStatus.ACTIVE, // Immediately active for cash payments
        });

        const savedSlot = await queryRunner.manager.save(BookingSlotEntity, slot);

        return { booking: savedBooking, slot: savedSlot };
    }

    async addMatchParticipant(matchId: number, participantData: any) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Lock match row for concurrent access
            const match = await queryRunner.query(
                `SELECT * FROM matches WHERE match_id = $1 FOR UPDATE`,
                [matchId]
            );

            if (!match || match.length === 0) {
            throw new NotFoundException(`Match with ID ${matchId} not found`);
        }

            const matchData = match[0];

        const user = await this.userRepository.findOne({ where: { id: participantData.userId } });
        if (!user) {
            throw new NotFoundException(`User with ID ${participantData.userId} not found`);
        }

            // Check if user already has online booking (within transaction)
            const hasOnline = await this.hasOnlineBooking(matchId, participantData.userId, queryRunner);
            if (hasOnline) {
                throw new BadRequestException(
                    'User already has an online booking for this match. Please use the frontend to add more slots.'
                );
            }

            // Check if participant already exists (within transaction)
            const existingParticipant = await queryRunner.manager.findOne(MatchParticipant, {
            where: { match: { matchId }, user: { id: participantData.userId } },
        });

        if (existingParticipant) {
            throw new BadRequestException('User is already a participant in this match');
        }

            // Check slot availability
            const availableSlot = await this.getNextAvailableSlotNumber(matchId, queryRunner);
            if (!availableSlot) {
                throw new ConflictException('Match is full. No slots available.');
            }

            // Get cash amount from participant data (default to 0 if not provided)
            const cashAmount = participantData.cashAmount !== undefined
                ? parseFloat(participantData.cashAmount)
                : 0;

            // Create booking and slot for cash payment
            const { booking, slot } = await this.createBookingSlotForCashPayment(
                matchId,
                participantData.userId,
            user,
                cashAmount,
                queryRunner
            );

            // Create match participant
            const participant = queryRunner.manager.create(MatchParticipant, {
                match: { matchId },
                user: { id: participantData.userId },
            teamName: participantData.teamName,
            paidStatsOptIn: participantData.paidStatsOptIn || false,
        });

            const savedParticipant = await queryRunner.manager.save(MatchParticipant, participant);

            await queryRunner.commitTransaction();

            this.logger.log(
                `Created cash booking for user ${participantData.userId} in match ${matchId}, slot ${slot.slotNumber}`
            );

            return savedParticipant;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async removeMatchParticipant(matchId: number, userId: number) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Find participant within transaction
            const participant = await queryRunner.manager.findOne(MatchParticipant, {
            where: { match: { matchId }, user: { id: userId } },
        });

        if (!participant) {
            throw new NotFoundException('Match participant not found');
        }

            // Find associated booking slot using transaction manager
            const bookingSlot = await queryRunner.manager
                .createQueryBuilder(BookingSlotEntity, 'bs')
                .innerJoin('bs.booking', 'b')
                .where('b.matchId = :matchId', { matchId })
                .andWhere('bs.playerId = :userId', { userId })
                .andWhere('bs.status = :status', { status: BookingSlotStatus.ACTIVE })
                .getOne();

            if (bookingSlot) {
                // Get the associated booking using transaction manager
                const booking = await queryRunner.manager.findOne(BookingEntity, {
                    where: { id: bookingSlot.bookingId },
                });

                if (!booking) {
                    throw new NotFoundException('Associated booking not found');
                }

                // Validate: Only allow deletion if payment_status is PAID_CASH (admin-created)
                if (booking.paymentStatus !== PaymentStatus.PAID_CASH) {
                    throw new BadRequestException(
                        'Cannot remove participant with online payment. User must cancel through the frontend.'
                    );
                }

                // Delete booking slot
                await queryRunner.manager.remove(BookingSlotEntity, bookingSlot);

                // Check if there are other slots for this booking
                const remainingSlots = await queryRunner.manager.count(BookingSlotEntity, {
                    where: { bookingId: booking.id },
                });

                // If no more slots, delete the booking as well
                if (remainingSlots === 0) {
                    await queryRunner.manager.remove(BookingEntity, booking);
                }
            }

            // Delete any related match participant stats
            await queryRunner.manager.delete(MatchParticipantStats, {
                matchParticipant: { matchParticipantId: participant.matchParticipantId },
            });

            // Delete the participant
            await queryRunner.manager.remove(MatchParticipant, participant);

            await queryRunner.commitTransaction();

            this.logger.log(`Removed participant ${userId} from match ${matchId} and associated booking slot`);

        return { message: 'Match participant removed successfully' };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    // CSV Upload Preview
    async previewCsvUpload(file: Express.Multer.File, matchId: number) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        if (!file.originalname.toLowerCase().endsWith('.csv')) {
            throw new BadRequestException('File must be a CSV');
        }

        const csvData = await this.parseCsv(file.buffer);

        // Add validation and user lookup for preview
        const previewData = await Promise.all(
            csvData.map(async (row, index) => {
                let user: User | null = null;
                let validationErrors: string[] = [];

                // Try to find user by phone or email
                if (row.phoneNumber) {
                    user = await this.userRepository.findOne({
                        where: { phoneNumber: row.phoneNumber },
                        select: ['id', 'firstName', 'lastName', 'phoneNumber', 'email']
                    });
                } else if (row.email) {
                    user = await this.userRepository.findOne({
                        where: { email: row.email },
                        select: ['id', 'firstName', 'lastName', 'phoneNumber', 'email']
                    });
                }

                if (!user) {
                    validationErrors.push('User not found');
                }

                if (!row.teamName) {
                    validationErrors.push('Team name is required');
                }

                return {
                    rowIndex: index + 1,
                    originalData: row,
                    user,
                    validationErrors,
                    isValid: validationErrors.length === 0
                };
            })
        );

        return {
            totalRows: csvData.length,
            validRows: previewData.filter(row => row.isValid).length,
            invalidRows: previewData.filter(row => !row.isValid).length,
            previewData
        };
    }

    // Final CSV Upload
    async uploadMatchStats(matchId: number, csvData: any[]) {
        // Convert the processed CSV data back to the format expected by CsvUploadService
        const mockFile = {
            buffer: Buffer.from(this.arrayToCsv(csvData)),
            originalname: 'processed_data.csv'
        } as Express.Multer.File;

        return this.csvUploadService.uploadCsv(mockFile, matchId);
    }

    // MVP Selection
    async setMatchMvp(matchId: number, userId: number) {
        // First, remove MVP status from all participants in this match
        await this.matchParticipantStatsRepository.update(
            { match: { matchId } },
            { isMvp: false }
        );

        // Set MVP status for the selected user
        const result = await this.matchParticipantStatsRepository.update(
            { match: { matchId }, player: { id: userId } },
            { isMvp: true }
        );

        if (result.affected === 0) {
            throw new NotFoundException('Match participant stats not found');
        }

        return { message: 'MVP set successfully' };
    }

    // Helper methods
    private async parseCsv(buffer: Buffer): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const results: any[] = [];
            const stream = Readable.from(buffer.toString());

            stream
                .pipe(csv({
                    mapHeaders: ({ header }) => header.trim().replace(/\s+/g, ''),
                }))
                .on('data', (data) => {
                    const cleanedData = Object.fromEntries(
                        Object.entries(data).map(([key, value]) => [
                            key,
                            value === '' || value === undefined ? null : value
                        ])
                    );

                    const hasRequiredData = cleanedData.phoneNumber || cleanedData.email;
                    if (hasRequiredData) {
                        results.push(cleanedData);
                    }
                })
                .on('end', () => resolve(results))
                .on('error', (error) => reject(error));
        });
    }

    private arrayToCsv(data: any[]): string {
        if (data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const csvRows = [
            headers.join(','),
            ...data.map(row =>
                headers.map(header => {
                    const value = row[header];
                    return typeof value === 'string' && value.includes(',')
                        ? `"${value}"`
                        : value || '';
                }).join(',')
            )
        ];

        return csvRows.join('\n');
    }

    // Reference data methods
    async getFootballTeams(query: any) {
        // Always return all football teams, ignoring filters and pagination
        const teams = await this.footballTeamRepository.find({
            order: { teamName: 'ASC' }
        });
        const total = await this.footballTeamRepository.count();
        return { data: teams, total: total };
    }

    async getCities(query: any) {
        // Always return all cities, ignoring filters and pagination
        const cities = await this.cityRepository.find({
            order: { cityName: 'ASC' }
        });
        const total = await this.cityRepository.count();
        return { data: cities, total: total };
    }

    async getChiefs() {
        // Include all roles that can manage matches (consistent with frontend permissions)
        const roles = ['football_chief', 'academy_admin', 'admin', 'super_admin'];
        const qb = this.userRepository.createQueryBuilder('user')
            .where('user.role IN (:...roles)', { roles })
            .orderBy('user.firstName', 'ASC');

        const chiefs = await qb.getMany();
        const mapped = chiefs.map(u => ({
            id: u.id,
            firstName: (u as any).firstName,
            lastName: (u as any).lastName,
            phoneNumber: (u as any).phoneNumber,
            fullName: `${(u as any).firstName || ''} ${(u as any).lastName || ''}`.trim() || (u as any).phoneNumber,
        }));
        return { data: mapped, total: mapped.length };
    }

    // Venue Management
    async getVenues(query: any) {
        try {
        const venues = await this.venueRepository.find({
                relations: ['city', 'venueFormats'],
            order: { name: 'ASC' }
        });

        const total = await this.venueRepository.count();

        return {
            data: venues,
            total: total
            };
        } catch (error: any) {
            // If venue_formats table doesn't exist yet, fetch without the relation
            if (error.message?.includes('venue_formats') || error.message?.includes('does not exist')) {
                this.logger.warn('venue_formats table does not exist, fetching venues without format relations');
                const venues = await this.venueRepository.find({
                    relations: ['city'],
                    order: { name: 'ASC' }
                });
                // Add empty venueFormats array to each venue
                const venuesWithFormats = venues.map(v => ({ ...v, venueFormats: [] }));
                return {
                    data: venuesWithFormats,
                    total: venues.length
                };
            }
            throw error;
        }
    }

    async getVenue(id: number) {
        try {
            const venue = await this.venueRepository.findOne({
                where: { id },
                relations: ['city', 'venueFormats']
            });

            if (!venue) {
                throw new NotFoundException(`Venue with ID ${id} not found`);
            }

            // Map format enum to cost field names
            const formatToFieldMap: Record<string, string> = {
                'FIVE_VS_FIVE': '5v5_Cost',
                'SIX_VS_SIX': '6v6_Cost',
                'SEVEN_VS_SEVEN': '7v7_Cost',
                'EIGHT_VS_EIGHT': '8v8_Cost',
                'NINE_VS_NINE': '9v9_Cost',
                'TEN_VS_TEN': '10v10_Cost',
                'ELEVEN_VS_ELEVEN': '11v11_Cost',
            };

            // Create flat cost fields for form
            const costFields: Record<string, number> = {};
            if (venue.venueFormats) {
                venue.venueFormats.forEach((vf) => {
                    const fieldName = formatToFieldMap[vf.format];
                    if (fieldName) {
                        costFields[fieldName] = vf.cost;
                    }
                });
            }

            // Transform the response - keep full city object for display, but also provide cityId for forms
            return {
                ...venue,
                cityId: venue.city?.id || null, // Provide city ID separately for react-admin ReferenceInput
                // Keep full city object for display in Show page
                ...costFields // Add flat cost fields for form
            };
        } catch (error: any) {
            // If venue_formats table doesn't exist yet, fetch without the relation
            if (error.message?.includes('venue_formats') || error.message?.includes('does not exist')) {
                this.logger.warn('venue_formats table does not exist, fetching venue without format relations');
        const venue = await this.venueRepository.findOne({
            where: { id },
            relations: ['city']
        });

        if (!venue) {
            throw new NotFoundException(`Venue with ID ${id} not found`);
        }

                return {
                    ...venue,
                    cityId: venue.city?.id || null, // Provide city ID separately for react-admin ReferenceInput
                    // Keep full city object for display in Show page
                    venueFormats: []
                };
            }
            throw error;
        }
    }

    async createVenue(createVenueDto: any) {
        try {
            // Normalize inputs coming from admin UI
            const cityId = createVenueDto.cityId || createVenueDto.city?.id || createVenueDto.city;
            const name: string = (createVenueDto.name || '').toString().trim();
            const phoneNumber: string = (createVenueDto.phoneNumber || '').toString().trim();
            const address: string = (createVenueDto.address || '').toString().trim();

            // Parse Google Maps URL if provided, otherwise use direct lat/lng
            let latitude = createVenueDto.latitude ? Number(createVenueDto.latitude) : null;
            let longitude = createVenueDto.longitude ? Number(createVenueDto.longitude) : null;

            // Check for Google Maps URL in various possible field names
            const googleMapsUrl = createVenueDto.googleMapsUrl || createVenueDto.mapsUrl || createVenueDto.googleMaps || createVenueDto.mapUrl;
            if (googleMapsUrl && (!latitude || !longitude)) {
                this.logger.log(`[createVenue] Parsing Google Maps URL: ${googleMapsUrl}`);
                const coords = await parseGoogleMapsUrl(googleMapsUrl);
                this.logger.log(`[createVenue] Google Maps URL parser returned: ${JSON.stringify(coords)}`);
                if (coords) {
                    latitude = coords.latitude;
                    longitude = coords.longitude;
                    this.logger.log(`[createVenue] Extracted coordinates: latitude=${latitude}, longitude=${longitude}`);
                } else {
                    this.logger.warn(`[createVenue] Failed to parse Google Maps URL: ${googleMapsUrl}`);
                }
            }

            const displayBanner = createVenueDto.displayBanner || null;
            const venueFormats = createVenueDto.venueFormats || [];

            if (!name) {
                throw new BadRequestException('Venue name is required');
            }
            if (!phoneNumber) {
                throw new BadRequestException('Venue phone number is required');
            }
            if (!cityId) {
                throw new BadRequestException('City is required');
            }

            // Check uniqueness of phone number
        const existingVenue = await this.venueRepository.findOne({
                where: { phoneNumber }
        });
        if (existingVenue) {
            throw new BadRequestException('Phone number already exists');
        }

            // Create venue with formats in a transaction
            return await this.dataSource.transaction(async (manager) => {
                const venue = new Venue();
                venue.name = name;
                venue.phoneNumber = phoneNumber;
                if (address) venue.address = address;
                if (latitude !== null && latitude !== undefined) venue.latitude = latitude;
                if (longitude !== null && longitude !== undefined) venue.longitude = longitude;
                if (displayBanner) venue.displayBanner = displayBanner;
                venue.city = { id: Number(cityId) } as City;

                const savedVenue = await manager.save(Venue, venue);
                
                // Reload venue to get all fields including relations
                const venueWithRelations = await manager.findOne(Venue, {
                    where: { id: savedVenue.id },
                    relations: ['city']
                });
                
                this.logger.log(`[createVenue] Created venue details: ${JSON.stringify({
                    id: venueWithRelations?.id,
                    name: venueWithRelations?.name,
                    phoneNumber: venueWithRelations?.phoneNumber,
                    address: venueWithRelations?.address,
                    city: venueWithRelations?.city ? `${venueWithRelations.city.cityName}, ${venueWithRelations.city.stateName}` : null,
                    latitude: venueWithRelations?.latitude,
                    longitude: venueWithRelations?.longitude,
                }, null, 2)}`);

                // Create venue formats if provided
                if (venueFormats && venueFormats.length > 0) {
                    const formatEntities = venueFormats.map((vf: any) => {
                        const formatEntity = new VenueFormatEntity();
                        formatEntity.venue = savedVenue;
                        formatEntity.format = vf.format;
                        formatEntity.cost = Number(vf.cost);
                        return formatEntity;
                    });
                    await manager.save(VenueFormatEntity, formatEntities);
                }

                // Reload with relations
                return await manager.findOne(Venue, {
                    where: { id: savedVenue.id },
                    relations: ['city', 'venueFormats']
                });
            });
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new BadRequestException(error?.message || 'Failed to create venue');
        }
    }

    async updateVenue(id: number, updateVenueDto: any) {
        const venue = await this.venueRepository.findOne({
            where: { id },
            relations: ['venueFormats']
        });
        if (!venue) {
            throw new NotFoundException(`Venue with ID ${id} not found`);
        }

        // Handle city update
        if (updateVenueDto.cityId) {
            updateVenueDto.city = { id: updateVenueDto.cityId };
            delete updateVenueDto.cityId;
        }

        // Extract venueFormats if provided
        const venueFormats = updateVenueDto.venueFormats;
        delete updateVenueDto.venueFormats;

        // Parse Google Maps URL if provided
        const googleMapsUrl = updateVenueDto.googleMapsUrl || updateVenueDto.mapsUrl || updateVenueDto.googleMaps || updateVenueDto.mapUrl;
        if (googleMapsUrl) {
            this.logger.log(`[updateVenue] Parsing Google Maps URL for venue ID ${venue.id}: ${googleMapsUrl}`);
            const coords = await parseGoogleMapsUrl(googleMapsUrl);
            this.logger.log(`[updateVenue] Google Maps URL parser returned: ${JSON.stringify(coords)}`);
            if (coords) {
                updateVenueDto.latitude = coords.latitude;
                updateVenueDto.longitude = coords.longitude;
                this.logger.log(`[updateVenue] Extracted coordinates: latitude=${coords.latitude}, longitude=${coords.longitude}`);
            } else {
                this.logger.warn(`[updateVenue] Failed to parse Google Maps URL: ${googleMapsUrl}`);
            }
            // Remove the URL field from DTO to avoid trying to save it
            delete updateVenueDto.googleMapsUrl;
            delete updateVenueDto.mapsUrl;
            delete updateVenueDto.googleMaps;
            delete updateVenueDto.mapUrl;
        }

        // Update venue basic fields
        Object.assign(venue, updateVenueDto);

        // Handle venue formats update in transaction
        return await this.dataSource.transaction(async (manager) => {
            const savedVenue = await manager.save(Venue, venue);
            
            // Reload venue to get all fields including relations
            const venueWithRelations = await manager.findOne(Venue, {
                where: { id: savedVenue.id },
                relations: ['city']
            });
            
            this.logger.log(`[updateVenue] Updated venue details: ${JSON.stringify({
                id: venueWithRelations?.id,
                name: venueWithRelations?.name,
                phoneNumber: venueWithRelations?.phoneNumber,
                address: venueWithRelations?.address,
                city: venueWithRelations?.city ? `${venueWithRelations.city.cityName}, ${venueWithRelations.city.stateName}` : null,
                latitude: venueWithRelations?.latitude,
                longitude: venueWithRelations?.longitude,
            }, null, 2)}`);

            // If venueFormats is provided, replace all existing formats
            if (venueFormats !== undefined) {
                // Delete existing formats
                await manager.delete(VenueFormatEntity, { venue: { id: savedVenue.id } });

                // Create new formats if provided
                if (venueFormats && venueFormats.length > 0) {
                    const formatEntities = venueFormats.map((vf: any) => {
                        const formatEntity = new VenueFormatEntity();
                        formatEntity.venue = savedVenue;
                        formatEntity.format = vf.format;
                        formatEntity.cost = Number(vf.cost);
                        return formatEntity;
                    });
                    await manager.save(VenueFormatEntity, formatEntities);
                }
            }

            // Reload with relations
            return await manager.findOne(Venue, {
                where: { id: savedVenue.id },
                relations: ['city', 'venueFormats']
            });
        });
    }

    async deleteVenue(id: number) {
        const venue = await this.venueRepository.findOne({ where: { id } });
        if (!venue) {
            throw new NotFoundException(`Venue with ID ${id} not found`);
        }

        await this.venueRepository.remove(venue);
        return { message: 'Venue deleted successfully' };
    }

    // Match Types
    async getMatchTypes(query: any) {
        const matchTypes = await this.matchTypeRepository.find();
        return { data: matchTypes, total: matchTypes.length };
    }

    async getMatchType(id: number) {
        const matchType = await this.matchTypeRepository.findOne({ where: { id } });
        if (!matchType) {
            throw new NotFoundException(`Match type with ID ${id} not found`);
        }
        return matchType;
    }

    private validatePricing(slotPrice: number, offerPrice: number): void {
        // Both prices must be >= 0
        if (slotPrice < 0 || offerPrice < 0) {
            throw new Error('Slot price and offer price must be greater than or equal to 0');
        }

        // Offer price must be <= slot price
        if (offerPrice > slotPrice) {
            throw new Error('Offer price must be less than or equal to slot price');
        }
    }

    async updateParticipantVideoUrl(participantId: number, matchId: number, videoUrl: string | null): Promise<void> {
        console.log(`Updating participant ${participantId} for match ${matchId} with video URL:`, videoUrl);

        const participant = await this.matchParticipantRepository.findOne({
            where: {
                matchParticipantId: participantId,
                match: { matchId: matchId }
            }
        });

        if (!participant) {
            console.log('Participant not found:', { participantId, matchId });
            throw new NotFoundException('Match participant not found');
        }

        console.log('Found participant:', participant);

        const updateData: Partial<MatchParticipant> = {};
        if (videoUrl === null) {
            updateData.playernationVideoUrl = undefined;
        } else {
            updateData.playernationVideoUrl = videoUrl;
        }

        console.log('Update data:', updateData);
        await this.matchParticipantRepository.update(participantId, updateData);
        console.log('Video URL updated successfully');
    }

    async cancelMatchWithRefunds(matchId: number): Promise<{
        success: boolean;
        matchId: number;
        refundsProcessed: number;
        refundsFailed: number;
        bookingsCancelled: number;
        totalRefundAmount: number;
        refundDetails: Array<{ bookingId: number; amount: number; status: string; error?: string }>;
    }> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Get match details
            const match = await this.matchRepository.findOne({
                where: { matchId },
                relations: ['venue', 'city', 'footballChief']
            });

            if (!match) {
                throw new NotFoundException(`Match with ID ${matchId} not found`);
            }

            if (match.status === 'CANCELLED') {
                throw new BadRequestException(`Match ${matchId} is already cancelled`);
            }

            // Query all bookings for this match
            const allBookings = await queryRunner.query(
                `SELECT 
                    b.id,
                    b.booking_reference,
                    b.status,
                    b.payment_status,
                    b.total_amount,
                    b.email,
                    b.metadata
                FROM bookings b
                WHERE b.match_id = $1
                AND b.status NOT IN ('CANCELLED', 'PARTIALLY_CANCELLED')
                ORDER BY b.created_at DESC`,
                [matchId]
            );

            // Separate bookings into confirmed (with payments) and non-confirmed
            const confirmedBookings = allBookings.filter(
                (b: any) => b.status === BookingStatus.CONFIRMED && b.payment_status === PaymentStatus.COMPLETED
            );
            const nonConfirmedBookings = allBookings.filter(
                (b: any) => b.status !== BookingStatus.CONFIRMED || b.payment_status !== PaymentStatus.COMPLETED
            );

            const refundDetails: Array<{ bookingId: number; amount: number; status: string; error?: string }> = [];
            let refundsProcessed = 0;
            let refundsFailed = 0;
            let totalRefundAmount = 0;

            // Process refunds for confirmed bookings with payments
            for (const booking of confirmedBookings) {
                try {
                    // Get payment ID from booking metadata
                    const paymentId = booking.metadata?.razorpayPaymentId ||
                        booking.metadata?.paymentId;

                    if (!paymentId) {
                        this.logger.warn(
                            `⚠️ Cannot process refund for booking ${booking.id} - no payment ID found in metadata`
                        );
                        refundDetails.push({
                            bookingId: booking.id,
                            amount: parseFloat(booking.total_amount) || 0,
                            status: 'FAILED',
                            error: 'No payment ID found in metadata'
                        });
                        refundsFailed++;
                        continue;
                    }

                    const refundAmount = parseFloat(booking.total_amount) || 0;

                    // Initiate refund
                    const refund = await this.refundService.initiateRefund({
                        bookingId: booking.id,
                        amount: refundAmount,
                        reason: `Match ${matchId} has been cancelled`,
                        razorpayPaymentId: paymentId,
                        metadata: {
                            matchId: matchId,
                            matchCancellation: true,
                            cancelledAt: new Date()
                        }
                    }, queryRunner);

                    // Update booking status to CANCELLED
                    await queryRunner.query(
                        `UPDATE bookings 
                         SET status = $1, updated_at = NOW()
                         WHERE id = $2`,
                        [BookingStatus.CANCELLED, booking.id]
                    );

                    // Update booking slots to CANCELLED
                    await queryRunner.query(
                        `UPDATE booking_slots 
                         SET status = $1, updated_at = NOW()
                         WHERE booking_id = $2`,
                        [BookingSlotStatus.CANCELLED, booking.id]
                    );

                    refundDetails.push({
                        bookingId: booking.id,
                        amount: refundAmount,
                        status: 'SUCCESS'
                    });
                    refundsProcessed++;
                    totalRefundAmount += refundAmount;

                    this.logger.log(
                        `✅ Refund initiated for booking ${booking.id} (amount: ₹${refundAmount}) due to match cancellation`
                    );
                } catch (error: any) {
                    this.logger.error(
                        `❌ Failed to process refund for booking ${booking.id}: ${error.message}`,
                        error.stack
                    );
                    refundDetails.push({
                        bookingId: booking.id,
                        amount: parseFloat(booking.total_amount) || 0,
                        status: 'FAILED',
                        error: error.message
                    });
                    refundsFailed++;
                    // Continue with other bookings even if one fails
                }
            }

            // Cancel non-confirmed bookings (no refunds)
            for (const booking of nonConfirmedBookings) {
                try {
                    // Update booking status to CANCELLED
                    await queryRunner.query(
                        `UPDATE bookings 
                         SET status = $1, updated_at = NOW()
                         WHERE id = $2`,
                        [BookingStatus.CANCELLED, booking.id]
                    );

                    // Update booking slots to CANCELLED
                    await queryRunner.query(
                        `UPDATE booking_slots 
                         SET status = $1, updated_at = NOW()
                         WHERE booking_id = $2`,
                        [BookingSlotStatus.CANCELLED, booking.id]
                    );

                    this.logger.log(`✅ Cancelled booking ${booking.id} (no refund - non-confirmed booking)`);
                } catch (error: any) {
                    this.logger.error(
                        `❌ Failed to cancel booking ${booking.id}: ${error.message}`,
                        error.stack
                    );
                    // Continue with other bookings
                }
            }

            // Mark match as CANCELLED
            await queryRunner.query(
                `UPDATE matches 
                 SET status = $1, updated_at = NOW()
                 WHERE match_id = $2`,
                ['CANCELLED', matchId]
            );

            await queryRunner.commitTransaction();

            this.logger.log(
                `✅ Match ${matchId} cancelled successfully. ` +
                `Refunds: ${refundsProcessed} processed, ${refundsFailed} failed. ` +
                `Bookings cancelled: ${nonConfirmedBookings.length}`
            );

            return {
                success: true,
                matchId,
                refundsProcessed,
                refundsFailed,
                bookingsCancelled: nonConfirmedBookings.length,
                totalRefundAmount,
                refundDetails
            };
        } catch (error: any) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`❌ Failed to cancel match ${matchId}: ${error.message}`, error.stack);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async getMatchCancellationPreview(matchId: number): Promise<{
        match: any;
        confirmedBookings: Array<{ id: number; bookingReference: string; email: string; amount: number; razorpayOrderId?: string | null }>;
        nonConfirmedBookings: Array<{ id: number; bookingReference: string; email: string; amount: number; razorpayOrderId?: string | null }>;
        totalRefundAmount: number;
    }> {
        // Get match details
        const match = await this.matchRepository.findOne({
            where: { matchId },
            relations: ['venue', 'city', 'footballChief']
        });

        if (!match) {
            throw new NotFoundException(`Match with ID ${matchId} not found`);
        }

        if (match.status === 'CANCELLED') {
            throw new BadRequestException(`Match ${matchId} is already cancelled`);
        }

        // Query all bookings for this match
        const allBookings = await this.dataSource.query(
            `SELECT 
                b.id,
                b.booking_reference,
                b.status,
                b.payment_status,
                b.total_amount,
                b.email,
                b.metadata
            FROM bookings b
            WHERE b.match_id = $1
            AND b.status NOT IN ('CANCELLED', 'PARTIALLY_CANCELLED')
            ORDER BY b.created_at DESC`,
            [matchId]
        );

        // Separate bookings into confirmed (with payments) and non-confirmed
        const confirmedBookings = allBookings
            .filter((b: any) => b.status === BookingStatus.CONFIRMED && b.payment_status === PaymentStatus.COMPLETED)
            .map((b: any) => {
                const metadata = typeof b.metadata === 'string' ? JSON.parse(b.metadata) : b.metadata;
                const razorpayOrderId = metadata?.razorpayOrderId || metadata?.razorpay_order_id || null;
                return {
                    id: b.id,
                    bookingReference: b.booking_reference,
                    email: b.email,
                    amount: parseFloat(b.total_amount) || 0,
                    razorpayOrderId: razorpayOrderId
                };
            });

        const nonConfirmedBookings = allBookings
            .filter((b: any) => b.status !== BookingStatus.CONFIRMED || b.payment_status !== PaymentStatus.COMPLETED)
            .map((b: any) => {
                const metadata = typeof b.metadata === 'string' ? JSON.parse(b.metadata) : b.metadata;
                const razorpayOrderId = metadata?.razorpayOrderId || metadata?.razorpay_order_id || null;
                return {
                    id: b.id,
                    bookingReference: b.booking_reference,
                    email: b.email,
                    amount: parseFloat(b.total_amount) || 0,
                    razorpayOrderId: razorpayOrderId
                };
            });

        const totalRefundAmount = confirmedBookings.reduce((sum, b) => sum + b.amount, 0);

        return {
            match: {
                matchId: match.matchId,
                startTime: match.startTime,
                endTime: match.endTime,
                venue: match.venue?.name || 'N/A',
                city: match.city ? `${match.city.cityName}, ${match.city.stateName}` : 'N/A'
            },
            confirmedBookings,
            nonConfirmedBookings,
            totalRefundAmount
        };
    }

}
