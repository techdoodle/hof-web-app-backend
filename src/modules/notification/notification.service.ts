import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { EmailService } from './services/email.service';
import {
  NotificationType,
  NotificationPayload,
  EmailTemplate
} from './interfaces/notification.interface';
import { Notification } from './entities/notification.entity';
import { TransactionManager } from '../../common/utils/transaction.util';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly transactionManager: TransactionManager;

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private readonly emailService: EmailService,
    private readonly connection: Connection
  ) {
    this.transactionManager = new TransactionManager(connection);
  }

  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    try {
      this.validateNotificationPayload(payload);

      return await this.transactionManager.withTransaction(async (queryRunner) => {
        // Get email template
        const template = await this.getEmailTemplate(
          payload.type,
          payload.templateData
        );

        // Send email
        const emailSent = await this.emailService.sendEmail(
          payload.recipient,
          template
        );

        // Store notification record
        const notification = this.notificationRepository.create({
          type: payload.type,
          recipientEmail: payload.recipient.email,
          recipientName: payload.recipient.name,
          status: emailSent ? 'SENT' : 'FAILED',
          metadata: {
            ...payload.metadata,
            templateData: payload.templateData,
            timestamp: new Date().toISOString()
          }
        });

        await queryRunner.manager.save(notification);

        return emailSent;
      }, 'sendNotification');
    } catch (error) {
      this.logger.error(
        `Failed to send notification: ${error.message}`,
        error.stack
      );
      return false;
    }
  }

  private validateNotificationPayload(payload: NotificationPayload): void {
    if (!payload) {
      throw new Error('Notification payload is required');
    }

    if (!payload.type || !Object.values(NotificationType).includes(payload.type)) {
      throw new Error(`Invalid notification type: ${payload.type}`);
    }

    if (!payload.recipient || !payload.recipient.email) {
      throw new Error('Recipient email is required');
    }

    if (!payload.templateData) {
      throw new Error('Template data is required');
    }
  }

  private async getEmailTemplate(
    type: NotificationType,
    data: Record<string, any>
  ): Promise<EmailTemplate> {
    const templates: Record<NotificationType, EmailTemplate> = {
      [NotificationType.BOOKING_CONFIRMATION]: {
        subject: 'Booking Confirmation - Humans of Football',
        template: 'booking-confirmation',
        data: {
          ...data,
          supportEmail: process.env.SUPPORT_EMAIL
        }
      },
      [NotificationType.PAYMENT_SUCCESS]: {
        subject: 'Payment Successful - Humans of Football',
        template: 'payment-success',
        data
      },
      [NotificationType.PAYMENT_FAILED]: {
        subject: 'Payment Failed - Humans of Football',
        template: 'payment-failed',
        data: {
          ...data,
          supportEmail: process.env.SUPPORT_EMAIL
        }
      },
      [NotificationType.BOOKING_CANCELLED]: {
        subject: 'Booking Cancelled - Humans of Football',
        template: 'booking-cancelled',
        data
      },
      [NotificationType.REFUND_INITIATED]: {
        subject: 'Refund Initiated - Humans of Football',
        template: 'refund-initiated',
        data
      },
      [NotificationType.REFUND_COMPLETED]: {
        subject: 'Refund Completed - Humans of Football',
        template: 'refund-completed',
        data
      },
      [NotificationType.BOOKING_REMINDER]: {
        subject: 'Match Reminder - Humans of Football',
        template: 'booking-reminder',
        data
      },
      [NotificationType.WAITLIST_NOTIFICATION]: {
        subject: 'Slots Available - Humans of Football',
        template: 'waitlist-notification',
        data
      }
    };

    const template = templates[type];
    if (!template) {
      throw new Error(`Template not found for notification type: ${type}`);
    }

    return template;
  }

  // Helper methods with proper validation and error handling
  async sendBookingConfirmation(
    email: string,
    bookingDetails: Record<string, any>
  ): Promise<boolean> {
    if (!bookingDetails.bookingId || !bookingDetails.matchDetails) {
      throw new Error('Invalid booking details');
    }

    return this.sendNotification({
      type: NotificationType.BOOKING_CONFIRMATION,
      recipient: { email },
      templateData: bookingDetails
    });
  }

  async sendPaymentConfirmation(
    email: string,
    paymentDetails: Record<string, any>
  ): Promise<boolean> {
    if (!paymentDetails.paymentId || !paymentDetails.amount) {
      throw new Error('Invalid payment details');
    }

    return this.sendNotification({
      type: NotificationType.PAYMENT_SUCCESS,
      recipient: { email },
      templateData: paymentDetails
    });
  }

  async sendBookingCancellation(
    email: string,
    cancellationDetails: Record<string, any>
  ): Promise<boolean> {
    if (!cancellationDetails.bookingId || !cancellationDetails.reason) {
      throw new Error('Invalid cancellation details');
    }

    return this.sendNotification({
      type: NotificationType.BOOKING_CANCELLED,
      recipient: { email },
      templateData: cancellationDetails
    });
  }

  async sendRefundNotification(
    email: string,
    refundDetails: Record<string, any>
  ): Promise<boolean> {
    if (!refundDetails.refundId || !refundDetails.amount) {
      throw new Error('Invalid refund details');
    }

    return this.sendNotification({
      type: NotificationType.REFUND_INITIATED,
      recipient: { email },
      templateData: refundDetails
    });
  }

  async sendWaitlistNotification(
    email: string,
    waitlistDetails: Record<string, any>
  ): Promise<boolean> {
    if (!waitlistDetails.matchId || !waitlistDetails.availableSlots) {
      throw new Error('Invalid waitlist details');
    }

    return this.sendNotification({
      type: NotificationType.WAITLIST_NOTIFICATION,
      recipient: { email },
      templateData: waitlistDetails
    });
  }
}