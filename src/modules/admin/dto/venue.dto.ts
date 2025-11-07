import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsEnum, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { VenueFormat } from '../../venue/venue-format.enum';

export class CreateVenueFormatDto {
  @IsEnum(VenueFormat)
  @IsNotEmpty()
  format: VenueFormat;

  @IsNumber()
  @IsNotEmpty()
  cost: number;
}

export class CreateVenueDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @IsOptional()
  cityId?: number;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  displayBanner?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVenueFormatDto)
  @IsOptional()
  venueFormats?: CreateVenueFormatDto[];
}

export class UpdateVenueDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @IsOptional()
  cityId?: number;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  displayBanner?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVenueFormatDto)
  @IsOptional()
  venueFormats?: CreateVenueFormatDto[];
}

