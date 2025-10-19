export enum PaymentStatus {
    INITIATED = 'INITIATED',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    EXPIRED = 'EXPIRED'
}

export enum OrderStatus {
    CREATED = 'CREATED',
    PAID = 'PAID',
    ATTEMPTED = 'ATTEMPTED',
    EXPIRED = 'EXPIRED'
}

export enum RefundStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

export interface CreateOrderDto {
    bookingId: string;
    amount: number;
    currency: string;
    notes?: Record<string, any>;
    receipt?: string;
}

export interface PaymentVerificationDto {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}

export interface WebhookEventDto {
    entity: string;
    account_id: string;
    event: string;
    contains: string[];
    payload: {
        payment: {
            entity: {
                id: string;
                order_id: string;
                amount: number;
                currency: string;
                status: string;
                method: string;
                captured: boolean;
                description: string;
                error_code?: string;
                error_description?: string;
                notes: Record<string, any>;
            }
        }
    };
    created_at: number;
}
