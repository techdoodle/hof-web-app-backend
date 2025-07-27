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
import { MatchParticipantsService } from './match-participants.service';
import { MatchParticipant } from './match-participants.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TeamSide } from '../../common/enums/team-side.enum';

@Controller('match-participants')
export class MatchParticipantsController {
  constructor(private readonly matchParticipantsService: MatchParticipantsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createMatchParticipantDto: any): Promise<MatchParticipant> {
    try {
      return await this.matchParticipantsService.create(createMatchParticipantDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to create match participant: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get()
  async findAll(): Promise<MatchParticipant[]> {
    return await this.matchParticipantsService.findAll();
  }

  @Get('match/:matchId')
  async findByMatch(@Param('matchId', ParseIntPipe) matchId: number): Promise<MatchParticipant[]> {
    return await this.matchParticipantsService.findByMatch(matchId);
  }

  @Get('user/:userId')
  async findByUser(@Param('userId', ParseIntPipe) userId: number): Promise<MatchParticipant[]> {
    return await this.matchParticipantsService.findByUser(userId);
  }

  @Get('match/:matchId/team/:teamSide')
  async findByMatchAndTeamSide(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('teamSide') teamSide: TeamSide
  ): Promise<MatchParticipant[]> {
    return await this.matchParticipantsService.findByMatchAndTeamSide(matchId, teamSide);
  }

  @Get('user/:userId/match/:matchId')
  async findByUserAndMatch(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('matchId', ParseIntPipe) matchId: number
  ): Promise<MatchParticipant | null> {
    return await this.matchParticipantsService.findByUserAndMatch(userId, matchId);
  }

  @Get('paid-stats/:paidStatsOptIn')
  async findByPaidStatsOptIn(@Param('paidStatsOptIn') paidStatsOptIn: string): Promise<MatchParticipant[]> {
    const isPaidStatsOptIn = paidStatsOptIn.toLowerCase() === 'true';
    return await this.matchParticipantsService.findByPaidStatsOptIn(isPaidStatsOptIn);
  }

  @Get('match/:matchId/count')
  async getMatchParticipantsCount(@Param('matchId', ParseIntPipe) matchId: number): Promise<{ teamA: number; teamB: number; total: number }> {
    return await this.matchParticipantsService.getMatchParticipantsCount(matchId);
  }

  @Get('match/:matchId/users')
  async getUsersByMatch(@Param('matchId', ParseIntPipe) matchId: number): Promise<{ teamA: any[]; teamB: any[] }> {
    return await this.matchParticipantsService.getUsersByMatch(matchId);
  }

  @Get(':matchParticipantId')
  async findOne(@Param('matchParticipantId', ParseIntPipe) matchParticipantId: number): Promise<MatchParticipant> {
    return await this.matchParticipantsService.findOne(matchParticipantId);
  }

  @Put(':matchParticipantId')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('matchParticipantId', ParseIntPipe) matchParticipantId: number,
    @Body() updateMatchParticipantDto: any
  ): Promise<MatchParticipant> {
    try {
      return await this.matchParticipantsService.update(matchParticipantId, updateMatchParticipantDto);
    } catch (error) {
      throw new HttpException(
        `Failed to update match participant: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Put(':matchParticipantId/team-side')
  @UseGuards(JwtAuthGuard)
  async updateTeamSide(
    @Param('matchParticipantId', ParseIntPipe) matchParticipantId: number,
    @Body('teamSide') teamSide: TeamSide
  ): Promise<MatchParticipant> {
    try {
      return await this.matchParticipantsService.updateTeamSide(matchParticipantId, teamSide);
    } catch (error) {
      throw new HttpException(
        `Failed to update team side: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Put(':matchParticipantId/paid-stats-opt-in')
  @UseGuards(JwtAuthGuard)
  async updatePaidStatsOptIn(
    @Param('matchParticipantId', ParseIntPipe) matchParticipantId: number,
    @Body('paidStatsOptIn') paidStatsOptIn: boolean
  ): Promise<MatchParticipant> {
    try {
      return await this.matchParticipantsService.updatePaidStatsOptIn(matchParticipantId, paidStatsOptIn);
    } catch (error) {
      throw new HttpException(
        `Failed to update paid stats opt-in: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Delete(':matchParticipantId')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('matchParticipantId', ParseIntPipe) matchParticipantId: number): Promise<{ message: string }> {
    await this.matchParticipantsService.remove(matchParticipantId);
    return { message: 'Match participant deleted successfully' };
  }

  @Delete('user/:userId/match/:matchId')
  @UseGuards(JwtAuthGuard)
  async removeUserFromMatch(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('matchId', ParseIntPipe) matchId: number
  ): Promise<{ message: string }> {
    await this.matchParticipantsService.removeUserFromMatch(userId, matchId);
    return { message: 'User removed from match successfully' };
  }
} 