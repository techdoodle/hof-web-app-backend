import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { BookingEntity } from './booking.entity';
import { BookingStatus } from '../../common/types/booking.types';
import { BookingSlotEntity, BookingSlotStatus } from './booking-slot.entity';
import { SlotAvailabilityMonitorService } from '../waitlist/slot-availability-monitor.service';
import { RazorpayService } from '../payment/razorpay.service';
import { MatchesService } from '../matches/matches.service';
import { RefundService } from '../payment/refund.service';
import { MatchParticipant } from '../match-participants/match-participants.entity';

@Injectable()
export class BookingCleanupService {
    private readonly logger = new Logger(BookingCleanupService.name);
    private instanceId: string;

    constructor(
        @InjectRepository(BookingEntity)
        private bookingRepository: Repository<BookingEntity>,
        @InjectRepository(BookingSlotEntity)
        private bookingSlotRepository: Repository<BookingSlotEntity>,
        @InjectRepository(MatchParticipant)
        private matchParticipantRepository: Repository<MatchParticipant>,
        private connection: Connection,
        private slotAvailabilityMonitor: SlotAvailabilityMonitorService,
        private razorpayService: RazorpayService,
        @Inject(forwardRef(() => MatchesService))
        private matchesService: MatchesService,
        private refundService: RefundService,
    ) {
        this.instanceId = `${process.env.NODE_ENV || 'local'}-${process.pid}-${Date.now()}`;
        this.logger.log(`🏷️ BookingCleanupService initialized [Instance: ${this.instanceId}]`);
    }

    /**
     * Test cron job - runs every minute for testing
     */
    @Cron('*/1 * * * *') // Every minute
    async testCronJob() {
        this.logger.log(`🧪 Test cron job is running! [Instance: ${this.instanceId}]`);
    }

