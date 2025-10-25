import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { RefundStatus } from '../../common/types/booking.types';

@Entity('refunds')
export class RefundEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'booking_id', type: 'integer' })
    bookingId: number;

    @Column({ name: 'razorpay_payment_id', length: 100 })
    razorpayPaymentId: string;

    @Column({ name: 'razorpay_refund_id', length: 100, nullable: true })
    razorpayRefundId?: string;

    @Column('decimal', { precision: 10, scale: 2 })
    amount: number;

    @Column()
    reason: string;

    @Column({
        type: 'varchar',
        enum: RefundStatus
    })
    status: RefundStatus;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
