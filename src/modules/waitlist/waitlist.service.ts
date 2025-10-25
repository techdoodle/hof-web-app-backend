import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
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
        @Inject(forwardRef(() => BookingService))
        private bookingService: BookingService,
        private connection: Connection
    ) { }

    async joinWaitlist(matchId: string, userId: string, email: string, slotsRequired: number, metadata?: any) {
        const existing = await this.waitlistRepository.findOne({
            where: {
                matchId: Number(matchId),
                userId: Number(userId),
                email,
                status: WaitlistStatus.ACTIVE
            }
        });

        if (existing) {
            throw new BadRequestException('Already in waitlist for this match');
        }

        const entry = this.waitlistRepository.create({
            matchId: Number(matchId),
            userId: Number(userId),
            email,
            slotsRequired,
            metadata,
            status: WaitlistStatus.ACTIVE
        });

        const savedEntry = await this.waitlistRepository.save(entry);

        // Send waitlist confirmation email
        await this.sendWaitlistConfirmationEmail(savedEntry);

        // Return waitlist entry with match details for confirmation page
        const matchDetails = await this.connection.query(
            `SELECT m.*, v.name as venue_name, v.address as venue_address, 
                    fc.first_name as fc_first_name, fc.last_name as fc_last_name, fc.phone_number as fc_phone
             FROM matches m 
             LEFT JOIN venues v ON m.venue = v.id
             LEFT JOIN users fc ON m.football_chief = fc.id
             WHERE m.match_id = $1`,
            [savedEntry.matchId]
        );

        const match = matchDetails[0];

        return {
            waitlistEntry: savedEntry,
            matchDetails: {
                venueName: match?.venue_name || 'TBD',
                venueAddress: match?.venue_address || 'TBD',
                startTime: match?.start_time,
                endTime: match?.end_time,
                date: match?.start_time,
                footballChief: {
                    name: `${match?.fc_first_name || ''} ${match?.fc_last_name || ''}`.trim() || 'Football Chief',
                    phone: match?.fc_phone || 'N/A'
                }
            }
        };
    }

    async notifySlotAvailability(matchId: string, availableSlots: number[], slotPrice: number) {
        console.log(`🔔 Notifying waitlist for match ${matchId}, available slots: ${availableSlots.length}`);

        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Get ALL active waitlist entries for this match (no ordering, everyone gets notified)
            const entries = await this.waitlistRepository.find({
                where: {
                    matchId: Number(matchId),
                    status: WaitlistStatus.ACTIVE
                }
                // No ordering - everyone gets notified simultaneously
            });

            console.log(`🔔 Found ${entries.length} waitlist entries for match ${matchId}`);

            // Notify ALL waitlist entries about available slots
            for (const entry of entries) {
                try {
                    console.log(`📧 Sending notification to waitlist entry ${entry.id} (${entry.email})`);

                    // Calculate how many slots this user can potentially get
                    const maxSlotsToAllocate = Math.min(entry.slotsRequired, availableSlots.length);
                    const amount = maxSlotsToAllocate * slotPrice;

                    console.log(`📧 Notification details: slots=${maxSlotsToAllocate}, amount=${amount}`);

                    // Send notification to ALL waitlist users
                    await this.notificationService.sendNotification({
                        type: NotificationType.WAITLIST_NOTIFICATION,
                        recipient: {
                            email: entry.email,
                            name: entry.metadata?.name
                        },
                        templateData: {
                            matchId,
                            availableSlots: availableSlots, // All available slots
                            totalAvailableSlots: availableSlots.length,
                            maxSlotsUserCanGet: maxSlotsToAllocate,
                            slotsRequested: entry.slotsRequired,
                            isPartialAllocation: maxSlotsToAllocate < entry.slotsRequired,
                            remainingSlotsNeeded: entry.slotsRequired - maxSlotsToAllocate,
                            amount,
                            bookingLink: `${process.env.FRONTEND_URL}/waitlist/confirm?id=${entry.id}&slots=${availableSlots.join(',')}`,
                            // No time limit - competitive allocation
                            isCompetitiveAllocation: true
                        }
                    });

                    // Update entry status to NOTIFIED (but don't allocate slots yet)
                    entry.status = WaitlistStatus.NOTIFIED;
                    entry.lastNotifiedAt = new Date();
                    entry.metadata = {
                        ...entry.metadata,
                        availableSlots: availableSlots, // Store all available slots
                        amount: amount, // Store the calculated amount
                        maxSlotsToAllocate: maxSlotsToAllocate,
                        slotPrice: slotPrice,
                        notes: 'Competitive allocation notification sent'
                    };
                    await queryRunner.manager.save(entry);

                    this.logger.log(`📧 Notified waitlist entry ${entry.id}: ${availableSlots.length} slots available, user can get up to ${maxSlotsToAllocate}`);

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
                id: Number(waitlistId),
                status: WaitlistStatus.NOTIFIED
            }
        });

        if (!entry) {
            throw new BadRequestException('Invalid waitlist entry or already processed');
        }

        console.log(`🔍 Waitlist entry ${waitlistId} metadata:`, entry.metadata);

        if (!entry.metadata?.availableSlots?.length) {
            throw new BadRequestException('No slots allocated for this entry');
        }

        // Calculate amount if not stored in metadata (fallback for old entries)
        let amount = entry.metadata?.amount;
        if (!amount) {
            // Fallback: calculate amount from available slots and match price
            const match = await this.connection.query(
                'SELECT slot_price, offer_price FROM matches WHERE match_id = $1',
                [entry.matchId]
            );

            if (match?.length) {
                const slotPrice = match[0].offer_price || match[0].slot_price || 0;
                const maxSlots = Math.min(entry.slotsRequired, entry.metadata?.availableSlots?.length || 0);
                amount = maxSlots * slotPrice;

                // Update the entry with calculated amount
                entry.metadata = {
                    ...entry.metadata,
                    amount: amount,
                    slotPrice: slotPrice,
                    maxSlotsToAllocate: maxSlots
                };
                await this.waitlistRepository.save(entry);
            } else {
                throw new BadRequestException('Amount not found for waitlist entry and unable to calculate from match data');
            }
        }

        const orderResponse = await this.paymentService.createOrder({
            bookingId: entry.id.toString(), // Use waitlist entry ID as booking ID (integer)
            amount: amount,
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
                where: { id: Number(waitlistId), status: WaitlistStatus.NOTIFIED }
            });

            if (!entry) {
                throw new BadRequestException('Invalid waitlist entry or already processed');
            }

            if (entry.metadata?.paymentOrderId !== paymentOrderId) {
                throw new BadRequestException('Invalid payment order');
            }

            if (!entry.metadata?.availableSlots?.length) {
                throw new BadRequestException('No slots available for this entry');
            }

            const verificationResponse = await this.paymentService.verifyPayment({
                razorpay_order_id: paymentOrderId,
                razorpay_payment_id: paymentId,
                razorpay_signature: signature
            });

            if (!verificationResponse.success) {
                throw new BadRequestException('Payment verification failed');
            }

            // Calculate how many slots are actually being booked
            const slotsAllocated = entry.metadata.availableSlots.length;
            const slotsRequested = entry.slotsRequired;
            const isPartialAllocation = slotsAllocated < slotsRequested;

            // Use the same booking flow as regular bookings - this will handle slot locking
            const booking = await this.bookingService.createBooking({
                matchId: entry.matchId.toString(),
                email: entry.email,
                totalSlots: slotsAllocated, // Use actual slots allocated, not total requested
                slotNumbers: entry.metadata.availableSlots,
                players: [
                    {
                        firstName: entry.metadata?.name?.split(' ')[0] || '',
                        lastName: entry.metadata?.name?.split(' ')[1] || '',
                        phone: entry.metadata?.phone || ''
                    }
                ]
            });

            // Update waitlist entry based on allocation
            if (isPartialAllocation) {
                // Partial allocation - user still needs more slots
                entry.slotsRequired = slotsRequested - slotsAllocated; // Update remaining slots needed
                entry.status = WaitlistStatus.ACTIVE; // Keep on waitlist for remaining slots
                entry.metadata = {
                    ...entry.metadata,
                    confirmedSlots: slotsAllocated,
                    remainingSlotsNeeded: slotsRequested - slotsAllocated,
                    lastConfirmedAt: new Date(),
                    notes: 'Partial allocation: User got ' + slotsAllocated + '/' + slotsRequested + ' slots, remaining: ' + entry.slotsRequired
                };
                this.logger.log(`📝 Partial allocation: User got ${slotsAllocated}/${slotsRequested} slots, remaining: ${entry.slotsRequired}`);
            } else {
                // Full allocation - user got all requested slots
                entry.status = WaitlistStatus.CONFIRMED;
                entry.metadata = {
                    ...entry.metadata,
                    confirmedSlots: slotsAllocated,
                    fullyConfirmedAt: new Date(),
                    notes: 'Full allocation: User got all ' + slotsAllocated + ' requested slots'
                };
                this.logger.log(`✅ Full allocation: User got all ${slotsAllocated} requested slots`);
            }

            await queryRunner.manager.save(entry);
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
                matchId: Number(matchId),
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
                matchId: Number(matchId),
                status: WaitlistStatus.ACTIVE
            }
        });
    }

    async getWaitlistEntry(waitlistId: string) {
        const entry = await this.waitlistRepository.findOne({
            where: { id: Number(waitlistId) }
        });

        if (!entry) {
            throw new BadRequestException('Waitlist entry not found');
        }

        // Get match details
        const matchDetails = await this.connection.query(
            `SELECT m.*, v.name as venue_name, v.address as venue_address, 
                    fc.first_name as fc_first_name, fc.last_name as fc_last_name, fc.phone_number as fc_phone
             FROM matches m 
             LEFT JOIN venues v ON m.venue = v.id
             LEFT JOIN users fc ON m.football_chief = fc.id
             WHERE m.match_id = $1`,
            [entry.matchId]
        );

        const match = matchDetails[0];

        return {
            ...entry,
            matchDetails: {
                venueName: match?.venue_name || 'TBD',
                venueAddress: match?.venue_address || 'TBD',
                startTime: match?.start_time,
                endTime: match?.end_time,
                footballChief: {
                    name: `${match?.fc_first_name || ''} ${match?.fc_last_name || ''}`.trim() || 'Football Chief',
                    phone: match?.fc_phone || 'N/A'
                }
            }
        };
    }

    private async sendWaitlistConfirmationEmail(entry: WaitlistEntry) {
        try {
            // Get match details for the email
            const matchDetails = await this.connection.query(
                `SELECT m.*, v.name as venue_name, v.address as venue_address, 
                        fc.first_name as fc_first_name, fc.last_name as fc_last_name, fc.phone_number as fc_phone
                 FROM matches m 
                 LEFT JOIN venues v ON m.venue = v.id
                 LEFT JOIN users fc ON m.football_chief = fc.id
                 WHERE m.match_id = $1`,
                [entry.matchId]
            );

            const match = matchDetails[0];

            console.log('📧 Sending waitlist confirmation email to:', entry.email);
            console.log('📧 Match details:', match);

            // Send email notification
            await this.notificationService.sendNotification({
                type: NotificationType.WAITLIST_CONFIRMATION,
                recipient: {
                    email: entry.email,
                    name: entry.metadata?.name || 'User'
                },
                templateData: {
                    waitlistId: entry.id,
                    email: entry.email,
                    slotsRequired: entry.slotsRequired,
                    matchId: entry.matchId,
                    matchDetails: {
                        venueName: match?.venue_name || 'TBD',
                        venueAddress: match?.venue_address || 'TBD',
                        startTime: match?.start_time ? new Date(match.start_time).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        }) : 'TBD',
                        endTime: match?.end_time ? new Date(match.end_time).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        }) : 'TBD',
                        date: match?.match_date
                    },
                    footballChief: {
                        name: `${match?.fc_first_name || ''} ${match?.fc_last_name || ''}`.trim() || 'Football Chief',
                        phone: match?.fc_phone || 'N/A'
                    }
                }
            });

            console.log(`✅ Waitlist confirmation sent: ${entry.email} - ${entry.slotsRequired} slots for match ${entry.matchId}`);

        } catch (error) {
            // Log error but don't fail the waitlist entry
            console.error('Failed to send waitlist confirmation email:', error);
        }
    }
}
