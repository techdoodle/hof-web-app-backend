import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { PromoCode } from './entities/promo-code.entity';
import { PromoCodeUsage } from './entities/promo-code-usage.entity';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import { DiscountType } from '../../common/enums/discount-type.enum';
import { BookingEntity } from '../booking/booking.entity';
import { BookingStatus } from '../../common/types/booking.types';
import { Match } from '../matches/matches.entity';

export interface ValidatePromoCodeResult {
    valid: boolean;
    discountAmount: number;
    finalAmount: number;
    message?: string;
    promoCode?: PromoCode;
}

export interface PromoCodeUsageStats {
    totalUses: number;
    uniqueUsers: number;
    totalDiscountGiven: number;
    totalRevenue: number;
}

@Injectable()
export class PromoCodesService {
    private readonly logger = new Logger(PromoCodesService.name);

    constructor(
        @InjectRepository(PromoCode)
        private promoCodeRepository: Repository<PromoCode>,
        @InjectRepository(PromoCodeUsage)
        private promoCodeUsageRepository: Repository<PromoCodeUsage>,
        @InjectRepository(BookingEntity)
        private bookingRepository: Repository<BookingEntity>,
        @InjectRepository(Match)
        private matchRepository: Repository<Match>,
        private connection: Connection,
    ) { }

