import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { MatchParticipantsService } from './match-participants.service';
import { MatchParticipant } from './match-participants.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';


@Controller('match-participants')
export class MatchParticipantsController {
  constructor(private readonly matchParticipantsService: MatchParticipantsService) { }

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
    console.log('Match-participants API called for match:', matchId);
    const participants = await this.matchParticipantsService.findByMatch(matchId);
    console.log('Match-participants API returning:', participants);
    return participants;
  }

  @Get('user/:userId')
  async findByUser(@Param('userId', ParseIntPipe) userId: number): Promise<MatchParticipant[]> {
    return await this.matchParticipantsService.findByUser(userId);
  }

  @Get('match/:matchId/team/:teamName')
  async findByMatchAndTeamName(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('teamName') teamName: string
  ): Promise<MatchParticipant[]> {
    return await this.matchParticipantsService.findByMatchAndTeamName(matchId, teamName);
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
  async getMatchParticipantsCount(@Param('matchId', ParseIntPipe) matchId: number): Promise<{ teams: Record<string, number>; total: number }> {
    return await this.matchParticipantsService.getMatchParticipantsCount(matchId);
  }

  @Get('match/:matchId/users')
  async getUsersByMatch(@Param('matchId', ParseIntPipe) matchId: number): Promise<{ teams: Record<string, any[]> }> {
    return await this.matchParticipantsService.getUsersByMatch(matchId);
  }

  @Get('match/:matchId/two-teams')
  async getTwoTeamsForMatch(@Param('matchId', ParseIntPipe) matchId: number): Promise<{ team1: { name: string; users: any[] }; team2: { name: string; users: any[] } } | null> {
    return await this.matchParticipantsService.getTwoTeamsForMatch(matchId);
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

  @Put(':matchParticipantId/team-name')
  @UseGuards(JwtAuthGuard)
  async updateTeamName(
    @Param('matchParticipantId', ParseIntPipe) matchParticipantId: number,
    @Body('teamName') teamName: string
  ): Promise<MatchParticipant> {
    try {
      return await this.matchParticipantsService.updateTeamName(matchParticipantId, teamName);
    } catch (error) {
      throw new HttpException(
        `Failed to update team name: ${error.message}`,
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

  @Put(':matchParticipantId/player-highlights')
  @UseGuards(JwtAuthGuard)
  async updatePlayerHighlights(
    @Param('matchParticipantId', ParseIntPipe) matchParticipantId: number,
    @Body('playerHighlights') playerHighlights: string
  ): Promise<MatchParticipant> {
    try {
      return await this.matchParticipantsService.updatePlayerHighlights(matchParticipantId, playerHighlights);
    } catch (error) {
      throw new HttpException(
        `Failed to update player highlights: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get(':matchParticipantId/player-highlights')
  async getPlayerHighlights(@Param('matchParticipantId', ParseIntPipe) matchParticipantId: number): Promise<{ playerHighlights: string | null }> {
    const participant = await this.matchParticipantsService.findOne(matchParticipantId);
    return { playerHighlights: participant.playerHighlights || null };
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