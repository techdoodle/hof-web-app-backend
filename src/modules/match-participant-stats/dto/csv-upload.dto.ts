import { IsString, IsNumber, IsBoolean, IsOptional, IsEnum, ValidateIf, IsEmail, IsNotEmpty } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CsvRowDto {
  // User identification - phone number is now required
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Legacy validation no longer needed; phoneNumber is mandatory

  // Match Participant fields - matchId is now passed as URL parameter
  @IsString()
  @IsNotEmpty()
  teamName: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  paidStatsOptIn?: boolean = false;

  // Match Participant Stats fields
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isMvp?: boolean = false;

  // Compact stats (10) - optional, prefer these for XP
  @IsOptional() @Type(() => Number) @IsNumber()
  goals?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  assists?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  totalPasses?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  passingAccuracy?: number; // decimal 0..1

  @IsOptional() @Type(() => Number) @IsNumber()
  keyPasses?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  totalShots?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  shotAccuracy?: number; // decimal 0..1

  @IsOptional() @Type(() => Number) @IsNumber()
  tackles?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  interceptions?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  saves?: number;

  // Passing stats
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPassingActions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalCompletePassingActions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalIncompletePassingActions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPassingAccuracy?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalOpenPlayPassingActions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalOpenPlayCompletePassingActions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalOpenPlayIncompletePassingActions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openPlayPassingAccuracy?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPass?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalCompletePass?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalIncompletePass?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalThroughBall?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalCompleteThroughBall?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalIncompleteThroughBall?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalLongPass?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalCompleteLongPass?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalIncompleteLongPass?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalCross?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalCompleteCross?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalIncompleteCross?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openPlayCompletePass?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openPlayIncompletePass?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openPlayCompleteThroughBall?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openPlayIncompleteThroughBall?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openPlayCompleteLongPass?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openPlayIncompleteLongPass?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openPlayCompleteCross?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openPlayIncompleteCross?: number;

  // Shooting stats
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalShot?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalOnTargetShot?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalOffTargetShot?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalBlockedShotTaken?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalOtherShot?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  // shotAccuracy defined in compact section above; keep only one definition

  // Attack stats
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalGoal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalAssist?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalKeyPass?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalDribbleAttempt?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalSuccessfulDribble?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalUnsuccessfulDribble?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dribbleSuccessPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalOffensiveActions?: number;

  // Defense stats
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalDefensiveActions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tackleInPossession?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tackleOob?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tackleTurnover?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tackleTeamPossession?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  recovery?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  recoveryOther?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  blockedShotDefensive?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  steal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  interceptionSameTeam?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalTackles?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalInterceptions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  deflectionTurnover?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  deflectionOob?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalClearance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalSave?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalCatch?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPunch?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalMiscontrol?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalWoodwork?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalOwnGoals?: number;

  // Team stats
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teamBlackGoals?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teamWhiteGoals?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teamAGoals?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teamBGoals?: number;
}

export class CsvUploadResponseDto {
  @IsNumber()
  totalRows: number;

  @IsNumber()
  successfulRows: number;

  @IsNumber()
  failedRows: number;

  @IsOptional()
  errors?: Array<{
    row: number;
    errors: string[];
    data?: any;
  }>;

  @IsOptional()
  warnings?: Array<{
    row: number;
    message: string;
    data?: any;
  }>;
} 