    async validatePromoCode(
        code: string,
        userId: number | null,
        bookingAmount: number,
        cityId?: number | null,
        matchId?: number | null
    ): Promise<ValidatePromoCodeResult> {
        // Note: cityId parameter is kept for backward compatibility but not used in validation
        // We only check match's city, not user's city
        // Normalize code to uppercase
        const normalizedCode = code.toUpperCase().trim();

        // Find promo code
        const promoCode = await this.promoCodeRepository.findOne({
            where: { code: normalizedCode }
        });

        if (!promoCode) {
            return {
                valid: false,
                discountAmount: 0,
                finalAmount: bookingAmount,
                message: 'Invalid promo code'
            };
        }

        // Check if code is active
        if (!promoCode.isActive) {
            return {
                valid: false,
                discountAmount: 0,
                finalAmount: bookingAmount,
                message: 'Promo code is not active'
            };
        }

        // Validate date range
        const now = new Date();
        if (now < promoCode.validFrom) {
            return {
                valid: false,
                discountAmount: 0,
                finalAmount: bookingAmount,
                message: 'Promo code is not yet valid'
            };
        }

        if (promoCode.validUntil && now > promoCode.validUntil) {
            return {
                valid: false,
                discountAmount: 0,
                finalAmount: bookingAmount,
                message: 'Promo code has expired'
            };
        }

        // Check global usage limit
        if (promoCode.maxUses !== null && promoCode.usageCount >= promoCode.maxUses) {
            return {
                valid: false,
                discountAmount: 0,
                finalAmount: bookingAmount,
                message: 'Promo code usage limit reached'
            };
        }

        // Check per-user usage limit (if user is provided)
        if (userId && promoCode.maxUsesPerUser !== null) {
            const userUsageCount = await this.promoCodeUsageRepository.count({
                where: {
                    promoCodeId: promoCode.id,
                    userId: userId
                }
            });

            if (userUsageCount >= promoCode.maxUsesPerUser) {
                return {
                    valid: false,
                    discountAmount: 0,
                    finalAmount: bookingAmount,
                    message: 'You have already used this code'
                };
            }
        }

        // Check first-time user requirement
        if (promoCode.firstTimeUsersOnly && userId) {
            // Check if user has any confirmed bookings
            const confirmedBookingsCount = await this.bookingRepository.count({
                where: {
                    userId: userId,
                    status: BookingStatus.CONFIRMED
                }
            });

            if (confirmedBookingsCount > 0) {
                return {
                    valid: false,
                    discountAmount: 0,
                    finalAmount: bookingAmount,
                    message: 'This code is only for first-time users'
                };
            }
        }

        // Check eligibility with OR logic:
        // - If eligibleCities is set: match's city must be in the list
        // - If eligibleMatches is set: matchId must be in the list
        // - If both are set: either condition can be true (OR logic)
        // - User's city is NOT checked at all

        const hasCityRestriction = promoCode.eligibleCities && promoCode.eligibleCities.length > 0;
        const hasMatchRestriction = promoCode.eligibleMatches && promoCode.eligibleMatches.length > 0;

        if (hasCityRestriction || hasMatchRestriction) {
            let cityEligible = false;
            let matchEligible = false;

            // Check match city eligibility (if cities are restricted)
            if (hasCityRestriction) {
                if (!matchId) {
                    return {
                        valid: false,
                        discountAmount: 0,
                        finalAmount: bookingAmount,
                        message: 'This promo code is only valid for matches in specific cities'
                    };
                }

                // Fetch match to get its city
                const match = await this.matchRepository.findOne({
                    where: { matchId: matchId },
                    relations: ['city']
                });

                if (!match) {
                    return {
                        valid: false,
                        discountAmount: 0,
                        finalAmount: bookingAmount,
                        message: 'Match not found'
                    };
                }

                const matchCityId = match.city?.id;
                if (matchCityId && promoCode.eligibleCities && promoCode.eligibleCities.includes(matchCityId)) {
                    cityEligible = true;
                }
            }

            // Check match ID eligibility (if specific matches are restricted)
            if (hasMatchRestriction) {
                if (!matchId) {
                    return {
                        valid: false,
                        discountAmount: 0,
                        finalAmount: bookingAmount,
                        message: 'This promo code is only valid for specific matches'
                    };
                }
                if (promoCode.eligibleMatches && promoCode.eligibleMatches.includes(matchId)) {
                    matchEligible = true;
                }
            }

            // OR logic: if both restrictions exist, either can be true
            // If only one restriction exists, that one must be true
            if (hasCityRestriction && hasMatchRestriction) {
                // Both set: OR logic - either condition can be true
                if (!cityEligible && !matchEligible) {
                    return {
                        valid: false,
                        discountAmount: 0,
                        finalAmount: bookingAmount,
                        message: 'This promo code is not valid for this match or match city'
                    };
                }
            } else if (hasCityRestriction) {
                // Only cities set: must match city
                if (!cityEligible) {
                    return {
                        valid: false,
                        discountAmount: 0,
                        finalAmount: bookingAmount,
                        message: 'This promo code is not valid for matches in this city'
                    };
                }
            } else if (hasMatchRestriction) {
                // Only matches set: must match match ID
                if (!matchEligible) {
                    return {
                        valid: false,
                        discountAmount: 0,
                        finalAmount: bookingAmount,
                        message: 'This promo code is not valid for this match'
                    };
                }
            }
        }

        // Check minimum order value
        if (promoCode.minOrderValue !== null && bookingAmount < promoCode.minOrderValue) {
            return {
                valid: false,
                discountAmount: 0,
                finalAmount: bookingAmount,
                message: `Minimum order value of ₹${promoCode.minOrderValue} required`
            };
        }

        // Calculate discount
        let discountAmount = 0;
        if (promoCode.discountType === DiscountType.PERCENTAGE) {
            discountAmount = (bookingAmount * Number(promoCode.discountValue)) / 100;
            // Apply max discount cap if set
            if (promoCode.maxDiscountAmount !== null) {
                discountAmount = Math.min(discountAmount, Number(promoCode.maxDiscountAmount));
            }
        } else if (promoCode.discountType === DiscountType.FLAT_AMOUNT) {
            discountAmount = Number(promoCode.discountValue);
            // Ensure discount doesn't exceed booking amount
            discountAmount = Math.min(discountAmount, bookingAmount);
        }

        const finalAmount = Math.max(0, bookingAmount - discountAmount);

        return {
            valid: true,
            discountAmount: Math.round(discountAmount * 100) / 100,
            finalAmount: Math.round(finalAmount * 100) / 100,
            promoCode
        };
    }

