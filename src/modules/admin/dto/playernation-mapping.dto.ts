import { IsString, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PlayerMappingDto {
  @IsString()
  externalPlayerId: string;

  @IsNumber()
  internalPlayerId: number;

  @IsString()
  internalPhone: string;
}

export class SaveMappingsDto {
  @IsNumber()
  matchId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlayerMappingDto)
  mappings: PlayerMappingDto[];
}
