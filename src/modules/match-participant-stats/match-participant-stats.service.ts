import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MatchParticipantStats } from './match-participant-stats.entity';

@Injectable()
export class MatchParticipantStatsService {
  constructor(
    @InjectRepository(MatchParticipantStats)
    private readonly matchParticipantStatsRepository: Repository<MatchParticipantStats>,
  ) {}

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
    const teamAStats = await this.matchParticipantStatsRepository
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
      .andWhere('mp.teamSide = :teamSide', { teamSide: 'A' })
      .getRawOne();

    const teamBStats = await this.matchParticipantStatsRepository
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
      .andWhere('mp.teamSide = :teamSide', { teamSide: 'B' })
      .getRawOne();

    return {
      teamA: {
        goals: parseInt(teamAStats.goals) || 0,
        shots: parseInt(teamAStats.shots) || 0,
        passingAccuracy: parseFloat(teamAStats.passingAccuracy) || 0,
        defensiveActions: parseInt(teamAStats.defensiveActions) || 0,
        offensiveActions: parseInt(teamAStats.offensiveActions) || 0,
      },
      teamB: {
        goals: parseInt(teamBStats.goals) || 0,
        shots: parseInt(teamBStats.shots) || 0,
        passingAccuracy: parseFloat(teamBStats.passingAccuracy) || 0,
        defensiveActions: parseInt(teamBStats.defensiveActions) || 0,
        offensiveActions: parseInt(teamBStats.offensiveActions) || 0,
      },
    };
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
    // Get all stats for the player
    const rawStats = await this.matchParticipantStatsRepository
      .createQueryBuilder('stats')
      .select([
        'COUNT(*) as matchesPlayed',
        'AVG(stats.shotAccuracy) as avgShotAccuracy',
        'SUM(stats.totalShot) as totalShots',
        'SUM(stats.totalOnTargetShot) as totalOnTargetShots',
        'AVG(stats.totalPassingAccuracy) as avgPassingAccuracy',
        'AVG(stats.openPlayPassingAccuracy) as avgOpenPlayPassingAccuracy',
        'AVG(stats.dribbleSuccessPercent) as avgDribbleSuccess',
        'SUM(stats.totalDribbleAttempt) as totalDribbleAttempts',
        'SUM(stats.totalSuccessfulDribble) as totalSuccessfulDribbles',
        'SUM(stats.totalDefensiveActions) as totalDefensiveActions',
        'SUM(stats.tackleInPossession + stats.tackleTeamPossession) as successfulTackles',
        'SUM(stats.tackleInPossession + stats.tackleOob + stats.tackleTurnover + stats.tackleTeamPossession) as totalTackleAttempts',
        'SUM(stats.totalGoal) as totalGoals',
        'SUM(stats.totalAssist) as totalAssists',
      ])
      .where('stats.player.id = :playerId', { playerId })
      .getRawOne();
    
    const matchesPlayed = parseInt(rawStats.matchesplayed) || 1; // Avoid division by zero

    // Calculate normalized values (0-100) for each axis
    
    // 1. Shooting (based on shot accuracy and shot frequency)
    const shotAccuracy = parseFloat(rawStats.avgshotaccuracy) || 0;
    const shotsPerMatch = (parseInt(rawStats.totalshots) || 0) / matchesPlayed;
    const shootingScore = Math.min(100, (shotAccuracy * 0.7) + (Math.min(shotsPerMatch * 10, 30) * 0.3));

    // 2. Passing (combination of overall and open play passing accuracy)
    const overallPassingAccuracy = parseFloat(rawStats.avgpassingaccuracy) || 0;
    const openPlayPassingAccuracy = parseFloat(rawStats.avgopenplaypassingaccuracy) || 0;
    const passingScore = Math.max(overallPassingAccuracy, openPlayPassingAccuracy);

    // 3. Dribbling (based on dribble success percentage and frequency)
    const dribbleSuccess = parseFloat(rawStats.avgdribblesuccess) || 0;
    const dribbleAttemptsPerMatch = (parseInt(rawStats.totaldribbleattempts) || 0) / matchesPlayed;
    const dribblingScore = Math.min(100, (dribbleSuccess * 0.8) + (Math.min(dribbleAttemptsPerMatch * 5, 20) * 0.2));

    // 4. Tackling (based on tackle success rate and defensive actions)
    const successfulTackles = parseInt(rawStats.successfultackles) || 0;
    const totalTackleAttempts = parseInt(rawStats.totaltackleattempts) || 1;
    const tackleSuccessRate = (successfulTackles / totalTackleAttempts) * 100;
    const defensiveActionsPerMatch = (parseInt(rawStats.totaldefensiveactions) || 0) / matchesPlayed;
    const tacklingScore = Math.min(100, (tackleSuccessRate * 0.6) + (Math.min(defensiveActionsPerMatch * 2, 40) * 0.4));

    // 5. Impact (goals + assists per match, normalized)
    const totalGoals = parseInt(rawStats.totalgoals) || 0;
    const totalAssists = parseInt(rawStats.totalassists) || 0;
    const impactPerMatch = (totalGoals + totalAssists) / matchesPlayed;
    const impactScore = Math.min(100, impactPerMatch * 50); // 2 goals+assists per match = 100

    return {
      playerId,
      matchesPlayed,
      spiderChart: {
        shooting: Math.round(shootingScore * 100) / 100,
        passing: Math.round(passingScore * 100) / 100,
        dribbling: Math.round(dribblingScore * 100) / 100,
        tackling: Math.round(tacklingScore * 100) / 100,
        impact: Math.round(impactScore * 100) / 100,
      },
      detailedStats: {
        shooting: {
          shotAccuracy: Math.round(shotAccuracy * 100) / 100,
          shotsPerMatch: Math.round(shotsPerMatch * 100) / 100,
          totalShots: parseInt(rawStats.totalShots) || 0,
          totalOnTargetShots: parseInt(rawStats.totalOnTargetShots) || 0,
        },
        passing: {
          overallAccuracy: Math.round(overallPassingAccuracy * 100) / 100,
          openPlayAccuracy: Math.round(openPlayPassingAccuracy * 100) / 100,
        },
        dribbling: {
          successRate: Math.round(dribbleSuccess * 100) / 100,
          attemptsPerMatch: Math.round(dribbleAttemptsPerMatch * 100) / 100,
          totalAttempts: parseInt(rawStats.totalDribbleAttempts) || 0,
          totalSuccessful: parseInt(rawStats.totalSuccessfulDribbles) || 0,
        },
        tackling: {
          successRate: Math.round(tackleSuccessRate * 100) / 100,
          defensiveActionsPerMatch: Math.round(defensiveActionsPerMatch * 100) / 100,
          totalDefensiveActions: parseInt(rawStats.totalDefensiveActions) || 0,
          successfulTackles,
          totalTackleAttempts,
        },
        impact: {
          goalsAndAssistsPerMatch: Math.round(impactPerMatch * 100) / 100,
          totalGoals,
          totalAssists,
        },
      },
    };
  }
} 