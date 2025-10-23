import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { BookingEntity } from './booking.entity';

export enum BookingSlotStatus {
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
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid', name: 'booking_id' })
    bookingId: string;

    @Column()
    slotNumber: number;

    @Column({ nullable: true })
    playerName: string;

    @Column({ nullable: true })
    playerEmail: string;

    @Column({ nullable: true })
    playerPhone: string;

    @Column({
        type: 'varchar',
        enum: BookingSlotStatus,
        default: BookingSlotStatus.ACTIVE
    })
    status: BookingSlotStatus;

    @Column({
        type: 'varchar',
        enum: RefundStatus,
        nullable: true
    })
    refundStatus: RefundStatus;

    @Column({
        type: 'decimal',
        precision: 10,
        scale: 2,
        nullable: true
    })
    refundAmount: number;

    @Column({ type: 'timestamp', nullable: true })
    cancelledAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    refundedAt: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @ManyToOne(() => BookingEntity, booking => booking.slots)
    booking: BookingEntity;
}
