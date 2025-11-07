import { Logger } from '@nestjs/common';

export class PaymentErrorHandler {
    private static readonly logger = new Logger('PaymentErrorHandler');

    static handleGatewayError(error: any, context: string): never {
        this.logger.error(
            `Payment Gateway Error in ${context}: ${error.message}`,
            error.stack
        );

        if (error.error?.description) {
            throw new Error(error.error.description);
        }

        throw new Error(`Payment gateway error: ${error.message}`);
    }

    static handleVerificationError(error: any, context: string): never {
        this.logger.error(
            `Payment Verification Error in ${context}: ${error.message}`,
            error.stack
        );

        throw new Error(`Payment verification failed: ${error.message}`);
    }

    static handleRefundError(error: any, context: string): never {
        this.logger.error(
            `Refund Error in ${context}: ${error.message}`,
            error.stack
        );

        throw new Error(`Refund processing failed: ${error.message}`);
    }
}