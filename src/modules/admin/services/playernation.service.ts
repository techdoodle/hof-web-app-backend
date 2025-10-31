import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Match } from '../../matches/matches.entity';
import { User } from '../../user/user.entity';
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
      totalCount: number;
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
    @InjectRepository(PlayerNationToken)
    private readonly tokenRepository: Repository<PlayerNationToken>,
    @InjectRepository(PlayerNationPlayerMapping)
    private readonly mappingRepository: Repository<PlayerNationPlayerMapping>,
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
      }

      this.logger.log(`Polled match ${matchId}, status: ${response.data.status}`);
    } catch (error) {
      this.logger.error(`Failed to poll match ${matchId}`, error);
      throw new BadRequestException('Failed to poll match stats from PlayerNation');
    }
  }

  private async processPlayerStats(matchId: number, response: PlayerNationStatsResponse): Promise<void> {
    if (!response.playerStats) {
      return;
    }

    // Process each player
    for (const [playerId, playerData] of Object.entries(response.playerStats)) {
      const { playerInfo, stats, hightlightURL } = playerData;

      // Check if player has hofPlayerId
      if (playerInfo.hofPlayerId) {
        // Try to find user by hofPlayerId (assuming it's the user ID)
        const user = await this.userRepository.findOne({
          where: { id: parseInt(playerInfo.hofPlayerId.replace('HF-PLAYER-', '')) },
        });

        if (user) {
          // Map stats directly
          await this.mapStatsToCompact(matchId, user.id, stats);
          continue;
        }
      }

      // Create mapping entry for manual matching
      await this.mappingRepository.save({
        matchId: matchId,
        externalPlayerId: playerId,
        externalName: playerInfo.name,
        externalTeam: playerInfo.team,
        thumbnailUrls: playerInfo.thumbnail,
        status: PlayerMappingStatus.UNMATCHED,
        createdById: 1, // TODO: Get from current user context
      });
    }

    // Update match status
    await this.matchRepository.update(matchId, {
      playernationStatus: 'PARTIAL', // Will be 'IMPORTED' when all players mapped
    });
  }

  private async mapStatsToCompact(matchId: number, userId: number, stats: Record<string, any>): Promise<void> {
    // Map PlayerNation stats to compact format
    const compactStats = {
      goals: stats.goal?.totalCount || 0,
      assists: stats.assist?.totalCount || 0,
      totalPasses: stats.pass?.totalCount || 0,
      passingAccuracy: stats.passAccuracy?.isPercentageStat 
        ? (stats.passAccuracy.totalCount / 100) 
        : stats.passAccuracy?.totalCount || 0,
      keyPasses: stats.keyPass?.totalCount || 0,
      totalShots: stats.shot?.totalCount || 0,
      shotAccuracy: stats.shotAccuracy?.isPercentageStat 
        ? (stats.shotAccuracy.totalCount / 100) 
        : stats.shotAccuracy?.totalCount || 0,
      tackles: stats.tackle?.totalCount || 0,
      interceptions: stats.interception?.totalCount || 0,
      saves: stats.save?.totalCount || 0,
    };

    // TODO: Upsert into match_participant_stats table
    // This would require the match-participant-stats service
    this.logger.log(`Mapped stats for user ${userId} in match ${matchId}:`, compactStats);
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
