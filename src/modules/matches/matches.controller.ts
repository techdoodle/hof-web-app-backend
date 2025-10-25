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
  constructor(private readonly matchesService: MatchesService) { }

  @Get(':id/availability')
  async checkSlotAvailability(
    @Param('id', ParseIntPipe) matchId: number,
    @Query('slots', ParseIntPipe) slots: number
  ) {
    return await this.matchesService.checkSlotAvailability(matchId, slots);
  }

  @Post('nearby')
  async findNearbyMatches(
    @Body() location: { latitude: number; longitude: number }
  ) {
    return await this.matchesService.findNearbyMatches(location);
  }

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

  @Get('type/:matchTypeId')
  async findByMatchType(@Param('matchType', ParseIntPipe) matchTypeId: number): Promise<Match[]> {
    return await this.matchesService.findByMatchType(matchTypeId);
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

  @Put(':matchId/highlights')
  @UseGuards(JwtAuthGuard)
  async updateMatchHighlights(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body('matchHighlights') matchHighlights: string
  ): Promise<Match> {
    try {
      return await this.matchesService.updateMatchHighlights(matchId, matchHighlights);
    } catch (error) {
      throw new HttpException(
        `Failed to update match highlights: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Put(':matchId/recap')
  @UseGuards(JwtAuthGuard)
  async updateMatchRecap(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body('matchRecap') matchRecap: string
  ): Promise<Match> {
    try {
      return await this.matchesService.updateMatchRecap(matchId, matchRecap);
    } catch (error) {
      throw new HttpException(
        `Failed to update match recap: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get(':matchId/highlights')
  async getMatchHighlights(@Param('matchId', ParseIntPipe) matchId: number): Promise<{ matchHighlights: string | null }> {
    const match = await this.matchesService.findOne(matchId);
    return { matchHighlights: match.matchHighlights || null };
  }

  @Get(':matchId/recap')
  async getMatchRecap(@Param('matchId', ParseIntPipe) matchId: number): Promise<{ matchRecap: string | null }> {
    const match = await this.matchesService.findOne(matchId);
    return { matchRecap: match.matchRecap || null };
  }

  @Get(':matchId/booking-info')
  async getBookingInfo(@Param('matchId', ParseIntPipe) matchId: number) {
    return this.matchesService.getCriticalBookingInfo(matchId);
  }

  @Post(':matchId/calculate-price')
  async calculatePrice(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() body: { numSlots: number }
  ) {
    return this.matchesService.calculateBookingPrice(matchId, body.numSlots);
  }

  @Delete(':matchId')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('matchId', ParseIntPipe) matchId: number): Promise<{ message: string }> {
    await this.matchesService.remove(matchId);
    return { message: 'Match deleted successfully' };
  }
} 