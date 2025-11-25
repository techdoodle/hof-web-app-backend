import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MatchParticipantStats } from './match-participant-stats.entity';
import { PlayerCategory } from '../../common/enums/player-category.enum';

@Injectable()
export class MatchParticipantStatsService {
  constructor(
    @InjectRepository(MatchParticipantStats)
    private readonly matchParticipantStatsRepository: Repository<MatchParticipantStats>,
  ) { }

  // Compact-stats-only XP calculators with updated weights
  private computeAttackXp(params: {
    goalsPerMatch: number;
    assistsPerMatch: number;
    shotsPerMatch: number;
    shotAccuracyPct: number;   // 0..100
    passAccuracyPct: number;   // 0..100
    keyPassesPerMatch: number;
    tacklesPerMatch: number;
    interceptionsPerMatch: number;
  }): number {
    const gnaScore = Math.min(100, (params.goalsPerMatch + params.assistsPerMatch) / 2.0 * 100);
    const shotsComponent = Math.min(params.shotsPerMatch * 4, 20);
    const shootingScore = Math.min(100, (params.shotAccuracyPct * 0.7) + (shotsComponent * 0.3));
    const keyPassesComponent = Math.min(params.keyPassesPerMatch * 10, 30);
    const playmakingScore = Math.min(100, (params.passAccuracyPct * 0.7) + (keyPassesComponent * 0.3));
    const defTackles = Math.min(params.tacklesPerMatch * 20, 60);
    const defInterceptions = Math.min(params.interceptionsPerMatch * 20, 40);
    const defensiveActionsScore = Math.min(100, defTackles + defInterceptions);

    const overall = (gnaScore * 0.50) + (shootingScore * 0.20) + (playmakingScore * 0.20) + (defensiveActionsScore * 0.10);
    return Math.round(overall);
  }

  private computeDefenderXp(params: {
    tacklesPerMatch: number;
    interceptionsPerMatch: number;
    passAccuracyPct: number; // 0..100
    gnaPerMatch: number;
  }): number {
    const defTackles = Math.min(params.tacklesPerMatch * 20, 60);
    const defInterceptions = Math.min(params.interceptionsPerMatch * 20, 40);
    const defensiveActionsScore = Math.min(100, defTackles + defInterceptions);
    const buildUp = Math.min(100, params.passAccuracyPct);
    const impact = Math.min(100, params.gnaPerMatch / 2.0 * 100);
    const overall = (defensiveActionsScore * 0.50) + (buildUp * 0.30) + (impact * 0.20);
    return Math.round(overall);
  }

  private computeGoalkeeperXp(params: {
    savesPerMatch: number;
    passAccuracyPct: number; // 0..100
    assistsPerMatch: number;
  }): number {
    const shotStopping = Math.min(100, params.savesPerMatch * 25);
    const distribution = Math.min(100, params.passAccuracyPct);
    const assistImpact = Math.min(100, params.assistsPerMatch / 1.0 * 100);
    const overall = (shotStopping * 0.60) + (distribution * 0.30) + (assistImpact * 0.10);
    return Math.round(overall);
  }

  async create(createMatchParticipantStatsDto: Partial<MatchParticipantStats>): Promise<MatchParticipantStats> {
    const matchParticipantStats = this.matchParticipantStatsRepository.create(createMatchParticipantStatsDto);
    return await this.matchParticipantStatsRepository.save(matchParticipantStats);
  }

