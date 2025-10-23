import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { NotificationModule } from '../notification/notification.module';
import { PaymentModule } from '../payment/payment.module';
import { BookingModule } from '../booking/booking.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([WaitlistEntry]),
        NotificationModule,
        PaymentModule,
        BookingModule
    ],
    controllers: [WaitlistController],
    providers: [WaitlistService],
    exports: [WaitlistService]
})
export class WaitlistModule { }
