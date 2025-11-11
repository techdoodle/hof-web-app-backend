import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { RazorpayOrder } from './entities/razorpay-order.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { RefundEntity } from './refund.entity';
import { RazorpayGateway } from './gateways/razorpay.gateway';
import {
    PaymentStatus,
    OrderStatus,
    CreateOrderDto,
    PaymentVerificationDto,
    WebhookEventDto
} from './types/payment.types';

@Injectable()
export class PaymentService {
    constructor(
        @InjectRepository(RazorpayOrder)
        private readonly orderRepository: Repository<RazorpayOrder>,
        @InjectRepository(PaymentAttempt)
        private readonly paymentAttemptRepository: Repository<PaymentAttempt>,
        @InjectRepository(RefundEntity)
        private readonly refundRepository: Repository<RefundEntity>,
        private readonly paymentGateway: RazorpayGateway,
        private readonly connection: Connection
    ) { }

    async createOrder(dto: CreateOrderDto) {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Create order via payment gateway
            const gatewayResponse = await this.paymentGateway.createOrder(
                dto.amount,
                dto.currency,
                {
                    bookingId: dto.bookingId,
                    receipt: dto.receipt || dto.bookingId,
                    ...dto.notes
                }
            );

            if (!gatewayResponse.success) {
                throw new BadRequestException(gatewayResponse.error);
            }

            // Store order in our database
            const order = this.orderRepository.create({
                bookingId: typeof dto.bookingId === 'string' ? parseInt(dto.bookingId) : dto.bookingId,
                razorpayOrderId: gatewayResponse.data?.orderId,
                amount: gatewayResponse.data?.amount,
                currency: gatewayResponse.data?.currency,
                status: OrderStatus.CREATED,
                metadata: {
                    notes: dto.notes,
                    receipt: dto.receipt
                }
            });

            await queryRunner.manager.save(order);
            await queryRunner.commitTransaction();

            return gatewayResponse.data;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw new InternalServerErrorException(error.message);
        } finally {
            await queryRunner.release();
        }
    }

    async verifyPayment(dto: PaymentVerificationDto) {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Verify payment via gateway
            const verificationResponse = await this.paymentGateway.verifyPayment(
                {
                    razorpay_order_id: dto.razorpay_order_id,
                    razorpay_payment_id: dto.razorpay_payment_id
                },
                dto.razorpay_signature
            );

            if (!verificationResponse.success) {
                throw new BadRequestException(verificationResponse.error);
            }

            const { data } = verificationResponse;

            // Get order details
            const order = await this.orderRepository.findOne({
                where: { razorpayOrderId: data?.orderId }
            });

            if (!order) {
                throw new BadRequestException('Order not found');
            }

            // Create payment attempt record
            const paymentAttempt = this.paymentAttemptRepository.create({
                razorpayOrderId: data?.orderId,
                razorpayPaymentId: data?.paymentId,
                amount: data?.amount,
                status: PaymentStatus.COMPLETED,
                completedAt: new Date(),
                metadata: data?.metadata
            });

            await queryRunner.manager.save(paymentAttempt);

            // Update order status
            order.status = OrderStatus.PAID;
            await queryRunner.manager.save(order);

            await queryRunner.commitTransaction();

            return { success: true, bookingId: order.bookingId };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async handleWebhook(payload: WebhookEventDto, signature: string, rawBody: string) {
        // Verify webhook signature
        const isValid = await this.paymentGateway.verifyWebhook(rawBody, signature);
        if (!isValid) {
            throw new BadRequestException('Invalid webhook signature');
        }

        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        console.log("payload", payload,);
        try {
            switch (payload.event) {
                case 'payment.captured':
                    await this.handlePaymentCaptured(payload.payload.payment.entity, queryRunner);
                    break;
                case 'payment.failed':
                    await this.handlePaymentFailed(payload.payload.payment.entity, queryRunner);
                    break;
                // Add more webhook handlers as needed
            }

            await queryRunner.commitTransaction();
            return { success: true };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    private async handlePaymentCaptured(payment: any, queryRunner: any) {
        const order = await this.orderRepository.findOne({
            where: { razorpayOrderId: payment.order_id }
        });

        if (!order) {
            throw new BadRequestException('Order not found');
        }

        // Update payment attempt
        const paymentAttempt = await this.paymentAttemptRepository.findOne({
            where: { razorpayPaymentId: payment.id }
        });

        if (paymentAttempt) {
            paymentAttempt.status = PaymentStatus.COMPLETED;
            paymentAttempt.completedAt = new Date();
            await queryRunner.manager.save(paymentAttempt);
        } else {
            // Create new payment attempt record
            const newPaymentAttempt = this.paymentAttemptRepository.create({
                razorpayOrderId: payment.order_id,
                razorpayPaymentId: payment.id,
                amount: payment.amount / 100,
                status: PaymentStatus.COMPLETED,
                paymentMethod: payment.method,
                completedAt: new Date(),
                metadata: payment.notes
            });
            await queryRunner.manager.save(newPaymentAttempt);
        }

        // Update order status
        order.status = OrderStatus.PAID;
        await queryRunner.manager.save(order);
    }

    private async handlePaymentFailed(payment: any, queryRunner: any) {
        const paymentAttempt = await this.paymentAttemptRepository.findOne({
            where: { razorpayPaymentId: payment.id }
        });

        if (paymentAttempt) {
            paymentAttempt.status = PaymentStatus.FAILED;
            paymentAttempt.errorCode = payment.error_code;
            paymentAttempt.errorDescription = payment.error_description;
            await queryRunner.manager.save(paymentAttempt);
        } else {
            // Create new failed payment attempt record
            const newPaymentAttempt = this.paymentAttemptRepository.create({
                razorpayOrderId: payment.order_id,
                razorpayPaymentId: payment.id,
                amount: payment.amount / 100,
                status: PaymentStatus.FAILED,
                errorCode: payment.error_code,
                errorDescription: payment.error_description,
                metadata: payment.notes
            });
            await queryRunner.manager.save(newPaymentAttempt);
        }

    }

    async processRefund(
        bookingId: string,
        amount: number,
        reason?: string
    ) {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Get the successful payment attempt
            const paymentAttempt = await this.paymentAttemptRepository.findOne({
                where: {
                    razorpayOrderId: bookingId,
                    status: PaymentStatus.COMPLETED
                }
            });

            if (!paymentAttempt) {
                throw new BadRequestException('No successful payment found for this booking');
            }

            // Process refund via gateway
            const refundResponse = await this.paymentGateway.processRefund(
                paymentAttempt.razorpayPaymentId,
                amount,
                { reason }
            );

            if (!refundResponse.success) {
                throw new BadRequestException(refundResponse.error);
            }

            // Create refund record
            const refund = this.refundRepository.create({
                bookingId: Number(bookingId),
                razorpayPaymentId: paymentAttempt.razorpayPaymentId,
                razorpayRefundId: refundResponse.data.refundId,
                amount,
                status: refundResponse.data.status,
                reason,
                metadata: { originalPaymentId: paymentAttempt.razorpayPaymentId }
            });

            await queryRunner.manager.save(refund);
            await queryRunner.commitTransaction();

            return refundResponse.data;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }
}