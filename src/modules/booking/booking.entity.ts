import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BookingSlotEntity } from './booking-slot.entity';
import { BookingStatus, PaymentStatus, RefundStatus } from '../../common/types/booking.types';
import { PromoCode } from '../promo-codes/entities/promo-code.entity';

@Entity('bookings')
export class BookingEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'booking_reference' })
    bookingReference: string;

    @Column({ name: 'match_id' })
    matchId: number;

    @Column({ name: 'user_id', nullable: true })
    userId: number;

    @Column()
    email: string;

    @Column({ name: 'total_slots' })
    totalSlots: number;

    @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2 })
    amount: number;

    @ManyToOne(() => PromoCode, { nullable: true })
    @JoinColumn({ name: 'promo_code_id' })
    promoCode: PromoCode | null;

    @Column({ name: 'promo_code_id', nullable: true })
    promoCodeId: number | null;

    @Column({ name: 'discount_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
    discountAmount: number | null;

    @Column({ name: 'original_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
    originalAmount: number | null;

    @Column({
        name: 'refund_status',
        type: 'varchar',
        enum: RefundStatus,
        nullable: true
    })
    refundStatus: RefundStatus;

    @Column({
        type: 'varchar',
        enum: BookingStatus
    })
    status: BookingStatus;

    @Column({
        name: 'payment_status',
        type: 'varchar',
        enum: PaymentStatus
    })
    paymentStatus: PaymentStatus;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @OneToMany(() => BookingSlotEntity, slot => slot.booking)
    slots: BookingSlotEntity[];
}
