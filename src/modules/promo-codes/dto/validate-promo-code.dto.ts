import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ValidatePromoCodeDto {
    @IsString()
    code: string;

    @IsNumber()
    @Min(0)
    @Type(() => Number)
    bookingAmount: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    matchId?: number;
}