    async applyPromoCode(
        code: string,
        userId: number | null,
        bookingId: number,
        originalAmount: number,
        matchId?: number | null
    ): Promise<{ discountAmount: number; finalAmount: number }> {
        const normalizedCode = code.toUpperCase().trim();

        // Validate code again (in case it changed between validation and application)
        const validation = await this.validatePromoCode(normalizedCode, userId, originalAmount, undefined, matchId);

        if (!validation.valid || !validation.promoCode) {
            throw new BadRequestException(validation.message || 'Invalid promo code');
        }

        const promoCode = validation.promoCode;
        const discountAmount = validation.discountAmount;
        const finalAmount = validation.finalAmount;

        // Create usage record
        const usage = this.promoCodeUsageRepository.create({
            promoCodeId: promoCode.id,
            userId: userId,
            bookingId: bookingId,
            discountAmount: discountAmount,
            originalAmount: originalAmount,
            finalAmount: finalAmount
        });

        await this.promoCodeUsageRepository.save(usage);

        // Increment usage count on promo code
        await this.promoCodeRepository.update(promoCode.id, {
            usageCount: promoCode.usageCount + 1
        });

        this.logger.log(
            `Applied promo code ${normalizedCode} to booking ${bookingId}: discount ₹${discountAmount}, final amount ₹${finalAmount}`
        );

        return { discountAmount, finalAmount };
    }

    async getPromoCodeByCode(code: string): Promise<PromoCode | null> {
        const normalizedCode = code.toUpperCase().trim();
        return this.promoCodeRepository.findOne({
            where: { code: normalizedCode }
        });
    }

    async getPromoCodeById(id: number): Promise<PromoCode | null> {
        return this.promoCodeRepository.findOne({
            where: { id },
            relations: ['createdBy']
        });
    }

    async getAllPromoCodes(filters?: {
        isActive?: boolean;
        page?: number;
        limit?: number;
    }): Promise<{ data: PromoCode[]; total: number }> {
        const page = filters?.page || 1;
        const limit = filters?.limit || 25;
        const skip = (page - 1) * limit;

        const queryBuilder = this.promoCodeRepository
            .createQueryBuilder('promo_code')
            .leftJoinAndSelect('promo_code.createdBy', 'createdBy')
            .orderBy('promo_code.createdAt', 'DESC');

        if (filters?.isActive !== undefined) {
            queryBuilder.andWhere('promo_code.isActive = :isActive', { isActive: filters.isActive });
        }

        const [data, total] = await queryBuilder
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        return { data, total };
    }

    async createPromoCode(dto: CreatePromoCodeDto, createdById: number): Promise<PromoCode> {
        // Normalize code to uppercase
        const normalizedCode = dto.code.toUpperCase().trim();

        // Check if code already exists
        const existing = await this.promoCodeRepository.findOne({
            where: { code: normalizedCode }
        });

        if (existing) {
            throw new BadRequestException('Promo code already exists');
        }

        // Validate date range
        const validFrom = new Date(dto.validFrom);
        const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;

        if (validUntil && validUntil <= validFrom) {
            throw new BadRequestException('Valid until date must be after valid from date');
        }

        // Validate discount value
        if (dto.discountType === DiscountType.PERCENTAGE && dto.discountValue > 100) {
            throw new BadRequestException('Percentage discount cannot exceed 100%');
        }

        if (dto.discountValue <= 0) {
            throw new BadRequestException('Discount value must be greater than 0');
        }

        const promoCode = this.promoCodeRepository.create({
            code: normalizedCode,
            description: dto.description,
            discountType: dto.discountType,
            discountValue: dto.discountValue,
            minOrderValue: dto.minOrderValue,
            maxDiscountAmount: dto.maxDiscountAmount,
            isActive: dto.isActive !== undefined ? dto.isActive : true,
            validFrom: validFrom,
            validUntil: validUntil,
            maxUses: dto.maxUses,
            maxUsesPerUser: dto.maxUsesPerUser,
            eligibleCities: dto.eligibleCities,
            eligibleMatches: dto.eligibleMatches,
            firstTimeUsersOnly: dto.firstTimeUsersOnly || false,
            createdById: createdById
        });

        return this.promoCodeRepository.save(promoCode);
    }

