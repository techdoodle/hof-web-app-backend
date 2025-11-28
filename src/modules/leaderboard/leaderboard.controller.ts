import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { LeaderboardResponseDto } from './dto/leaderboard-response.dto';

@Controller('leaderboard/overall')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) { }

  @Get()
  async getLeaderboard(@Query() query: LeaderboardQueryDto): Promise<LeaderboardResponseDto> {
    try {
      // Map position abbreviations to full names
      const positionMap: { [key: string]: string } = {
        'atk': 'STRIKER',
        'striker': 'STRIKER',
        'def': 'DEFENDER',
        'defender': 'DEFENDER',
        'gk': 'GOALKEEPER',
        'goalkeeper': 'GOALKEEPER',
        'all': 'all',
      };

      const rawPosition = (query.position || 'all').toLowerCase();
      const mappedPosition = positionMap[rawPosition] || 'all';

      // Normalize query parameters (case insensitive)
      const normalizedQuery: LeaderboardQueryDto = {
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 50,
        city: (query.city || 'all').toLowerCase(),
        position: mappedPosition,
        gender: (query.gender || 'male').toLowerCase(),
        type: (query.type || 'overall').toLowerCase(),
      };

      return await this.leaderboardService.getLeaderboard(normalizedQuery);
    } catch (error) {
      console.error('Leaderboard error:', error);
      throw new HttpException(
        `Failed to get leaderboard: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}

