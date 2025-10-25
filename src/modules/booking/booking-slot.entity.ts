import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { BookingEntity } from './booking.entity';

export enum BookingSlotStatus {
    PENDING_PAYMENT = 'PENDING_PAYMENT',
    ACTIVE = 'ACTIVE',
    CANCELLED = 'CANCELLED',
    CANCELLED_REFUND_PENDING = 'CANCELLED_REFUND_PENDING',
    CANCELLED_REFUNDED = 'CANCELLED_REFUNDED',
    EXPIRED = 'EXPIRED'
}

export enum RefundStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

@Entity('booking_slots')
export class BookingSlotEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'booking_id' })
    bookingId: number;

    @Column({ name: 'slot_number' })
    slotNumber: number;

    @Column({ name: 'player_id', nullable: true })
    playerId: number;

    @Column({ name: 'player_name', nullable: true })
    playerName: string;

    @Column({ name: 'player_email', nullable: true })
    playerEmail: string;

    @Column({ name: 'player_phone', nullable: true })
    playerPhone: string;

    @Column({
        type: 'varchar',
        enum: BookingSlotStatus,
        default: BookingSlotStatus.ACTIVE
    })
    status: BookingSlotStatus;

    @Column({
        name: 'refund_status',
        type: 'varchar',
        enum: RefundStatus,
        nullable: true
    })
    refundStatus: RefundStatus;

    @Column({
        name: 'refund_amount',
        type: 'decimal',
        precision: 10,
        scale: 2,
        nullable: true
    })
    refundAmount: number;

    @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
    cancelledAt: Date;

    @Column({ name: 'refunded_at', type: 'timestamp', nullable: true })
    refundedAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @ManyToOne(() => BookingEntity, booking => booking.slots)
    @JoinColumn({ name: 'booking_id' })
    booking: BookingEntity;
}
