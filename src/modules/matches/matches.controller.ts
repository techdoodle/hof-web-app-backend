import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Param, 
  Body, 
  Query, 
  ParseIntPipe,
  UseGuards,
  HttpStatus,
  HttpException
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { Match } from './matches.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MatchType } from '../../common/enums/match-type.enum';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createMatchDto: any): Promise<Match> {
    try {
      return await this.matchesService.create(createMatchDto);
    } catch (error) {
      throw new HttpException(
        `Failed to create match: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get()
  async findAll(): Promise<Match[]> {
    return await this.matchesService.findAll();
  }

  @Get('search')
  async searchMatches(
    @Query('q') query: string,
    @Query('limit') limit?: string
  ): Promise<Match[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }
    
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.matchesService.searchMatches(query.trim(), limitNum);
  }

  @Get('type/:matchType')
  async findByMatchType(@Param('matchType') matchType: MatchType): Promise<Match[]> {
    return await this.matchesService.findByMatchType(matchType);
  }

  @Get('football-chief/:footballChiefId')
  async findByFootballChief(@Param('footballChiefId', ParseIntPipe) footballChiefId: number): Promise<Match[]> {
    return await this.matchesService.findByFootballChief(footballChiefId);
  }

  @Get('city/:cityId')
  async findByCity(@Param('cityId', ParseIntPipe) cityId: number): Promise<Match[]> {
    return await this.matchesService.findByCity(cityId);
  }

  @Get('venue/:venueId')
  async findByVenue(@Param('venueId', ParseIntPipe) venueId: number): Promise<Match[]> {
    return await this.matchesService.findByVenue(venueId);
  }

  @Get('date-range')
  async findByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ): Promise<Match[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new HttpException(
        'Invalid date parameters',
        HttpStatus.BAD_REQUEST
      );
    }
    
    return await this.matchesService.findByDateRange(start, end);
  }

  @Get('stats-received/:statsReceived')
  async findByStatsReceived(@Param('statsReceived') statsReceived: string): Promise<Match[]> {
    const isStatsReceived = statsReceived.toLowerCase() === 'true';
    return await this.matchesService.findByStatsReceived(isStatsReceived);
  }

  @Get('upcoming')
  async getUpcomingMatches(@Query('limit') limit?: string): Promise<Match[]> {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.matchesService.getUpcomingMatches(limitNum);
  }

  @Get('completed')
  async getCompletedMatches(@Query('limit') limit?: string): Promise<Match[]> {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.matchesService.getCompletedMatches(limitNum);
  }

  @Get(':matchId')
  async findOne(@Param('matchId', ParseIntPipe) matchId: number): Promise<Match> {
    return await this.matchesService.findOne(matchId);
  }

  @Put(':matchId')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() updateMatchDto: any
  ): Promise<Match> {
    try {
      return await this.matchesService.update(matchId, updateMatchDto);
    } catch (error) {
      throw new HttpException(
        `Failed to update match: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Delete(':matchId')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('matchId', ParseIntPipe) matchId: number): Promise<{ message: string }> {
    await this.matchesService.remove(matchId);
    return { message: 'Match deleted successfully' };
  }
} 