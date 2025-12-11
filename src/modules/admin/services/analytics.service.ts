import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../../user/user.entity';
import { Match } from '../../matches/matches.entity';

export type GroupByType = 'daily' | 'weekly' | 'monthly';

export interface TrendDataPoint {
  date: string;
  count: number;
}

export interface TrendResponse {
  data: TrendDataPoint[];
  total: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get users added trend grouped by date period
   * Filters and groups by createdAt (registration date)
   */
  async getUsersAddedTrend(
    dateFrom?: Date,
    dateTo?: Date,
    groupBy: GroupByType = 'daily',
  ): Promise<TrendResponse> {
    const dateTrunc = this.getDateTruncFunction(groupBy);
    
    let query = this.userRepository
      .createQueryBuilder('user')
      .select(`DATE_TRUNC('${dateTrunc}', user.created_at)`, 'date')
      .addSelect('COUNT(*)', 'count')
      .groupBy(`DATE_TRUNC('${dateTrunc}', user.created_at)`)
      .orderBy(`DATE_TRUNC('${dateTrunc}', user.created_at)`, 'ASC');

    if (dateFrom) {
      query = query.andWhere('user.created_at >= :dateFrom', {
        dateFrom: dateFrom.toISOString(),
      });
    }

    if (dateTo) {
      query = query.andWhere('user.created_at <= :dateTo', {
        dateTo: dateTo.toISOString(),
      });
    }

    const results = await query.getRawMany();

    // Get total count
    let totalQuery = this.userRepository.createQueryBuilder('user');
    if (dateFrom) {
      totalQuery = totalQuery.andWhere('user.created_at >= :dateFrom', {
        dateFrom: dateFrom.toISOString(),
      });
    }
    if (dateTo) {
      totalQuery = totalQuery.andWhere('user.created_at <= :dateTo', {
        dateTo: dateTo.toISOString(),
      });
    }
    const total = await totalQuery.getCount();

    const data: TrendDataPoint[] = results.map((row: any) => ({
      date: new Date(row.date).toISOString().split('T')[0],
      count: parseInt(row.count, 10),
    }));

    return { data, total };
  }

  /**
   * Get matches completed trend grouped by date period
   * Filters and groups by startTime (match start date), not createdAt
   * Matches are "completed" when endTime < NOW() AND status != 'CANCELLED'
   */
  async getMatchesCompletedTrend(
    dateFrom?: Date,
    dateTo?: Date,
    groupBy: GroupByType = 'daily',
  ): Promise<TrendResponse> {
    const dateTrunc = this.getDateTruncFunction(groupBy);
    const now = new Date();

    let query = this.matchRepository
      .createQueryBuilder('match')
      .select(`DATE_TRUNC('${dateTrunc}', match.start_time)`, 'date')
      .addSelect('COUNT(*)', 'count')
      .where('match.end_time < :now', { now: now.toISOString() })
      .andWhere('match.status != :cancelled', { cancelled: 'CANCELLED' })
      .groupBy(`DATE_TRUNC('${dateTrunc}', match.start_time)`)
      .orderBy(`DATE_TRUNC('${dateTrunc}', match.start_time)`, 'ASC');

    if (dateFrom) {
      query = query.andWhere('match.start_time >= :dateFrom', {
        dateFrom: dateFrom.toISOString(),
      });
    }

    if (dateTo) {
      query = query.andWhere('match.start_time <= :dateTo', {
        dateTo: dateTo.toISOString(),
      });
    }

    const results = await query.getRawMany();

    // Get total count
    let totalQuery = this.matchRepository
      .createQueryBuilder('match')
      .where('match.end_time < :now', { now: now.toISOString() })
      .andWhere('match.status != :cancelled', { cancelled: 'CANCELLED' });
    
    if (dateFrom) {
      totalQuery = totalQuery.andWhere('match.start_time >= :dateFrom', {
        dateFrom: dateFrom.toISOString(),
      });
    }
    if (dateTo) {
      totalQuery = totalQuery.andWhere('match.start_time <= :dateTo', {
        dateTo: dateTo.toISOString(),
      });
    }
    const total = await totalQuery.getCount();

    const data: TrendDataPoint[] = results.map((row: any) => ({
      date: new Date(row.date).toISOString().split('T')[0],
      count: parseInt(row.count, 10),
    }));

    return { data, total };
  }

  /**
   * Get matches cancelled trend grouped by date period
   * Filters and groups by startTime (match start date), not createdAt
   * Matches are "cancelled" when status = 'CANCELLED'
   */
  async getMatchesCancelledTrend(
    dateFrom?: Date,
    dateTo?: Date,
    groupBy: GroupByType = 'daily',
  ): Promise<TrendResponse> {
    const dateTrunc = this.getDateTruncFunction(groupBy);

    let query = this.matchRepository
      .createQueryBuilder('match')
      .select(`DATE_TRUNC('${dateTrunc}', match.start_time)`, 'date')
      .addSelect('COUNT(*)', 'count')
      .where('match.status = :cancelled', { cancelled: 'CANCELLED' })
      .groupBy(`DATE_TRUNC('${dateTrunc}', match.start_time)`)
      .orderBy(`DATE_TRUNC('${dateTrunc}', match.start_time)`, 'ASC');

    if (dateFrom) {
      query = query.andWhere('match.start_time >= :dateFrom', {
        dateFrom: dateFrom.toISOString(),
      });
    }

    if (dateTo) {
      query = query.andWhere('match.start_time <= :dateTo', {
        dateTo: dateTo.toISOString(),
      });
    }

    const results = await query.getRawMany();

    // Get total count
    let totalQuery = this.matchRepository
      .createQueryBuilder('match')
      .where('match.status = :cancelled', { cancelled: 'CANCELLED' });
    
    if (dateFrom) {
      totalQuery = totalQuery.andWhere('match.start_time >= :dateFrom', {
        dateFrom: dateFrom.toISOString(),
      });
    }
    if (dateTo) {
      totalQuery = totalQuery.andWhere('match.start_time <= :dateTo', {
        dateTo: dateTo.toISOString(),
      });
    }
    const total = await totalQuery.getCount();

    const data: TrendDataPoint[] = results.map((row: any) => ({
      date: new Date(row.date).toISOString().split('T')[0],
      count: parseInt(row.count, 10),
    }));

    return { data, total };
  }

  /**
   * Get the PostgreSQL DATE_TRUNC function parameter based on groupBy type
   */
  private getDateTruncFunction(groupBy: GroupByType): string {
    switch (groupBy) {
      case 'daily':
        return 'day';
      case 'weekly':
        return 'week';
      case 'monthly':
        return 'month';
      default:
        return 'day';
    }
  }
}

