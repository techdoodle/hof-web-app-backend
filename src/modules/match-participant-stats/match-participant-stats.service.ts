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

    // Calculate normalized scores for spider chart (0-100)
    const shotAccuracy = (stats.shotAccuracy || 0) * 100;
    const passingAccuracy = (stats.totalPassingAccuracy || 0) * 100;
    const dribbleSuccess = (stats.dribbleSuccessPercent || 0) * 100;

    // Tackling: derive score from available fields (tackle breakdown + totalDefensiveActions)
    const totalDefensiveActions = stats.totalDefensiveActions || 0;
    const totalTackleAttempts = stats.totalTackles || 0;
    const tacklesComponent = Math.min(totalTackleAttempts * 10, 70);
    const defensiveComponent = Math.min(totalDefensiveActions * 1.5, 30);
    const tackleDerivedScore = Math.min(100, tacklesComponent + defensiveComponent);

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
            totalInterceptions: (stats.steal || 0) + (stats.interceptionSameTeam || 0),
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
      // isMvp: stats.isMvp || false,
      match: {
        id: stats.match?.matchId,
        venue: stats.match?.venue?.name || null,
        startTime: stats.match?.startTime || null,
      },
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
          totalPassingActions: stats.totalPassingActions || 0,
        },
        dribbling: {
          successRate: Math.round(dribbleSuccess * 100) / 100,
          totalAttempts: stats.totalDribbleAttempt || 0,
          totalSuccessful: stats.totalSuccessfulDribble || 0,
        },
        tackling: {
          totalDefensiveActions: totalDefensiveActions,
          totalTackles: totalTackleAttempts,
          interceptions: (stats.steal || 0) + (stats.interceptionSameTeam || 0),
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
        'AVG(COALESCE(stats.shotAccuracy, 0)) as avgShotAccuracy',
        'SUM(COALESCE(stats.totalShot, 0)) as totalShots',
        'AVG(COALESCE(stats.totalPassingAccuracy, 0)) as avgPassingAccuracy',
        'AVG(COALESCE(stats.dribbleSuccessPercent, 0)) as avgDribbleSuccess',
        'SUM(COALESCE(stats.totalDribbleAttempt, 0)) as totalDribbleAttempts',
        'SUM(COALESCE(stats.totalSuccessfulDribble, 0)) as totalSuccessfulDribbles',
        'SUM(COALESCE(stats.totalDefensiveActions, 0)) as totalDefensiveActions',
        'SUM(COALESCE(stats.totalTackles, 0)) as totalTackles',
        'SUM(COALESCE(stats.totalGoal, 0)) as totalGoals',
        'SUM(COALESCE(stats.totalAssist, 0)) as totalAssists',
        'SUM(CASE WHEN stats.isMvp = true THEN 1 ELSE 0 END) as totalMvpWins',
        'SUM(COALESCE(stats.steal, 0)) as totalSteals',
        'SUM(COALESCE(stats.totalInterceptions, 0)) as totalInterceptions',
        'SUM(COALESCE(stats.totalPassingActions, 0)) as totalPassingActions',
        'SUM(COALESCE(stats.totalSave, 0)) as totalSave',
        'SUM(COALESCE(stats.totalCatch, 0)) as totalCatch',
        'SUM(COALESCE(stats.totalPunch, 0)) as totalPunch',
        'SUM(COALESCE(stats.totalClearance, 0)) as totalClearance',
        'SUM(COALESCE(stats.totalMiscontrol, 0)) as totalMiscontrol',
        'SUM(COALESCE(stats.blockedShotDefensive, 0)) as totalBlocks',
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

    const dribbleSuccess = (parseFloat(rawStats?.avgdribblesuccess) || 0) * 100;
    const totalDribbleAttempts = parseInt(rawStats?.totaldribbleattempts) || 0;
    const dribbleAttemptsPerMatch = totalDribbleAttempts / matchesPlayed || 0;

    const totalTackles = parseInt(rawStats?.totaltackles) || 0;
    const tacklesPerMatch = totalTackles / matchesPlayed || 0;
    const totalDefensiveActions = parseInt(rawStats?.totaldefensiveactions) || 0;
    const defensiveActionsPerMatch = totalDefensiveActions / matchesPlayed || 0;

    const totalGoals = parseInt(rawStats?.totalgoals) || 0;
    const totalAssists = parseInt(rawStats?.totalassists) || 0;
    const totalMvpWins = parseInt(rawStats?.totalmvpwins) || 0;
    const totalSteals = parseInt(rawStats?.totalsteals) || 0;
    const totalInterceptions = parseInt(rawStats?.totalinterceptions) || 0;
    const impactPerMatch = (totalGoals + totalAssists) / matchesPlayed || 0;

    const totalPassingActions = parseInt(rawStats?.totalpassingactions) || 0;
    const totalSave = parseInt(rawStats?.totalsave) || 0;
    const totalCatch = parseInt(rawStats?.totalcatch) || 0;
    const totalPunch = parseInt(rawStats?.totalpunch) || 0;
    const totalClearance = parseInt(rawStats?.totalclearance) || 0;
    const totalMiscontrol = parseInt(rawStats?.totalmiscontrol) || 0;
    const totalBlocks = parseInt(rawStats?.totalblocks) || 0;
    const totalSuccessfulDribbles = parseInt(rawStats?.totalsuccessfuldribbles) || 0;

    const shootingScore = Math.min(100, (shotAccuracy * 0.8) + (Math.min(shotsPerMatch * 4, 20) * 0.2));
    const passingScore = overallPassingAccuracy;
    const dribblingScore = Math.min(100, (dribbleSuccess * 0.9) + (Math.min(dribbleAttemptsPerMatch * 2, 10) * 0.1));
    const tacklesComponent = Math.min(tacklesPerMatch * 20, 70);
    const defensiveComponent = Math.min(defensiveActionsPerMatch * 1.5, 30);
    const tacklingScore = Math.min(100, tacklesComponent + defensiveComponent);
    // Impact calculation - better performance = higher score
    // Scale based on realistic football performance expectations
    let impactScore = Math.min(100, (impactPerMatch / 2.0) * 100);

    const getCategorySpecificStats = () => {
      const commonStats = {
        goals: totalGoals,
        assists: totalAssists,
        passingAccuracy: Math.round(overallPassingAccuracy * 100) / 100,
        totalPassingActions,
      };

      switch (playerCategory) {
        case PlayerCategory.GOALKEEPER:
          return {
            ...commonStats,
            totalSave,
            totalCatch,
            totalPunch,
            totalClearance,
            totalMiscontrol,
            totalKeyPass: totalPassingActions,
          };
        case PlayerCategory.DEFENDER:
          return {
            ...commonStats,
            totalInterceptions: totalInterceptions,
            totalTackles: totalTackles,
            blocks: totalBlocks,
            totalDefensiveActions,
            steals: totalSteals,
          };
        case PlayerCategory.STRIKER:
          return {
            ...commonStats,
            totalShots,
            shotAccuracy: Math.round(shotAccuracy * 100) / 100,
            dribbleAttempts: totalDribbleAttempts,
            dribbleCompleted: totalSuccessfulDribbles,
            totalSuccessfulDribbles,
          };
        default:
          return {
            ...commonStats,
            totalShots,
            shotAccuracy: Math.round(shotAccuracy * 100) / 100,
            totalDefensiveActions,
            totalTackles: totalTackles,
            dribbleAttempts: totalDribbleAttempts,
            totalSuccessfulDribbles,
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
        dribbling: Math.round(dribblingScore * 100) / 100,
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
          totalPassingActions,
        },
        dribbling: {
          successRate: Math.round(dribbleSuccess * 100) / 100,
          attemptsPerMatch: Math.round(dribbleAttemptsPerMatch * 100) / 100,
          totalAttempts: totalDribbleAttempts,
          totalSuccessful: totalSuccessfulDribbles,
        },
        tackling: {
          totalDefensiveActions,
          defensiveActionsPerMatch: Math.round(defensiveActionsPerMatch * 100) / 100,
          totalTackles: totalTackles,
          interceptions: totalInterceptions,
          blocks: totalBlocks,
          steals: totalSteals,
        },
        goalkeeping: {
          totalSave,
          totalCatch,
          totalPunch,
          totalClearance,
          totalMiscontrol,
        },
        impact: {
          goalsAndAssistsPerMatch: Math.round(impactPerMatch * 100) / 100,
          totalGoals,
          totalAssists,
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
        'AVG(COALESCE(stats.openPlayPassingAccuracy, 0)) as avgOpenPlayPassingAccuracy',
        'AVG(COALESCE(stats.dribbleSuccessPercent, 0)) as avgDribbleSuccess',
        'SUM(COALESCE(stats.totalDribbleAttempt, 0)) as totalDribbleAttempts',
        'SUM(COALESCE(stats.totalDefensiveActions, 0)) as totalDefensiveActions',
        'SUM(COALESCE(stats.tackleInPossession, 0) + COALESCE(stats.tackleTeamPossession, 0)) as successfulTackles',
        'SUM(COALESCE(stats.tackleInPossession, 0) + COALESCE(stats.tackleOob, 0) + COALESCE(stats.tackleTurnover, 0) + COALESCE(stats.tackleTeamPossession, 0)) as totalTackleAttempts',
        'SUM(COALESCE(stats.totalGoal, 0)) as totalGoals',
        'SUM(COALESCE(stats.totalAssist, 0)) as totalAssists',
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
        suffix = 'g+a';
      } else {
        // Original overall calculation
        // Calculate individual scores using same logic as spider chart
        const shotAccuracy = (parseFloat(rawStats.avgshotaccuracy) || 0) * 100;
        const totalShots = parseInt(rawStats.totalshots) || 0;
        const shotsPerMatch = totalShots / matchesPlayed || 0;

        const overallPassingAccuracy = (parseFloat(rawStats.avgpassingaccuracy) || 0) * 100;
        const openPlayPassingAccuracy = (parseFloat(rawStats.avgopenplaypassingaccuracy) || 0) * 100;

        const dribbleSuccess = (parseFloat(rawStats.avgdribblesuccess) || 0) * 100;
        const totalDribbleAttempts = parseInt(rawStats.totaldribbleattempts) || 0;
        const dribbleAttemptsPerMatch = totalDribbleAttempts / matchesPlayed || 0;

        const successfulTackles = parseInt(rawStats.successfultackles) || 0;
        const totalTackleAttempts = parseInt(rawStats.totaltackleattempts) || 0;
        const tackleSuccessRate = (successfulTackles / totalTackleAttempts || 0) * 100;
        const totalDefensiveActions = parseInt(rawStats.totaldefensiveactions) || 0;
        const defensiveActionsPerMatch = totalDefensiveActions / matchesPlayed || 0;

        const impactPerMatch = (totalGoals + totalAssists) / matchesPlayed || 0;

        // Calculate spider chart scores
        const shootingScore = Math.min(100, (shotAccuracy * 0.8) + (Math.min(shotsPerMatch * 4, 20) * 0.2));
        const passingScore = Math.max(overallPassingAccuracy, openPlayPassingAccuracy);
        const dribblingScore = Math.min(100, (dribbleSuccess * 0.9) + (Math.min(dribbleAttemptsPerMatch * 2, 10) * 0.1));
        const tacklingScore = Math.min(100, (tackleSuccessRate * 0.7) + (Math.min(defensiveActionsPerMatch * 1.5, 30) * 0.3));
        // Impact calculation - better performance = higher score
        // Scale based on realistic football performance expectations
        let impactScore = Math.min(100, (impactPerMatch / 2.0) * 100);

        // Calculate overall score by averaging all spider chart scores
        const overallScore = (shootingScore + passingScore + dribblingScore + tacklingScore + impactScore) / 5;
        score = Math.round(overallScore);
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

    const rankedLeaderboard = leaderboardData.slice(skip, skip + limit).map((player, index) => ({
      id: player.id,
      rank: skip + index + 1,
      name: player.name,
      score: player.score,
      suffix: player.suffix,
      imageUrl: player.imageUrl,
    }));

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