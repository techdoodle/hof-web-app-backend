import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match } from '../../matches/matches.entity';

export interface FootballChiefLeaderboardEntry {
  footballChiefId: number;
  footballChiefName: string;
  footballChiefEmail: string;
  footballChiefPhone: string;
  profilePicture: string | null;
  matchCount: number;
}

@Injectable()
export class FootballChiefLeaderboardService {
  constructor(
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
  ) {}

  /**
   * Get football chief leaderboard ranked by match count
   * @param dateFrom Optional start date filter
   * @param dateTo Optional end date filter
   * @returns Array of football chiefs sorted by match count (descending)
   */
  async getLeaderboard(
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<FootballChiefLeaderboardEntry[]> {
    // Use TypeORM query builder for better control
    const queryBuilder = this.matchRepository
      .createQueryBuilder('match')
      .select('footballChief.id', 'footballChiefId')
      .addSelect('footballChief.firstName', 'firstName')
      .addSelect('footballChief.lastName', 'lastName')
      .addSelect('footballChief.email', 'email')
      .addSelect('footballChief.phoneNumber', 'phone')
      .addSelect('footballChief.profilePicture', 'profilePicture')
      .addSelect('COUNT(match.matchId)', 'matchCount')
      .innerJoin('match.footballChief', 'footballChief')
      .where('match.status = :status', { status: 'ACTIVE' })
      .groupBy('footballChief.id')
      .addGroupBy('footballChief.firstName')
      .addGroupBy('footballChief.lastName')
      .addGroupBy('footballChief.email')
      .addGroupBy('footballChief.phoneNumber')
      .addGroupBy('footballChief.profilePicture')
      .orderBy('COUNT(match.matchId)', 'DESC')
      .addOrderBy('footballChief.firstName', 'ASC');

    // Add date filters if provided
    if (dateFrom) {
      queryBuilder.andWhere('match.startTime >= :dateFrom', {
        dateFrom: dateFrom.toISOString(),
      });
    }
    if (dateTo) {
      // Set to end of day
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('match.startTime <= :dateTo', {
        dateTo: endOfDay.toISOString(),
      });
    }

    const results = await queryBuilder.getRawMany();

    // Transform results to match interface
    return results.map((row) => ({
      footballChiefId: parseInt(row.footballChiefId),
      footballChiefName: `${row.firstName || ''} ${row.lastName || ''}`.trim() || 'Unknown',
      footballChiefEmail: row.email || '',
      footballChiefPhone: row.phone || '',
      profilePicture: row.profilePicture || null,
      matchCount: parseInt(row.matchCount) || 0,
    }));
  }
}

