import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Match } from '../../matches/matches.entity';
import { User } from '../../user/user.entity';
import { MatchParticipant } from '../../match-participants/match-participants.entity';
import { MatchParticipantStats } from '../../match-participant-stats/match-participant-stats.entity';
import { PlayerNationToken } from '../entities/playernation-token.entity';
import { PlayerNationPlayerMapping, PlayerMappingStatus } from '../entities/playernation-player-mapping.entity';
import { PlayerNationSubmitDto } from '../dto/playernation-submit.dto';
import { SaveMappingsDto } from '../dto/playernation-mapping.dto';


interface PlayerNationResponse {
  success: boolean;
  message: string;
  accessToken?: string;
  matchId?: string;
}

interface PlayerNationStatsResponse {
  status: 'success' | 'analyzing' | 'cancelled';
  matchNotes?: string;
  playerStats?: Record<string, {
    playerInfo: {
      name: string;
      jerseyNumber: string;
      team: string;
      hofPlayerId?: string;
      thumbnail: string[];
    };
    hightlightURL: Array<{
      youtubeVideoUrl: string;
      name: string;
    }>;
    stats: Record<string, {
      type: 'raw' | 'derived';
      totalCount: number | string;
      isPercentageStat: boolean;
      minutes?: number[];
      description?: string;
    }>;
  }>;
}

@Injectable()
export class PlayerNationService {
  private readonly logger = new Logger(PlayerNationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(MatchParticipant)
    private readonly matchParticipantRepository: Repository<MatchParticipant>,
    @InjectRepository(MatchParticipantStats)
    private readonly matchParticipantStatsRepository: Repository<MatchParticipantStats>,
    @InjectRepository(PlayerNationToken)
    private readonly tokenRepository: Repository<PlayerNationToken>,
    @InjectRepository(PlayerNationPlayerMapping)
    private readonly mappingRepository: Repository<PlayerNationPlayerMapping>,
    private readonly dataSource: DataSource,
  ) {}

  async getValidToken(forceRefresh: boolean = false): Promise<string> {
    // Check for existing valid token (with 1 hour buffer)
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    const existingToken = await this.tokenRepository.findOne({
      where: {
        expiresAt: MoreThan(oneHourFromNow),
      },
      order: { createdAt: 'DESC' },
    });

    if (!forceRefresh && existingToken) {
      console.log('Using existing valid token');
      return existingToken.accessToken;
    }

    console.log(forceRefresh ? 'Force refreshing PlayerNation token...' : 'No valid token found, getting new token...');

    // Get new token
    const phone = this.configService.get<string>('playernation.phone');
    const password = this.configService.get<string>('playernation.password');

    if (!phone || !password) {
      throw new BadRequestException('PlayerNation credentials not configured');
    }

    try {
      const baseUrl = this.configService.get('playernation.baseUrl');
      const verifyUrl = `${baseUrl}/hof/verify`;
      const verifyHeaders = { 'Content-Type': 'application/json' } as Record<string, string>;

      const response = await firstValueFrom(
        this.httpService.post<PlayerNationResponse>(
          verifyUrl,
          { phone, password },
          { headers: verifyHeaders },
        ),
      );

      if (!response.data.success || !response.data.accessToken) {
        throw new BadRequestException('Failed to get PlayerNation token');
      }

      // Store token in database
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

      await this.tokenRepository.save({
        accessToken: response.data.accessToken,
        expiresAt: expiresAt,
      });

      return response.data.accessToken;
    } catch (error) {

      this.logger.error('Failed to get PlayerNation token', error);
      throw new BadRequestException('Failed to authenticate with PlayerNation');
    }
  }

