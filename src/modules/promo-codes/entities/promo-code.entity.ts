import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { DiscountType } from '../../../common/enums/discount-type.enum';
import { User } from '../../user/user.entity';
import { PromoCodeUsage } from './promo-code-usage.entity';

@Entity('promo_codes')
@Index(['code'], { unique: true })
@Index(['isActive', 'validFrom', 'validUntil'])
export class PromoCode {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true })
    code: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({
        name: 'discount_type',
        type: 'enum',
        enum: DiscountType
    })
    discountType: DiscountType;

    @Column({ name: 'discount_value', type: 'decimal', precision: 10, scale: 2 })
    discountValue: number;

    @Column({ name: 'min_order_value', type: 'decimal', precision: 10, scale: 2, nullable: true })
    minOrderValue: number | null;

    @Column({ name: 'max_discount_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
    maxDiscountAmount: number | null;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @Column({ name: 'valid_from', type: 'timestamp' })
    validFrom: Date;

    @Column({ name: 'valid_until', type: 'timestamp', nullable: true })
    validUntil: Date | null;

    @Column({ name: 'max_uses', type: 'integer', nullable: true })
    maxUses: number | null;

    @Column({ name: 'max_uses_per_user', type: 'integer', nullable: true })
    maxUsesPerUser: number | null;

    @Column({ name: 'usage_count', type: 'integer', default: 0 })
    usageCount: number;

    @Column({ name: 'eligible_cities', type: 'jsonb', nullable: true })
    eligibleCities: number[] | null;

    @Column({ name: 'eligible_matches', type: 'jsonb', nullable: true })
    eligibleMatches: number[] | null;

    @Column({ name: 'first_time_users_only', type: 'boolean', default: false })
    firstTimeUsersOnly: boolean;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'created_by' })
    createdBy: User;

    @Column({ name: 'created_by', nullable: true })
    createdById: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @OneToMany(() => PromoCodeUsage, usage => usage.promoCode)
    usages: PromoCodeUsage[];
}

