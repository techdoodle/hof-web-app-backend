import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { RefundEntity } from './refund.entity';
import { RefundStatus } from '../../common/types/booking.types';
import { RazorpayService } from './razorpay.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/interfaces/notification.interface';
import { BookingEntity } from '../booking/booking.entity';

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
        @InjectRepository(BookingEntity)
        private bookingRepository: Repository<BookingEntity>,
        private razorpayService: RazorpayService,
        private notificationService: NotificationService,
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

            // ✅ Send email notification to user after refund initiation (fire-and-forget)
            // Note: Email is sent asynchronously and won't block the transaction
            this.sendRefundNotification(params, refund).catch((emailError) => {
                this.logger.warn(`⚠️ Failed to send refund notification email: ${emailError.message}`);
                // Don't fail the refund - email is non-critical
            });

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

    private async sendRefundNotification(params: InitiateRefundParams, refund: RefundEntity): Promise<void> {
        try {
            const booking = await this.bookingRepository.findOne({
                where: { id: Number(params.bookingId) },
                relations: ['slots']
            });

            if (!booking) {
                this.logger.warn(`⚠️ Booking ${params.bookingId} not found for refund notification`);
                return;
            }

            await this.notificationService.sendNotification({
                type: NotificationType.REFUND_INITIATED,
                recipient: {
                    email: booking.email,
                    name: booking.slots?.[0]?.playerName || 'User'
                },
                templateData: {
                    bookingReference: booking.bookingReference,
                    refundAmount: params.amount,
                    refundId: refund.id,
                    razorpayRefundId: refund.razorpayRefundId || 'Processing',
                    reason: params.reason || `Your payment of ₹${params.amount} has been refunded and will be processed shortly.`,
                    matchId: booking.matchId,
                    refundStatus: refund.status,
                    requestedSlots: params.metadata?.requestedSlots,
                    availableSlots: params.metadata?.availableSlots
                }
            });
            this.logger.log(`✅ Refund initiation notification email sent for booking ${params.bookingId}`);
        } catch (error) {
            this.logger.error(`Failed to send refund notification email for booking ${params.bookingId}: ${error.message}`, error.stack);
            throw error; // Re-throw to be caught by caller
        }
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
