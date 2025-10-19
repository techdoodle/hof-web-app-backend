import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { RefundStatus } from '../types/payment.types';

@Entity('refunds')
export class Refund {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'booking_id', type: 'uuid' })
    bookingId: string;

    @Column({ name: 'razorpay_payment_id' })
    razorpayPaymentId: string;

    @Column({ name: 'razorpay_refund_id', nullable: true })
    razorpayRefundId: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount: number;

    @Column({
        type: 'varchar',
        length: 20,
        enum: RefundStatus
    })
    status: RefundStatus;

    @Column({ nullable: true })
    reason: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
