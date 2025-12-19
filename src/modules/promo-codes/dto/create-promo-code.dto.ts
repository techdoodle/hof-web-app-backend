import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsDateString, IsArray, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType } from '../../../common/enums/discount-type.enum';

export class CreatePromoCodeDto {
    @IsString()
    code: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsEnum(DiscountType)
    discountType: DiscountType;

    @IsNumber()
    @Min(0)
    @Type(() => Number)
    discountValue: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    minOrderValue?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    @ValidateIf(o => o.discountType === DiscountType.PERCENTAGE)
    maxDiscountAmount?: number;

    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    isActive?: boolean;

    @IsDateString()
    validFrom: string;

    @IsOptional()
    @IsDateString()
    validUntil?: string;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    maxUses?: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    maxUsesPerUser?: number;

    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    @Type(() => Number)
    eligibleCities?: number[];

    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    @Type(() => Number)
    eligibleMatches?: number[];

    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    firstTimeUsersOnly?: boolean;

    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    @Type(() => Number)
    allowedUserIds?: number[];
}

