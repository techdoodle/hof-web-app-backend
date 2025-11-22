import { IsOptional, IsNumber, IsString, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class LeaderboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value || 'all').toLowerCase())
  city?: string = 'all';

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value || 'all').toLowerCase())
  position?: string = 'all';

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value || 'male').toLowerCase())
  gender?: string = 'male';
}

