import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { RefundService } from './refund.service';
import { WebhookController } from './webhook.controller';
import { RazorpayGateway } from './gateways/razorpay.gateway';
import { RazorpayService } from './razorpay.service';
import { RazorpayOrder } from './entities/razorpay-order.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { RefundEntity } from './refund.entity';
import { BookingEntity } from '../booking/booking.entity';
import { NotificationModule } from '../notification/notification.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            RazorpayOrder,
            PaymentAttempt,
            RefundEntity,
            BookingEntity
        ]),
        ConfigModule,
        NotificationModule
    ],
    controllers: [PaymentController, WebhookController],
    providers: [
        PaymentService,
        RefundService,
        RazorpayGateway,
        RazorpayService
    ],
    exports: [PaymentService, RefundService]
})
export class PaymentModule { }
