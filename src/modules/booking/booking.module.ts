import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingEntity } from './booking.entity';
import { BookingSlotEntity } from './booking-slot.entity';
import { SlotLockService } from './slot-lock.service';
import { RefundService } from '../payment/refund.service';
import { RefundEntity } from '../payment/refund.entity';
import { WaitlistModule } from '../waitlist/waitlist.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([BookingEntity, BookingSlotEntity, RefundEntity]),
        WaitlistModule
    ],
    controllers: [BookingController],
    providers: [BookingService, SlotLockService, RefundService],
    exports: [BookingService]
})
export class BookingModule { }