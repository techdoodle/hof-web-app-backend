import { Entity, PrimaryColumn, Column, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';

@Entity('push_subscriptions')
export class PushSubscriptionEntity {
    @PrimaryColumn('uuid')
    id: string;

    @Column()
    endpoint: string;

    @Column({ name: 'expiration_time', nullable: true, type: 'bigint' })
    expiration_time: number | null;

    @Column('jsonb')
    keys: {
        p256dh: string;
        auth: string;
    };

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'user_id' })
    user_id: number;

    @CreateDateColumn({ name: 'created_at' })
    created_at: Date;
}