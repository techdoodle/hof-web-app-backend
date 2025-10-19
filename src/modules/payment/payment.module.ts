import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { RazorpayGateway } from './gateways/razorpay.gateway';
import { RazorpayOrder } from './entities/razorpay-order.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { Refund } from './entities/refund.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            RazorpayOrder,
            PaymentAttempt,
            Refund
        ]),
        ConfigModule
    ],
    controllers: [PaymentController],
    providers: [
        PaymentService,
        RazorpayGateway
    ],
    exports: [PaymentService]
})
export class PaymentModule {}
