import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { RefundStatus } from '../../common/types/booking.types';

@Entity('refunds')
export class RefundEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    bookingId: string;

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

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
