import { IsString, IsEmail, IsOptional, IsEnum, IsNumber, IsBoolean } from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { Gender } from '../../../common/enums/gender.enum';
import { PlayerCategory } from '../../../common/enums/player-category.enum';

export class CreateUserDto {
    @IsString()
    phoneNumber: string;

    @IsOptional()
    @IsString()
    username?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsNumber()
    cityId?: number;

    @IsOptional()
    @IsEnum(Gender)
    gender?: Gender;

    @IsOptional()
    @IsEnum(PlayerCategory)
    playerCategory?: PlayerCategory;

    @IsOptional()
    @IsNumber()
    preferredTeamId?: number;

    @IsEnum(UserRole)
    role: UserRole;
}

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    phoneNumber?: string;

    @IsOptional()
    @IsString()
    username?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsNumber()
    cityId?: number;

    @IsOptional()
    @IsEnum(Gender)
    gender?: Gender;

    @IsOptional()
    @IsBoolean()
    onboardingComplete?: boolean;

    @IsOptional()
    @IsEnum(PlayerCategory)
    playerCategory?: PlayerCategory;

    @IsOptional()
    @IsNumber()
    invitesLeft?: number;

    @IsOptional()
    @IsNumber()
    preferredTeamId?: number;

    @IsOptional()
    @IsBoolean()
    whatsappInviteOpt?: boolean;


    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;
}

export class UserFilterDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional()
    @IsNumber()
    city?: number;

    @IsOptional()
    @IsNumber()
    limit?: number;

    @IsOptional()
    @IsNumber()
    offset?: number;
}
