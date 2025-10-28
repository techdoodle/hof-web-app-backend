import { IsString, IsOptional, IsNumber, IsDateString, IsBoolean, IsEnum, Min } from 'class-validator';
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

  @IsString()
  @IsOptional()
  teamAName?: string;

  @IsString()
  @IsOptional()
  teamBName?: string;
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
