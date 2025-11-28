import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromoCodesController, PromoCodesAdminController } from './promo-codes.controller';
import { PromoCodesService } from './promo-codes.service';
import { PromoCode } from './entities/promo-code.entity';
import { PromoCodeUsage } from './entities/promo-code-usage.entity';
import { BookingEntity } from '../booking/booking.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([PromoCode, PromoCodeUsage, BookingEntity])
    ],
    controllers: [PromoCodesController, PromoCodesAdminController],
    providers: [PromoCodesService],
    exports: [PromoCodesService]
})
export class PromoCodesModule { }

