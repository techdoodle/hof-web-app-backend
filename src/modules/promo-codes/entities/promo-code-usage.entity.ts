import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { PromoCode } from './promo-code.entity';
import { User } from '../../user/user.entity';
import { BookingEntity } from '../../booking/booking.entity';

@Entity('promo_code_usage')
@Index(['promoCodeId', 'userId'])
@Index(['bookingId'], { unique: true })
export class PromoCodeUsage {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => PromoCode)
    @JoinColumn({ name: 'promo_code_id' })
    promoCode: PromoCode;

    @Column({ name: 'promo_code_id' })
    promoCodeId: number;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'user_id' })
    user: User | null;

    @Column({ name: 'user_id', nullable: true })
    userId: number | null;

    @ManyToOne(() => BookingEntity)
    @JoinColumn({ name: 'booking_id' })
    booking: BookingEntity;

    @Column({ name: 'booking_id' })
    bookingId: number;

    @Column({ name: 'discount_amount', type: 'decimal', precision: 10, scale: 2 })
    discountAmount: number;

    @Column({ name: 'original_amount', type: 'decimal', precision: 10, scale: 2 })
    originalAmount: number;

    @Column({ name: 'final_amount', type: 'decimal', precision: 10, scale: 2 })
    finalAmount: number;

    @CreateDateColumn({ name: 'used_at' })
    usedAt: Date;
}

