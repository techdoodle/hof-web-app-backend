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
import { RefundEntity } from '../payment/refund.entity';
import { generateBookingReference } from '../../common/utils/reference.util';
import { parseGoogleMapsUrl } from '../../common/utils/google-maps.util';
import * as csv from 'csv-parser';
import { Readable } from 'stream';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CreateUserDto, UpdateUserDto, UserFilterDto } from './dto/user.dto';
import { CreateMatchDto, MatchFilterDto, UpdateMatchDto, CreateRecurringMatchesDto, TimeSlotDto } from './dto/match.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/interfaces/notification.interface';

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
        private readonly notificationService: NotificationService,
    ) { }

    // User Management
    async getAllUsers(filters: UserFilterDto) {
        // Optimize: Use leftJoin with addSelect to only load necessary fields
        const queryBuilder = this.userRepository.createQueryBuilder('user')
            .leftJoin('user.city', 'city')
            .leftJoin('user.preferredTeam', 'preferredTeam')
            .addSelect([
                'city.id',
                'city.cityName',
                'preferredTeam.id',
                'preferredTeam.teamName'
            ]);

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
    async getAllMatches(filters: MatchFilterDto, userId?: number, userRole?: string) {
        // Optimize: Use leftJoin with addSelect to only load necessary fields
        // This reduces data transfer compared to leftJoinAndSelect which loads all fields
        // Note: Using leftJoinAndSelect for matchTypeRef as it's a small entity and addSelect has issues with relation aliases
        const queryBuilder = this.matchRepository.createQueryBuilder('match')
            .leftJoin('match.venue', 'venue')
            .leftJoin('venue.city', 'city')
            .leftJoin('match.footballChief', 'footballChief')
            .leftJoin('match.vendor', 'vendor')
            .leftJoinAndSelect('match.matchTypeRef', 'matchTypeRef')
            .addSelect([
                'venue.id',
                'venue.name',
                'city.id',
                'city.cityName',
                'footballChief.id',
                'footballChief.firstName',
                'footballChief.lastName',
                'vendor.id'
            ]);

        // Filter by vendor if user is a vendor
        if (userRole === UserRole.VENDOR && userId) {
            queryBuilder.andWhere('vendor.id = :vendorId', { vendorId: userId });
        }

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
        if (filters.status) {
            queryBuilder.andWhere('match.status = :status', { status: filters.status });
        }
        if (filters.statusNot) {
            queryBuilder.andWhere('match.status != :statusNot', { statusNot: filters.statusNot });
        }

        // Unified date range filtering (removed duplicate logic)
        // Accept dateFrom/dateTo (primary) and also startDate/startTime, endDate/endTime (back-compat)
        const dateFrom = filters.dateFrom || (filters as any).startDate || (filters as any).startTime;
        const dateTo = filters.dateTo || (filters as any).endDate || (filters as any).endTime;
        
        if (dateFrom) {
            queryBuilder.andWhere('match.start_time >= :dateFrom', { dateFrom });
        }
        if (dateTo) {
            queryBuilder.andWhere('match.start_time <= :dateTo', { dateTo });
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

        try {
            // Use proper pagination - respect limit from frontend (default 25 per page)
            const limit = filters.limit || 25;
            const offset = filters.offset || 0;
            
            const [matches, total] = await queryBuilder
                .orderBy(sortField, sortOrder as 'ASC' | 'DESC')
                .limit(limit)
                .offset(offset)
                .getManyAndCount();

            // Get participant counts for all matches in batch
            const matchIds = matches.map(m => m.matchId);
            const countMap = new Map<number, number>();

            if (matchIds.length > 0) {
                // Use raw SQL query for more reliable column names
                // This query uses the IDX_match_participants_match_id index
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
            const mappedMatches = matches.map(match => ({
                ...match,
                id: match.matchId, // Add id field while keeping matchId
                matchTypeId: match.matchTypeRef?.id,
                participantCount: countMap.get(match.matchId) || 0
            }));

            return {
                data: mappedMatches,
                total: total
            };
        } catch (error) {
            console.error('Match query error:', error);
            throw error;
        }
    }

    async createMatch(createMatchDto: CreateMatchDto, vendorId?: number) {
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
            // Convert to numbers to handle decimal/string types
            const slotPriceNum = typeof slotPrice === 'string' ? parseFloat(slotPrice) : Number(slotPrice);
            const offerPriceNum = typeof offerPrice === 'string' ? parseFloat(offerPrice) : Number(offerPrice);
            
            this.validatePricing(slotPriceNum, offerPriceNum);
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
            matchTypeRef: matchType,
            vendor: vendorId ? { id: vendorId } : null
        } as any);
        const savedMatch = await this.matchRepository.save(match) as unknown as Match;
        return { ...savedMatch, id: savedMatch.matchId };
    }

    /**
     * Generate all dates for recurring matches based on pattern
     */
    private generateMatchDates(
        pattern: 'daily' | 'weekly' | 'custom',
        startDate: Date,
        endDate: Date,
        daysOfWeek?: number[]
    ): Date[] {
        const dates: Date[] = [];
        const current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        if (pattern === 'daily') {
            // Generate dates for every day
            while (current <= end) {
                dates.push(new Date(current));
                current.setDate(current.getDate() + 1);
            }
        } else if (pattern === 'weekly' || pattern === 'custom') {
            // Generate dates for specified days of week
            if (!daysOfWeek || daysOfWeek.length === 0) {
                throw new BadRequestException('daysOfWeek is required for weekly/custom patterns');
            }

            while (current <= end) {
                const dayOfWeek = current.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
                if (daysOfWeek.includes(dayOfWeek)) {
                    dates.push(new Date(current));
                }
                current.setDate(current.getDate() + 1);
            }
        }

        return dates;
    }

    /**
     * Parse time string (HH:mm) and combine with date
     */
    private combineDateAndTime(date: Date, timeString: string): Date {
        const [hours, minutes] = timeString.split(':').map(Number);
        const result = new Date(date);
        result.setHours(hours, minutes, 0, 0);
        return result;
    }

    /**
     * Create multiple matches based on recurring pattern
     */
    async createRecurringMatches(dto: CreateRecurringMatchesDto, vendorId?: number): Promise<{ created: number; matches: any[]; errors: string[] }> {
        // Validate date range
        const startDate = new Date(dto.startDate);
        const endDate = new Date(dto.endDate);
        
        if (startDate > endDate) {
            throw new BadRequestException('Start date must be before or equal to end date');
        }

        // Validate daysOfWeek for weekly/custom patterns
        if ((dto.pattern === 'weekly' || dto.pattern === 'custom') && (!dto.daysOfWeek || dto.daysOfWeek.length === 0)) {
            throw new BadRequestException('daysOfWeek is required for weekly/custom patterns');
        }

        // Validate time slots
        if (!dto.timeSlots || dto.timeSlots.length === 0) {
            throw new BadRequestException('At least one time slot is required');
        }

        // Validate time format
        for (const slot of dto.timeSlots) {
            const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
                throw new BadRequestException(`Invalid time format. Use HH:mm format (e.g., "14:30")`);
            }
        }

        // Get city from venue if not provided
        let cityId = dto.city;
        if (dto.venue && !cityId) {
            const venue = await this.venueRepository.findOne({
                where: { id: dto.venue },
                relations: ['city']
            });
            if (venue && venue.city) {
                cityId = venue.city.id;
            }
        }

        // Generate all match dates
        const matchDates = this.generateMatchDates(dto.pattern, startDate, endDate, dto.daysOfWeek);

        if (matchDates.length === 0) {
            throw new BadRequestException('No matches would be generated with the given pattern and date range');
        }

        const createdMatches: any[] = [];
        const errors: string[] = [];
        let createdCount = 0;

        // Create matches for each date and time slot combination
        for (const date of matchDates) {
            for (const timeSlot of dto.timeSlots) {
                try {
                    const startTime = this.combineDateAndTime(date, timeSlot.startTime);
                    const endTime = this.combineDateAndTime(date, timeSlot.endTime);

                    // Validate end time is after start time
                    if (endTime <= startTime) {
                        // If end time is before or equal to start time, assume it's next day
                        endTime.setDate(endTime.getDate() + 1);
                    }

                    // Create match DTO
                    const createMatchDto: CreateMatchDto = {
                        matchType: dto.matchType,
                        matchTypeId: dto.matchTypeId,
                        startTime: startTime.toISOString(),
                        endTime: endTime.toISOString(),
                        venue: dto.venue,
                        city: cityId,
                        footballChief: dto.footballChief,
                        slotPrice: dto.slotPrice,
                        offerPrice: dto.offerPrice,
                        playerCapacity: dto.playerCapacity,
                        bufferCapacity: dto.bufferCapacity ?? 0,
                        teamAName: dto.teamAName || 'Home',
                        teamBName: dto.teamBName || 'Away',
                    };

                    // Create match using existing logic
                    const match = await this.createMatch(createMatchDto, vendorId);
                    createdMatches.push(match);
                    createdCount++;
                } catch (error: any) {
                    const errorMsg = `Failed to create match for ${date.toDateString()} at ${timeSlot.startTime}: ${error.message}`;
                    errors.push(errorMsg);
                    this.logger.error(errorMsg, error.stack);
                }
            }
        }

        this.logger.log(`Created ${createdCount} recurring matches. Errors: ${errors.length}`);

        return {
            created: createdCount,
            matches: createdMatches,
            errors,
        };
    }

    async updateMatch(id: number, updateMatchDto: UpdateMatchDto, userId?: number, userRole?: string) {
        try {
            console.log('updateMatch called with:', { id, updateMatchDto });

            const match = await this.matchRepository.findOne({ 
                where: { matchId: id },
                relations: ['vendor']
            });
            if (!match) {
                throw new NotFoundException(`Match with ID ${id} not found`);
            }

            // If user is a vendor, verify they own this match
            if (userRole === UserRole.VENDOR && userId) {
                if (!match.vendor || match.vendor.id !== userId) {
                    throw new NotFoundException(`Match with ID ${id} not found`);
                }
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
                    // Convert to numbers to handle decimal/string types from database
                    const slotPriceNum = typeof slotPrice === 'string' ? parseFloat(slotPrice) : Number(slotPrice);
                    const offerPriceNum = typeof offerPrice === 'string' ? parseFloat(offerPrice) : Number(offerPrice);
                    
                    this.validatePricing(slotPriceNum, offerPriceNum);
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
    async getAllMatchParticipants(query: any, userId?: number, userRole?: string) {
        console.log('Query params:', query); // Debug log
        // Optimize: Use leftJoin with addSelect to only load necessary fields
        const queryBuilder = this.matchParticipantRepository.createQueryBuilder('mp')
            .leftJoin('mp.user', 'user')
            .leftJoin('mp.match', 'match')
            .leftJoin('match.venue', 'venue')
            .leftJoin('match.vendor', 'vendor')
            .addSelect([
                'user.id',
                'user.firstName',
                'user.lastName',
                'user.phoneNumber',
                'user.email',
                'match.matchId',
                'match.startTime',
                'venue.id',
                'venue.name',
                'vendor.id'
            ]);

        // Filter by vendor if user is a vendor
        if (userRole === UserRole.VENDOR && userId) {
            queryBuilder.andWhere('vendor.id = :vendorId', { vendorId: userId });
        }

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
            let mvpMap = new Map<string, boolean>();
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

                // Fetch MVP status for all participants
                const mvpStats = await this.matchParticipantStatsRepository
                    .createQueryBuilder('stats')
                    .leftJoinAndSelect('stats.match', 'match')
                    .leftJoinAndSelect('stats.player', 'player')
                    .where('match.matchId IN (:...matchIds)', { matchIds })
                    .andWhere('player.id IN (:...userIds)', { userIds })
                    .andWhere('stats.isMvp = :isMvp', { isMvp: true })
                    .getMany();

                mvpStats.forEach(stat => {
                    const key = `${stat.match.matchId}-${stat.player.id}`;
                    mvpMap.set(key, true);
                });
            }

            // Map data for React Admin's ReferenceField compatibility
            // Include user data directly so football_chief can see it without accessing users endpoint
            const mappedParticipants = participants.map(participant => {
                const key = participant.match?.matchId && participant.user?.id 
                    ? `${participant.match.matchId}-${participant.user.id}` 
                    : null;
                const paymentType = key ? paymentMap.get(key) || 'N/A' : 'N/A';
                const isMvp = key ? mvpMap.get(key) || false : false;

                return {
                id: participant.matchParticipantId,
                teamName: participant.teamName,
                paidStatsOptIn: participant.paidStatsOptIn,
                    playernationVideoUrl: participant.playernationVideoUrl,
                    paymentType: paymentType,
                    isMvp: isMvp,
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

    async getMatch(id: number, userId?: number, userRole?: string) {
        const match = await this.matchRepository.findOne({
            where: { matchId: id },
            relations: ['venue', 'venue.city', 'footballChief', 'matchTypeRef', 'vendor']
        });

        if (!match) {
            throw new NotFoundException(`Match with ID ${id} not found`);
        }

        // If user is a vendor, verify they own this match
        if (userRole === UserRole.VENDOR && userId) {
            if (!match.vendor || match.vendor.id !== userId) {
                throw new NotFoundException(`Match with ID ${id} not found`);
            }
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

    async getMatchParticipants(matchId: number, userId?: number, userRole?: string) {
        // If user is a vendor, verify they own this match
        if (userRole === UserRole.VENDOR && userId) {
            const match = await this.matchRepository.findOne({
                where: { matchId },
                relations: ['vendor']
            });
            if (!match || !match.vendor || match.vendor.id !== userId) {
                throw new NotFoundException(`Match with ID ${matchId} not found`);
            }
        }

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

    async addMatchParticipant(matchId: number, participantData: any, userId?: number, userRole?: string) {
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

            // If user is a vendor, verify they own this match
            if (userRole === UserRole.VENDOR && userId) {
                // matchData from raw query has vendor as integer, not object
                const matchVendorId = matchData.vendor;
                if (!matchVendorId || matchVendorId !== userId) {
                    throw new NotFoundException(`Match with ID ${matchId} not found`);
                }
            }

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

            // Send email notification for cash payment asynchronously (fire-and-forget)
            // Note: Email is sent in the background and won't block the participant addition
            if (cashAmount > 0) {
                this.sendCashPaymentNotificationEmail(
                    matchId,
                    booking,
                    slot,
                    user,
                    cashAmount,
                    userId,
                    userRole
                ).catch((emailError) => {
                    this.logger.warn(
                        `⚠️ Failed to send cash payment notification email: ${emailError.message}`
                    );
                    // Don't fail the participant addition - email is non-critical
                });
            }

            return savedParticipant;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Send cash payment notification email asynchronously (fire-and-forget)
     * This method runs in the background and doesn't block the participant addition process
     */
    private async sendCashPaymentNotificationEmail(
        matchId: number,
        booking: BookingEntity,
        slot: BookingSlotEntity,
        user: User,
        cashAmount: number,
        userId?: number,
        userRole?: string
    ): Promise<void> {
        try {
            // Fetch match details with relations
            const matchDetails = await this.matchRepository.findOne({
                where: { matchId },
                relations: ['venue', 'city'],
            });

            // Fetch admin/football chief user details if userId is provided
            let adminUser: User | null = null;
            if (userId) {
                adminUser = await this.userRepository.findOne({
                    where: { id: userId },
                });
            }

            if (matchDetails) {
                // Format dates
                const matchDate = new Date(matchDetails.startTime).toLocaleDateString('en-IN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                });
                const matchStartTime = new Date(matchDetails.startTime).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                });
                const matchEndTime = new Date(matchDetails.endTime).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                });
                const recordedAt = new Date().toLocaleString('en-IN', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                });

                await this.notificationService.sendNotification({
                    type: NotificationType.CASH_PAYMENT_RECORDED,
                    recipient: {
                        email: 'maulik@humansoffootball.in',
                        name: 'Maulik',
                    },
                    templateData: {
                        cashAmount: cashAmount.toFixed(2),
                        bookingReference: booking.bookingReference || `BK-${booking.id}`,
                        recordedAt,
                        matchId,
                        venueName: matchDetails.venue?.name || 'N/A',
                        venueAddress: matchDetails.venue?.address || 'N/A',
                        cityName: matchDetails.city?.cityName || 'N/A',
                        matchDate,
                        matchStartTime,
                        matchEndTime,
                        playerName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'N/A',
                        playerEmail: user.email || 'N/A',
                        playerPhone: user.phoneNumber || 'N/A',
                        slotNumber: slot.slotNumber,
                        adminName: adminUser 
                            ? `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || 'Unknown'
                            : 'Unknown',
                        adminEmail: adminUser?.email || 'N/A',
                        adminRole: userRole || 'Unknown',
                    },
                });

                this.logger.log(
                    `Cash payment notification email sent to maulik@humansoffootball.in for booking ${booking.id}`
                );
            } else {
                this.logger.warn(
                    `Could not send cash payment notification: Match ${matchId} not found`
                );
            }
        } catch (error) {
            this.logger.error(
                `Failed to send cash payment notification email: ${error.message}`,
                error.stack
            );
            throw error; // Re-throw to be caught by the caller's catch handler
        }
    }

    async removeMatchParticipant(matchId: number, userId: number, shouldRefund: boolean = false, vendorId?: number, vendorRole?: string) {
        this.logger.log(`[removeMatchParticipant] Starting removal of participant - Match ID: ${matchId}, User ID: ${userId}, Should Refund: ${shouldRefund}`);
        
        // If user is a vendor, verify they own this match
        if (vendorRole === UserRole.VENDOR && vendorId) {
            const match = await this.matchRepository.findOne({
                where: { matchId },
                relations: ['vendor']
            });
            if (!match || !match.vendor || match.vendor.id !== vendorId) {
                throw new NotFoundException(`Match with ID ${matchId} not found`);
            }
        }
        
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Find participant within transaction
            this.logger.log(`[removeMatchParticipant] Searching for participant - Match ID: ${matchId}, User ID: ${userId}`);
            const participant = await queryRunner.manager.findOne(MatchParticipant, {
            where: { match: { matchId }, user: { id: userId } },
        });

        if (!participant) {
            this.logger.warn(`[removeMatchParticipant] Participant not found - Match ID: ${matchId}, User ID: ${userId}`);
            throw new NotFoundException('Match participant not found');
        }

        this.logger.log(`[removeMatchParticipant] Found participant - Participant ID: ${participant.matchParticipantId}, Match ID: ${matchId}, User ID: ${userId}`);

            // Find associated booking slot using transaction manager
            this.logger.log(`[removeMatchParticipant] Searching for associated booking slot - Match ID: ${matchId}, User ID: ${userId}`);
            const bookingSlot = await queryRunner.manager
                .createQueryBuilder(BookingSlotEntity, 'bs')
                .innerJoin('bs.booking', 'b')
                .where('b.matchId = :matchId', { matchId })
                .andWhere('bs.playerId = :userId', { userId })
                .andWhere('bs.status = :status', { status: BookingSlotStatus.ACTIVE })
                .getOne();

            if (bookingSlot) {
                this.logger.log(`[removeMatchParticipant] Found booking slot - Slot ID: ${bookingSlot.id}, Booking ID: ${bookingSlot.bookingId}, Slot Number: ${bookingSlot.slotNumber}`);
                
                // Get the associated booking using transaction manager
                this.logger.log(`[removeMatchParticipant] Fetching booking details - Booking ID: ${bookingSlot.bookingId}`);
                const booking = await queryRunner.manager.findOne(BookingEntity, {
                    where: { id: bookingSlot.bookingId },
                });

                if (!booking) {
                    this.logger.error(`[removeMatchParticipant] Associated booking not found - Booking ID: ${bookingSlot.bookingId}`);
                    throw new NotFoundException('Associated booking not found');
                }

                this.logger.log(`[removeMatchParticipant] Booking details - Booking ID: ${booking.id}, Reference: ${booking.bookingReference}, ` +
                    `Total Slots: ${booking.totalSlots}, Amount: ₹${booking.amount}, Payment Status: ${booking.paymentStatus}, Booking Status: ${booking.status}`);

                // Fix: Check BookingStatus.CONFIRMED instead of PaymentStatus.COMPLETED
                // A confirmed booking indicates successful payment, regardless of paymentStatus field
                const isOnlinePayment = booking.status === BookingStatus.CONFIRMED && 
                                      booking.paymentStatus !== PaymentStatus.PAID_CASH;
                const isCashPayment = booking.paymentStatus === PaymentStatus.PAID_CASH;
                
                this.logger.log(`[removeMatchParticipant] Payment type determined - Online Payment: ${isOnlinePayment}, Cash Payment: ${isCashPayment}, ` +
                    `Booking Status: ${booking.status}, Payment Status: ${booking.paymentStatus}`);

                // Process refund for online payments (only if shouldRefund is true)
                if (isOnlinePayment && shouldRefund) {
                    this.logger.log(`[removeMatchParticipant] Processing refund for online payment - Booking ID: ${booking.id}, Should Refund: ${shouldRefund}`);
                    try {
                        // Extract payment ID from booking metadata
                        this.logger.log(`[removeMatchParticipant] Extracting payment ID from booking metadata - Booking ID: ${booking.id}`);
                        const metadata = typeof booking.metadata === 'string' 
                            ? JSON.parse(booking.metadata) 
                            : booking.metadata;
                        const paymentId = metadata?.razorpayPaymentId || metadata?.paymentId;

                        this.logger.log(`[removeMatchParticipant] Payment ID extraction result - Booking ID: ${booking.id}, ` +
                            `Payment ID: ${paymentId || 'NOT FOUND'}, Metadata Keys: ${metadata ? Object.keys(metadata).join(', ') : 'null'}`);

                        if (paymentId) {
                            // Calculate per-slot refund amount
                            const perSlotAmount = parseFloat(booking.amount.toString()) / booking.totalSlots;
                            this.logger.log(`[removeMatchParticipant] Calculated refund amount - Booking ID: ${booking.id}, ` +
                                `Total Amount: ₹${booking.amount}, Total Slots: ${booking.totalSlots}, Per-Slot Amount: ₹${perSlotAmount.toFixed(2)}`);

                            // Initiate refund
                            this.logger.log(`[removeMatchParticipant] Initiating refund via RefundService - Booking ID: ${booking.id}, ` +
                                `Amount: ₹${perSlotAmount.toFixed(2)}, Payment ID: ${paymentId}, Reason: 'Booking slot cancelled'`);
                            
                            const refund = await this.refundService.initiateRefund({
                                bookingId: booking.id.toString(),
                                amount: perSlotAmount,
                                reason: 'Booking slot cancelled',
                                razorpayPaymentId: paymentId,
                                metadata: {
                                    adminRemoval: true,
                                    matchId: matchId,
                                    userId: userId,
                                    removedAt: new Date()
                                }
                            }, queryRunner);

                            this.logger.log(
                                `[removeMatchParticipant] ✅ Refund initiated successfully - Booking ID: ${booking.id}, ` +
                                `Refund ID: ${refund.id}, Amount: ₹${perSlotAmount.toFixed(2)}, ` +
                                `Razorpay Refund ID: ${refund.razorpayRefundId || 'Pending'}, Status: ${refund.status}, ` +
                                `Razorpay Payment ID: ${paymentId}`
                            );
                            this.logger.log(`[removeMatchParticipant] Refund record saved to database - Refund ID: ${refund.id}, Booking ID: ${booking.id}`);
                            
                            // Verify refund was saved in the database
                            const savedRefund = await queryRunner.manager.findOne(RefundEntity, {
                                where: { id: refund.id }
                            });
                            if (savedRefund) {
                                this.logger.log(`[removeMatchParticipant] ✅ Refund record verified in database - Refund ID: ${refund.id}, Status: ${savedRefund.status}`);
                            } else {
                                this.logger.error(`[removeMatchParticipant] ❌ Refund record NOT found in database after save - Refund ID: ${refund.id}`);
                            }
                        } else {
                            this.logger.warn(
                                `[removeMatchParticipant] ⚠️ Cannot process refund - Booking ID: ${booking.id}, ` +
                                `Reason: No payment ID found in metadata. Participant will still be removed. ` +
                                `Metadata: ${JSON.stringify(metadata)}`
                            );
                        }
                    } catch (refundError: any) {
                        this.logger.error(
                            `[removeMatchParticipant] ❌ Failed to process refund - Booking ID: ${booking.id}, ` +
                            `User ID: ${userId}, Match ID: ${matchId}, Error: ${refundError.message}`,
                            refundError.stack
                        );
                        this.logger.error(`[removeMatchParticipant] Refund error details - Booking ID: ${booking.id}, ` +
                            `Error Type: ${refundError.constructor.name}, Error Stack: ${refundError.stack}`);
                        this.logger.warn(`[removeMatchParticipant] ⚠️ Continuing with participant removal despite refund failure - Booking ID: ${booking.id}`);
                        // Continue with participant removal even if refund fails
                        // Note: RefundService should have saved a FAILED refund record if it got that far
                    }

                    // Update slot status to CANCELLED (maintain audit trail for online payments)
                    this.logger.log(`[removeMatchParticipant] Updating slot status to CANCELLED - Slot ID: ${bookingSlot.id}, Booking ID: ${booking.id}`);
                    await queryRunner.manager.update(
                        BookingSlotEntity,
                        { id: bookingSlot.id },
                        { status: BookingSlotStatus.CANCELLED }
                    );
                    this.logger.log(`[removeMatchParticipant] Slot status updated to CANCELLED - Slot ID: ${bookingSlot.id}, Booking ID: ${booking.id}`);
                } else if (isOnlinePayment && !shouldRefund) {
                    // Online payment but refund not requested - just update slot status to CANCELLED
                    this.logger.log(`[removeMatchParticipant] Online payment but refund not requested - Updating slot status to CANCELLED - Slot ID: ${bookingSlot.id}, Booking ID: ${booking.id}`);
                    await queryRunner.manager.update(
                        BookingSlotEntity,
                        { id: bookingSlot.id },
                        { status: BookingSlotStatus.CANCELLED }
                    );
                    this.logger.log(`[removeMatchParticipant] Slot status updated to CANCELLED (no refund) - Slot ID: ${bookingSlot.id}, Booking ID: ${booking.id}`);
                } else if (isCashPayment) {
                    // For cash payments, delete the slot (no refund needed)
                    this.logger.log(`[removeMatchParticipant] Processing cash payment - Deleting slot (no refund needed) - ` +
                        `Slot ID: ${bookingSlot.id}, Booking ID: ${booking.id}`);
                    await queryRunner.manager.remove(BookingSlotEntity, bookingSlot);
                    this.logger.log(`[removeMatchParticipant] Slot deleted - Slot ID: ${bookingSlot.id}, Booking ID: ${booking.id}`);
                } else {
                    // For other payment statuses (e.g., INITIATED, FAILED), still cancel the slot
                    this.logger.log(`[removeMatchParticipant] Processing non-online/cash payment - Updating slot status to CANCELLED - ` +
                        `Slot ID: ${bookingSlot.id}, Booking ID: ${booking.id}, Payment Status: ${booking.paymentStatus}, Booking Status: ${booking.status}`);
                    await queryRunner.manager.update(
                        BookingSlotEntity,
                        { id: bookingSlot.id },
                        { status: BookingSlotStatus.CANCELLED }
                    );
                    this.logger.log(`[removeMatchParticipant] Slot status updated to CANCELLED - Slot ID: ${bookingSlot.id}, Booking ID: ${booking.id}`);
                }

                // Decrement booked_slots in matches table
                this.logger.log(`[removeMatchParticipant] Decrementing booked_slots - Match ID: ${matchId}, Decrement by: 1`);
                const beforeUpdate = await queryRunner.query(
                    `SELECT booked_slots FROM matches WHERE match_id = $1`,
                    [matchId]
                );
                const bookedSlotsBefore = beforeUpdate?.[0]?.booked_slots || 0;
                
                await queryRunner.query(
                    `UPDATE matches 
                     SET booked_slots = booked_slots - $1
                     WHERE match_id = $2`,
                    [1, matchId]
                );
                
                const afterUpdate = await queryRunner.query(
                    `SELECT booked_slots FROM matches WHERE match_id = $1`,
                    [matchId]
                );
                const bookedSlotsAfter = afterUpdate?.[0]?.booked_slots || 0;
                
                this.logger.log(`[removeMatchParticipant] booked_slots updated - Match ID: ${matchId}, ` +
                    `Before: ${bookedSlotsBefore}, After: ${bookedSlotsAfter}, Decremented by: 1`);

                // Check if there are other active slots for this booking
                this.logger.log(`[removeMatchParticipant] Checking remaining active slots - Booking ID: ${booking.id}`);
                const remainingActiveSlots = await queryRunner.manager.count(BookingSlotEntity, {
                    where: { 
                        bookingId: booking.id,
                        status: BookingSlotStatus.ACTIVE
                    },
                });

                this.logger.log(`[removeMatchParticipant] Remaining active slots - Booking ID: ${booking.id}, ` +
                    `Remaining: ${remainingActiveSlots}, Original Total: ${booking.totalSlots}, ` +
                    `Current Booking Status: ${booking.status}`);

                // Update booking status if all slots are cancelled/removed
                if (remainingActiveSlots === 0) {
                    this.logger.log(`[removeMatchParticipant] All slots removed - Updating booking status to CANCELLED - Booking ID: ${booking.id}, Payment Type: ${isOnlinePayment ? 'Online' : 'Cash'}`);
                    // For both online and cash payments, update status to CANCELLED (maintain audit trail)
                    const updateResult = await queryRunner.manager.update(
                        BookingEntity,
                        { id: booking.id },
                        { status: BookingStatus.CANCELLED }
                    );
                    this.logger.log(`[removeMatchParticipant] Booking status update result - Booking ID: ${booking.id}, ` +
                        `Rows Affected: ${updateResult.affected || 0}, Payment Type: ${isOnlinePayment ? 'Online' : 'Cash'}`);
                    
                    // Verify the update
                    const updatedBooking = await queryRunner.manager.findOne(BookingEntity, {
                        where: { id: booking.id }
                    });
                    this.logger.log(`[removeMatchParticipant] Booking status verification - Booking ID: ${booking.id}, ` +
                        `Status: ${updatedBooking?.status || 'NOT FOUND'}`);
                } else if (isOnlinePayment && remainingActiveSlots < booking.totalSlots) {
                    // Partial cancellation for online payments
                    this.logger.log(`[removeMatchParticipant] Partial cancellation detected - Updating booking status to PARTIALLY_CANCELLED - ` +
                        `Booking ID: ${booking.id}, Remaining Slots: ${remainingActiveSlots}, Original Total: ${booking.totalSlots}`);
                    await queryRunner.manager.update(
                        BookingEntity,
                        { id: booking.id },
                        { status: BookingStatus.PARTIALLY_CANCELLED }
                    );
                    this.logger.log(`[removeMatchParticipant] Booking status updated to PARTIALLY_CANCELLED - Booking ID: ${booking.id}`);
                } else {
                    this.logger.log(`[removeMatchParticipant] Booking status unchanged - Booking ID: ${booking.id}, ` +
                        `Remaining Slots: ${remainingActiveSlots}, Original Total: ${booking.totalSlots}`);
                }
            } else {
                this.logger.log(`[removeMatchParticipant] No active booking slot found - Match ID: ${matchId}, User ID: ${userId}`);
            }

            // Delete any related match participant stats
            this.logger.log(`[removeMatchParticipant] Deleting match participant stats - Participant ID: ${participant.matchParticipantId}`);
            const deletedStats = await queryRunner.manager.delete(MatchParticipantStats, {
                matchParticipant: { matchParticipantId: participant.matchParticipantId },
            });
            this.logger.log(`[removeMatchParticipant] Match participant stats deleted - Participant ID: ${participant.matchParticipantId}, Deleted: ${deletedStats.affected || 0} records`);

            // Delete the participant
            this.logger.log(`[removeMatchParticipant] Removing match participant - Participant ID: ${participant.matchParticipantId}, Match ID: ${matchId}, User ID: ${userId}`);
            await queryRunner.manager.remove(MatchParticipant, participant);
            this.logger.log(`[removeMatchParticipant] Match participant removed - Participant ID: ${participant.matchParticipantId}`);

            await queryRunner.commitTransaction();
            this.logger.log(`[removeMatchParticipant] ✅ Transaction committed successfully - Match ID: ${matchId}, User ID: ${userId}`);
            this.logger.log(`[removeMatchParticipant] ✅ Successfully removed participant ${userId} from match ${matchId} and processed associated booking slot/refund`);

        return { message: 'Match participant removed successfully' };
        } catch (error) {
            this.logger.error(`[removeMatchParticipant] ❌ Transaction failed - Rolling back - Match ID: ${matchId}, User ID: ${userId}, Error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
            await queryRunner.rollbackTransaction();
            this.logger.error(`[removeMatchParticipant] ❌ Transaction rolled back - Match ID: ${matchId}, User ID: ${userId}`);
            throw error;
        } finally {
            await queryRunner.release();
            this.logger.log(`[removeMatchParticipant] Query runner released - Match ID: ${matchId}, User ID: ${userId}`);
        }
    }

    // CSV Upload Preview
    async previewCsvUpload(file: Express.Multer.File, matchId: number, userId?: number, userRole?: string) {
        // If user is a vendor, verify they own this match
        if (userRole === UserRole.VENDOR && userId) {
            const match = await this.matchRepository.findOne({
                where: { matchId },
                relations: ['vendor']
            });
            if (!match || !match.vendor || match.vendor.id !== userId) {
                throw new NotFoundException(`Match with ID ${matchId} not found`);
            }
        }

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
    async uploadMatchStats(matchId: number, csvData: any[], userId?: number, userRole?: string) {
        // If user is a vendor, verify they own this match
        if (userRole === UserRole.VENDOR && userId) {
            const match = await this.matchRepository.findOne({
                where: { matchId },
                relations: ['vendor']
            });
            if (!match || !match.vendor || match.vendor.id !== userId) {
                throw new NotFoundException(`Match with ID ${matchId} not found`);
            }
        }

        // Convert the processed CSV data back to the format expected by CsvUploadService
        const mockFile = {
            buffer: Buffer.from(this.arrayToCsv(csvData)),
            originalname: 'processed_data.csv'
        } as Express.Multer.File;

        return this.csvUploadService.uploadCsv(mockFile, matchId);
    }

    // MVP Selection
    async setMatchMvp(matchId: number, userId: number, vendorId?: number, vendorRole?: string) {
        // If user is a vendor, verify they own this match
        if (vendorRole === UserRole.VENDOR && vendorId) {
            const match = await this.matchRepository.findOne({
                where: { matchId },
                relations: ['vendor']
            });
            if (!match || !match.vendor || match.vendor.id !== vendorId) {
                throw new NotFoundException(`Match with ID ${matchId} not found`);
            }
        }

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

    /**
     * Read admin-facing changelog entries (CHANGELOG.admin.md) and return only
     * entries from the last 7 days for display in the admin panel \"Updates\" tab.
     */
    async getRecentAdminUpdates() {
        try {
            const changelogPath = path.resolve(process.cwd(), 'CHANGELOG.admin.md');
            const raw = await fs.readFile(changelogPath, 'utf-8');

            const lines = raw.split(/\r?\n/);
            const entries: Array<{
                version: string;
                date: string;
                whatChanged: string[];
                howToTest: string[];
            }> = [];

            let currentVersion: string | null = null;
            let currentDate: string | null = null;
            let inWhatChanged = false;
            let inHowToTest = false;
            let bufferWhat: string[] = [];
            let bufferHow: string[] = [];

            const flushEntry = () => {
                if (currentVersion && currentDate && (bufferWhat.length || bufferHow.length)) {
                    entries.push({
                        version: currentVersion,
                        date: currentDate,
                        whatChanged: bufferWhat.slice(),
                        howToTest: bufferHow.slice(),
                    });
                }
                bufferWhat = [];
                bufferHow = [];
                inWhatChanged = false;
                inHowToTest = false;
            };

            for (const line of lines) {
                const versionMatch = line.match(/^##\s+v([0-9]+\.[0-9]+\.[0-9]+)\s+\((\d{4}-\d{2}-\d{2})\)/);
                if (versionMatch) {
                    flushEntry();
                    currentVersion = `v${versionMatch[1]}`;
                    currentDate = versionMatch[2];
                    continue;
                }

                if (/^###\s+What changed/i.test(line)) {
                    inWhatChanged = true;
                    inHowToTest = false;
                    continue;
                }
                if (/^###\s+How to test/i.test(line)) {
                    inWhatChanged = false;
                    inHowToTest = true;
                    continue;
                }

                const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
                if (bulletMatch) {
                    const text = bulletMatch[1].trim();
                    if (inWhatChanged) {
                        bufferWhat.push(text);
                    } else if (inHowToTest) {
                        bufferHow.push(text);
                    }
                    continue;
                }

                const stepMatch = line.match(/^\s*\d+\.\s+(.*)$/);
                if (stepMatch && inHowToTest) {
                    bufferHow.push(stepMatch[1].trim());
                }
            }

            flushEntry();

            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

            const recent = entries.filter(e => {
                const d = new Date(e.date);
                return !Number.isNaN(d.getTime()) && d >= oneWeekAgo;
            });

            return {
                success: true,
                message: 'Recent admin updates',
                data: recent,
            };
        } catch (error) {
            this.logger.error('Failed to read admin changelog for updates', error as any);
            throw new BadRequestException('Failed to read admin updates');
        }
    }

    async getChiefs() {
        // Include all roles that can manage matches (consistent with frontend permissions)
        // Added 'vendor' so vendors can select themselves as football chief
        const roles = ['football_chief', 'academy_admin', 'admin', 'super_admin', 'vendor'];
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
        // Ensure both are valid numbers
        const slotPriceNum = typeof slotPrice === 'string' ? parseFloat(slotPrice) : Number(slotPrice);
        const offerPriceNum = typeof offerPrice === 'string' ? parseFloat(offerPrice) : Number(offerPrice);
        
        // Check for NaN
        if (isNaN(slotPriceNum) || isNaN(offerPriceNum)) {
            throw new Error('Slot price and offer price must be valid numbers');
        }
        
        // Both prices must be >= 0
        if (slotPriceNum < 0 || offerPriceNum < 0) {
            throw new Error('Slot price and offer price must be greater than or equal to 0');
        }

        // Offer price must be <= slot price
        if (offerPriceNum > slotPriceNum) {
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

    async cancelMatchWithRefunds(matchId: number, userId?: number, userRole?: string): Promise<{
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
                relations: ['venue', 'city', 'footballChief', 'vendor']
            });

            if (!match) {
                throw new NotFoundException(`Match with ID ${matchId} not found`);
            }

            // If user is a vendor, verify they own this match
            if (userRole === UserRole.VENDOR && userId) {
                if (!match.vendor || match.vendor.id !== userId) {
                    throw new NotFoundException(`Match with ID ${matchId} not found`);
                }
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

    async getMatchCancellationPreview(matchId: number, userId?: number, userRole?: string): Promise<{
        match: any;
        confirmedBookings: Array<{ id: number; bookingReference: string; email: string; amount: number; razorpayOrderId?: string | null }>;
        nonConfirmedBookings: Array<{ id: number; bookingReference: string; email: string; amount: number; razorpayOrderId?: string | null }>;
        totalRefundAmount: number;
    }> {
        // Get match details
        const match = await this.matchRepository.findOne({
            where: { matchId },
            relations: ['venue', 'city', 'footballChief', 'vendor']
        });

        if (!match) {
            throw new NotFoundException(`Match with ID ${matchId} not found`);
        }

        // If user is a vendor, verify they own this match
        if (userRole === UserRole.VENDOR && userId) {
            if (!match.vendor || match.vendor.id !== userId) {
                throw new NotFoundException(`Match with ID ${matchId} not found`);
            }
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

    // Dashboard Stats - Optimized endpoint for dashboard
    async getDashboardStats() {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        // Use COUNT queries instead of fetching all data
        const [totalUsers, totalParticipants, monthlyMatches, futureMatches] = await Promise.all([
            // Total users count
            this.userRepository.count(),
            
            // Total participants count
            this.matchParticipantRepository.count(),
            
            // Monthly matches count (matches in current month)
            this.matchRepository
                .createQueryBuilder('match')
                .where('match.start_time >= :monthStart', { monthStart: monthStart.toISOString() })
                .andWhere('match.start_time <= :monthEnd', { monthEnd: monthEnd.toISOString() })
                .getCount(),
            
            // Future matches count (matches where start_time is in the future)
            // Use database NOW() to avoid timezone issues
            this.matchRepository
                .createQueryBuilder('match')
                .where('match.start_time > NOW()')
                .andWhere('match.status != :cancelled', { cancelled: 'CANCELLED' })
                .getCount()
        ]);

        return {
            success: true,
            data: {
                totalUsers,
                totalParticipants,
                monthlyMatches,
                futureMatches
            }
        };
    }

}
