import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { BookingSlotEntity } from './booking-slot.entity';
import { BookingStatus, RefundStatus } from '../../common/types/booking.types';

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

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @OneToMany(() => BookingSlotEntity, slot => slot.booking)
    slots: BookingSlotEntity[];
}
