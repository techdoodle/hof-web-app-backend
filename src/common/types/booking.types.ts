export enum BookingStatus {
    INITIATED = 'INITIATED',
    PAYMENT_PENDING = 'PAYMENT_PENDING',
    PAYMENT_FAILED = 'PAYMENT_FAILED',
    PAYMENT_EXPIRED = 'PAYMENT_EXPIRED',
    PAYMENT_FAILED_VERIFIED = 'PAYMENT_FAILED_VERIFIED',
    PAYMENT_CANCELLED = 'PAYMENT_CANCELLED',
    CONFIRMED = 'CONFIRMED',
    CANCELLED = 'CANCELLED',
    PARTIALLY_CANCELLED = 'PARTIALLY_CANCELLED',
    EXPIRED = 'EXPIRED'
}

export enum PaymentStatus {
    INITIATED = 'INITIATED',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    PAID_CASH = 'PAID_CASH'
}

export enum RefundStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

export enum WaitlistStatus {
    WAITING = 'WAITING',
    NOTIFIED = 'NOTIFIED',
    PROMOTED = 'PROMOTED',
    EXPIRED = 'EXPIRED',
    CANCELLED = 'CANCELLED'
}

export interface CreateBookingDto {
    matchId: string;
    userId?: string;
    email: string;
    totalSlots: number;
    slotNumbers: number[];
    players: Array<{
        firstName?: string;
        lastName?: string;
        phone: string;
        teamName?: string; // Team selection for this player (required for confirmed bookings)
    }>;
    metadata?: Record<string, any>;
    isWaitlist?: boolean; // Flag to indicate if this is a waitlist booking
}

export interface InitiatePaymentDto {
    bookingId: string;
    amount: number;
    currency: string;
    email: string;
    metadata?: Record<string, any>;
}

export interface PaymentCallbackDto {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
}

export interface CancelBookingDto {
    bookingId: string;
    slotNumbers?: number[]; // If not provided, cancel all slots
    reason?: string;
}

export interface AddToWaitlistDto {
    matchId: string;
    userId?: string;
    email: string;
    slotsRequested: number;
    metadata?: Record<string, any>;
}

export interface VerifySlotsDto {
    matchId: string;
    slots: Array<{
        phone: string;
        slotNumber?: number;
    }>;
}