import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { PromoCodesService } from './promo-codes.service';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import { ValidatePromoCodeDto } from './dto/validate-promo-code.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { Public } from '../../common/decorators/public.decorator';

@Controller('promo-codes')
export class PromoCodesController {
    constructor(private readonly promoCodesService: PromoCodesService) { }

    @Post('validate')
    @Public()
    @HttpCode(HttpStatus.OK)
    async validatePromoCode(@Body() dto: ValidatePromoCodeDto, @Req() req: any) {
        // Extract user from token if available (optional for public endpoint)
        const userId = req.user?.userId || null;
        const cityId = req.user?.city?.id || null;

        const result = await this.promoCodesService.validatePromoCode(
            dto.code,
            userId,
            dto.bookingAmount,
            cityId,
            dto.matchId
        );

        return {
            success: result.valid,
            message: result.message,
            data: {
                valid: result.valid,
                discountAmount: result.discountAmount,
                finalAmount: result.finalAmount
            }
        };
    }
}

@Controller('admin/promo-codes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PromoCodesAdminController {
    constructor(private readonly promoCodesService: PromoCodesService) { }

    @Get()
    async getAllPromoCodes(@Query() query: any) {
        const page = query.page ? parseInt(query.page, 10) : 1;
        const limit = query.limit ? parseInt(query.limit, 10) : 25;
        const isActive = query.isActive !== undefined ? query.isActive === 'true' : undefined;

        const result = await this.promoCodesService.getAllPromoCodes({
            isActive,
            page,
            limit
        });

        return {
            success: true,
            message: 'Promo codes retrieved successfully',
            data: result.data,
            total: result.total,
            page,
            limit
        };
    }

    @Get(':id')
    async getPromoCode(@Param('id', ParseIntPipe) id: number) {
        const promoCode = await this.promoCodesService.getPromoCodeById(id);

        if (!promoCode) {
            return {
                success: false,
                message: 'Promo code not found',
                data: null
            };
        }

        return {
            success: true,
            message: 'Promo code retrieved successfully',
            data: promoCode
        };
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async createPromoCode(@Body() dto: CreatePromoCodeDto, @Req() req: any) {
        const createdById = req.user?.userId;

        if (!createdById) {
            return {
                success: false,
                message: 'User not authenticated',
                data: null
            };
        }

        const promoCode = await this.promoCodesService.createPromoCode(dto, createdById);

        return {
            success: true,
            message: 'Promo code created successfully',
            data: promoCode
        };
    }

    @Patch(':id')
    async updatePromoCode(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePromoCodeDto
    ) {
        const promoCode = await this.promoCodesService.updatePromoCode(id, dto);

        return {
            success: true,
            message: 'Promo code updated successfully',
            data: promoCode
        };
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    async deletePromoCode(@Param('id', ParseIntPipe) id: number) {
        await this.promoCodesService.deletePromoCode(id);

        return {
            success: true,
            message: 'Promo code deleted successfully',
            data: null
        };
    }

    @Get(':id/usage')
    async getPromoCodeUsageStats(@Param('id', ParseIntPipe) id: number) {
        const stats = await this.promoCodesService.getPromoCodeUsageStats(id);

        return {
            success: true,
            message: 'Usage statistics retrieved successfully',
            data: stats
        };
    }
}