  async findAll(): Promise<MatchParticipantStats[]> {
    return await this.matchParticipantStatsRepository.find({
      relations: ['match', 'player', 'matchParticipant'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(matchStatsId: number): Promise<MatchParticipantStats> {
    const matchParticipantStats = await this.matchParticipantStatsRepository.findOne({
      where: { matchStatsId },
      relations: ['match', 'player', 'matchParticipant'],
    });
    if (!matchParticipantStats) {
      throw new NotFoundException(`Match participant stats with ID ${matchStatsId} not found`);
    }
    return matchParticipantStats;
  }

  async update(matchStatsId: number, updateMatchParticipantStatsDto: Partial<MatchParticipantStats>): Promise<MatchParticipantStats> {
    const matchParticipantStats = await this.findOne(matchStatsId);
    Object.assign(matchParticipantStats, updateMatchParticipantStatsDto);
    return await this.matchParticipantStatsRepository.save(matchParticipantStats);
  }

  async remove(matchStatsId: number): Promise<void> {
    const matchParticipantStats = await this.findOne(matchStatsId);
    await this.matchParticipantStatsRepository.remove(matchParticipantStats);
  }

  async findByMatch(matchId: number): Promise<MatchParticipantStats[]> {
    return await this.matchParticipantStatsRepository.find({
      where: { match: { matchId } },
      relations: ['match', 'player', 'matchParticipant'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByPlayer(playerId: number): Promise<MatchParticipantStats[]> {
    return await this.matchParticipantStatsRepository.find({
      where: { player: { id: playerId } },
      relations: ['match', 'player', 'matchParticipant'],
      order: { createdAt: 'DESC' },
    });
  }

  async hasStatsForPlayer(playerId: number): Promise<boolean> {
    const count = await this.matchParticipantStatsRepository.count({
      where: { player: { id: playerId } },
    });
    return count > 0;
  }

  async findByMatchParticipant(matchParticipantId: number): Promise<MatchParticipantStats[]> {
    return await this.matchParticipantStatsRepository.find({
      where: { matchParticipant: { matchParticipantId } },
      relations: ['match', 'player', 'matchParticipant'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByUserAndMatch(userId: number, matchId: number): Promise<any> {
    const stats = await this.matchParticipantStatsRepository.findOne({
      where: {
        player: { id: userId },
        match: { matchId }
      },
      relations: ['match', 'match.venue', 'player', 'matchParticipant'],
    });

    if (!stats) {
      throw new NotFoundException(`Stats not found for user ${userId} in match ${matchId}`);
    }

    const playerCategory = stats.player?.playerCategory || null;

    // Get all players and their stats for this match
    const allMatchStats = await this.matchParticipantStatsRepository.find({
      where: { match: { matchId } },
      relations: ['player', 'matchParticipant'],
    });

    // Get the current player's team
    const currentPlayerTeam = stats.matchParticipant.teamName;

    // Separate players into myTeam and opponentTeam
    const myTeam: any[] = [];
    const opponentTeam: any[] = [];

    for (const playerStats of allMatchStats) {
      const player = playerStats.player;
      const isCurrentPlayer = player.id === userId;
      const playerTeam = playerStats.matchParticipant.teamName;

      // Get position-based stat value
      let statVal = '';
      switch (player.playerCategory) {
        case 'GOALKEEPER':
          statVal = (playerStats.totalSave || 0).toString() + ' Saves';
          break;
        case 'DEFENDER':
          statVal = (playerStats.totalTackles || 0).toString() + ' Tackles';
          break;
        case 'STRIKER':
          statVal = (playerStats.totalGoal || 0).toString() + ' Goals';
          break;
        default:
          statVal = '0';
      }

      const playerData = {
        id: player.id,
        firstName: player.firstName || '',
        lastName: player.lastName || '',
        position: player.playerCategory || 'STRIKER',
        profilePicture: player.profilePicture || '',
        statVal: statVal,
        mvp: playerStats.isMvp || false
      };

      if (playerTeam === currentPlayerTeam && !isCurrentPlayer) {
        myTeam.push(playerData);
      } else if (playerTeam !== currentPlayerTeam) {
        opponentTeam.push(playerData);
      }
    }

    // Calculate normalized scores for spider chart (0-100)
    const shotAccuracy = (stats.shotAccuracy || 0) * 100;
    const passingAccuracy = (stats.totalPassingAccuracy || 0) * 100;
    const dribbleSuccess = (stats.dribbleSuccessPercent || 0) * 100;

    // Tackling: derive score from available fields (tackle breakdown + totalDefensiveActions)
    const totalDefensiveActions = stats.totalDefensiveActions || 0;
    const totalTackleAttempts = stats.totalTackles || 0;
    const totalInterceptions = stats.totalInterceptions || 0;
    const tacklesComponent = Math.min(totalTackleAttempts * 10, 70);
    const interceptionsComponent = Math.min(totalInterceptions * 10, 30);
    const tackleDerivedScore = Math.min(100, tacklesComponent + interceptionsComponent);

    // Calculate impact score based on goals and assists
    const impactScore = Math.min(100, ((stats.totalGoal || 0) + (stats.totalAssist || 0)) * 25); // Scale to 100

    // Normalize scores for spider chart
    const shootingScore = Math.min(100, shotAccuracy);
    const passingScore = Math.min(100, passingAccuracy);
    const dribblingScore = Math.min(100, dribbleSuccess);
    const tacklingScore = tackleDerivedScore;

    // Helper function to get category-specific stats for this match
    const getCategorySpecificStats = () => {
      const commonStats = {
        goals: stats.totalGoal || 0,
        assists: stats.totalAssist || 0,
        passingAccuracy: Math.round(passingAccuracy * 100) / 100,
      };

      switch (playerCategory) {
        case PlayerCategory.GOALKEEPER:
          return {
            ...commonStats,
            totalSave: stats.totalSave || 0,
            totalCatch: stats.totalCatch || 0,
            totalPunch: stats.totalPunch || 0,
            totalClearance: stats.totalClearance || 0,
            totalMiscontrol: stats.totalMiscontrol || 0,
            totalKeyPass: stats.totalKeyPass || 0,
          };
        case PlayerCategory.DEFENDER:
          return {
            ...commonStats,
            totalInterceptions: stats.totalInterceptions || 0,
            totalTackles: totalTackleAttempts,
            blocks: stats.blockedShotDefensive || 0,
            totalDefensiveActions: totalDefensiveActions,
            steals: stats.steal || 0,
          };
        case PlayerCategory.STRIKER:
          return {
            ...commonStats,
            totalShots: stats.totalShot || 0,
            shotAccuracy: Math.round(shotAccuracy * 100) / 100,
            dribbleAttempts: stats.totalDribbleAttempt || 0,
            dribbleCompleted: stats.totalSuccessfulDribble || 0,
            totalSuccessfulDribbles: stats.totalSuccessfulDribble || 0,
          };
        default:
          return {
            ...commonStats,
            totalShots: stats.totalShot || 0,
            shotAccuracy: Math.round(shotAccuracy * 100) / 100,
            totalDefensiveActions: totalDefensiveActions,
            totalTackles: totalTackleAttempts,
            dribbleAttempts: stats.totalDribbleAttempt || 0,
            totalSuccessfulDribbles: stats.totalSuccessfulDribble || 0,
          };
      }
    };

    return {
      playerId: userId,
      matchId: matchId,
      playerCategory,
      playerHighlights: stats.matchParticipant?.playerHighlights || null,
      // isMvp: stats.isMvp || false,
      match: {
        id: stats.match?.matchId,
        venue: stats.match?.venue?.name || null,
        startTime: stats.match?.startTime || null,
        matchHighlights: stats.match?.matchHighlights || null,
        matchRecap: stats.match?.matchRecap || null,
      },
      myTeam: myTeam,
      opponentTeam: opponentTeam,
      spiderChart: {
        shooting: Math.round(shootingScore * 100) / 100,
        passing: Math.round(passingScore * 100) / 100,
        dribbling: Math.round(dribblingScore * 100) / 100,
        tackling: Math.round(tacklingScore * 100) / 100,
        impact: Math.round(impactScore * 100) / 100,
      },
      categorySpecificStats: getCategorySpecificStats(),
      detailedStats: {
        shooting: {
          shotAccuracy: Math.round(shotAccuracy * 100) / 100,
          totalShots: stats.totalShot || 0,
        },
        passing: {
          overallAccuracy: Math.round((stats.totalPassingAccuracy || 0) * 10000) / 100,
          totalPasses: stats.totalPass || 0,
        },
        dribbling: {
          successRate: Math.round(dribbleSuccess * 100) / 100,
          totalAttempts: stats.totalDribbleAttempt || 0,
          totalSuccessful: stats.totalSuccessfulDribble || 0,
        },
        tackling: {
          totalDefensiveActions: totalDefensiveActions,
          totalTackles: totalTackleAttempts,
          interceptions: stats.totalInterceptions || 0,
          blocks: stats.blockedShotDefensive || 0,
          steals: stats.steal || 0,
        },
        goalkeeping: {
          totalSave: stats.totalSave || 0,
          totalCatch: stats.totalCatch || 0,
          totalPunch: stats.totalPunch || 0,
          totalClearance: stats.totalClearance || 0,
          totalMiscontrol: stats.totalMiscontrol || 0,
        },
        impact: {
          totalGoals: stats.totalGoal || 0,
          totalAssists: stats.totalAssist || 0,
          totalKeyPass: stats.totalKeyPass || 0,
        },
      },
    };
  }

  async getTopScorers(limit: number = 10): Promise<MatchParticipantStats[]> {
    return await this.matchParticipantStatsRepository.find({
      where: { totalGoal: Between(1, 100) },
      relations: ['match', 'player', 'matchParticipant'],
      order: { totalGoal: 'DESC' },
      take: limit,
    });
  }

  async getTopAssisters(limit: number = 10): Promise<MatchParticipantStats[]> {
    return await this.matchParticipantStatsRepository.find({
      where: { totalAssist: Between(1, 100) },
      relations: ['match', 'player', 'matchParticipant'],
      order: { totalAssist: 'DESC' },
      take: limit,
    });
  }

  async getPlayerAverageStats(playerId: number): Promise<any> {
    const stats = await this.matchParticipantStatsRepository
      .createQueryBuilder('stats')
      .select([
        'AVG(stats.totalGoal) as avgGoals',
        'AVG(stats.totalAssist) as avgAssists',
        'AVG(stats.totalPassingAccuracy) as avgPassingAccuracy',
        'AVG(stats.shotAccuracy) as avgShotAccuracy',
        'AVG(stats.dribbleSuccessPercent) as avgDribbleSuccess',
        'COUNT(*) as totalMatches',
        'SUM(stats.totalGoal) as totalGoals',
        'SUM(stats.totalAssist) as totalAssists',
      ])
      .where('stats.player.id = :playerId', { playerId })
      .getRawOne();

    return {
      averageGoals: parseFloat(stats.avgGoals) || 0,
      averageAssists: parseFloat(stats.avgAssists) || 0,
      averagePassingAccuracy: parseFloat(stats.avgPassingAccuracy) || 0,
      averageShotAccuracy: parseFloat(stats.avgShotAccuracy) || 0,
      averageDribbleSuccess: parseFloat(stats.avgDribbleSuccess) || 0,
      totalMatches: parseInt(stats.totalMatches) || 0,
      totalGoals: parseInt(stats.totalGoals) || 0,
      totalAssists: parseInt(stats.totalAssists) || 0,
    };
  }

  async getMatchStats(matchId: number): Promise<any> {
    const stats = await this.matchParticipantStatsRepository
      .createQueryBuilder('stats')
      .select([
        'SUM(stats.totalGoal) as totalGoals',
        'SUM(stats.totalShot) as totalShots',
        'AVG(stats.totalPassingAccuracy) as avgPassingAccuracy',
        'COUNT(*) as totalPlayers',
      ])
      .where('stats.match.matchId = :matchId', { matchId })
      .getRawOne();

    return {
      totalGoals: parseInt(stats.totalGoals) || 0,
      totalShots: parseInt(stats.totalShots) || 0,
      averagePassingAccuracy: parseFloat(stats.avgPassingAccuracy) || 0,
      totalPlayers: parseInt(stats.totalPlayers) || 0,
    };
  }

  async getPlayersByStatCategory(category: string, limit: number = 10): Promise<MatchParticipantStats[]> {
    const validCategories = [
      'totalGoal', 'totalAssist', 'totalShot', 'totalKeyPass',
      'totalPassingAccuracy', 'shotAccuracy', 'dribbleSuccessPercent',
      'totalDefensiveActions', 'totalOffensiveActions'
    ];

    if (!validCategories.includes(category)) {
      throw new NotFoundException(`Invalid stat category: ${category}`);
    }

    return await this.matchParticipantStatsRepository.find({
      relations: ['match', 'player', 'matchParticipant'],
      order: { [category]: 'DESC' },
      take: limit,
    });
  }

  async getTeamStatsComparison(matchId: number): Promise<any> {
    // Get all unique team names for this match
    const teamNames = await this.matchParticipantStatsRepository
      .createQueryBuilder('stats')
      .leftJoin('stats.matchParticipant', 'mp')
      .select('DISTINCT mp.teamName', 'teamName')
      .where('stats.match.matchId = :matchId', { matchId })
      .getRawMany();

    const teamStats: Record<string, any> = {};

    // Get stats for each team
    for (const team of teamNames) {
      const teamName = team.teamname;
      const stats = await this.matchParticipantStatsRepository
        .createQueryBuilder('stats')
        .leftJoin('stats.matchParticipant', 'mp')
        .select([
          'SUM(stats.totalGoal) as goals',
          'SUM(stats.totalShot) as shots',
          'AVG(stats.totalPassingAccuracy) as passingAccuracy',
          'SUM(stats.totalDefensiveActions) as defensiveActions',
          'SUM(stats.totalOffensiveActions) as offensiveActions',
        ])
        .where('stats.match.matchId = :matchId', { matchId })
        .andWhere('mp.teamName = :teamName', { teamName })
        .getRawOne();

      teamStats[teamName] = {
        goals: parseInt(stats.goals) || 0,
        shots: parseInt(stats.shots) || 0,
        passingAccuracy: parseFloat(stats.passingAccuracy) || 0,
        defensiveActions: parseInt(stats.defensiveActions) || 0,
        offensiveActions: parseInt(stats.offensiveActions) || 0,
      };
    }

    return teamStats;
  }

  async getSeasonStats(playerId: number, year: number): Promise<any> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    const stats = await this.matchParticipantStatsRepository
      .createQueryBuilder('stats')
      .leftJoin('stats.match', 'match')
      .select([
        'COUNT(*) as matchesPlayed',
        'SUM(stats.totalGoal) as totalGoals',
        'SUM(stats.totalAssist) as totalAssists',
        'SUM(stats.totalShot) as totalShots',
        'AVG(stats.totalPassingAccuracy) as avgPassingAccuracy',
        'AVG(stats.shotAccuracy) as avgShotAccuracy',
      ])
      .where('stats.player.id = :playerId', { playerId })
      .andWhere('match.startTime BETWEEN :startDate AND :endDate', { startDate, endDate })
      .getRawOne();

    return {
      year,
      matchesPlayed: parseInt(stats.matchesPlayed) || 0,
      totalGoals: parseInt(stats.totalGoals) || 0,
      totalAssists: parseInt(stats.totalAssists) || 0,
      totalShots: parseInt(stats.totalShots) || 0,
      averagePassingAccuracy: parseFloat(stats.avgPassingAccuracy) || 0,
      averageShotAccuracy: parseFloat(stats.avgShotAccuracy) || 0,
    };
  }

  async getPlayerSpiderChartStats(playerId: number): Promise<any> {
    const rawStats = await this.matchParticipantStatsRepository
      .createQueryBuilder('stats')
      .leftJoinAndSelect('stats.player', 'player')
      .select([
        'COUNT(*) as matchesPlayed',
        'player.playerCategory as playerCategory',
        // Compact-only aggregates
        'AVG(COALESCE(stats.shotAccuracy, 0)) as avgShotAccuracy',
        'SUM(COALESCE(stats.totalShot, 0)) as totalShots',
        'AVG(COALESCE(stats.totalPassingAccuracy, 0)) as avgPassingAccuracy',
        'SUM(COALESCE(stats.totalPass, 0)) as totalPasses',
        'SUM(COALESCE(stats.totalKeyPass, 0)) as totalKeyPasses',
        'SUM(COALESCE(stats.totalTackles, 0)) as totalTackles',
        'SUM(COALESCE(stats.totalInterceptions, 0)) as totalInterceptions',
        'SUM(COALESCE(stats.totalGoal, 0)) as totalGoals',
        'SUM(COALESCE(stats.totalAssist, 0)) as totalAssists',
        'SUM(CASE WHEN stats.isMvp = true THEN 1 ELSE 0 END) as totalMvpWins',
        'SUM(COALESCE(stats.totalSave, 0)) as totalSave',
      ])
      .where('stats.player.id = :playerId', { playerId })
      .groupBy('player.playerCategory')
      .getRawOne();

    const matchesPlayed = parseInt(rawStats?.matchesplayed) || 0;
    const playerCategory = rawStats?.playercategory || null;

    const shotAccuracy = (parseFloat(rawStats?.avgshotaccuracy) || 0) * 100;
    const totalShots = parseInt(rawStats?.totalshots) || 0;
    const shotsPerMatch = totalShots / matchesPlayed || 0;

    const overallPassingAccuracy = (parseFloat(rawStats?.avgpassingaccuracy) || 0) * 100;

    const totalTackles = parseInt(rawStats?.totaltackles) || 0;
    const tacklesPerMatch = totalTackles / matchesPlayed || 0;
    const totalInterceptionsVal = parseInt(rawStats?.totalinterceptions) || 0;
    const interceptionsPerMatch = totalInterceptionsVal / matchesPlayed || 0;

    const totalGoals = parseInt(rawStats?.totalgoals) || 0;
    const totalAssists = parseInt(rawStats?.totalassists) || 0;
    const totalMvpWins = parseInt(rawStats?.totalmvpwins) || 0;
    const totalSteals = parseInt(rawStats?.totalsteals) || 0;
    const impactPerMatch = (totalGoals + totalAssists) / matchesPlayed || 0;

    const totalKeyPasses = parseInt(rawStats?.totalkeypasses) || 0;
    const totalPasses = parseInt(rawStats?.totalpasses) || 0;
    const totalSave = parseInt(rawStats?.totalsave) || 0;

    const shootingScore = Math.min(100, (shotAccuracy * 0.8) + (Math.min(shotsPerMatch * 4, 20) * 0.2));
    const passingScore = overallPassingAccuracy;
    const defTackles = Math.min(tacklesPerMatch * 20, 60);
    const defInterceptions = Math.min(interceptionsPerMatch * 20, 40);
    const tacklingScore = Math.min(100, defTackles + defInterceptions);
    // Position-based impact using compact stats only (per-match averages)
    const matches = matchesPlayed || 1;
    const goalsPerMatch = totalGoals / matches;
    const assistsPerMatch = totalAssists / matches;
    const gnaPerMatch = (totalGoals + totalAssists) / matches;
    const keyPassesPerMatch = totalKeyPasses / matches;
    const savesPerMatch = totalSave / matches;

    // Attack/Mid components
    const atk_gna = Math.min(100, (gnaPerMatch / 2.0) * 100);
    const atk_shoot = Math.min(100, (shotAccuracy * 0.7) + (Math.min(shotsPerMatch * 4, 20) * 0.3));
    const atk_play = Math.min(100, (overallPassingAccuracy * 0.7) + (Math.min(keyPassesPerMatch * 10, 30) * 0.3));
    const atk_def = Math.min(100, Math.min(tacklesPerMatch * 20, 60) + Math.min(interceptionsPerMatch * 20, 40));
    const attackImpact = (atk_gna * 0.50) + (atk_shoot * 0.20) + (atk_play * 0.20) + (atk_def * 0.10);

    // Defender components
    const def_actions = Math.min(100, Math.min(tacklesPerMatch * 20, 60) + Math.min(interceptionsPerMatch * 20, 40));
    const def_buildup = Math.min(100, overallPassingAccuracy);
    const def_gna = Math.min(100, (gnaPerMatch / 2.0) * 100);
    const defenderImpact = (def_actions * 0.50) + (def_buildup * 0.30) + (def_gna * 0.20);

    // Goalkeeper components
    const gk_shotStopping = Math.min(100, Math.min(savesPerMatch * 25, 100));
    const gk_distribution = Math.min(100, overallPassingAccuracy);
    const gk_assists = Math.min(100, (assistsPerMatch / 1.0) * 100);
    const goalkeeperImpact = (gk_shotStopping * 0.60) + (gk_distribution * 0.30) + (gk_assists * 0.10);

    let impactScore = 0;
    switch (playerCategory) {
      case PlayerCategory.GOALKEEPER:
        impactScore = goalkeeperImpact;
        break;
      case PlayerCategory.DEFENDER:
        impactScore = defenderImpact;
        break;
      case PlayerCategory.STRIKER:
      default:
        impactScore = attackImpact;
        break;
    }

    const getCategorySpecificStats = () => {
      const commonStats = {
        goals: totalGoals,
        assists: totalAssists,
        passingAccuracy: Math.round(overallPassingAccuracy * 100) / 100,
        totalKeyPasses,
      };

      switch (playerCategory) {
        case PlayerCategory.GOALKEEPER:
          return {
            ...commonStats,
            totalSave,
          };
        case PlayerCategory.DEFENDER:
          return {
            ...commonStats,
            totalInterceptions: totalInterceptionsVal,
            totalTackles: totalTackles,
          };
        case PlayerCategory.STRIKER:
          return {
            ...commonStats,
            totalShots,
            shotAccuracy: Math.round(shotAccuracy * 100) / 100,
          };
        default:
          return {
            ...commonStats,
            totalShots,
            shotAccuracy: Math.round(shotAccuracy * 100) / 100,
            totalTackles: totalTackles,
          };
      }
    };

    return {
      playerId,
      playerCategory,
      matchesPlayed,
      totalMvpWins,
      spiderChart: matchesPlayed > 0 ? {
        shooting: Math.round(shootingScore * 100) / 100,
        passing: Math.round(passingScore * 100) / 100,
        tackling: Math.round(tacklingScore * 100) / 100,
        impact: Math.round(impactScore * 100) / 100,
      } : {},
      categorySpecificStats: matchesPlayed > 0 ? getCategorySpecificStats() : {},
      detailedStats: matchesPlayed > 0 ? {
        shooting: {
          shotAccuracy: Math.round(shotAccuracy * 100) / 100,
          shotsPerMatch: Math.round(shotsPerMatch * 100) / 100,
          totalShots,
        },
        passing: {
          overallAccuracy: Math.round(overallPassingAccuracy * 100) / 100,
          totalPasses,
        },
        tackling: {
          totalTackles: totalTackles,
          interceptions: totalInterceptionsVal,
        },
        goalkeeping: {
          totalSave,
        },
        impact: {
          goalsAndAssistsPerMatch: Math.round(impactPerMatch * 100) / 100,
          totalGoals,
          totalAssists,
          totalKeyPass: totalKeyPasses,
        },
      } : {},
    };
  }

  async getPlayersLeaderboard(limit: number = 10, page: number = 1, type: string = 'overall'): Promise<any> {
    // Get all players who have participated in matches
    const playersWithStats = await this.matchParticipantStatsRepository
      .createQueryBuilder('stats')
      .leftJoinAndSelect('stats.player', 'player')
      .select([
        'player.id as playerId',
        'player.firstName as firstName',
        'player.lastName as lastName',
        'player.profilePicture as profilePicture',
        'player.playerCategory as playerCategory',
        'COUNT(*) as matchesPlayed',
        'AVG(COALESCE(stats.shotAccuracy, 0)) as avgShotAccuracy',
        'SUM(COALESCE(stats.totalShot, 0)) as totalShots',
        'AVG(COALESCE(stats.totalPassingAccuracy, 0)) as avgPassingAccuracy',
        'SUM(COALESCE(stats.totalGoal, 0)) as totalGoals',
        'SUM(COALESCE(stats.totalAssist, 0)) as totalAssists',
        'SUM(COALESCE(stats.totalKeyPass, 0)) as totalKeyPasses',
        'SUM(COALESCE(stats.totalTackles, 0)) as totalTackles',
        'SUM(COALESCE(stats.totalInterceptions, 0)) as totalInterceptions',
        'SUM(COALESCE(stats.totalSave, 0)) as totalSaves',
      ])
      .groupBy('player.id, player.firstName, player.lastName, player.profilePicture, player.playerCategory')
      .having('COUNT(*) > 0') // Only include players with at least one match
      .getRawMany();

    // Calculate spider chart scores for each player
    const leaderboardData = playersWithStats.map((rawStats) => {
      const playerId = parseInt(rawStats.playerid);
      const firstName = rawStats.firstname || '';
      const lastName = rawStats.lastname || '';
      const profilePicture = rawStats.profilepicture || '';
      const playerCategory = rawStats.playercategory;
      const matchesPlayed = parseInt(rawStats.matchesplayed) || 0;

      if (matchesPlayed === 0) return null;

      const totalGoals = parseInt(rawStats.totalgoals) || 0;
      const totalAssists = parseInt(rawStats.totalassists) || 0;

      let score: number;
      let suffix: string;

      if (type === 'gna') {
        // For goals + assists type, use the sum as the score
        score = totalGoals + totalAssists;
        suffix = '';
      } else {
        // Compact-only, position-based XP
        const matches = matchesPlayed || 1;
        const shots = parseInt(rawStats.totalshots) || 0;
        const keyPasses = parseInt(rawStats.totalkeypasses) || 0;
        const tackles = parseInt(rawStats.totaltackles) || 0;
        const interceptions = parseInt(rawStats.totalinterceptions) || 0;
        const saves = parseInt(rawStats.totalsaves) || 0;
        const shotAccPct = (parseFloat(rawStats.avgshotaccuracy) || 0) * 100;
        const passAccPct = (parseFloat(rawStats.avgpassingaccuracy) || 0) * 100;

        const goalsPerMatch = totalGoals / matches;
        const assistsPerMatch = totalAssists / matches;
        const shotsPerMatch = shots / matches;
        const keyPassesPerMatch = keyPasses / matches;
        const tacklesPerMatch = tackles / matches;
        const interceptionsPerMatch = interceptions / matches;
        const savesPerMatch = saves / matches;
        const gnaPerMatch = (totalGoals + totalAssists) / matches;

        if ((playerCategory || '').toUpperCase() === 'GOALKEEPER') {
          score = this.computeGoalkeeperXp({ savesPerMatch, passAccuracyPct: passAccPct, assistsPerMatch });
        } else if ((playerCategory || '').toUpperCase() === 'DEFENDER') {
          score = this.computeDefenderXp({ tacklesPerMatch, interceptionsPerMatch, passAccuracyPct: passAccPct, gnaPerMatch });
        } else {
          score = this.computeAttackXp({ goalsPerMatch, assistsPerMatch, shotsPerMatch, shotAccuracyPct: shotAccPct, passAccuracyPct: passAccPct, keyPassesPerMatch, tacklesPerMatch, interceptionsPerMatch });
        }
        suffix = 'xp';
      }

      return {
        id: playerId,
        name: `${firstName} ${lastName}`.trim() || `Player ${playerId}`,
        score: score,
        suffix: suffix,
        imageUrl: profilePicture || '',
        playerCategory,
        matchesPlayed,
        totalGoals,
        totalAssists,
        spiderChart: type === 'overall' ? {
          shooting: Math.round((Math.min(100, ((parseFloat(rawStats.avgshotaccuracy) || 0) * 100 * 0.8) + (Math.min((parseInt(rawStats.totalshots) || 0) / matchesPlayed * 4, 20) * 0.2))) * 100) / 100,
          passing: Math.round(Math.max((parseFloat(rawStats.avgpassingaccuracy) || 0) * 100, (parseFloat(rawStats.avgopenplaypassingaccuracy) || 0) * 100) * 100) / 100,
          dribbling: Math.round((Math.min(100, ((parseFloat(rawStats.avgdribblesuccess) || 0) * 100 * 0.9) + (Math.min((parseInt(rawStats.totaldribbleattempts) || 0) / matchesPlayed * 2, 10) * 0.1))) * 100) / 100,
          tackling: Math.round((Math.min(100, (((parseInt(rawStats.successfultackles) || 0) / (parseInt(rawStats.totaltackleattempts) || 1) * 100) * 0.7) + (Math.min((parseInt(rawStats.totaldefensiveactions) || 0) / matchesPlayed * 1.5, 30) * 0.3))) * 100) / 100,
          impact: Math.round((Math.min(100, ((totalGoals + totalAssists) / matchesPlayed / 2.0) * 100)) * 100) / 100,
        } : undefined
      };
    }).filter(player => player !== null);

    // Sort by score and add ranks
    leaderboardData.sort((a, b) => b.score - a.score);

    // Calculate pagination
    const totalPlayers = leaderboardData.length;
    const totalPages = Math.ceil(totalPlayers / limit);
    const skip = (page - 1) * limit;

    const rankedLeaderboard = leaderboardData.slice(skip, skip + limit).map((player, index) => {
      const baseData = {
        id: player.id,
        rank: skip + index + 1,
        name: player.name,
        score: player.score,
        suffix: player.suffix,
        imageUrl: player.imageUrl,
      };

      // Add detailed stats only for G+A type
      if (type === 'gna') {
        return {
          ...baseData,
          appearances: player.matchesPlayed,
          goals: player.totalGoals,
          assists: player.totalAssists,
        };
      }

      // Return basic format for overall type
      return baseData;
    });

    return {
      data: rankedLeaderboard,
      pagination: {
        currentPage: page,
        totalPages,
        totalPlayers,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    };
  }

} 