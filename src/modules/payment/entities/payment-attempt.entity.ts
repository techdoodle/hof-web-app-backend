import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PaymentStatus } from '../types/payment.types';
import { RazorpayOrder } from './razorpay-order.entity';

@Entity('payment_attempts')
export class PaymentAttempt {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'razorpay_order_id' })
    razorpayOrderId: string;

    @Column({ name: 'razorpay_payment_id', nullable: true })
    razorpayPaymentId: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount: number;

    @Column({
        type: 'varchar',
        length: 20,
        enum: PaymentStatus
    })
    status: PaymentStatus;

    @Column({ name: 'payment_method', nullable: true })
    paymentMethod: string;

    @Column({ name: 'error_code', nullable: true })
    errorCode: string;

    @Column({ name: 'error_description', nullable: true })
    errorDescription: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @Column({ name: 'completed_at', nullable: true })
    completedAt: Date;

    @ManyToOne(() => RazorpayOrder, order => order.paymentAttempts)
    @JoinColumn({ name: 'razorpay_order_id', referencedColumnName: 'razorpayOrderId' })
    order: RazorpayOrder;
}
