import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../user/user.entity';
import { Match } from '../matches/matches.entity';
import { MatchParticipant } from '../match-participants/match-participants.entity';
import { MatchParticipantStats } from '../match-participant-stats/match-participant-stats.entity';
import { FootballTeam } from '../football-teams/football-teams.entity';
import { City } from '../cities/cities.entity';
import { Venue } from '../venue/venue.entity';
import { CsvUploadService } from '../match-participant-stats/csv-upload.service';
import * as csv from 'csv-parser';
import { Readable } from 'stream';
import { CreateUserDto, UpdateUserDto, UserFilterDto } from './dto/user.dto';
import { CreateMatchDto, MatchFilterDto, UpdateMatchDto } from './dto/match.dto';

@Injectable()
export class AdminService {
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
        private readonly csvUploadService: CsvUploadService,
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

        const [users, total] = await queryBuilder
            .orderBy('user.createdAt', 'DESC')
            .limit(filters.limit || 50)
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
            .leftJoinAndSelect('match.footballChief', 'footballChief');

        if (filters.search) {
            queryBuilder.where('match.name ILIKE :search', { search: `%${filters.search}%` });
        }

        if (filters.venue) {
            queryBuilder.andWhere('venue.id = :venueId', { venueId: filters.venue });
        }

        if (filters.startDate) {
            queryBuilder.andWhere('match.start_time >= :startDate', { startDate: filters.startDate });
        }

        if (filters.endDate) {
            queryBuilder.andWhere('match.start_time <= :endDate', { endDate: filters.endDate });
        }

        console.log('Match query filters:', filters);

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

        console.log('Match query:', {
            filters,
            sortField,
            sortOrder,
            query: queryBuilder.getSql()
        });

        try {
            const [matches, total] = await queryBuilder
                .orderBy(sortField, sortOrder as 'ASC' | 'DESC')
                .limit(filters.limit || 50)
                .offset(filters.offset || 0)
                .getManyAndCount();

            // Map matchId to id for frontend compatibility
            const mappedMatches = matches.map(match => ({
                ...match,
                id: match.matchId // Add id field while keeping matchId
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

        const match = this.matchRepository.create({
            ...createMatchDto,
            footballChief: { id: createMatchDto.footballChief } as any,
            venue: createMatchDto.venue ? { id: createMatchDto.venue } as any : null,
            city: cityId ? { id: cityId } as any : null
        });
        const savedMatch = await this.matchRepository.save(match);
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

            // Handle entity references
            const updateData = {
                ...updateMatchDto,
                footballChief: updateMatchDto.footballChief ? { id: updateMatchDto.footballChief } as any : undefined,
                venue: updateMatchDto.venue ? { id: updateMatchDto.venue } as any : undefined,
                city: updateMatchDto.city ? { id: updateMatchDto.city } as any : undefined
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

    async deleteMatch(id: number) {
        const match = await this.matchRepository.findOne({ where: { matchId: id } });
        if (!match) {
            throw new NotFoundException(`Match with ID ${id} not found`);
        }

        await this.matchRepository.remove(match);
        return { message: 'Match deleted successfully' };
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

            // Map data for React Admin's ReferenceField compatibility
            const mappedParticipants = participants.map(participant => ({
                id: participant.matchParticipantId,
                teamName: participant.teamName,
                paidStatsOptIn: participant.paidStatsOptIn,
                // Reference IDs for React Admin
                matchId: participant.match?.matchId,  // Just the ID for ReferenceField
                user: participant.user?.id,         // Just the ID for ReferenceField
                // Keep creation/update timestamps
                createdAt: participant.createdAt,
                updatedAt: participant.updatedAt
            }));

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
            relations: ['venue', 'venue.city', 'footballChief']
        });

        if (!match) {
            throw new NotFoundException(`Match with ID ${id} not found`);
        }

        return { ...match, id: match.matchId };
    }

    async getMatchParticipants(matchId: number) {
        return this.matchParticipantRepository.find({
            where: { match: { matchId } },
            relations: ['user', 'match'],
        });
    }

    async addMatchParticipant(matchId: number, participantData: any) {
        const match = await this.matchRepository.findOne({ where: { matchId } });
        if (!match) {
            throw new NotFoundException(`Match with ID ${matchId} not found`);
        }

        const user = await this.userRepository.findOne({ where: { id: participantData.userId } });
        if (!user) {
            throw new NotFoundException(`User with ID ${participantData.userId} not found`);
        }

        const existingParticipant = await this.matchParticipantRepository.findOne({
            where: { match: { matchId }, user: { id: participantData.userId } },
        });

        if (existingParticipant) {
            throw new BadRequestException('User is already a participant in this match');
        }

        const participant = this.matchParticipantRepository.create({
            match,
            user,
            teamName: participantData.teamName,
            paidStatsOptIn: participantData.paidStatsOptIn || false,
        });

        return this.matchParticipantRepository.save(participant);
    }

    async removeMatchParticipant(matchId: number, userId: number) {
        const participant = await this.matchParticipantRepository.findOne({
            where: { match: { matchId }, user: { id: userId } },
        });

        if (!participant) {
            throw new NotFoundException('Match participant not found');
        }

        // First delete any related match participant stats
        await this.matchParticipantStatsRepository.delete({
            matchParticipant: { matchParticipantId: participant.matchParticipantId }
        });

        // Then delete the participant
        await this.matchParticipantRepository.remove(participant);
        return { message: 'Match participant removed successfully' };
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

    // Venue Management
    async getVenues(query: any) {
        const venues = await this.venueRepository.find({
            relations: ['city'],
            order: { name: 'ASC' }
        });

        const total = await this.venueRepository.count();

        return {
            data: venues,
            total: total
        };
    }

    async getVenue(id: number) {
        const venue = await this.venueRepository.findOne({
            where: { id },
            relations: ['city']
        });

        if (!venue) {
            throw new NotFoundException(`Venue with ID ${id} not found`);
        }

        return venue;
    }

    async createVenue(createVenueDto: any) {
        // Check if phone number already exists
        const existingVenue = await this.venueRepository.findOne({
            where: { phoneNumber: createVenueDto.phoneNumber }
        });

        if (existingVenue) {
            throw new BadRequestException('Phone number already exists');
        }

        // Create new venue without ID
        const venue = this.venueRepository.create({
            name: createVenueDto.name,
            phoneNumber: createVenueDto.phoneNumber,
            address: createVenueDto.address,
            city: { id: createVenueDto.cityId }
        });

        return this.venueRepository.save(venue);
    }

    async updateVenue(id: number, updateVenueDto: any) {
        const venue = await this.venueRepository.findOne({ where: { id } });
        if (!venue) {
            throw new NotFoundException(`Venue with ID ${id} not found`);
        }

        if (updateVenueDto.cityId) {
            updateVenueDto.city = { id: updateVenueDto.cityId };
            delete updateVenueDto.cityId;
        }

        Object.assign(venue, updateVenueDto);
        return this.venueRepository.save(venue);
    }

    async deleteVenue(id: number) {
        const venue = await this.venueRepository.findOne({ where: { id } });
        if (!venue) {
            throw new NotFoundException(`Venue with ID ${id} not found`);
        }

        await this.venueRepository.remove(venue);
        return { message: 'Venue deleted successfully' };
    }
}
