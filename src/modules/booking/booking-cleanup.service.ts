import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingEntity } from './booking.entity';
import { BookingStatus } from '../../common/types/booking.types';
import { BookingSlotEntity, BookingSlotStatus } from './booking-slot.entity';

@Injectable()
export class BookingCleanupService {
    private readonly logger = new Logger(BookingCleanupService.name);

    constructor(
        @InjectRepository(BookingEntity)
        private bookingRepository: Repository<BookingEntity>,
        @InjectRepository(BookingSlotEntity)
        private bookingSlotRepository: Repository<BookingSlotEntity>,
    ) { }

    /**
     * Test cron job - runs every minute for testing
     */
    @Cron('*/1 * * * *') // Every minute
    async testCronJob() {
        this.logger.log('🧪 Test cron job is running!');
    }

    /**
     * Clean up expired bookings every 5 minutes
     * This ensures slots are released even if the automatic cleanup fails
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async cleanupExpiredBookings() {
        try {
            const expiredTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

            // Find bookings that are INITIATED and older than 10 minutes
            const expiredBookings = await this.bookingRepository
                .createQueryBuilder('booking')
                .where('booking.status = :status', { status: BookingStatus.INITIATED })
                .andWhere('booking.created_at < :expiredTime', { expiredTime })
                .getMany();

            if (expiredBookings.length > 0) {
                this.logger.warn(`Found ${expiredBookings.length} expired bookings to cleanup`);

                for (const booking of expiredBookings) {
                    // Cancel the booking
                    await this.bookingRepository.update(booking.id, {
                        status: BookingStatus.CANCELLED
                    });

                    // Cancel the slots
                    await this.bookingSlotRepository.update(
                        { bookingId: booking.id },
                        { status: BookingSlotStatus.CANCELLED }
                    );

                    this.logger.log(`Cleaned up expired booking ${booking.id}`);
                }
            }
        } catch (error) {
            this.logger.error('Failed to cleanup expired bookings', error.stack);
        }
    }
}
