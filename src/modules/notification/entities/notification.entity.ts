import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { NotificationType } from '../interfaces/notification.interface';

@Entity('notifications')
export class Notification {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 50 })
    type: NotificationType;

    @Column({ name: 'recipient_email' })
    recipientEmail: string;

    @Column({ name: 'recipient_name', nullable: true })
    recipientName?: string;

    @Column({ type: 'varchar', length: 20 })
    status: 'SENT' | 'FAILED';

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
