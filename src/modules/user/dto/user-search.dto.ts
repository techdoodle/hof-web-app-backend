import { IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class UserSearchDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  cityId?: number;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  page?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  limit?: number;
}


