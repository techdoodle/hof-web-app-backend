import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { PromoCode } from './promo-code.entity';
import { User } from '../../user/user.entity';

@Entity('promo_code_allowed_users')
@Index(['promoCodeId', 'userId'], { unique: true })
@Index(['promoCodeId'])
@Index(['userId'])
export class PromoCodeAllowedUser {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => PromoCode, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'promo_code_id' })
    promoCode: PromoCode;

    @Column({ name: 'promo_code_id' })
    promoCodeId: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'user_id' })
    userId: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

