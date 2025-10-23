import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
const Razorpay = require('razorpay');
import { createHmac } from 'crypto';
import {
    PaymentGateway,
    PaymentGatewayResponse,
    CreateOrderResponse,
    VerifyPaymentResponse
} from '../interfaces/payment-gateway.interface';
import { PaymentErrorHandler } from '../utils/error-handler.util';

@Injectable()
export class RazorpayGateway implements PaymentGateway {
    private razorpay: any;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // 1 second
    private readonly PAISE_PER_RUPEE = 100;

    constructor(private readonly configService: ConfigService) {
        this.razorpay = new Razorpay({
            key_id: this.configService.get<string>('RAZORPAY_KEY_ID'),
            key_secret: this.configService.get<string>('RAZORPAY_KEY_SECRET')
        });
    }

    private toPaise(rupees: number): number {
        return Math.round(rupees * this.PAISE_PER_RUPEE);
    }

    private toRupees(paise: number | null | undefined): number {
        return paise ? Number(paise) / this.PAISE_PER_RUPEE : 0;
    }

    async createOrder(
        amount: number,
        currency: string,
        metadata: Record<string, any>
    ): Promise<PaymentGatewayResponse<CreateOrderResponse>> {
        try {
            if (amount <= 0) throw new Error('Invalid amount specified');
            if (!currency) throw new Error('Currency is required');

            const order = await this.razorpay.orders.create({
                amount: this.toPaise(amount), // Convert to paise
                currency,
                receipt: metadata.receipt,
                notes: metadata
            });

            return {
                success: true,
                data: {
                    orderId: order.id,
                    amount: this.toRupees(Number(order.amount)),
                    currency: order.currency
                }
            };
        } catch (error) {
            PaymentErrorHandler.handleGatewayError(error, 'createOrder');
        }
    }

    async verifyPayment(
        payload: Record<string, any>,
        signature: string
    ): Promise<PaymentGatewayResponse<VerifyPaymentResponse>> {
        try {
            const isValid = this.verifySignature(
                payload.razorpay_order_id,
                payload.razorpay_payment_id,
                signature
            );

            if (!isValid) throw new Error('Invalid payment signature');

            const payment = await this.retryOperation(
                () => this.razorpay.payments.fetch(payload.razorpay_payment_id)
            ) as any;

            if (payment.status !== 'captured') {
                throw new Error(`Payment not captured. Status: ${payment.status}`);
            }

            return {
                success: true,
                data: {
                    success: true,
                    paymentId: payment.id,
                    orderId: payment.order_id,
                    amount: this.toRupees(Number(payment.amount)),
                    metadata: payment.notes
                }
            };
        } catch (error) {
            PaymentErrorHandler.handleVerificationError(error, 'verifyPayment');
        }
    }

    async verifyWebhook(payload: any, signature: string): Promise<boolean> {
        try {
            const secret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET');
            if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET configuration is missing');

            const hmac = createHmac('sha256', secret);
            hmac.update(JSON.stringify(payload));
            const generatedSignature = hmac.digest('hex');
            return generatedSignature === signature;
        } catch (error) {
            PaymentErrorHandler.handleVerificationError(error, 'verifyWebhook');
            return false;
        }
    }

    async processRefund(
        paymentId: string,
        amount: number,
        metadata?: Record<string, any>
    ): Promise<PaymentGatewayResponse> {
        try {
            const payment = await this.razorpay.payments.fetch(paymentId);
            if (amount > this.toRupees(Number(payment.amount))) {
                throw new Error('Refund amount exceeds payment amount');
            }

            const refund = await this.retryOperation(
                () => this.razorpay.payments.refund(paymentId, {
                    amount: this.toPaise(amount),
                    notes: metadata
                })
            ) as any;

            return {
                success: true,
                data: {
                    refundId: refund.id,
                    amount: this.toRupees(Number(refund.amount)),
                    status: refund.status
                }
            };
        } catch (error) {
            PaymentErrorHandler.handleRefundError(error, 'processRefund');
        }
    }

    async getPaymentStatus(paymentId: string): Promise<PaymentGatewayResponse> {
        try {
            const payment = await this.retryOperation(
                () => this.razorpay.payments.fetch(paymentId)
            ) as any;

            return {
                success: true,
                data: {
                    status: payment.status,
                    amount: this.toRupees(Number(payment.amount)),
                    method: payment.method,
                    captured: payment.captured
                }
            };
        } catch (error) {
            PaymentErrorHandler.handleGatewayError(error, 'getPaymentStatus');
        }
    }

    private verifySignature(orderId: string, paymentId: string, signature: string): boolean {
        const secret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
        if (!secret) throw new Error('RAZORPAY_KEY_SECRET configuration is missing');

        const hmac = createHmac('sha256', secret);
        hmac.update(`${orderId}|${paymentId}`);
        const generatedSignature = hmac.digest('hex');
        return generatedSignature === signature;
    }

    private async retryOperation<T>(operation: () => Promise<T>): Promise<T> {
        let lastError: Error = new Error('Operation not attempted');
        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt === this.MAX_RETRIES) break;
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
            }
        }
        throw lastError;
    }
}