  async submitMatch(matchId: number, payload: PlayerNationSubmitDto): Promise<string> {
    const match = await this.matchRepository.findOne({
      where: { matchId },
      relations: ['footballChief'],
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    // Always refresh token for each submit to avoid stale token issues
    const token = await this.getValidToken(true);

    try {
      console.log('=== PLAYERNATION API CALL ===');
      console.log('URL:', `${this.configService.get('playernation.baseUrl')}/hof/uploadGame`);
      console.log('Token (first 50 chars):', token.substring(0, 50) + '...');
      console.log('=== COMPLETE PAYLOAD ===');
      console.log(JSON.stringify(payload, null, 2));
      console.log('=== PAYLOAD STRUCTURE ===');
      console.log('teamA:', payload.teamA);
      console.log('teamB:', payload.teamB);
      console.log('matchDate:', payload.matchDate);
      console.log('matchLink:', payload.matchLink);
      console.log('players.teamA length:', payload.players?.teamA?.length || 0);
      console.log('players.teamB length:', payload.players?.teamB?.length || 0);
      console.log('players.teamA sample:', payload.players?.teamA?.[0]);
      console.log('players.teamB sample:', payload.players?.teamB?.[0]);
      console.log('=== END PAYLOAD DEBUG ===');

      // (file payload logging removed)
      
      // Test token validity first
      console.log('Testing token validity...');
      let finalToken = token;
      try {
        const testResponse = await firstValueFrom(
          this.httpService.post(
            `${this.configService.get('playernation.baseUrl')}/hof/verify`,
            { phone: this.configService.get('playernation.phone'), password: this.configService.get('playernation.password') },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
            },
          ),
        );
        console.log('Token test response:', testResponse.data);
      } catch (testError) {
        console.error('Token test failed:', testError.response?.data || testError.message);
        // If token test fails, try to get a fresh token
        console.log('Attempting to refresh token...');
        finalToken = await this.getValidToken();
        console.log('Fresh token obtained:', finalToken.substring(0, 50) + '...');
      }
      
      const uploadUrl = `${this.configService.get('playernation.baseUrl')}/hof/uploadGame`;
      const requestHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${finalToken}`,
      } as Record<string, string>;

      const response = await firstValueFrom(
        this.httpService.post<PlayerNationResponse>(
          uploadUrl,
          payload,
          { headers: requestHeaders },
        ),
      );

      // (file response logging removed)

      if (!response.data.success || !response.data.matchId) {
        throw new BadRequestException('Failed to submit match to PlayerNation');
      }

      // Update match with PlayerNation matchId and status
      await this.matchRepository.update(matchId, {
        matchStatsId: response.data.matchId,
        playernationStatus: 'PENDING',
        playernationPayload: payload as any,
        playernationNextPollAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        playernationPollAttempts: 0,
      });

      this.logger.log(`Match ${matchId} submitted to PlayerNation with matchId: ${response.data.matchId}`);
      return response.data.matchId;
    } catch (error) {
      console.error('=== PLAYERNATION API ERROR ===');
      console.error('Error:', error.response?.data || error.message);
      console.error('Status:', error.response?.status);
      console.error('Headers:', error.response?.headers);

      // (file error logging removed)
      
      this.logger.error(`Failed to submit match ${matchId} to PlayerNation`, error);
      throw new BadRequestException('Failed to submit match to PlayerNation');
    }
  }

  async pollMatchStats(matchId: number): Promise<void> {
    const match = await this.matchRepository.findOne({
      where: { matchId },
    });

    if (!match || !match.matchStatsId) {
      throw new NotFoundException('Match or PlayerNation matchId not found');
    }

    // Refresh token for polling as well to avoid stale auth
    const token = await this.getValidToken(true);

    try {
      const response = await firstValueFrom(
        this.httpService.post<PlayerNationStatsResponse>(
          `${this.configService.get('playernation.baseUrl')}/hof/getStats`,
          { matchId: match.matchStatsId },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          },
        ),
      );

      // Update match with response
      await this.matchRepository.update(matchId, {
        playernationLastResponse: response.data as any,
        playernationPollAttempts: match.playernationPollAttempts + 1,
      });

      if (response.data.status === 'analyzing') {
        // Schedule next poll
        await this.matchRepository.update(matchId, {
          playernationStatus: 'PROCESSING',
          playernationNextPollAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        });
      } else if (response.data.status === 'cancelled') {
        await this.matchRepository.update(matchId, {
          playernationStatus: 'ERROR',
        });
      } else if (response.data.status === 'success') {
        await this.processPlayerStats(matchId, response.data);
        // Update status to SUCCESS after processing
        await this.matchRepository.update(matchId, {
          playernationStatus: 'SUCCESS',
        });
        this.logger.log(`Match ${matchId} stats processed successfully`);
      }

      this.logger.log(`Polled match ${matchId}, status: ${response.data.status}`);
    } catch (error) {
      this.logger.error(`Failed to poll match ${matchId}`, error);
      throw new BadRequestException('Failed to poll match stats from PlayerNation');
    }
  }

  private async processPlayerStats(matchId: number, response: PlayerNationStatsResponse): Promise<void> {
    if (!response.playerStats) {
      this.logger.warn(`No player stats in response for match ${matchId}`);
      return;
    }

    const match = await this.matchRepository.findOne({ where: { matchId } });
    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    let processedCount = 0;
    let unmappedCount = 0;

    // Process each player
    for (const [externalPlayerId, playerData] of Object.entries(response.playerStats)) {
      const { playerInfo, stats } = playerData;

      let user: User | null = null;

      // Try to find user by hofPlayerId
      if (playerInfo.hofPlayerId) {
        // Try parsing as numeric ID (what we send)
        const numericId = parseInt(playerInfo.hofPlayerId);
        if (!isNaN(numericId)) {
          user = await this.userRepository.findOne({
            where: { id: numericId },
          });
        }

        // If still not found, try matching by name and team from match participants
        if (!user) {
          const matchParticipants = await this.matchParticipantRepository.find({
            where: { match: { matchId } },
            relations: ['user'],
          });

          // Try to match by name (case-insensitive) and team
          for (const participant of matchParticipants) {
            const fullName = `${participant.user.firstName || ''} ${participant.user.lastName || ''}`.trim().toLowerCase();
            const playerName = playerInfo.name.trim().toLowerCase();
            
            // Match team name (A/B or actual team names)
            const teamMatch = 
              participant.teamName === playerInfo.team ||
              (match.teamAName && match.teamAName === playerInfo.team && participant.teamName === match.teamAName) ||
              (match.teamBName && match.teamBName === playerInfo.team && participant.teamName === match.teamBName);

            if (fullName.includes(playerName) || playerName.includes(fullName)) {
              if (teamMatch) {
                user = participant.user;
                this.logger.log(`Matched player ${playerInfo.name} to user ${user.id} by name and team`);
                break;
              }
            }
          }
        }
      }

      if (user) {
        // Map and save stats
        try {
          await this.mapStatsToCompact(matchId, user.id, stats);
          processedCount++;
        } catch (error) {
          this.logger.error(`Failed to save stats for user ${user.id} in match ${matchId}:`, error);
          // Create mapping entry as fallback
          await this.mappingRepository.save({
            matchId: matchId,
            externalPlayerId: externalPlayerId,
            externalName: playerInfo.name,
            externalTeam: playerInfo.team,
            thumbnailUrls: playerInfo.thumbnail,
            status: PlayerMappingStatus.UNMATCHED,
            createdById: 1,
          });
          unmappedCount++;
        }
      } else {
        // Create mapping entry for manual matching
        await this.mappingRepository.save({
          matchId: matchId,
          externalPlayerId: externalPlayerId,
          externalName: playerInfo.name,
          externalTeam: playerInfo.team,
          thumbnailUrls: playerInfo.thumbnail,
          status: PlayerMappingStatus.UNMATCHED,
          createdById: 1,
        });
        unmappedCount++;
        this.logger.warn(`Could not match player ${playerInfo.name} (${playerInfo.hofPlayerId || 'no hofPlayerId'}) to any user`);
      }
    }

    this.logger.log(`Processed ${processedCount} players, ${unmappedCount} unmapped for match ${matchId}`);
  }

  private async mapStatsToCompact(matchId: number, userId: number, stats: Record<string, any>): Promise<void> {
    // Helper function to parse numeric values (handle string numbers and "NA")
    const parseNumeric = (value: number | string | undefined): number => {
      if (value === undefined || value === null) return 0;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        if (value === 'NA' || value === '') return 0;
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    };

    // Helper function to parse percentage (0-1 range or percentage)
    const parsePercentage = (stat: any): number => {
      if (!stat) return 0;
      const value = parseNumeric(stat.totalCount);
      if (stat.isPercentageStat) {
        // If already 0-1 range, return as is; otherwise assume it's 0-100
        return value > 1 ? value / 100 : value;
      }
      return value;
    };

    // Map PlayerNation stats to compact format based on actual response structure
    const compactStats = {
      totalGoal: parseNumeric(stats.goals?.totalCount),
      totalAssist: parseNumeric(stats.assists?.totalCount),
      totalPass: parseNumeric(stats.passes_total?.totalCount),
      totalPassingAccuracy: parsePercentage(stats.passing_accuracy_overall),
      totalKeyPass: parseNumeric(stats.key_passes?.totalCount),
      totalShot: parseNumeric(stats.shots_total?.totalCount),
      shotAccuracy: parsePercentage(stats.shot_accuracy),
      totalTackles: parseNumeric(stats.tackles_total?.totalCount),
      totalInterceptions: parseNumeric(stats.interceptions_total?.totalCount),
      totalSave: parseNumeric(stats.saves?.totalCount),
    };

    // Get match, user, and match participant
    const match = await this.matchRepository.findOne({ where: { matchId } });
    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const matchParticipant = await this.matchParticipantRepository.findOne({
      where: {
        match: { matchId },
        user: { id: userId },
      },
    });

    if (!matchParticipant) {
      throw new NotFoundException(`Match participant not found for user ${userId} in match ${matchId}`);
    }

    // Check if stats already exist
    const existingStats = await this.matchParticipantStatsRepository.findOne({
      where: {
        match: { matchId },
        player: { id: userId },
      },
    });

    // Use transaction to ensure atomicity
    await this.dataSource.transaction(async (manager) => {
      if (existingStats) {
        // Update existing stats
        Object.assign(existingStats, compactStats);
        await manager.save(MatchParticipantStats, existingStats);
        this.logger.log(`Updated stats for user ${userId} in match ${matchId}`);
      } else {
        // Create new stats
        const statsEntity = manager.create(MatchParticipantStats, {
          match: match,
          player: user,
          matchParticipant: matchParticipant,
          ...compactStats,
        });
        await manager.save(MatchParticipantStats, statsEntity);
        this.logger.log(`Created stats for user ${userId} in match ${matchId}`);
      }
    });
  }

  async getUnmappedPlayers(matchId: number): Promise<PlayerNationPlayerMapping[]> {
    return this.mappingRepository.find({
      where: { matchId: matchId, status: PlayerMappingStatus.UNMATCHED },
    });
  }

  async saveMappings(matchId: number, mappings: SaveMappingsDto['mappings']): Promise<void> {
    for (const mapping of mappings) {
      await this.mappingRepository.update(
        { matchId: matchId, externalPlayerId: mapping.externalPlayerId },
        {
          internalPlayerId: mapping.internalPlayerId,
          internalPhone: mapping.internalPhone,
          status: PlayerMappingStatus.MATCHED,
        },
      );
    }

    // Check if all players are now mapped
    const unmappedCount = await this.mappingRepository.count({
      where: { matchId: matchId, status: PlayerMappingStatus.UNMATCHED },
    });

    if (unmappedCount === 0) {
      await this.matchRepository.update(matchId, {
        playernationStatus: 'IMPORTED',
      });
    }
  }

  async getMatchStatus(matchId: number): Promise<any> {
    const match = await this.matchRepository.findOne({
      where: { matchId },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    return {
      matchStatsId: match.matchStatsId,
      status: match.playernationStatus,
      lastPollTime: match.playernationLastResponse,
      pollAttempts: match.playernationPollAttempts,
      nextPollAt: match.playernationNextPollAt,
    };
  }
}
