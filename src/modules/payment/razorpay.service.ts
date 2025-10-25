import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const Razorpay = require('razorpay');

@Injectable()
export class RazorpayService {
    private razorpay: any;

    constructor(private configService: ConfigService) {
        this.razorpay = new Razorpay({
            key_id: this.configService.get<string>('RAZORPAY_KEY_ID'),
            key_secret: this.configService.get<string>('RAZORPAY_KEY_SECRET'),
        });
    }

    async createOrder(amount: number, currency: string = 'INR', receipt?: string) {
        const options = {
            amount: amount * 100, // Razorpay expects amount in paise
            currency,
            receipt: receipt || `receipt_${Date.now()}`,
            notes: {
                source: 'hof-web-app'
            }
        };

        try {
            const order = await this.razorpay.orders.create(options);
            return order;
        } catch (error) {
            throw new Error(`Failed to create Razorpay order: ${error.message}`);
        }
    }

    async verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
        const crypto = require('crypto');
        const expectedSignature = crypto
            .createHmac('sha256', this.configService.get<string>('RAZORPAY_KEY_SECRET'))
            .update(`${orderId}|${paymentId}`)
            .digest('hex');

        return expectedSignature === signature;
    }

    async capturePayment(paymentId: string, amount: number) {
        try {
            const payment = await this.razorpay.payments.capture(paymentId, amount * 100, 'INR');
            return payment;
        } catch (error) {
            throw new Error(`Failed to capture payment: ${error.message}`);
        }
    }

    async getPaymentDetails(paymentId: string) {
        try {
            const payment = await this.razorpay.payments.fetch(paymentId);
            return payment;
        } catch (error) {
            throw new Error(`Failed to fetch payment details: ${error.message}`);
        }
    }

    async createRefund(params: { paymentId: string; amount: number; notes?: Record<string, any> }) {
        try {
            const refund = await this.razorpay.payments.refund(params.paymentId, {
                amount: params.amount, // Amount should already be in paise
                notes: params.notes || {
                    reason: 'Booking cancellation refund'
                }
            });
            return refund;
        } catch (error) {
            throw new Error(`Failed to create refund: ${error.message}`);
        }
    }

    async getRefundDetails(refundId: string) {
        try {
            const refund = await this.razorpay.refunds.fetch(refundId);
            return refund;
        } catch (error) {
            throw new Error(`Failed to fetch refund details: ${error.message}`);
        }
    }
}
