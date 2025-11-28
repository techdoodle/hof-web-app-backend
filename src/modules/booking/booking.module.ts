import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingEntity } from './booking.entity';
import { BookingSlotEntity } from './booking-slot.entity';
import { SlotLockService } from './slot-lock.service';
import { RefundService } from '../payment/refund.service';
import { RefundEntity } from '../payment/refund.entity';
import { RazorpayService } from '../payment/razorpay.service';
import { PaymentService } from '../payment/payment.service';
import { RazorpayOrder } from '../payment/entities/razorpay-order.entity';
import { PaymentAttempt } from '../payment/entities/payment-attempt.entity';
import { Refund } from '../payment/entities/refund.entity';
import { RazorpayGateway } from '../payment/gateways/razorpay.gateway';
import { BookingUserService } from './booking-user.service';
import { BookingCleanupService } from './booking-cleanup.service';
import { NotificationService } from '../notification/notification.service';
import { Notification } from '../notification/entities/notification.entity';
import { EmailService } from '../notification/services/email.service';
import { User } from '../user/user.entity';
import { SlotAvailabilityMonitorService } from '../waitlist/slot-availability-monitor.service';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { Match } from '../matches/matches.entity';
import { MatchParticipant } from '../match-participants/match-participants.entity';
import { MatchesModule } from '../matches/matches.module';
import { PromoCodesModule } from '../promo-codes/promo-codes.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([BookingEntity, BookingSlotEntity, RefundEntity, RazorpayOrder, PaymentAttempt, Refund, Notification, User, Match, MatchParticipant]),
        forwardRef(() => WaitlistModule),
        forwardRef(() => MatchesModule),
        forwardRef(() => PromoCodesModule)
    ],
    controllers: [BookingController],
    providers: [BookingService, SlotLockService, RefundService, RazorpayService, PaymentService, RazorpayGateway, BookingUserService, BookingCleanupService, NotificationService, EmailService, SlotAvailabilityMonitorService],
    exports: [BookingService]
})
export class BookingModule { }