    /**
     * Clean up expired bookings every 2 minutes
     * This ensures slots are released even if the automatic cleanup fails
     * 
     * ✅ COORDINATION: Skips bookings that reconciliation might be processing (7-22 min window)
     * ✅ STATUS CHECKS: Only processes INITIATED and PAYMENT_PENDING bookings
     * ✅ DISTRIBUTED LOCK: Prevents multiple instances from running simultaneously
     */
    @Cron('*/2 * * * *') // Every 2 minutes
    async cleanupExpiredBookings() {
        try {
            const startTime = new Date();
            this.logger.log(`🧹 Cleanup expired bookings cron job is running! [Instance: ${this.instanceId}, Time: ${startTime.toISOString()}]`);

            // ✅ DISTRIBUTED LOCK: Prevent multiple instances from running cleanup simultaneously
            const lockKey = `cleanup_expired_bookings_${Math.floor(startTime.getTime() / (2 * 60 * 1000))}`;
            const lockAcquired = await this.acquireDistributedLock(lockKey, 120); // 2 minutes

            if (!lockAcquired) {
                this.logger.log(`⏭️ Another instance is handling cleanup. Skipping. [Instance: ${this.instanceId}]`);
                return;
            }

            this.logger.log(`🔒 Cleanup lock acquired. Proceeding. [Instance: ${this.instanceId}]`);

            // ✅ COORDINATION: Skip bookings in the 7-22 minute window (reconciliation handles these)
            // Only process bookings older than 22 minutes to avoid conflicts with reconciliation
            // Also process bookings between 7-22 minutes ONLY if they don't have Razorpay orders (reconciliation won't touch them)
            const expiredBookings = await this.connection.query(
                `SELECT id, status, created_at, metadata->>'razorpayOrderId' as razorpay_order_id
                 FROM bookings 
                 WHERE status IN ('INITIATED', 'PAYMENT_PENDING')
                   AND created_at < NOW() - INTERVAL '7 minutes'
                   AND (
                       -- Bookings older than 22 minutes (reconciliation window passed)
                       created_at < NOW() - INTERVAL '22 minutes'
                       OR
                       -- Bookings 7-22 minutes old but NO Razorpay order (reconciliation won't process)
                       (created_at >= NOW() - INTERVAL '22 minutes' 
                        AND created_at < NOW() - INTERVAL '7 minutes'
                        AND (metadata->>'razorpayOrderId' IS NULL OR metadata->>'razorpayOrderId' = ''))
                   )
                 ORDER BY created_at ASC
                 LIMIT 50`
            );

            this.logger.log(`📋 Found ${expiredBookings.length} expired bookings to cleanup (excluding reconciliation window)`);
            if (expiredBookings.length > 0) {
                this.logger.log(`📋 Bookings to process:`, expiredBookings.map(b => ({
                    id: b.id,
                    status: b.status,
                    hasRazorpayOrder: !!b.razorpay_order_id
                })));
            }

            if (expiredBookings.length > 0) {
                this.logger.warn(`🧹 Cleaning up ${expiredBookings.length} expired bookings`);

                for (const bookingRow of expiredBookings) {
                    try {
                        // ✅ STATUS CHECK: Re-fetch booking to ensure status hasn't changed
                        const booking = await this.bookingRepository.findOne({
                            where: { id: bookingRow.id },
                            relations: ['slots']
                        });

                        if (!booking) {
                            this.logger.warn(`⚠️ Booking ${bookingRow.id} not found in repository`);
                            continue;
                        }

                        // ✅ STATUS CHECK: Skip if status changed (might be processed by reconciliation)
                        if (booking.status !== BookingStatus.INITIATED &&
                            booking.status !== BookingStatus.PAYMENT_PENDING) {
                            this.logger.log(
                                `⏭️ Skipping booking ${booking.id} - status changed to ${booking.status} ` +
                                `(might be processed by reconciliation)`
                            );
                            continue;
                        }

                        // ✅ STATUS CHECK: Skip if booking is in reconciliation window and has Razorpay order
                        const bookingAge = (Date.now() - new Date(booking.createdAt).getTime()) / (1000 * 60);
                        if (bookingAge >= 7 && bookingAge <= 22 && booking.metadata?.razorpayOrderId) {
                            this.logger.log(
                                `⏭️ Skipping booking ${booking.id} - in reconciliation window (${Math.round(bookingAge)} min old) ` +
                                `with Razorpay order ${booking.metadata.razorpayOrderId}`
                            );
                            continue;
                        }

                        this.logger.log(`🔄 Processing booking ${booking.id} (status: ${booking.status})`);
                        await this.cleanupExpiredBooking(booking);
                        this.logger.log(`✅ Completed booking ${booking.id}`);
                    } catch (error) {
                        this.logger.error(`❌ Failed to cleanup booking ${bookingRow.id}: ${error.message}`, error.stack);
                    }
                }
            } else {
                this.logger.log(`ℹ️ No expired bookings found`);
            }

            // Also cleanup expired locks from matches table
            await this.cleanupExpiredLocks();

            // Release lock
            await this.releaseDistributedLock(lockKey);

        } catch (error) {
            this.logger.error(`❌ Failed to cleanup expired bookings [Instance: ${this.instanceId}]`, error.stack);
        }
    }


