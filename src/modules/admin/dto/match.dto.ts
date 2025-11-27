import { IsString, IsOptional, IsNumber, IsDateString, IsBoolean, IsEnum, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MatchType } from '../../../common/enums/match-type.enum';

export class CreateMatchDto {
    @IsString()
    @IsOptional()
    matchStatsId?: string;

    @IsEnum(MatchType)
    matchType: MatchType;

    @IsNumber()
    matchTypeId: number;

    @IsDateString()
    startTime: string;

    @IsDateString()
    endTime: string;

    @IsBoolean()
    @IsOptional()
    statsReceived?: boolean;

    @IsNumber()
    @IsOptional()
    teamAScore?: number;

    @IsNumber()
    @IsOptional()
    teamBScore?: number;

    @IsString()
    @IsOptional()
    matchHighlights?: string;

    @IsString()
    @IsOptional()
    matchRecap?: string;

    @IsNumber()
    footballChief: number;

    @IsNumber()
    @IsOptional()
    city?: number;

    @IsNumber()
    @IsOptional()
    venue?: number;

    @IsNumber()
    @Min(-1)
    slotPrice?: number;

    @IsNumber()
    @Min(-1)
    offerPrice?: number;

  @IsNumber()
  @IsOptional()
  playerCapacity?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  bufferCapacity?: number;

  @IsString()
  @IsOptional()
  teamAName?: string;

  @IsString()
  @IsOptional()
  teamBName?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  footballChiefCost?: number;
}

export class UpdateMatchDto {
    @IsString()
    @IsOptional()
    matchStatsId?: string;

    @IsEnum(MatchType)
    @IsOptional()
    matchType?: MatchType;

    @IsNumber()
    @IsOptional()
    matchTypeId?: number;

    @IsDateString()
    @IsOptional()
    startTime?: string;

    @IsDateString()
    @IsOptional()
    endTime?: string;

    @IsBoolean()
    @IsOptional()
    statsReceived?: boolean;

    @IsNumber()
    @IsOptional()
    teamAScore?: number;

    @IsNumber()
    @IsOptional()
    teamBScore?: number;

    @IsString()
    @IsOptional()
    matchHighlights?: string;

    @IsString()
    @IsOptional()
    matchRecap?: string;

    @IsNumber()
    @IsOptional()
    footballChief?: number;

    @IsNumber()
    @IsOptional()
    city?: number;

    @IsNumber()
    @IsOptional()
    venue?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    slotPrice?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    offerPrice?: number;

  @IsString()
  @IsOptional()
  teamAName?: string;

  @IsString()
  @IsOptional()
  teamBName?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  footballChiefCost?: number;
}

export class MatchFilterDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsNumber()
    venue?: number;

    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    // New generic date range filters
    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @IsOptional()
    @IsDateString()
    dateTo?: string;

    @IsOptional()
    @IsNumber()
    limit?: number;

    @IsOptional()
    @IsNumber()
    offset?: number;

    @IsOptional()
    @IsString()
    sort?: string;

    @IsOptional()
    @IsString()
    order?: 'ASC' | 'DESC';
}

export class TimeSlotDto {
  @IsString()
  startTime: string; // Time in HH:mm format

  @IsString()
  endTime: string; // Time in HH:mm format
}

export class CreateRecurringMatchesDto {
  @IsEnum(['daily', 'weekly', 'custom'])
  pattern: 'daily' | 'weekly' | 'custom';

  @IsDateString()
  startDate: string; // First match date (YYYY-MM-DD)

  @IsDateString()
  endDate: string; // Last match date (YYYY-MM-DD)

  @IsOptional()
  @IsNumber({}, { each: true })
  daysOfWeek?: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday (for weekly/custom)

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  timeSlots: TimeSlotDto[]; // Multiple time slots per day

  @IsNumber()
  venue: number;

  @IsEnum(MatchType)
  matchType: MatchType;

  @IsNumber()
  matchTypeId: number;

  @IsNumber()
  footballChief: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  slotPrice?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  offerPrice?: number;

  @IsNumber()
  @IsOptional()
  playerCapacity?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  bufferCapacity?: number;

  @IsNumber()
  @IsOptional()
  city?: number;

  @IsString()
  @IsOptional()
  teamAName?: string;

  @IsString()
  @IsOptional()
  teamBName?: string;
}
