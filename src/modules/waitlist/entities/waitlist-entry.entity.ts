import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum WaitlistStatus {
    ACTIVE = 'ACTIVE',
    NOTIFIED = 'NOTIFIED',
    CONFIRMED = 'CONFIRMED',
    CANCELLED = 'CANCELLED'
}

@Entity('waitlist_entries')
export class WaitlistEntry {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'match_id' })
    matchId: number;

    @Column({ name: 'user_id', nullable: true })
    userId: number;

    @Column()
    email: string;

    @Column({ name: 'slots_required' })
    slotsRequired: number;

    @Column({
        type: 'enum',
        enum: WaitlistStatus,
        default: WaitlistStatus.ACTIVE
    })
    status: WaitlistStatus;

    @Column({ name: 'last_notified_at', type: 'timestamp', nullable: true })
    lastNotifiedAt: Date;

    @Column({ type: 'jsonb', nullable: true })
    metadata: {
        name?: string;
        phone?: string;
        notes?: string;
        amount?: number;
        availableSlots?: number[];
        paymentOrderId?: string;
        orderCreatedAt?: string;
        confirmedSlots?: number;
        remainingSlotsNeeded?: number;
        lastConfirmedAt?: Date;
        fullyConfirmedAt?: Date;
    };

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}