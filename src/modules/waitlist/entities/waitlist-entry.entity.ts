import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum WaitlistStatus {
    ACTIVE = 'ACTIVE',
    NOTIFIED = 'NOTIFIED',
    CANCELLED = 'CANCELLED'
}

@Entity('waitlist_entries')
export class WaitlistEntry {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid', name: 'match_id' })
    matchId: string;

    @Column({ type: 'uuid', nullable: true })
    userId: string;

    @Column()
    email: string;

    @Column()
    slotsRequired: number;

    @Column({
        type: 'enum',
        enum: WaitlistStatus,
        default: WaitlistStatus.ACTIVE
    })
    status: WaitlistStatus;

    @Column({ type: 'timestamp', nullable: true })
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
    };

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}