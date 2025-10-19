import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection, LessThan } from 'typeorm';
import { WaitlistEntry, WaitlistStatus } from './entities/waitlist-entry.entity';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/interfaces/notification.interface';
import { PaymentService } from '../payment/payment.service';
import { BookingService } from '../booking/booking.service';

@Injectable()
export class WaitlistService {
    private readonly logger = new Logger(WaitlistService.name);

    constructor(
        @InjectRepository(WaitlistEntry)
        private waitlistRepository: Repository<WaitlistEntry>,
        private notificationService: NotificationService,
        private paymentService: PaymentService,
        private bookingService: BookingService,
        private connection: Connection
    ) { }

    async joinWaitlist(matchId: string, email: string, slotsRequired: number, metadata?: any) {
        const existing = await this.waitlistRepository.findOne({
            where: {
                matchId,
                email,
                status: WaitlistStatus.ACTIVE
            }
        });

        if (existing) {
            throw new BadRequestException('Already in waitlist for this match');
        }

        const entry = this.waitlistRepository.create({
            matchId,
            email,
            slotsRequired,
            metadata,
            status: WaitlistStatus.ACTIVE
        });

        return this.waitlistRepository.save(entry);
    }

    async notifySlotAvailability(matchId: string, availableSlots: number[], slotPrice: number) {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Get all active waitlist entries for this match
            const entries = await this.waitlistRepository.find({
                where: {
                    matchId,
                    status: WaitlistStatus.ACTIVE,
                    slotsRequired: LessThan(availableSlots.length + 1)
                }
            });

            for (const entry of entries) {
                try {
                    const allocatedSlots = availableSlots.slice(0, entry.slotsRequired);
                    const amount = entry.slotsRequired * slotPrice;

                    await this.notificationService.sendNotification({
                        type: NotificationType.WAITLIST_NOTIFICATION,
                        recipient: {
                            email: entry.email,
                            name: entry.metadata?.name
                        },
                        templateData: {
                            matchId,
                            availableSlots: allocatedSlots,
                            slotsRequired: entry.slotsRequired,
                            amount,
                            bookingLink: `${process.env.FRONTEND_URL}/waitlist/confirm?id=${entry.id}&slots=${allocatedSlots.join(',')}`,
                            validityMinutes: 15
                        }
                    });

                    entry.status = WaitlistStatus.NOTIFIED;
                    entry.lastNotifiedAt = new Date();
                    entry.metadata = {
                        ...entry.metadata,
                        amount,
                        availableSlots: allocatedSlots
                    };
                    await queryRunner.manager.save(entry);

                    availableSlots = availableSlots.slice(entry.slotsRequired);
                    if (availableSlots.length === 0) break;

                } catch (error) {
                    this.logger.error(
                        `Failed to notify waitlist entry ${entry.id}: ${error.message}`,
                        error.stack
                    );
                }
            }

            await queryRunner.commitTransaction();
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async initiateWaitlistBooking(waitlistId: string) {
        const entry = await this.waitlistRepository.findOne({
            where: {
                id: waitlistId,
                status: WaitlistStatus.NOTIFIED
            }
        });

        if (!entry) {
            throw new BadRequestException('Invalid waitlist entry or already processed');
        }

        if (!entry.metadata?.availableSlots?.length) {
            throw new BadRequestException('No slots allocated for this entry');
        }

        if (!entry.metadata.amount) {
            throw new BadRequestException('Amount not found for waitlist entry');
        }

        const orderResponse = await this.paymentService.createOrder({
            bookingId: '',
            amount: entry.metadata.amount,
            currency: 'INR',
            receipt: `waitlist_${entry.id}`,
            notes: {
                matchId: entry.matchId,
                waitlistId: entry.id,
                slotsRequired: entry.slotsRequired,
                availableSlots: entry.metadata.availableSlots
            }
        });

        entry.metadata = {
            ...entry.metadata,
            paymentOrderId: orderResponse?.orderId,
            orderCreatedAt: new Date().toISOString()
        };
        await this.waitlistRepository.save(entry);

        return {
            orderId: orderResponse?.orderId,
            amount: orderResponse?.amount,
            currency: orderResponse?.currency
        };
    }

    async confirmWaitlistBooking(
        waitlistId: string,
        paymentOrderId: string,
        paymentId: string,
        signature: string
    ) {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const entry = await this.waitlistRepository.findOne({
                where: { id: waitlistId, status: WaitlistStatus.NOTIFIED }
            });

            if (!entry) {
                throw new BadRequestException('Invalid waitlist entry or already processed');
            }

            if (entry.metadata?.paymentOrderId !== paymentOrderId) {
                throw new BadRequestException('Invalid payment order');
            }

            if (!entry.metadata?.availableSlots?.length) {
                throw new BadRequestException('No slots allocated for this entry');
            }

            const verificationResponse = await this.paymentService.verifyPayment({
                razorpay_order_id: paymentOrderId,
                razorpay_payment_id: paymentId,
                razorpay_signature: signature
            });

            if (!verificationResponse.success) {
                throw new BadRequestException('Payment verification failed');
            }

            const booking = await this.bookingService.createBooking({
                matchId: entry.matchId,
                email: entry.email,
                totalSlots: entry.slotsRequired,
                slotNumbers: entry.metadata.availableSlots
            });
            await queryRunner.commitTransaction();
            return booking;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async cancelWaitlistEntry(matchId: string, email: string) {
        const entry = await this.waitlistRepository.findOne({
            where: {
                matchId,
                email,
                status: WaitlistStatus.ACTIVE
            }
        });

        if (!entry) {
            throw new BadRequestException('No active waitlist entry found');
        }

        entry.status = WaitlistStatus.CANCELLED;
        return this.waitlistRepository.save(entry);
    }

    async getActiveWaitlistCount(matchId: string): Promise<number> {
        return this.waitlistRepository.count({
            where: {
                matchId,
                status: WaitlistStatus.ACTIVE
            }
        });
    }
}
