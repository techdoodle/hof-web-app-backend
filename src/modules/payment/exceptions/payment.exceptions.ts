import { HttpException, HttpStatus } from '@nestjs/common';

export class PaymentGatewayException extends HttpException {
    constructor(message: string, gatewayError?: any) {
        super(
            {
                message,
                error: 'Payment Gateway Error',
                details: gatewayError
            },
            HttpStatus.BAD_GATEWAY
        );
    }
}

export class PaymentVerificationException extends HttpException {
    constructor(message: string) {
        super(
            {
                message,
                error: 'Payment Verification Failed'
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

export class PaymentWebhookException extends HttpException {
    constructor(message: string) {
        super(
            {
                message,
                error: 'Webhook Processing Failed'
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

export class RefundException extends HttpException {
    constructor(message: string, details?: any) {
        super(
            {
                message,
                error: 'Refund Processing Failed',
                details
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

export class OrderCreationException extends HttpException {
    constructor(message: string, details?: any) {
        super(
            {
                message,
                error: 'Order Creation Failed',
                details
            },
            HttpStatus.BAD_REQUEST
        );
    }
}