    async updatePromoCode(id: number, dto: UpdatePromoCodeDto): Promise<PromoCode> {
        const promoCode = await this.getPromoCodeById(id);

        if (!promoCode) {
            throw new NotFoundException('Promo code not found');
        }

        // If code is being updated, check for duplicates
        if (dto.code) {
            const normalizedCode = dto.code.toUpperCase().trim();
            const existing = await this.promoCodeRepository.findOne({
                where: { code: normalizedCode }
            });

            if (existing && existing.id !== id) {
                throw new BadRequestException('Promo code already exists');
            }

            promoCode.code = normalizedCode;
        }

        // Update other fields
        if (dto.description !== undefined) promoCode.description = dto.description;
        if (dto.discountType !== undefined) promoCode.discountType = dto.discountType;
        if (dto.discountValue !== undefined) promoCode.discountValue = dto.discountValue;
        if (dto.minOrderValue !== undefined) promoCode.minOrderValue = dto.minOrderValue;
        if (dto.maxDiscountAmount !== undefined) promoCode.maxDiscountAmount = dto.maxDiscountAmount;
        if (dto.isActive !== undefined) promoCode.isActive = dto.isActive;
        if (dto.validFrom !== undefined) promoCode.validFrom = new Date(dto.validFrom);
        if (dto.validUntil !== undefined) promoCode.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
        if (dto.maxUses !== undefined) promoCode.maxUses = dto.maxUses;
        if (dto.maxUsesPerUser !== undefined) promoCode.maxUsesPerUser = dto.maxUsesPerUser;
        if (dto.eligibleCities !== undefined) promoCode.eligibleCities = dto.eligibleCities;
        if (dto.eligibleMatches !== undefined) promoCode.eligibleMatches = dto.eligibleMatches;
        if (dto.firstTimeUsersOnly !== undefined) promoCode.firstTimeUsersOnly = dto.firstTimeUsersOnly;

        // Validate date range if updated
        if (dto.validFrom || dto.validUntil) {
            const validFrom = promoCode.validFrom;
            const validUntil = promoCode.validUntil;

            if (validUntil && validUntil <= validFrom) {
                throw new BadRequestException('Valid until date must be after valid from date');
            }
        }

        // Validate discount value if updated
        if (dto.discountType === DiscountType.PERCENTAGE && dto.discountValue !== undefined && dto.discountValue > 100) {
            throw new BadRequestException('Percentage discount cannot exceed 100%');
        }

        if (dto.discountValue !== undefined && dto.discountValue <= 0) {
            throw new BadRequestException('Discount value must be greater than 0');
        }

        return this.promoCodeRepository.save(promoCode);
    }

    async deletePromoCode(id: number): Promise<void> {
        const promoCode = await this.getPromoCodeById(id);

        if (!promoCode) {
            throw new NotFoundException('Promo code not found');
        }

        // Soft delete by deactivating
        promoCode.isActive = false;
        await this.promoCodeRepository.save(promoCode);
    }

    async getPromoCodeUsageStats(promoCodeId: number): Promise<PromoCodeUsageStats> {
        const promoCode = await this.getPromoCodeById(promoCodeId);

        if (!promoCode) {
            throw new NotFoundException('Promo code not found');
        }

        const usages = await this.promoCodeUsageRepository.find({
            where: { promoCodeId: promoCodeId },
            select: ['discountAmount', 'finalAmount', 'userId']
        });

        const totalUses = usages.length;
        const uniqueUsers = new Set(usages.map(u => u.userId).filter(id => id !== null)).size;
        const totalDiscountGiven = usages.reduce((sum, u) => sum + Number(u.discountAmount), 0);
        const totalRevenue = usages.reduce((sum, u) => sum + Number(u.finalAmount), 0);

        return {
            totalUses,
            uniqueUsers,
            totalDiscountGiven: Math.round(totalDiscountGiven * 100) / 100,
            totalRevenue: Math.round(totalRevenue * 100) / 100
        };
    }

    /**
     * Check if a promo code usage record already exists for a given booking.
     * Used to keep applyPromoCode idempotent across retries/webhooks.
     */
    async hasUsageForBooking(bookingId: number): Promise<boolean> {
        const count = await this.promoCodeUsageRepository.count({
            where: { bookingId }
        });
        return count > 0;
    }
}