    /**
     * Reconcile payments - check for paid Razorpay orders that weren't confirmed
     * Runs every 5 minutes (different from cleanup which runs every 2 minutes)
     * This handles cases where webhooks fail or payment succeeds but booking wasn't confirmed
     * 
     * NOTE: We always check Razorpay API directly because razorpay_orders.status 
     * never updates from 'CREATED' to 'PAID' in our database
     */
    @Cron('*/5 * * * *') // Every 5 minutes - different schedule to avoid conflicts
    async reconcilePayments() {
        try {
            const startTime = new Date();
            this.logger.log(`🔄 Payment reconciliation cron job is running! [Instance: ${this.instanceId}, Time: ${startTime.toISOString()}]`);

            // ✅ Use distributed lock to prevent conflicts with cleanup cron
            const lockKey = `reconcile_payments_${Math.floor(startTime.getTime() / (5 * 60 * 1000))}`;
            const lockAcquired = await this.acquireDistributedLock(lockKey, 300); // 5 minutes

            if (!lockAcquired) {
                this.logger.log(`⏭️ Another instance is handling reconciliation. Skipping. [Instance: ${this.instanceId}]`);
                return;
            }

            this.logger.log(`🔒 Reconciliation lock acquired. Proceeding. [Instance: ${this.instanceId}]`);

            // ✅ Find bookings with Razorpay orders in the 7-17 minute window
            // This checks expired bookings (older than 7 min) but not too old (within 17 min)
            // Gives a 10-minute window for reconciliation
            const query = `
                SELECT 
                    b.id AS booking_id,
                    b.booking_reference,
                    b.match_id,
                    b.status AS booking_status,
                    b.total_slots,
                    b.metadata->>'razorpayOrderId' AS razorpay_order_id,
                    rpo.status AS razorpay_order_status_db,
                    rpo.amount,
                    rpo.created_at AS order_created_at,
                    b.created_at AS booking_created_at,
                    b.updated_at AS booking_updated_at,
                    EXTRACT(EPOCH FROM (NOW() - b.created_at))/60 as minutes_old
                FROM bookings b
                INNER JOIN razorpay_orders rpo 
                    ON b.metadata->>'razorpayOrderId' = rpo.razorpay_order_id
                WHERE b.status NOT IN ('CONFIRMED', 'CANCELLED', 'PARTIALLY_CANCELLED', 'PAYMENT_FAILED_VERIFIED')
                AND b.metadata->>'razorpayOrderId' IS NOT NULL
                AND b.created_at < NOW() - INTERVAL '7 minutes'   -- Older than 7 minutes (expired)
                AND b.created_at > NOW() - INTERVAL '22 minutes'  -- Not older than 22 minutes (15 mins window)
                ORDER BY b.created_at DESC
            `;

            const bookingsToCheck = await this.connection.query(query);

            this.logger.log(`📊 Found ${bookingsToCheck.length} bookings with Razorpay orders to verify`);

            if (bookingsToCheck.length > 0) {
                let reconciledCount = 0;
                let skippedCount = 0;
                let errorCount = 0;
                let paidCount = 0;

                for (const bookingData of bookingsToCheck) {
                    try {
                        // ✅ STATUS CHECK: Re-fetch booking to ensure status hasn't changed (might be processed by cleanup)
                        const currentBooking = await this.bookingRepository.findOne({
                            where: { id: bookingData.booking_id }
                        });

                        if (!currentBooking) {
                            this.logger.log(`⏭️ Skipping booking ${bookingData.booking_id} - not found`);
                            skippedCount++;
                            continue;
                        }

                        // ✅ STATUS CHECK: Skip if booking is in final state (might have been processed)
                        if (currentBooking.status === BookingStatus.CONFIRMED ||
                            currentBooking.status === BookingStatus.CANCELLED ||
                            currentBooking.status === BookingStatus.PARTIALLY_CANCELLED ||
                            currentBooking.status === BookingStatus.PAYMENT_FAILED_VERIFIED) {
                            this.logger.log(
                                `⏭️ Skipping booking ${bookingData.booking_id} - status is ${currentBooking.status} ` +
                                `(might have been processed by cleanup)`
                            );
                            skippedCount++;
                            continue;
                        }

                        // ✅ Always verify with Razorpay API (don't trust database status)
                        const razorpayOrderId = bookingData.razorpay_order_id;

                        if (!razorpayOrderId) {
                            this.logger.log(`⏭️ Skipping booking ${bookingData.booking_id} - no Razorpay order ID`);
                            skippedCount++;
                            continue;
                        }

                        // Check Razorpay API for actual payment status
                        let razorpayOrder: any;
                        try {
                            razorpayOrder = await this.razorpayService.getOrderDetails(razorpayOrderId);
                            this.logger.log(
                                `📡 Razorpay API: Order ${razorpayOrderId} status=${razorpayOrder.status} ` +
                                `(DB status: ${bookingData.razorpay_order_status_db})`
                            );
                        } catch (error) {
                            this.logger.warn(
                                `⚠️ Could not verify order ${razorpayOrderId} with Razorpay API: ${error.message}`
                            );
                            errorCount++;
                            continue;
                        }

                        // Check if payment is actually paid
                        const isPaid = razorpayOrder.status?.toLowerCase() === 'paid' ||
                            razorpayOrder.status?.toLowerCase() === 'captured';

                        // Scenario 1: PAYMENT_FAILED booking with non-paid Razorpay status
                        if (bookingData.booking_status === BookingStatus.PAYMENT_FAILED && !isPaid) {
                            this.logger.log(
                                `✅ Verifying PAYMENT_FAILED booking ${bookingData.booking_id} - ` +
                                `Razorpay confirms not paid (status: ${razorpayOrder.status})`
                            );
                            const verified = await this.verifyPaymentFailed(bookingData, razorpayOrder);
                            if (verified) {
                                reconciledCount++;
                            } else {
                                skippedCount++;
                            }
                        }
                        // Scenario 2: Any booking status with paid Razorpay
                        else if (isPaid) {
                            paidCount++;
                            this.logger.log(
                                `💰 Found PAID order ${razorpayOrderId} for booking ${bookingData.booking_id} ` +
                                `(booking status: ${bookingData.booking_status}, reference: ${bookingData.booking_reference})`
                            );

                            // Reconcile this booking (check slots, confirm or refund)
                            const reconciled = await this.reconcilePaidBooking(bookingData, razorpayOrder);
                            if (reconciled) {
                                reconciledCount++;
                            } else {
                                skippedCount++;
                            }
                        } else {
                            this.logger.log(
                                `⏭️ Order ${razorpayOrderId} not paid yet (status: ${razorpayOrder.status}). Skipping.`
                            );
                            skippedCount++;
                        }
                    } catch (error) {
                        errorCount++;
                        this.logger.error(
                            `❌ Failed to process booking ${bookingData.booking_id}: ${error.message}`,
                            error.stack
                        );
                    }
                }

                this.logger.log(
                    `✅ Reconciliation complete: ${paidCount} paid orders found, ` +
                    `${reconciledCount} reconciled, ${skippedCount} skipped, ${errorCount} errors`
                );
            } else {
                this.logger.log(`✅ No bookings need reconciliation`);
            }

            // Release lock
            await this.releaseDistributedLock(lockKey);

        } catch (error) {
            this.logger.error(`❌ Payment reconciliation failed [Instance: ${this.instanceId}]`, error.stack);
        }
    }

