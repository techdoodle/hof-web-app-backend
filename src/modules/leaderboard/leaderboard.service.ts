import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { LeaderboardResponseDto, LeaderboardUserDto } from './dto/leaderboard-response.dto';

@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getLeaderboard(query: LeaderboardQueryDto): Promise<LeaderboardResponseDto> {
    const { page = 1, limit = 50, city = 'all', position = 'all', gender = 'male' } = query;

    // Build the base query to get users with their match stats
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.city', 'city')
      .leftJoin('match_participant_stats', 'stats', 'stats.player_id = user.id')
      .select([
        'user.id as userId',
        'user.first_name as firstName',
        'user.last_name as lastName',
        'user.profile_picture as profilePicture',
        'user.player_category as playerCategory',
        'user.gender as gender',
        'city.city_name as cityName',
        'COUNT(stats.match_stats_id) as matchesPlayed',
        'SUM(COALESCE(stats.total_goal, 0)) as totalGoals',
        'SUM(COALESCE(stats.total_assist, 0)) as totalAssists',
        'SUM(COALESCE(stats.total_shot, 0)) as totalShots',
        'AVG(COALESCE(stats.shot_accuracy, 0)) as avgShotAccuracy',
        'AVG(COALESCE(stats.total_passing_accuracy, 0)) as avgPassingAccuracy',
        'SUM(COALESCE(stats.total_key_pass, 0)) as totalKeyPasses',
        'SUM(COALESCE(stats.total_tackles, 0)) as totalTackles',
        'SUM(COALESCE(stats.total_interceptions, 0)) as totalInterceptions',
        'SUM(COALESCE(stats.total_save, 0)) as totalSaves',
      ])
      .groupBy('user.id, user.first_name, user.last_name, user.profile_picture, user.player_category, user.gender, city.city_name')
      .having('COUNT(stats.match_stats_id) > 0'); // Only users who have played at least one match

    // Apply filters
    // City filter
    if (city !== 'all') {
      queryBuilder.andWhere('LOWER(city.city_name) = LOWER(:city)', { city });
    }

    // Gender filter (ENUM type, compare directly)
    if (gender !== 'all') {
      queryBuilder.andWhere('user.gender = :gender', { gender: gender.toUpperCase() });
    }

    // Position filter (ENUM type, compare directly)
    if (position !== 'all') {
      queryBuilder.andWhere('user.player_category = :position', { position: position.toUpperCase() });
    }

    const rawResults = await queryBuilder.getRawMany();

    // Calculate XP for each user
    const leaderboardData = rawResults.map((raw) => {
      const userId = parseInt(raw.userid);
      const firstName = raw.firstname || '';
      const lastName = raw.lastname || '';
      const profilePicture = raw.profilepicture || '';
      const playerCategory = raw.playercategory || 'STRIKER';
      const matchesPlayed = parseInt(raw.matchesplayed) || 0;

      if (matchesPlayed === 0) return null;

      const totalGoals = parseInt(raw.totalgoals) || 0;
      const totalAssists = parseInt(raw.totalassists) || 0;
      const shots = parseInt(raw.totalshots) || 0;
      const keyPasses = parseInt(raw.totalkeypasses) || 0;
      const tackles = parseInt(raw.totaltackles) || 0;
      const interceptions = parseInt(raw.totalinterceptions) || 0;
      const saves = parseInt(raw.totalsaves) || 0;
      const shotAccPct = (parseFloat(raw.avgshotaccuracy) || 0) * 100;
      const passAccPct = (parseFloat(raw.avgpassingaccuracy) || 0) * 100;

      const goalsPerMatch = totalGoals / matchesPlayed;
      const assistsPerMatch = totalAssists / matchesPlayed;
      const shotsPerMatch = shots / matchesPlayed;
      const keyPassesPerMatch = keyPasses / matchesPlayed;
      const tacklesPerMatch = tackles / matchesPlayed;
      const interceptionsPerMatch = interceptions / matchesPlayed;
      const savesPerMatch = saves / matchesPlayed;
      const gnaPerMatch = (totalGoals + totalAssists) / matchesPlayed;

      let score: number;
      const category = (playerCategory || '').toUpperCase();

      if (category === 'GOALKEEPER') {
        score = this.computeGoalkeeperXp({ savesPerMatch, passAccuracyPct: passAccPct, assistsPerMatch });
      } else if (category === 'DEFENDER') {
        score = this.computeDefenderXp({ tacklesPerMatch, interceptionsPerMatch, passAccuracyPct: passAccPct, gnaPerMatch });
      } else {
        score = this.computeAttackXp({ goalsPerMatch, assistsPerMatch, shotsPerMatch, shotAccuracyPct: shotAccPct, passAccuracyPct: passAccPct, keyPassesPerMatch, tacklesPerMatch, interceptionsPerMatch });
      }

      return {
        id: userId,
        userId: userId,
        name: `${firstName} ${lastName}`.trim() || `Player ${userId}`,
        score: Math.round(score),
        suffix: 'XP',
        imageUrl: profilePicture || '',
      };
    }).filter(player => player !== null);

    // Sort by score (descending) to calculate ranks
    leaderboardData.sort((a, b) => b.score - a.score);

    // Apply pagination
    const totalItems = leaderboardData.length;
    const totalPages = Math.ceil(totalItems / limit);
    const skip = (page - 1) * limit;
    const hasNextPage = page < totalPages;

    // Add rank to paginated results
    const paginatedData: LeaderboardUserDto[] = leaderboardData
      .slice(skip, skip + limit)
      .map((player, index) => ({
        ...player,
        rank: skip + index + 1,
      }));

    return {
      data: paginatedData,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage,
      },
    };
  }

  // XP calculation methods
  private computeGoalkeeperXp(params: { savesPerMatch: number; passAccuracyPct: number; assistsPerMatch: number }): number {
    const { savesPerMatch, passAccuracyPct, assistsPerMatch } = params;
    const savesScore = Math.min(savesPerMatch * 12, 60);
    const passScore = Math.min(passAccuracyPct * 0.2, 20);
    const assistScore = Math.min(assistsPerMatch * 15, 20);
    return savesScore + passScore + assistScore;
  }

  private computeDefenderXp(params: { tacklesPerMatch: number; interceptionsPerMatch: number; passAccuracyPct: number; gnaPerMatch: number }): number {
    const { tacklesPerMatch, interceptionsPerMatch, passAccuracyPct, gnaPerMatch } = params;
    const tacklesScore = Math.min(tacklesPerMatch * 8, 40);
    const interceptionsScore = Math.min(interceptionsPerMatch * 8, 30);
    const passScore = Math.min(passAccuracyPct * 0.15, 15);
    const gnaScore = Math.min(gnaPerMatch * 15, 15);
    return tacklesScore + interceptionsScore + passScore + gnaScore;
  }

  private computeAttackXp(params: {
    goalsPerMatch: number;
    assistsPerMatch: number;
    shotsPerMatch: number;
    shotAccuracyPct: number;
    passAccuracyPct: number;
    keyPassesPerMatch: number;
    tacklesPerMatch: number;
    interceptionsPerMatch: number;
  }): number {
    const { goalsPerMatch, assistsPerMatch, shotsPerMatch, shotAccuracyPct, passAccuracyPct, keyPassesPerMatch, tacklesPerMatch, interceptionsPerMatch } = params;
    const goalsScore = Math.min(goalsPerMatch * 20, 40);
    const assistsScore = Math.min(assistsPerMatch * 12, 24);
    const shotsScore = Math.min(shotsPerMatch * 1.5, 9);
    const shotAccScore = Math.min(shotAccuracyPct * 0.08, 8);
    const passScore = Math.min(passAccuracyPct * 0.06, 6);
    const keyPassScore = Math.min(keyPassesPerMatch * 2, 8);
    const defenseScore = Math.min((tacklesPerMatch + interceptionsPerMatch) * 1, 5);
    return goalsScore + assistsScore + shotsScore + shotAccScore + passScore + keyPassScore + defenseScore;
  }
}

