import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { OrderStatus } from '../types/payment.types';
import { PaymentAttempt } from './payment-attempt.entity';

@Entity('razorpay_orders')
export class RazorpayOrder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'booking_id', type: 'uuid' })
    bookingId: string;

    @Column({ name: 'razorpay_order_id', unique: true })
    razorpayOrderId: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount: number;

    @Column({ default: 'INR', length: 3 })
    currency: string;

    @Column({
        type: 'varchar',
        length: 20,
        enum: OrderStatus
    })
    status: OrderStatus;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @OneToMany(() => PaymentAttempt, attempt => attempt.order)
    paymentAttempts: PaymentAttempt[];
}
