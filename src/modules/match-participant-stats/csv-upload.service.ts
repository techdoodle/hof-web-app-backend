import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import * as csv from 'csv-parser';
import { Readable } from 'stream';

import { MatchParticipantStats } from './match-participant-stats.entity';
import { MatchParticipant } from '../match-participants/match-participants.entity';
import { User } from '../user/user.entity';
import { Match } from '../matches/matches.entity';
import { CsvRowDto, CsvUploadResponseDto } from './dto/csv-upload.dto';

@Injectable()
export class CsvUploadService {
  private readonly logger = new Logger(CsvUploadService.name);

  constructor(
    @InjectRepository(MatchParticipantStats)
    private readonly matchParticipantStatsRepository: Repository<MatchParticipantStats>,
    @InjectRepository(MatchParticipant)
    private readonly matchParticipantRepository: Repository<MatchParticipant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    private readonly dataSource: DataSource,
  ) { }

  async uploadCsv(file: Express.Multer.File, matchId: number): Promise<CsvUploadResponseDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('File must be a CSV');
    }

    const csvData = await this.parseCsv(file.buffer);
    return await this.processCsvData(csvData, matchId);
  }

  private async parseCsv(buffer: Buffer): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      const stream = Readable.from(buffer.toString());

      stream
        .pipe(csv({
          mapHeaders: ({ header }) => header.trim().replace(/\s+/g, ''),
        }))
        .on('data', (data) => {
          // Convert empty strings to null for optional fields
          const cleanedData = Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
              key,
              value === '' || value === undefined ? null : value
            ])
          );

          // Skip empty rows (rows where all required fields are null/empty)
          const hasRequiredData = cleanedData.phoneNumber || cleanedData.email;
          if (hasRequiredData) {
            results.push(cleanedData);
          }
        })
        .on('end', () => resolve(results))
        .on('error', (error) => reject(error));
    });
  }

  private async processCsvData(csvData: any[], matchId: number): Promise<CsvUploadResponseDto> {
    const response: CsvUploadResponseDto = {
      totalRows: csvData.length,
      successfulRows: 0,
      failedRows: 0,
      errors: [],
      warnings: [],
    };

    // Track processed combinations to detect duplicates in the CSV itself
    const processedCombinations = new Set<string>();

    for (let i = 0; i < csvData.length; i++) {
      const rowIndex = i + 1; // 1-based for user readability

      try {
        // Check for duplicate combinations in the CSV
        const userIdentifier = csvData[i].phoneNumber || csvData[i].email;
        const combinationKey = `${userIdentifier}-${matchId}`;

        if (processedCombinations.has(combinationKey)) {
          throw new BadRequestException(`Duplicate entry in CSV for user ${userIdentifier} in match ${matchId}`);
        }

        processedCombinations.add(combinationKey);
        const wasSuccessful = await this.processRow(csvData[i], rowIndex, response, matchId);
        if (wasSuccessful) {
          response.successfulRows++;
        }
      } catch (error) {
        response.failedRows++;
        this.logger.error(`Error processing row ${rowIndex}:`, error);

        response.errors?.push({
          row: rowIndex,
          errors: [error.message || 'Unknown error'],
          data: csvData[i],
        });
      }
    }

    return response;
  }

  private async processRow(
    rowData: any,
    rowIndex: number,
    response: CsvUploadResponseDto,
    matchId: number,
  ): Promise<boolean> {
    // Convert and validate the row data
    const dto = plainToClass(CsvRowDto, rowData, {
      enableImplicitConversion: true,
      excludeExtraneousValues: false,
    });

    // Validate the DTO
    const validationErrors = await validate(dto);
    if (validationErrors.length > 0) {
      const errorMessages = validationErrors
        .map(error => Object.values(error.constraints || {}).join(', '))
        .join('; ');
      throw new BadRequestException(`Validation failed: ${errorMessages}`);
    }

    // Validate user identification
    if (!dto.phoneNumber && !dto.email) {
      throw new BadRequestException('Either phoneNumber or email must be provided');
    }

    let statsCreated = false;

    // Use database transaction for atomicity
    await this.dataSource.transaction(async (manager) => {
      // Find user by phone number or email
      const user = await this.findUserByIdentification(dto, manager);
      if (!user) {
        throw new NotFoundException(
          `User not found with ${dto.phoneNumber ? 'phone: ' + dto.phoneNumber : 'email: ' + dto.email}`
        );
      }

      // Find match
      const match = await manager.findOne(Match, {
        where: { matchId: matchId },
      });
      if (!match) {
        throw new NotFoundException(`Match with ID ${matchId} not found`);
      }

      // Check if match participant already exists
      let matchParticipant = await manager.findOne(MatchParticipant, {
        where: {
          match: { matchId: matchId },
          user: { id: user.id },
        },
        relations: ['match', 'user'],
      });

      // Create or update match participant
      if (!matchParticipant) {
        // Validate that we don't exceed 2 teams
        const existingParticipants = await manager.find(MatchParticipant, {
          where: { match: { matchId: matchId } },
        });
        const existingTeamNames = new Set(existingParticipants.map(p => p.teamName));

        if (!existingTeamNames.has(dto.teamName) && existingTeamNames.size >= 2) {
          throw new BadRequestException(`Cannot add more than 2 teams to match ${matchId}. Existing teams: ${Array.from(existingTeamNames).join(', ')}`);
        }

        matchParticipant = manager.create(MatchParticipant, {
          match,
          user,
          teamName: dto.teamName,
          paidStatsOptIn: dto.paidStatsOptIn || false,
        });
        await manager.save(MatchParticipant, matchParticipant);

        response.warnings?.push({
          row: rowIndex,
          message: `Created new match participant for user ${user.id}`,
          data: { userId: user.id, matchId: matchId },
        });
      } else {
        // Update existing match participant if team name changed
        if (matchParticipant.teamName !== dto.teamName) {
          // Validate that we don't exceed 2 teams
          const existingParticipants = await manager.find(MatchParticipant, {
            where: { match: { matchId: matchId } },
          });
          const existingTeamNames = new Set(existingParticipants.map(p => p.teamName));

          if (!existingTeamNames.has(dto.teamName) && existingTeamNames.size >= 2) {
            throw new BadRequestException(`Cannot add more than 2 teams to match ${matchId}. Existing teams: ${Array.from(existingTeamNames).join(', ')}`);
          }

          matchParticipant.teamName = dto.teamName;
          await manager.save(MatchParticipant, matchParticipant);

          response.warnings?.push({
            row: rowIndex,
            message: `Updated team name for existing match participant`,
            data: { userId: user.id, matchId: matchId, newTeamName: dto.teamName },
          });
        }
      }

      // Check if stats already exist
      const existingStats = await manager.findOne(MatchParticipantStats, {
        where: {
          match: { matchId: matchId },
          player: { id: user.id },
        },
      });

      if (existingStats) {
        response.warnings?.push({
          row: rowIndex,
          message: `Stats already exist for this player in this match, skipping stats creation`,
          data: { userId: user.id, matchId: matchId },
        });
        return; // Don't create stats, but don't throw error
      }

      // Create match participant stats
      const statsData = this.mapDtoToStatsEntity(dto, match, user, matchParticipant);
      const stats = manager.create(MatchParticipantStats, statsData);
      await manager.save(MatchParticipantStats, stats);
      statsCreated = true; // Mark that stats were actually created
    });

    return statsCreated; // Only successful if stats were actually created
  }

  private async findUserByIdentification(
    dto: CsvRowDto,
    manager: any,
  ): Promise<User | null> {
    // phoneNumber is mandatory now; lookup by phone only
    if (!dto.phoneNumber) return null;
    return await manager.findOne(User, {
      where: { phoneNumber: dto.phoneNumber },
    });
  }

  private mapDtoToStatsEntity(
    dto: CsvRowDto,
    match: Match,
    player: User,
    matchParticipant: MatchParticipant,
  ): Partial<MatchParticipantStats> {
    return {
      match,
      player,
      matchParticipant,
      isMvp: dto.isMvp || false,

      // Passing stats
      totalPassingActions: dto.totalPassingActions,
      totalCompletePassingActions: dto.totalCompletePassingActions,
      totalIncompletePassingActions: dto.totalIncompletePassingActions,
      totalPassingAccuracy: dto.passingAccuracy ?? dto.totalPassingAccuracy,
      totalOpenPlayPassingActions: dto.totalOpenPlayPassingActions,
      totalOpenPlayCompletePassingActions: dto.totalOpenPlayCompletePassingActions,
      totalOpenPlayIncompletePassingActions: dto.totalOpenPlayIncompletePassingActions,
      openPlayPassingAccuracy: dto.openPlayPassingAccuracy,
      totalPass: dto.totalPasses ?? dto.totalPass,
      totalCompletePass: dto.totalCompletePass,
      totalIncompletePass: dto.totalIncompletePass,
      totalThroughBall: dto.totalThroughBall,
      totalCompleteThroughBall: dto.totalCompleteThroughBall,
      totalIncompleteThroughBall: dto.totalIncompleteThroughBall,
      totalLongPass: dto.totalLongPass,
      totalCompleteLongPass: dto.totalCompleteLongPass,
      totalIncompleteLongPass: dto.totalIncompleteLongPass,
      totalCross: dto.totalCross,
      totalCompleteCross: dto.totalCompleteCross,
      totalIncompleteCross: dto.totalIncompleteCross,
      openPlayCompletePass: dto.openPlayCompletePass,
      openPlayIncompletePass: dto.openPlayIncompletePass,
      openPlayCompleteThroughBall: dto.openPlayCompleteThroughBall,
      openPlayIncompleteThroughBall: dto.openPlayIncompleteThroughBall,
      openPlayCompleteLongPass: dto.openPlayCompleteLongPass,
      openPlayIncompleteLongPass: dto.openPlayIncompleteLongPass,
      openPlayCompleteCross: dto.openPlayCompleteCross,
      openPlayIncompleteCross: dto.openPlayIncompleteCross,

      // Shooting stats
      totalShot: dto.totalShots ?? dto.totalShot,
      totalOnTargetShot: dto.totalOnTargetShot,
      totalOffTargetShot: dto.totalOffTargetShot,
      totalBlockedShotTaken: dto.totalBlockedShotTaken,
      totalOtherShot: dto.totalOtherShot,
      shotAccuracy: dto.shotAccuracy ?? dto.shotAccuracy,

      // Attack stats
      totalGoal: dto.goals ?? dto.totalGoal,
      totalAssist: dto.assists ?? dto.totalAssist,
      totalKeyPass: dto.keyPasses ?? dto.totalKeyPass,
      totalDribbleAttempt: dto.totalDribbleAttempt,
      totalSuccessfulDribble: dto.totalSuccessfulDribble,
      totalUnsuccessfulDribble: dto.totalUnsuccessfulDribble,
      dribbleSuccessPercent: dto.dribbleSuccessPercent,
      totalOffensiveActions: dto.totalOffensiveActions,

      // Defense stats
      totalDefensiveActions: dto.totalDefensiveActions,
      tackleInPossession: dto.tackleInPossession,
      tackleOob: dto.tackleOob,
      tackleTurnover: dto.tackleTurnover,
      tackleTeamPossession: dto.tackleTeamPossession,
      recovery: dto.recovery,
      recoveryOther: dto.recoveryOther,
      blockedShotDefensive: dto.blockedShotDefensive,
      steal: dto.steal,
      interceptionSameTeam: dto.interceptionSameTeam,
      totalTackles: dto.tackles ?? dto.totalTackles,
      totalInterceptions: dto.interceptions ?? dto.totalInterceptions,
      deflectionTurnover: dto.deflectionTurnover,
      deflectionOob: dto.deflectionOob,
      totalClearance: dto.totalClearance,
      totalSave: dto.saves ?? dto.totalSave,
      totalCatch: dto.totalCatch,
      totalPunch: dto.totalPunch,
      totalMiscontrol: dto.totalMiscontrol,
      totalWoodwork: dto.totalWoodwork,
      totalOwnGoals: dto.totalOwnGoals,

      // Team stats
      teamBlackGoals: dto.teamBlackGoals,
      teamWhiteGoals: dto.teamWhiteGoals,
      teamAGoals: dto.teamAGoals,
      teamBGoals: dto.teamBGoals,
    };
  }
} 