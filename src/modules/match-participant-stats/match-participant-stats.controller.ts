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
  HttpException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MatchParticipantStatsService } from './match-participant-stats.service';
import { MatchParticipantStats } from './match-participant-stats.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CsvUploadService } from './csv-upload.service';
import { CsvUploadResponseDto } from './dto/csv-upload.dto';


@Controller('match-participant-stats')
export class MatchParticipantStatsController {
  constructor(
    private readonly matchParticipantStatsService: MatchParticipantStatsService,
    private readonly csvUploadService: CsvUploadService,
  ) { }


  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createMatchParticipantStatsDto: any): Promise<MatchParticipantStats> {
    try {
      return await this.matchParticipantStatsService.create(createMatchParticipantStatsDto);
    } catch (error) {
      throw new HttpException(
        `Failed to create match participant stats: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }


  @Post('upload-csv')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<CsvUploadResponseDto> {
    try {
      return await this.csvUploadService.uploadCsv(file);
    } catch (error) {
      throw new HttpException(
        `Failed to upload CSV: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }


  @Get()
  async findAll(): Promise<MatchParticipantStats[]> {
    return await this.matchParticipantStatsService.findAll();
  }


  @Get('match/:matchId')
  async findByMatch(@Param('matchId', ParseIntPipe) matchId: number): Promise<MatchParticipantStats[]> {
    return await this.matchParticipantStatsService.findByMatch(matchId);
  }


  @Get('player/:playerId')
  async findByPlayer(@Param('playerId', ParseIntPipe) playerId: number): Promise<MatchParticipantStats[]> {
    return await this.matchParticipantStatsService.findByPlayer(playerId);
  }


  @Get('match-participant/:matchParticipantId')
  async findByMatchParticipant(@Param('matchParticipantId', ParseIntPipe) matchParticipantId: number): Promise<MatchParticipantStats[]> {
    return await this.matchParticipantStatsService.findByMatchParticipant(matchParticipantId);
  }


  @Get('player/:playerId/match/:matchId')
  async findByUserAndMatch(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('matchId', ParseIntPipe) matchId: number
  ): Promise<MatchParticipantStats> {
    try {
      return await this.matchParticipantStatsService.findByUserAndMatch(playerId, matchId);
    } catch (error) {
      throw new HttpException(
        `Failed to get stats for player ${playerId} in match ${matchId}: ${error.message}`,
        HttpStatus.NOT_FOUND
      );
    }
  }


  @Get('leaderboard/scorers')
  async getTopScorers(@Query('limit') limit?: string): Promise<MatchParticipantStats[]> {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.matchParticipantStatsService.getTopScorers(limitNum);
  }


  @Get('leaderboard/assisters')
  async getTopAssisters(@Query('limit') limit?: string): Promise<MatchParticipantStats[]> {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.matchParticipantStatsService.getTopAssisters(limitNum);
  }

  @Get('leaderboard/overall')
  async getOverallLeaderboard(@Query('limit') limit?: string): Promise<any[]> {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 10;
      return await this.matchParticipantStatsService.getPlayersLeaderboard(limitNum);
    } catch (error) {
      throw new HttpException(
        `Failed to get overall leaderboard: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get('leaderboard/:category')
  async getPlayersByStatCategory(
    @Param('category') category: string,
    @Query('limit') limit?: string
  ): Promise<MatchParticipantStats[]> {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.matchParticipantStatsService.getPlayersByStatCategory(category, limitNum);
  }


  @Get('player/:playerId/averages')
  async getPlayerAverageStats(@Param('playerId', ParseIntPipe) playerId: number): Promise<any> {
    return await this.matchParticipantStatsService.getPlayerAverageStats(playerId);
  }


  @Get('match/:matchId/summary')
  async getMatchStats(@Param('matchId', ParseIntPipe) matchId: number): Promise<any> {
    return await this.matchParticipantStatsService.getMatchStats(matchId);
  }


  @Get('match/:matchId/team-comparison')
  async getTeamStatsComparison(@Param('matchId', ParseIntPipe) matchId: number): Promise<any> {
    return await this.matchParticipantStatsService.getTeamStatsComparison(matchId);
  }


  @Get('player/:playerId/season/:year')
  async getSeasonStats(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Param('year', ParseIntPipe) year: number
  ): Promise<any> {
    if (year < 2000 || year > new Date().getFullYear() + 1) {
      throw new HttpException(
        'Invalid year parameter',
        HttpStatus.BAD_REQUEST
      );
    }
    return await this.matchParticipantStatsService.getSeasonStats(playerId, year);
  }


  @Get('player/:playerId/spider-chart')
  async getPlayerSpiderChartStats(@Param('playerId', ParseIntPipe) playerId: number): Promise<any> {
    try {
      return await this.matchParticipantStatsService.getPlayerSpiderChartStats(playerId);
    } catch (error) {
      throw new HttpException(
        `Failed to get spider chart stats for player ${playerId}: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }


  @Get(':matchStatsId')
  async findOne(@Param('matchStatsId', ParseIntPipe) matchStatsId: number): Promise<MatchParticipantStats> {
    return await this.matchParticipantStatsService.findOne(matchStatsId);
  }


  @Put(':matchStatsId')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('matchStatsId', ParseIntPipe) matchStatsId: number,
    @Body() updateMatchParticipantStatsDto: any
  ): Promise<MatchParticipantStats> {
    try {
      return await this.matchParticipantStatsService.update(matchStatsId, updateMatchParticipantStatsDto);
    } catch (error) {
      throw new HttpException(
        `Failed to update match participant stats: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }


  @Delete(':matchStatsId')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('matchStatsId', ParseIntPipe) matchStatsId: number): Promise<{ message: string }> {
    await this.matchParticipantStatsService.remove(matchStatsId);
    return { message: 'Match participant stats deleted successfully' };
  }
}
