export interface EmailConfig {
    from?: {
        name: string;
        address: string;
    };
    replyTo?: string;
    attachments?: Array<{
        filename: string;
        content: string | Buffer;
        contentType?: string;
    }>;
}

export interface NotificationRecipient {
    email: string;
    name?: string;
    phone?: string;
}

export interface EmailTemplate {
    subject: string;
    template: string;
    data: Record<string, any>;
}

export interface NotificationPayload {
    type: NotificationType;
    recipient: NotificationRecipient;
    templateData: Record<string, any>;
    metadata?: Record<string, any>;
}

export enum NotificationType {
    BOOKING_CONFIRMATION = 'BOOKING_CONFIRMATION',
    PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
    PAYMENT_FAILED = 'PAYMENT_FAILED',
    BOOKING_CANCELLED = 'BOOKING_CANCELLED',
    REFUND_INITIATED = 'REFUND_INITIATED',
    REFUND_COMPLETED = 'REFUND_COMPLETED',
    BOOKING_REMINDER = 'BOOKING_REMINDER',
    WAITLIST_NOTIFICATION = 'WAITLIST_NOTIFICATION',
    WAITLIST_CONFIRMATION = 'WAITLIST_CONFIRMATION'
}