import { Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, DataSource, IsNull, Not } from 'typeorm';
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
import { MatchesService } from '../../matches/matches.service';
import { MatchType } from '../../../common/enums/match-type.enum';
import * as fs from 'fs/promises';
import * as path from 'path';


interface PlayerNationResponse {
  success: boolean;
  message: string;
  accessToken?: string;
  matchId?: string;
}

interface PlayerNationStatsResponse {
  status: 'success' | 'analyzing' | 'cancelled';
  matchNotes?: string;
  matchHighlights?: string;
  playerStats?: Record<string, {
    playerInfo: {
      name: string;
      jerseyNumber: string;
      team: string;
      hofPlayerId?: string;
        thumbnail: string[];
        playerVideo?: string;
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
    @Inject(forwardRef(() => MatchesService))
    private readonly matchesService: MatchesService,
  ) {}

  private parseHofPlayerId(value?: string): number | undefined {
    if (!value) return undefined;
    // PlayerNation may return IDs like "Hof-123"; strip the prefix (case-insensitive)
    const cleaned = value.replace(/^hof-/i, '');
    const numeric = parseInt(cleaned, 10);
    return isNaN(numeric) ? undefined : numeric;
  }

  private async writeJsonLog(kind: 'uploadGame' | 'getStats', matchId: number, phase: 'request' | 'response' | 'error', payload: any) {
    try {
      const baseDir = path.resolve(process.cwd(), 'playernation_logs');
      await fs.mkdir(baseDir, { recursive: true });
      const dir = path.join(baseDir, `match_${matchId}`);
      await fs.mkdir(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(dir, `${kind}-${phase}-${ts}.json`);
      await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (e) {
      this.logger.warn(`Failed to write PlayerNation ${kind} ${phase} log for match ${matchId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

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
      relations: ['footballChief', 'venue', 'venue.city', 'city'],
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

      // Ensure playerVideo exists as empty string when not provided
      const normalizePlayers = (arr: any[] = []) =>
        arr.map((p: any) => ({
          ...p,
          playerVideo: p.playerVideo ?? '',
        }));

      // Format matchName as "Venue Name : City Name : Date : Time"
      const formatDate = (date: Date): string => {
        return new Date(date).toLocaleDateString('en-US', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      };

      const formatTime = (date: Date): string => {
        return new Date(date).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      };

      const venueName = match.venue?.name || 'Unknown Venue';
      const cityName = match.venue?.city?.cityName || match.city?.cityName || 'Unknown City';
      const dateStr = formatDate(match.startTime);
      const timeStr = formatTime(match.startTime);
      const matchName = `${venueName} : ${cityName} : ${dateStr} : ${timeStr}`;

      const payloadForPN = {
        ...payload,
        matchName: matchName,
        players: {
          teamA: normalizePlayers(payload.players?.teamA),
          teamB: normalizePlayers(payload.players?.teamB),
        },
      } as PlayerNationSubmitDto;

      // write request log (normalized)
      await this.writeJsonLog('uploadGame', matchId, 'request', {
        url: uploadUrl,
        headers: requestHeaders,
        payload: payloadForPN,
      });

      const response = await firstValueFrom(
        this.httpService.post<PlayerNationResponse>(
          uploadUrl,
          payloadForPN,
          { headers: requestHeaders },
        ),
      );

      // write response log
      await this.writeJsonLog('uploadGame', matchId, 'response', {
        status: response.status,
        data: response.data,
        headers: response.headers,
      });

      // (file response logging removed)

      if (!response.data.success || !response.data.matchId) {
        throw new BadRequestException('Failed to submit match to PlayerNation');
      }

      // Update match with PlayerNation matchId and status
      await this.matchRepository.update({ matchId }, {
        matchStatsId: response.data.matchId,
        playernationStatus: 'PENDING',
        playernationPayload: payloadForPN as any,
        playernationNextPollAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        playernationPollAttempts: 0,
      });

      // Update match status based on new state (will set to POLLING_STATS for recorded matches)
      await this.matchesService.updateMatchStatusIfNeeded(matchId);

      this.logger.log(`Match ${matchId} submitted to PlayerNation with matchId: ${response.data.matchId}`);
      return response.data.matchId;
    } catch (error) {
      console.error('=== PLAYERNATION API ERROR ===');
      console.error('Error:', error.response?.data || error.message);
      console.error('Status:', error.response?.status);
      console.error('Headers:', error.response?.headers);

      // write error log
      await this.writeJsonLog('uploadGame', matchId, 'error', {
        message: error.message,
        response: {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
        },
      });
      
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
      const getUrl = `${this.configService.get('playernation.baseUrl')}/hof/getStats`;
      const requestHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      } as Record<string, string>;

      await this.writeJsonLog('getStats', matchId, 'request', {
        url: getUrl,
        headers: requestHeaders,
        payload: { matchId: match.matchStatsId },
      });

      const response = await firstValueFrom(
        this.httpService.post<PlayerNationStatsResponse>(
          getUrl,
          { matchId: match.matchStatsId },
          { headers: requestHeaders },
        ),
      );

      await this.writeJsonLog('getStats', matchId, 'response', {
        status: response.status,
        data: response.data,
        headers: response.headers,
      });

      // Persist last response; attempts will be updated conditionally below
      await this.matchRepository.update({ matchId }, {
        playernationLastResponse: response.data as any,
      });

      if (response.data.status === 'analyzing') {
        // Schedule next poll
        await this.matchRepository.update({ matchId }, {
          playernationStatus: 'PROCESSING',
          playernationNextPollAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
          playernationPollAttempts: (match.playernationPollAttempts || 0) + 1,
        });
        // Update match status (will set to POLLING_STATS for recorded matches)
        await this.matchesService.updateMatchStatusIfNeeded(matchId);
      } else if (response.data.status === 'cancelled') {
        await this.matchRepository.update({ matchId }, {
          playernationStatus: 'ERROR',
        });
        // Update match status
        await this.matchesService.updateMatchStatusIfNeeded(matchId);
      } else if (response.data.status === 'success') {
        // Extract and store match highlights if available
        if (response.data.matchHighlights && response.data.matchHighlights.trim() !== '' && response.data.matchHighlights !== 'null') {
          await this.matchRepository.update({ matchId }, {
            matchHighlights: response.data.matchHighlights,
          });
          this.logger.log(`Stored match highlights for match ${matchId}`);
        }

        await this.processPlayerStats(matchId, response.data);
        // Do not override SUCCESS_WITH_UNMATCHED set by processPlayerStats
        // If all players were matched and ingested, processPlayerStats will set SUCCESS or IMPORTED elsewhere
        this.logger.log(`Match ${matchId} stats processed successfully`);
        // Update match status (will set to SS_MAPPING_PENDING if unmapped players exist, or keep current)
        await this.matchesService.updateMatchStatusIfNeeded(matchId);
      }

      this.logger.log(`Polled match ${matchId}, status: ${response.data.status}`);
    } catch (error) {
      this.logger.error(`Failed to poll match ${matchId}`, error);
      await this.writeJsonLog('getStats', matchId, 'error', {
        message: error.message,
        response: {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
        },
      });
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

    let matchedCount = 0;
    let unmappedCount = 0;

    // Build or update mapping entries ONLY; do NOT ingest stats here (blocked until all matched)
    const matchParticipants = await this.matchParticipantRepository.find({
      where: { match: { matchId } },
      relations: ['user'],
    });

    // Prune stale mappings not present in this response
    const incomingExternalIds = Object.keys(response.playerStats || {});
    if (incomingExternalIds.length > 0) {
      await this.mappingRepository.createQueryBuilder()
        .delete()
        .from(PlayerNationPlayerMapping)
        .where('match_id = :matchId', { matchId })
        .andWhere('external_player_id NOT IN (:...ids)', { ids: incomingExternalIds })
        .execute();
    } else {
      // No players returned; remove all mappings for this match
      await this.mappingRepository.delete({ matchId });
    }

    for (const [externalPlayerId, playerData] of Object.entries(response.playerStats)) {
      const { playerInfo } = playerData;

      let internalUser: User | null = null;

      // Attempt auto-matching only to set mapping to MATCHED if unequivocal
      if (playerInfo.playerVideo && playerInfo.hofPlayerId) {
        const numericId = this.parseHofPlayerId(playerInfo.hofPlayerId);
        if (numericId !== undefined) {
          internalUser = await this.userRepository.findOne({ where: { id: numericId } });
        }
      }

      if (!internalUser) {
        // Fallback: try name + team match
        const playerName = playerInfo.name.trim().toLowerCase();
        for (const participant of matchParticipants) {
          const fullName = `${participant.user.firstName || ''} ${participant.user.lastName || ''}`.trim().toLowerCase();
          const teamMatch =
            participant.teamName === playerInfo.team ||
            (match.teamAName && match.teamAName === playerInfo.team && participant.teamName === match.teamAName) ||
            (match.teamBName && match.teamBName === playerInfo.team && participant.teamName === match.teamBName);
          if ((fullName && (fullName.includes(playerName) || playerName.includes(fullName))) && teamMatch) {
            internalUser = participant.user;
            break;
          }
        }
      }

      const existing = await this.mappingRepository.findOne({ where: { matchId, externalPlayerId } });
      const status = internalUser ? PlayerMappingStatus.MATCHED : PlayerMappingStatus.UNMATCHED;
      const payload = {
        matchId,
        externalPlayerId,
        externalName: playerInfo.name,
        externalTeam: playerInfo.team,
        thumbnailUrls: playerInfo.thumbnail,
        internalPlayerId: internalUser?.id,
        internalPhone: internalUser?.phoneNumber,
        status,
      } as Partial<PlayerNationPlayerMapping> & { matchId: number; externalPlayerId: string };

      if (existing) {
        await this.mappingRepository.update({ matchId, externalPlayerId }, payload);
      } else {
        await this.mappingRepository.save(payload as any);
      }

      if (status === PlayerMappingStatus.MATCHED) matchedCount++; else unmappedCount++;
    }

    this.logger.log(`Built mappings for match ${matchId}: matched=${matchedCount}, unmapped=${unmappedCount}`);

    // If no unmapped players remain, auto-ingest immediately
    if (unmappedCount === 0) {
      this.logger.log(`No unmapped players for match ${matchId}. Auto-ingesting stats...`);
      await this.processMatchedPlayerStats(matchId);
    } else {
      // Otherwise, mark as SUCCESS_WITH_UNMATCHED to prompt manual mapping
      await this.matchRepository.update({ matchId }, {
        playernationStatus: 'SUCCESS_WITH_UNMATCHED',
      });
    }
  }

  async purgeAllMappings(): Promise<{ deleted: number }> {
    const res = await this.mappingRepository.createQueryBuilder()
      .delete()
      .from(PlayerNationPlayerMapping)
      .execute();
    return { deleted: res.affected || 0 };
  }

  async processMatchedPlayerStats(matchId: number): Promise<{ processed: number; expected: number }>{
    const match = await this.matchRepository.findOne({ where: { matchId } });
    if (!match) throw new NotFoundException('Match not found');

    const last = match.playernationLastResponse as any as PlayerNationStatsResponse;
    if (!last || !last.playerStats) throw new BadRequestException('No PlayerNation stats available to process');

    // Get all matched mappings - no longer require all players to be mapped
    const mappings = await this.mappingRepository.find({ where: { matchId, status: PlayerMappingStatus.MATCHED } });
    
    // Group external player IDs by internal player ID to handle players who changed teams
    const internalIdToExternalIds = new Map<number, Array<{ externalId: string; playerData: any; videoUrl?: string; playerTopMomentUrl?: string }>>();
    
    for (const mapping of mappings) {
      if (!mapping.internalPlayerId) continue;
      
      const externalPlayerId = mapping.externalPlayerId;
      const playerData = last.playerStats[externalPlayerId];
      if (!playerData) continue;

      // Extract YouTube highlight video URL from highlightURL array (for playerHighlights - displayed on FE)
      const highlightArr = (playerData as any)?.hightlightURL || (playerData as any)?.highlightURL;
      const playerHighlightUrl = Array.isArray(highlightArr) && highlightArr.length > 0
        ? (highlightArr[0]?.youtubeVideoUrl as string | undefined)
        : undefined;

      // Extract 360-degree video URL from playerInfo.playerVideo (for playernationVideoUrl - NOT displayed, only for submission)
      const player360VideoUrl = playerData.playerInfo?.playerVideo && 
        playerData.playerInfo.playerVideo.trim() !== '' && 
        playerData.playerInfo.playerVideo !== 'null'
        ? playerData.playerInfo.playerVideo
        : undefined;

      if (!internalIdToExternalIds.has(mapping.internalPlayerId)) {
        internalIdToExternalIds.set(mapping.internalPlayerId, []);
      }
      internalIdToExternalIds.get(mapping.internalPlayerId)!.push({
        externalId: externalPlayerId,
        playerData,
        videoUrl: player360VideoUrl, // 360-degree video for playernationVideoUrl
        playerTopMomentUrl: playerHighlightUrl, // YouTube highlight for playerHighlights
      });
    }

    let processed = 0;
    // Process each internal player, combining stats if they have multiple external IDs
    for (const [internalId, externalDataArray] of internalIdToExternalIds.entries()) {
      try {
        let combinedStats: Record<string, any>;
        let combinedVideoUrl: string | undefined;
        let combinedPlayerTopMomentUrl: string | undefined;

        if (externalDataArray.length === 1) {
          // Single mapping - use stats as is
          combinedStats = externalDataArray[0].playerData.stats;
          combinedVideoUrl = externalDataArray[0].videoUrl; // 360-degree video
          combinedPlayerTopMomentUrl = externalDataArray[0].playerTopMomentUrl; // YouTube highlight
        } else {
          // Multiple mappings - combine stats
          combinedStats = this.combineStatsForPlayer(externalDataArray.map(item => item.playerData.stats));
          // Use first non-empty 360-degree video URL
          combinedVideoUrl = externalDataArray.find(item => item.videoUrl)?.videoUrl;
          // Use first non-empty YouTube highlight URL
          combinedPlayerTopMomentUrl = externalDataArray.find(item => item.playerTopMomentUrl)?.playerTopMomentUrl;
        }

        await this.mapStatsToCompact(matchId, internalId, combinedStats, combinedVideoUrl, combinedPlayerTopMomentUrl);
        processed++;
      } catch (e) {
        this.logger.error(`Failed to ingest stats for internal user ${internalId}`, e);
      }
    }

    // Update match status based on whether we processed any stats
    if (processed > 0) {
      await this.matchRepository.update({ matchId }, { playernationStatus: 'IMPORTED' });
      // Update match status to STATS_UPDATED for recorded matches
      await this.matchesService.updateMatchStatusIfNeeded(matchId);
    } else {
      await this.matchRepository.update({ matchId }, { playernationStatus: 'POLL_SUCCESS_MAPPING_FAILED' });
    }
    
    const expected = internalIdToExternalIds.size;
    return { processed, expected };
  }

  /**
   * Combines stats from multiple external player IDs for the same internal player
   * (e.g., when a player changed teams during the match)
   */
  private combineStatsForPlayer(statsArray: Array<Record<string, any>>): Record<string, any> {
    if (statsArray.length === 0) return {};
    if (statsArray.length === 1) return statsArray[0];

    // Helper function to parse numeric values
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

    // Helper function to parse percentage
    const parsePercentage = (stat: any): number => {
      if (!stat) return 0;
      const value = parseNumeric(stat.totalCount);
      if (stat.isPercentageStat) {
        return value > 1 ? value / 100 : value;
      }
      return value;
    };

    // Extract and combine absolute stats (addition)
    let totalGoal = 0;
    let totalAssist = 0;
    let totalPass = 0;
    let totalKeyPass = 0;
    let totalShot = 0;
    let totalTackles = 0;
    let totalInterceptions = 0;
    let totalSave = 0;

    // Extract and collect percentage stats for averaging
    const passingAccuracies: number[] = [];
    const shotAccuracies: number[] = [];

    for (const stats of statsArray) {
      // Add absolute stats
      totalGoal += parseNumeric(stats.goals?.totalCount);
      totalAssist += parseNumeric(stats.assists?.totalCount);
      totalPass += parseNumeric(stats.passes_total?.totalCount);
      totalKeyPass += parseNumeric(stats.key_passes?.totalCount);
      totalShot += parseNumeric(stats.shots_total?.totalCount);
      totalTackles += parseNumeric(stats.tackles_total?.totalCount);
      totalInterceptions += parseNumeric(stats.interceptions_total?.totalCount);
      totalSave += parseNumeric(stats.saves?.totalCount);

      // Collect percentage stats
      const passingAccuracy = parsePercentage(stats.passing_accuracy_overall);
      if (passingAccuracy > 0) {
        passingAccuracies.push(passingAccuracy);
      }

      const shotAccuracy = parsePercentage(stats.shot_accuracy);
      if (shotAccuracy > 0) {
        shotAccuracies.push(shotAccuracy);
      }
    }

    // Calculate averages for percentage stats
    const avgPassingAccuracy = passingAccuracies.length > 0
      ? passingAccuracies.reduce((sum, val) => sum + val, 0) / passingAccuracies.length
      : 0;
    const avgShotAccuracy = shotAccuracies.length > 0
      ? shotAccuracies.reduce((sum, val) => sum + val, 0) / shotAccuracies.length
      : 0;

    // Return combined stats in the same format as PlayerNation response
    return {
      goals: { totalCount: totalGoal },
      assists: { totalCount: totalAssist },
      passes_total: { totalCount: totalPass },
      passing_accuracy_overall: {
        totalCount: avgPassingAccuracy,
        isPercentageStat: true,
      },
      key_passes: { totalCount: totalKeyPass },
      shots_total: { totalCount: totalShot },
      shot_accuracy: {
        totalCount: avgShotAccuracy,
        isPercentageStat: true,
      },
      tackles_total: { totalCount: totalTackles },
      interceptions_total: { totalCount: totalInterceptions },
      saves: { totalCount: totalSave },
    };
  }

  private async mapStatsToCompact(matchId: number, userId: number, stats: Record<string, any>, playerVideoUrl?: string, playerTopMomentUrl?: string): Promise<void> {
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
      // Update participant's 360-degree video URL if provided (from playerInfo.playerVideo - NOT displayed, only for submission)
      if (playerVideoUrl && playerVideoUrl.trim() !== '') {
        matchParticipant.playernationVideoUrl = playerVideoUrl;
      }

      // Update participant's player highlights if provided (from highlightURL array - YouTube highlight, displayed on FE)
      if (playerTopMomentUrl && playerTopMomentUrl.trim() !== '') {
        matchParticipant.playerHighlights = playerTopMomentUrl;
      }

      // Save participant if any video URLs were updated
      if ((playerVideoUrl && playerVideoUrl.trim() !== '') || (playerTopMomentUrl && playerTopMomentUrl.trim() !== '')) {
        await manager.save(MatchParticipant, matchParticipant);
      }

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

  async getMappings(matchId: number): Promise<Array<{ externalPlayerId: string; internalPlayerId: number | null }>> {
    const mappings = await this.mappingRepository.find({
      where: { matchId: matchId },
      select: ['externalPlayerId', 'internalPlayerId'],
    });
    return mappings.map(m => ({
      externalPlayerId: m.externalPlayerId,
      internalPlayerId: m.internalPlayerId || null,
    }));
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

    // Note: We don't set playernationStatus to IMPORTED here - that should only happen after stats are processed
    // Update match status based on current state (will update SS_MAPPING_PENDING if all players are now mapped)
    await this.matchesService.updateMatchStatusIfNeeded(matchId);
  }

  async getMatchStatus(matchId: number): Promise<any> {
    const match = await this.matchRepository.findOne({
      where: { matchId },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    // Extract timestamp from playernationLastResponse if it exists
    let lastPollTime: any = null;
    if (match.playernationLastResponse) {
      // Try to extract timestamp from response, or use updatedAt as fallback
      lastPollTime = match.updatedAt;
    }

    return {
      matchStatsId: match.matchStatsId,
      status: match.playernationStatus,
      lastPollTime,
      pollAttempts: match.playernationPollAttempts,
      nextPollAt: match.playernationNextPollAt,
      playernationLastResponse: match.playernationLastResponse,
    };
  }

  /**
   * Backfill highlights from stored PlayerNation response for a specific match
   * Extracts matchHighlights and player highlights (playerInfo.playerVideo) from stored response
   */
  async backfillHighlightsFromStoredResponse(matchId: number): Promise<{ 
    matchHighlightsUpdated: boolean; 
    playersUpdated: number; 
  }> {
    const match = await this.matchRepository.findOne({ where: { matchId } });
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    
    if (!match.playernationLastResponse) {
      throw new BadRequestException('No stored PlayerNation response found for this match');
    }

    const response = match.playernationLastResponse as any as PlayerNationStatsResponse;
    let playersUpdated = 0;
    let matchHighlightsUpdated = false;

    // Extract and store match highlights
    if (response.matchHighlights && response.matchHighlights.trim() !== '' && response.matchHighlights !== 'null') {
      await this.matchRepository.update({ matchId }, {
        matchHighlights: response.matchHighlights,
      });
      matchHighlightsUpdated = true;
      this.logger.log(`Backfilled match highlights for match ${matchId}`);
    }

    // Extract and store player highlights
    if (response.playerStats) {
      const mappings = await this.mappingRepository.find({ 
        where: { matchId, status: PlayerMappingStatus.MATCHED } 
      });

      for (const mapping of mappings) {
        if (!mapping.internalPlayerId) continue;

        const playerData = response.playerStats[mapping.externalPlayerId];
        if (!playerData) continue;

        // Extract 360-degree video from playerInfo.playerVideo (for playernationVideoUrl - NOT displayed)
        const player360VideoUrl = playerData.playerInfo?.playerVideo && 
          playerData.playerInfo.playerVideo.trim() !== '' && 
          playerData.playerInfo.playerVideo !== 'null'
          ? playerData.playerInfo.playerVideo
          : null;

        // Extract YouTube highlight video from highlightURL array (for playerHighlights - displayed on FE)
        const highlightArr = (playerData as any)?.hightlightURL || (playerData as any)?.highlightURL;
        const playerHighlightUrl = Array.isArray(highlightArr) && highlightArr.length > 0
          ? (highlightArr[0]?.youtubeVideoUrl as string | undefined)
          : null;

        // Update 360-degree video URL (playernationVideoUrl)
        if (player360VideoUrl) {
          const matchParticipant = await this.matchParticipantRepository.findOne({
            where: {
              match: { matchId },
              user: { id: mapping.internalPlayerId },
            },
          });

          if (matchParticipant) {
            matchParticipant.playernationVideoUrl = player360VideoUrl;
            await this.matchParticipantRepository.save(matchParticipant);
            this.logger.log(`Backfilled 360-degree video for user ${mapping.internalPlayerId} in match ${matchId}`);
          }
        }

        // Update player highlights (YouTube video - displayed on FE)
        if (playerHighlightUrl) {
          const matchParticipant = await this.matchParticipantRepository.findOne({
            where: {
              match: { matchId },
              user: { id: mapping.internalPlayerId },
            },
          });

          if (matchParticipant) {
            matchParticipant.playerHighlights = playerHighlightUrl;
            await this.matchParticipantRepository.save(matchParticipant);
            playersUpdated++;
            this.logger.log(`Backfilled player highlights for user ${mapping.internalPlayerId} in match ${matchId}`);
          }
        }
      }
    }

    return {
      matchHighlightsUpdated,
      playersUpdated,
    };
  }

  /**
   * Backfill highlights for all matches with stored PlayerNation responses
   * Useful for bulk processing of existing matches
   */
  async backfillHighlightsForAllMatches(): Promise<{ 
    totalMatches: number; 
    processed: number; 
    errors: number;
    results: Array<{ matchId: number; success: boolean; error?: string }>;
  }> {
    // Find all matches with stored PlayerNation responses
    const matches = await this.matchRepository.find({
      where: {
        playernationLastResponse: Not(IsNull()),
        matchType: MatchType.RECORDED,
      },
    });

    let processed = 0;
    let errors = 0;
    const results: Array<{ matchId: number; success: boolean; error?: string }> = [];

    this.logger.log(`Starting backfill for ${matches.length} matches`);

    for (const match of matches) {
      try {
        await this.backfillHighlightsFromStoredResponse(match.matchId);
        processed++;
        results.push({ matchId: match.matchId, success: true });
      } catch (error: any) {
        this.logger.error(`Failed to backfill highlights for match ${match.matchId}`, error);
        errors++;
        results.push({ 
          matchId: match.matchId, 
          success: false, 
          error: error?.message || 'Unknown error' 
        });
      }
    }

    this.logger.log(`Backfill completed: ${processed} processed, ${errors} errors`);

    return {
      totalMatches: matches.length,
      processed,
      errors,
      results,
    };
  }
}
