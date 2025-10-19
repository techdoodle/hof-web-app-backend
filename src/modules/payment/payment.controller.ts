import { 
    Controller, 
    Post, 
    Body, 
    Headers,
    BadRequestException,
    UseGuards
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { 
    CreateOrderDto, 
    PaymentVerificationDto, 
    WebhookEventDto 
} from './types/payment.types';
import { AuthGuard } from '@nestjs/passport';

@Controller('payments')
export class PaymentController {
    constructor(private readonly paymentService: PaymentService) {}

    @Post('create-order')
    @UseGuards(AuthGuard('jwt'))
    async createOrder(@Body() dto: CreateOrderDto) {
        return await this.paymentService.createOrder(dto);
    }

    @Post('verify')
    @UseGuards(AuthGuard('jwt'))
    async verifyPayment(@Body() dto: PaymentVerificationDto) {
        return await this.paymentService.verifyPayment(dto);
    }

    @Post('webhook')
    async handleWebhook(
        @Body() payload: WebhookEventDto,
        @Headers('x-razorpay-signature') signature: string
    ) {
        if (!signature) {
            throw new BadRequestException('Missing signature header');
        }
        return await this.paymentService.handleWebhook(payload, signature);
    }

    @Post('refund')
    @UseGuards(AuthGuard('jwt'))
    async processRefund(
        @Body() dto: { 
            bookingId: string;
            amount: number;
            reason?: string;
        }
    ) {
        return await this.paymentService.processRefund(
            dto.bookingId,
            dto.amount,
            dto.reason
        );
    }
}