    /**
     * Verify PAYMENT_FAILED booking - update to PAYMENT_FAILED_VERIFIED if Razorpay confirms not paid
     * Scenario 1: Booking status is PAYMENT_FAILED and Razorpay confirms payment is not paid/captured
     */
    private async verifyPaymentFailed(bookingData: any, razorpayOrder: any): Promise<boolean> {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const bookingId = bookingData.booking_id;

            this.logger.log(
                `🔄 Verifying PAYMENT_FAILED booking ${bookingId} - ` +
                `Razorpay status: ${razorpayOrder.status}`
            );

            // Update booking status to PAYMENT_FAILED_VERIFIED
            await queryRunner.query(
                `UPDATE bookings 
                 SET status = $1, updated_at = NOW()
                 WHERE id = $2`,
                [BookingStatus.PAYMENT_FAILED_VERIFIED, bookingId]
            );

            await queryRunner.commitTransaction();
            this.logger.log(
                `✅ Updated booking ${bookingId} to PAYMENT_FAILED_VERIFIED ` +
                `(Razorpay confirmed payment not successful)`
            );

            return true;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(
                `❌ Failed to verify PAYMENT_FAILED booking ${bookingData.booking_id}: ${error.message}`,
                error.stack
            );
            return false;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Reconcile a single paid booking - confirm it if payment succeeded and slots available
     * If slots not available, process refund
     * Scenario 2: Booking status is PAYMENT_FAILED/INITIATED/etc and Razorpay confirms payment is paid
     * @param bookingData - Booking data from database query
     * @param razorpayOrder - Order details from Razorpay API (source of truth)
     */
    private async reconcilePaidBooking(bookingData: any, razorpayOrder: any): Promise<boolean> {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const bookingId = bookingData.booking_id;
            const razorpayOrderId = bookingData.razorpay_order_id;

            this.logger.log(
                `🔄 Reconciling booking ${bookingId} with paid order ${razorpayOrderId} ` +
                `[Current booking status: ${bookingData.booking_status}, Razorpay status: ${razorpayOrder.status}]`
            );

            // Get the booking with all details
            const booking = await this.bookingRepository.findOne({
                where: { id: bookingId },
                relations: ['slots']
            });

            if (!booking) {
                this.logger.warn(`⚠️ Booking ${bookingId} not found`);
                await queryRunner.rollbackTransaction();
                return false;
            }

            // ✅ STATUS CHECK: Check if booking is already in final state
            if (booking.status === BookingStatus.CONFIRMED) {
                this.logger.log(`✅ Booking ${bookingId} already confirmed`);
                await queryRunner.rollbackTransaction();
                return false;
            }

            if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.PARTIALLY_CANCELLED) {
                this.logger.warn(
                    `⚠️ Booking ${bookingId} is CANCELLED or PARTIALLY_CANCELLED and payment is PAID. Skipping...`
                );
                await queryRunner.rollbackTransaction();
                return false;
            }

            // ✅ STATUS CHECK: Skip if booking is PAYMENT_FAILED_VERIFIED (already verified)
            if (booking.status === BookingStatus.PAYMENT_FAILED_VERIFIED) {
                this.logger.log(`✅ Booking ${bookingId} already verified as PAYMENT_FAILED_VERIFIED`);
                await queryRunner.rollbackTransaction();
                return false;
            }

            // ✅ COORDINATION: Double-check booking age to ensure it's in reconciliation window
            // Use the minutes_old calculated in SQL (UTC) instead of recalculating in JavaScript
            const bookingAge = bookingData.minutes_old;
            if (bookingAge < 7 || bookingAge > 22) {
                this.logger.log(
                    `⏭️ Skipping booking ${bookingId} - outside reconciliation window ` +
                    `(${Math.round(bookingAge)} min old, should be 7-22 min)`
                );
                await queryRunner.rollbackTransaction();
                return false;
            }

            // ✅ Check slot availability before confirming
            const slotAvailability = await this.matchesService.checkSlotAvailability(
                booking.matchId,
                booking.totalSlots
            );

            this.logger.log(
                `📊 Slot availability check for booking ${bookingId}: ` +
                `requested=${booking.totalSlots}, available=${slotAvailability.availableSlots}`
            );

            // If slots not available, process refund
            if (slotAvailability.availableSlots < booking.totalSlots) {
                this.logger.warn(
                    `⚠️ Insufficient slots available for booking ${bookingId}. ` +
                    `Requested: ${booking.totalSlots}, Available: ${slotAvailability.availableSlots}. ` +
                    `Processing refund.`
                );

                // Get payment ID from booking metadata
                // Payment ID should be stored in metadata when payment callback is received
                const paymentId = booking.metadata?.razorpayPaymentId ||
                    booking.metadata?.paymentId ||
                    bookingData.metadata?.razorpayPaymentId;

                if (!paymentId) {
                    this.logger.error(
                        `❌ Cannot process refund for booking ${bookingId} - no payment ID found in metadata. ` +
                        `Order ID: ${razorpayOrderId}. ` +
                        `This booking may need manual refund processing.`
                    );
                    // Still cancel the booking even if we can't refund automatically
                    await queryRunner.query(
                        `UPDATE bookings 
                         SET status = $1, updated_at = NOW()
                         WHERE id = $2`,
                        [BookingStatus.CANCELLED, bookingId]
                    );
                    await queryRunner.manager.update(
                        BookingSlotEntity,
                        { bookingId: bookingId },
                        { status: BookingSlotStatus.CANCELLED }
                    );
                    await queryRunner.commitTransaction();
                    this.logger.warn(
                        `⚠️ Booking ${bookingId} cancelled but refund requires manual processing ` +
                        `(no payment ID in metadata)`
                    );
                    return false;
                }

                // Process refund
                const refund = await this.refundService.initiateRefund({
                    bookingId: bookingId.toString(),
                    amount: bookingData.amount,
                    reason: `Insufficient slots available. Requested: ${booking.totalSlots}, Available: ${slotAvailability.availableSlots}`,
                    razorpayPaymentId: paymentId,
                    metadata: {
                        reconciliationRefund: true,
                        requestedSlots: booking.totalSlots,
                        availableSlots: slotAvailability.availableSlots,
                        refundedAt: new Date()
                    }
                }, queryRunner);

                // Update booking status
                await queryRunner.query(
                    `UPDATE bookings 
                     SET status = $1, updated_at = NOW()
                     WHERE id = $2`,
                    [BookingStatus.CANCELLED, bookingId]
                );

                // Cancel booking slots
                await queryRunner.manager.update(
                    BookingSlotEntity,
                    { bookingId: bookingId },
                    { status: BookingSlotStatus.CANCELLED }
                );

                await queryRunner.commitTransaction();
                this.logger.log(
                    `✅ Refund initiated for booking ${bookingId} due to insufficient slots ` +
                    `(amount: ₹${bookingData.amount}, refund ID: ${refund.id})`
                );
                // Note: Email notification is sent by RefundService after refund initiation

                return false; // Return false since we didn't confirm, we refunded
            }

            // ✅ Slots are available - proceed with confirmation
            this.logger.log(`✅ Sufficient slots available. Confirming booking ${bookingId}`);

            // Get available slot numbers
            const availableSlotNumbers = await this.getAvailableSlotNumbers(
                booking.matchId,
                booking.totalSlots,
                queryRunner
            );

            if (availableSlotNumbers.length < booking.totalSlots) {
                this.logger.error(
                    `❌ Race condition: Slots became unavailable during reconciliation for booking ${bookingId}`
                );
                await queryRunner.rollbackTransaction();
                return false;
            }

            // ✅ Update booking to CONFIRMED
            await queryRunner.query(
                `UPDATE bookings 
                 SET status = $1, payment_status = $2, updated_at = NOW()
                 WHERE id = $3`,
                [BookingStatus.CONFIRMED, 'COMPLETED', bookingId]
            );

            // ✅ Update booking slots: assign slot numbers and set to ACTIVE
            const bookingSlots = await queryRunner.query(
                `SELECT id, slot_number FROM booking_slots WHERE booking_id = $1 ORDER BY id`,
                [bookingId]
            );

            if (bookingSlots.length !== booking.totalSlots) {
                this.logger.error(
                    `❌ Slot count mismatch for booking ${bookingId}: ` +
                    `expected ${booking.totalSlots}, found ${bookingSlots.length}`
                );
                await queryRunner.rollbackTransaction();
                return false;
            }

            // Update each slot with assigned slot number and ACTIVE status
            for (let i = 0; i < bookingSlots.length; i++) {
                await queryRunner.query(
                    `UPDATE booking_slots 
                     SET slot_number = $1, status = $2, updated_at = NOW()
                     WHERE id = $3`,
                    [availableSlotNumbers[i], BookingSlotStatus.ACTIVE, bookingSlots[i].id]
                );
            }

            // ✅ Increment booked_slots in matches table
            await queryRunner.query(
                `UPDATE matches 
                 SET booked_slots = booked_slots + $1
                 WHERE match_id = $2`,
                [booking.totalSlots, booking.matchId]
            );

            // ✅ Create match participants for each unique player in activated slots
            try {
                const activatedSlots: Array<{ slot_number: number; player_id: number }> = await queryRunner.query(
                    `SELECT slot_number, player_id FROM booking_slots WHERE booking_id = $1 AND status = $2`,
                    [bookingId, BookingSlotStatus.ACTIVE]
                );
                const uniquePlayerIds = Array.from(new Set(activatedSlots.map(s => s.player_id).filter(Boolean)));

                for (const playerId of uniquePlayerIds) {
                    if (!playerId) continue;
                    const existing = await queryRunner.manager.findOne(MatchParticipant, {
                        where: { match: { matchId: booking.matchId }, user: { id: playerId } },
                    });
                    if (!existing) {
                        const participant = queryRunner.manager.create(MatchParticipant, {
                            match: { matchId: booking.matchId },
                            user: { id: playerId },
                            teamName: 'Unassigned',
                        });
                        await queryRunner.manager.save(MatchParticipant, participant);
                        this.logger.log(`✅ Created match participant for user ${playerId} in match ${booking.matchId}`);
                    }
                }
            } catch (e) {
                this.logger.warn(`⚠️ Participant creation failed for booking ${bookingId}: ${e?.message || e}`);
                // Don't fail the transaction for this
            }

            // ✅ Release locked slots
            const lockResult = await queryRunner.query(
                `SELECT locked_slots, version FROM matches WHERE match_id = $1 FOR UPDATE`,
                [booking.matchId]
            );

            if (lockResult?.length) {
                const match = lockResult[0];
                const lockedSlots = match.locked_slots || {};
                const lockKey = booking.metadata?.lockKey;

                if (lockKey && lockedSlots[lockKey]) {
                    delete lockedSlots[lockKey];
                    this.logger.log(`🔓 Released lock ${lockKey} for booking ${bookingId}`);
                }

                await queryRunner.query(
                    `UPDATE matches 
                     SET locked_slots = $1, version = version + 1
                     WHERE match_id = $2 AND version = $3`,
                    [JSON.stringify(lockedSlots), booking.matchId, match.version]
                );
            }

            // ✅ Update razorpay_orders status to PAID (optional, for consistency)
            try {
                await queryRunner.query(
                    `UPDATE razorpay_orders 
                     SET status = 'PAID', updated_at = NOW()
                     WHERE razorpay_order_id = $1`,
                    [razorpayOrderId]
                );
                this.logger.log(`✅ Updated razorpay_orders status to PAID for order ${razorpayOrderId}`);
            } catch (error) {
                this.logger.warn(`⚠️ Could not update razorpay_orders status: ${error.message}`);
                // Don't fail the transaction for this
            }

            await queryRunner.commitTransaction();
            this.logger.log(
                `✅ Successfully reconciled and confirmed booking ${bookingId} ` +
                `(order: ${razorpayOrderId}, amount: ₹${bookingData.amount}, slots: ${availableSlotNumbers.join(', ')})`
            );

            // Notify waitlist if needed
            await this.slotAvailabilityMonitor.checkAndNotifyAvailableSlots(booking.matchId);

            return true;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(
                `❌ Failed to reconcile booking ${bookingData.booking_id}: ${error.message}`,
                error.stack
            );
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get available slot numbers for a match
     * Helper method to find available slots for booking allocation
     */
    private async getAvailableSlotNumbers(
        matchId: number,
        requestedSlots: number,
        queryRunner: any
    ): Promise<number[]> {
        // Get all currently active slot numbers for this match
        const activeSlots = await queryRunner.query(
            `SELECT bs.slot_number 
             FROM booking_slots bs 
             JOIN bookings b ON bs.booking_id = b.id 
             WHERE b.match_id = $1 AND bs.status = $2`,
            [matchId, BookingSlotStatus.ACTIVE]
        );

        const bookedSlotNumbers = activeSlots.map(row => row.slot_number);

        // Get match capacity
        const match = await queryRunner.query(
            `SELECT player_capacity FROM matches WHERE match_id = $1`,
            [matchId]
        );

        const totalCapacity = match[0]?.player_capacity || 0;

        // Generate all possible slot numbers
        const allSlots = Array.from({ length: totalCapacity }, (_, i) => i + 1);

        // Find available slots
        const availableSlots = allSlots.filter(slot => !bookedSlotNumbers.includes(slot));

        // Return only the requested number of slots
        return availableSlots.slice(0, requestedSlots);
    }

    /**
     * Acquire distributed lock using database
     * Prevents multiple instances from running the same job simultaneously
     */
    private async acquireDistributedLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();

        try {
            // Try to insert/update lock record
            const result = await queryRunner.query(
                `INSERT INTO distributed_locks (lock_key, instance_id, expires_at, created_at)
                 VALUES ($1, $2, NOW() + INTERVAL '${ttlSeconds} seconds', NOW())
                 ON CONFLICT (lock_key) 
                 DO UPDATE SET 
                     instance_id = CASE 
                         WHEN distributed_locks.expires_at < NOW() THEN $2
                         ELSE distributed_locks.instance_id
                     END,
                     expires_at = CASE 
                         WHEN distributed_locks.expires_at < NOW() THEN NOW() + INTERVAL '${ttlSeconds} seconds'
                         ELSE distributed_locks.expires_at
                     END
                 RETURNING instance_id`,
                [lockKey, this.instanceId]
            );

            const gotLock = result[0]?.instance_id === this.instanceId;

            if (gotLock) {
                this.logger.log(`🔒 Acquired lock: ${lockKey} [Instance: ${this.instanceId}]`);
            }

            return gotLock;
        } catch (error) {
            // If table doesn't exist, create it and retry
            if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
                this.logger.warn(`⚠️ distributed_locks table not found. Creating it...`);
                await this.createDistributedLocksTable(queryRunner);
                // Retry once
                return this.acquireDistributedLock(lockKey, ttlSeconds);
            }
            this.logger.error(`Failed to acquire lock: ${error.message}`);
            return false;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Release distributed lock
     */
    private async releaseDistributedLock(lockKey: string): Promise<void> {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();

        try {
            await queryRunner.query(
                `DELETE FROM distributed_locks 
                 WHERE lock_key = $1 AND instance_id = $2`,
                [lockKey, this.instanceId]
            );
            this.logger.log(`🔓 Released lock: ${lockKey} [Instance: ${this.instanceId}]`);
        } catch (error) {
            this.logger.error(`Failed to release lock: ${error.message}`);
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Create distributed_locks table if it doesn't exist
     */
    private async createDistributedLocksTable(queryRunner: any): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS distributed_locks (
                lock_key VARCHAR(255) PRIMARY KEY,
                instance_id VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            
            CREATE INDEX IF NOT EXISTS idx_distributed_locks_expires_at 
            ON distributed_locks(expires_at);
        `);
    }

    /**
     * Clean up a single expired booking and release its locked slots
     */
    private async cleanupExpiredBooking(booking: BookingEntity) {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {

            const razorpayOrderId = booking.metadata?.razorpayOrderId;
            if (razorpayOrderId) {
                try {
                    // Fetch order details directly from Razorpay API (source of truth)
                    const razorpayOrder = await this.razorpayService.getOrderDetails(razorpayOrderId);
                    this.logger.log(
                        `📡 Razorpay API check for booking ${booking.id}: ` +
                        `order ${razorpayOrderId} status=${razorpayOrder.status}`
                    );

                    // Check if payment was captured (status will be 'paid' if payment succeeded)
                    // Razorpay order status can be: created, attempted, paid, failed
                    if (razorpayOrder.status?.toLowerCase() === 'paid' ||
                        razorpayOrder.status?.toLowerCase() === 'captured') {
                        this.logger.warn(
                            `⚠️ Booking ${booking.id} has PAID Razorpay order ${razorpayOrderId} ` +
                            `(amount: ₹${razorpayOrder.amount / 100}) but booking status is ${booking.status}. ` +
                            `Skipping cleanup - payment reconciliation will handle this!`
                        );
                        await queryRunner.rollbackTransaction();
                        return; // Don't cancel if payment succeeded
                    }

                    // Log order status for debugging
                    this.logger.log(
                        `ℹ️ Booking ${booking.id} - Razorpay order ${razorpayOrderId} status: ${razorpayOrder.status}. ` +
                        `Proceeding with cleanup.`
                    );
                } catch (error) {
                    // If order not found or API error, log and proceed with cleanup
                    this.logger.warn(
                        `⚠️ Could not verify Razorpay order ${razorpayOrderId} for booking ${booking.id}: ${error.message}. ` +
                        `Proceeding with cleanup.`
                    );
                    // Continue with cleanup if we can't verify
                }
            } else {
                // No Razorpay order ID in metadata - safe to cleanup
                this.logger.log(
                    `ℹ️ Booking ${booking.id} has no Razorpay order ID in metadata. Proceeding with cleanup.`
                );
            }


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

            // Check for available slots and notify waitlist users
            await this.slotAvailabilityMonitor.checkAndNotifyAvailableSlots(booking.matchId);

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
