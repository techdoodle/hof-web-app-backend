import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { RefundEntity } from './refund.entity';
import { RefundStatus } from '../../common/types/booking.types';
import { RazorpayService } from './razorpay.service';

interface InitiateRefundParams {
    bookingId: string | number;
    amount: number;
    reason: string;
    razorpayPaymentId: string;
    slots?: number[];
    metadata?: Record<string, any>;
}

@Injectable()
export class RefundService {
    private readonly logger = new Logger(RefundService.name);

    constructor(
        @InjectRepository(RefundEntity)
        private refundRepository: Repository<RefundEntity>,
        private razorpayService: RazorpayService,
    ) { }

    async initiateRefund(params: InitiateRefundParams, queryRunner: QueryRunner) {
        const refund = this.refundRepository.create({
            bookingId: Number(params.bookingId),
            amount: params.amount,
            reason: params.reason,
            status: RefundStatus.PENDING,
            razorpayPaymentId: params.razorpayPaymentId,
            // razorpayRefundId will be set after Razorpay API call
            metadata: {
                ...params.metadata,
                slots: params.slots,
                initiatedAt: new Date()
            }
        });

        // Save using the provided query runner to maintain transaction
        await queryRunner.manager.save(refund);

        // Initiate actual refund with Razorpay
        try {
            this.logger.log(`Initiating refund for payment ${params.razorpayPaymentId}, amount: ${params.amount}`);

            const razorpayRefund = await this.razorpayService.createRefund({
                paymentId: params.razorpayPaymentId,
                amount: params.amount * 100, // Convert to paise
                notes: {
                    reason: params.reason,
                    bookingId: params.bookingId.toString()
                }
            });

            // Update refund record with Razorpay refund ID
            refund.razorpayRefundId = razorpayRefund.id;
            refund.status = RefundStatus.PROCESSING;
            refund.metadata = {
                ...refund.metadata,
                razorpayRefundData: razorpayRefund,
                processedAt: new Date()
            };

            await queryRunner.manager.save(refund);
            this.logger.log(`Refund initiated successfully: ${refund.id}`);

        } catch (error) {
            // Mark refund as failed
            refund.status = RefundStatus.FAILED;
            refund.metadata = {
                ...refund.metadata,
                error: error.message,
                errorDetails: error.response?.data || error.stack,
                failedAt: new Date()
            };
            await queryRunner.manager.save(refund);
            this.logger.error(`Refund initiation failed for payment ${params.razorpayPaymentId}: ${error.message}`, error.stack);
            throw error;
        }

        return refund;
    }

    async updateRefundStatus(refundId: string, status: RefundStatus, razorpayData?: any) {
        const refund = await this.refundRepository.findOne({ where: { id: refundId } });
        if (!refund) {
            throw new Error('Refund not found');
        }

        refund.status = status;
        if (razorpayData) {
            refund.metadata = {
                ...refund.metadata,
                razorpayWebhookData: razorpayData,
                statusUpdatedAt: new Date()
            };
        }

        await this.refundRepository.save(refund);
        this.logger.log(`Refund status updated: ${refundId} -> ${status}`);
    }

    async getRefundById(refundId: string): Promise<RefundEntity | null> {
        const refund = await this.refundRepository.findOne({ where: { id: refundId } });
        return refund || null;
    }

    async getRefundsByBookingId(bookingId: string | number): Promise<RefundEntity[]> {
        const refunds = await this.refundRepository.find({
            where: { bookingId: Number(bookingId) },
            order: { createdAt: 'DESC' }
        });
        return refunds || [];
    }

    async getRefundByRazorpayId(razorpayRefundId: string): Promise<RefundEntity | null> {
        const refund = await this.refundRepository.findOne({
            where: { razorpayRefundId }
        });
        return refund || null;
    }
}
