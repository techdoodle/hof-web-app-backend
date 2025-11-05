import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsEnum, IsUrl, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export enum MatchFormat {
  THREE_VS_THREE = 'THREE_VS_THREE',
  FIVE_VS_FIVE = 'FIVE_VS_FIVE',
  SEVEN_VS_SEVEN = 'SEVEN_VS_SEVEN',
  NINE_VS_NINE = 'NINE_VS_NINE',
  ELEVEN_VS_ELEVEN = 'ELEVEN_VS_ELEVEN',
}

export class PlayerDto {
  @IsString()
  name: string;

  @IsString()
  hofPlayerId: string; // Required by PlayerNation API

  @IsOptional()
  @IsString()
  jerseyNumber?: string;

  @IsOptional()
  @IsUrl()
  playerVideo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  playerImages?: string[];

  @IsOptional()
  @IsNumber()
  goal?: number;

  @IsOptional()
  @IsNumber()
  ownGoal?: number;
}

export class PlayersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlayerDto)
  teamA: PlayerDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlayerDto)
  teamB: PlayerDto[];
}

export class PlayerNationSubmitDto {
  @IsString()
  teamA: string;

  @IsString()
  teamB: string;

  @IsDateString()
  matchDate: string; // ISO format

  @IsUrl()
  matchLink: string;

  @IsOptional()
  @IsEnum(MatchFormat)
  matchFormat?: MatchFormat;

  @IsOptional()
  @IsNumber()
  matchDuration?: number;

  @IsOptional()
  @IsString()
  matchName?: string;

  @IsOptional()
  @IsNumber()
  teamAScore?: number;

  @IsOptional()
  @IsNumber()
  teamBScore?: number;

  @IsOptional()
  matchMetaDataJson?: any;

  @ValidateNested()
  @Type(() => PlayersDto)
  players: PlayersDto;
}
