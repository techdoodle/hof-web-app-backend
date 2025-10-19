import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { BookingSlotEntity } from './booking-slot.entity';
import { BookingStatus, RefundStatus } from '../../common/types/booking.types';

@Entity('bookings')
export class BookingEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    bookingReference: string;

    @Column({ type: 'uuid' })
    matchId: string;

    @Column({ type: 'uuid', nullable: true })
    userId: string;

    @Column()
    email: string;

    @Column()
    totalSlots: number;

    @Column('decimal', { precision: 10, scale: 2 })
    amount: number;

    @Column({
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

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @OneToMany(() => BookingSlotEntity, slot => slot.booking)
    slots: BookingSlotEntity[];
}
