import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
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
        private connection: Connection,
    ) { }

    /**
     * Test cron job - runs every minute for testing
     */
    @Cron('*/1 * * * *') // Every minute
    async testCronJob() {
        this.logger.log('🧪 Test cron job is running!');
    }

    /**
     * Clean up expired bookings every 2 minutes
     * This ensures slots are released even if the automatic cleanup fails
     */
    @Cron('*/2 * * * *') // Every 2 minutes
    async cleanupExpiredBookings() {
        try {
            this.logger.log('🧹 Cleanup expired bookings cron job is running!');
            const expiredTime = new Date(Date.now() - 7 * 60 * 1000); // 7 minutes ago (matches lock expiry)

            // Find bookings that are INITIATED or PAYMENT_PENDING and older than 7 minutes
            const expiredBookings = await this.bookingRepository
                .createQueryBuilder('booking')
                .where('booking.status IN (:...statuses)', {
                    statuses: [BookingStatus.INITIATED, BookingStatus.PAYMENT_PENDING]
                })
                .andWhere('booking.created_at < :expiredTime', { expiredTime })
                .getMany();

            this.logger.log(`Found ${expiredBookings.length} expired bookings to cleanup`);

            if (expiredBookings.length > 0) {
                this.logger.warn(`🧹 Cleaning up ${expiredBookings.length} expired bookings`);

                for (const booking of expiredBookings) {
                    await this.cleanupExpiredBooking(booking);
                }
            }

            // Also cleanup expired locks from matches table
            await this.cleanupExpiredLocks();
        } catch (error) {
            this.logger.error('Failed to cleanup expired bookings', error.stack);
        }
    }

    /**
     * Clean up a single expired booking and release its locked slots
     */
    private async cleanupExpiredBooking(booking: BookingEntity) {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Update booking status to PAYMENT_FAILED
            await queryRunner.manager.update(BookingEntity, booking.id, {
                status: BookingStatus.PAYMENT_FAILED
            });

            // Update booking slots status from PENDING_PAYMENT to CANCELLED
            await queryRunner.manager.update(
                BookingSlotEntity,
                { bookingId: booking.id },
                { status: BookingSlotStatus.CANCELLED }
            );

            // Release locked slots from matches table
            const result = await queryRunner.query(
                `SELECT locked_slots, version FROM matches WHERE match_id = $1 FOR UPDATE`,
                [booking.matchId]
            );

            if (result?.length) {
                const match = result[0];
                const lockedSlots = match.locked_slots || {};

                // Remove this booking's lock using the stored lock key
                const lockKey = booking.metadata?.lockKey;
                if (lockKey && lockedSlots[lockKey]) {
                    delete lockedSlots[lockKey];
                    this.logger.log(`🔓 Released lock ${lockKey} for booking ${booking.id}`);
                } else {
                    // Fallback: try to find and remove any lock that matches this booking's slots
                    const bookingSlots = await queryRunner.query(
                        `SELECT slot_number FROM booking_slots WHERE booking_id = $1`,
                        [booking.id]
                    );
                    const slotNumbers = bookingSlots.map(row => row.slot_number);

                    Object.keys(lockedSlots).forEach(key => {
                        const lockData = lockedSlots[key];
                        if (lockData.slots && lockData.slots.some(slot => slotNumbers.includes(slot))) {
                            delete lockedSlots[key];
                            this.logger.log(`🔓 Released fallback lock ${key} for booking ${booking.id}`);
                        }
                    });
                }

                // Update match with removed lock
                await queryRunner.query(
                    `UPDATE matches 
                     SET locked_slots = $1,
                         version = version + 1
                     WHERE match_id = $2 AND version = $3`,
                    [JSON.stringify(lockedSlots), booking.matchId, match.version]
                );
            }

            await queryRunner.commitTransaction();
            this.logger.log(`✅ Cleaned up expired booking ${booking.id}`);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`Failed to cleanup booking ${booking.id}`, error.stack);
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Clean up expired locks from matches table (safety net)
     */
    private async cleanupExpiredLocks() {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const currentTime = new Date();

            // Get all matches with locked slots
            const matches = await queryRunner.query(
                `SELECT match_id, locked_slots, version FROM matches 
                 WHERE locked_slots IS NOT NULL AND locked_slots != '{}'::jsonb
                 FOR UPDATE`
            );

            let totalCleanedLocks = 0;

            for (const match of matches) {
                const lockedSlots = match.locked_slots || {};
                let hasExpiredLocks = false;

                // Clean expired locks
                Object.entries(lockedSlots).forEach(([key, data]: [string, any]) => {
                    if (new Date(data.expires_at) < currentTime) {
                        delete lockedSlots[key];
                        hasExpiredLocks = true;
                        totalCleanedLocks++;
                        this.logger.log(`🔓 Cleaned expired lock ${key} from match ${match.match_id}`);
                    }
                });

                // Update match if locks were cleaned
                if (hasExpiredLocks) {
                    await queryRunner.query(
                        `UPDATE matches 
                         SET locked_slots = $1,
                             version = version + 1
                         WHERE match_id = $2 AND version = $3`,
                        [JSON.stringify(lockedSlots), match.match_id, match.version]
                    );
                }
            }

            if (totalCleanedLocks > 0) {
                this.logger.log(`🧹 Cleaned ${totalCleanedLocks} expired locks from matches table`);
            }
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Failed to cleanup expired locks', error.stack);
        } finally {
            await queryRunner.release();
        }
    }
}
