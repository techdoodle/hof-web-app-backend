import { Controller, Post, Body, Headers, Logger, HttpStatus, HttpCode } from '@nestjs/common';
import { RefundService } from './refund.service';
import { RefundStatus } from '../../common/types/booking.types';

@Controller('webhooks')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(private refundService: RefundService) { }

    @Post('razorpay')
    @HttpCode(HttpStatus.OK)
    async handleRazorpayWebhook(@Body() body: any, @Headers() headers: any) {
        this.logger.log('Received Razorpay webhook', { event: body.event, entity: body.entity });

        try {
            // Handle refund events
            if (body.event && body.entity === 'refund') {
                await this.handleRefundEvent(body);
            }

            return { status: 'success' };
        } catch (error) {
            this.logger.error('Webhook processing failed', error);
            throw error;
        }
    }

    private async handleRefundEvent(webhookData: any) {
        const { event, payload } = webhookData;
        const refund = payload.refund;

        if (!refund || !refund.id) {
            this.logger.warn('Invalid refund data in webhook');
            return;
        }

        this.logger.log(`Processing refund event: ${event} for refund: ${refund.id} with payload: ${JSON.stringify(payload)}`);
        this.logger.log("payload", payload);
        this.logger.log("refund", refund);
        this.logger.log("event", event);

        // Map Razorpay refund status to our RefundStatus enum
        let status: RefundStatus;
        switch (refund.status) {
            case 'refund.created':
                status = RefundStatus.PROCESSING;
                break;
            case 'refund.processed':
                status = RefundStatus.COMPLETED;
                break;
            case 'refund.failed':
                status = RefundStatus.FAILED;
                break;
            case 'processed':
                status = RefundStatus.COMPLETED;
                break;
            case 'failed':
                status = RefundStatus.FAILED;
                break;
            case 'pending':
                status = RefundStatus.PROCESSING;
                break;
            default:
                this.logger.warn(`Unknown refund status: ${refund.status}`);
                return;
        }

        // Find refund by Razorpay refund ID
        const existingRefund = await this.refundService.getRefundByRazorpayId(refund.id);
        if (!existingRefund) {
            this.logger.warn(`Refund not found for Razorpay ID: ${refund.id}`);
            return;
        }

        // Update refund status
        await this.refundService.updateRefundStatus(existingRefund.id, status, webhookData);

        this.logger.log(`Refund status updated: ${existingRefund.id} -> ${status}`);
    }
}
