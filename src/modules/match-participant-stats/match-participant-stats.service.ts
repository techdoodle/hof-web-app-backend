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
} 