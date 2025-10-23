import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection, In } from 'typeorm';
import { BookingEntity } from './booking.entity';
import { BookingSlotEntity, BookingSlotStatus } from './booking-slot.entity';
import { SlotLockService } from './slot-lock.service';
import {
    BookingStatus,
    CreateBookingDto,
    CancelBookingDto,
    InitiatePaymentDto,
    PaymentCallbackDto,
    RefundStatus
} from '../../common/types/booking.types';
import { RefundService } from '../payment/refund.service';
import { RazorpayService } from '../payment/razorpay.service';
import { PaymentService } from '../payment/payment.service';
import { BookingUserService } from './booking-user.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/interfaces/notification.interface';
import { generateBookingReference } from 'src/common/utils/reference.util';
import { User } from '../user/user.entity';

@Injectable()
export class BookingService {
    constructor(
        @InjectRepository(BookingEntity)
        private bookingRepository: Repository<BookingEntity>,
        @InjectRepository(BookingSlotEntity)
        private bookingSlotRepository: Repository<BookingSlotEntity>,
        private connection: Connection,
        private slotLockService: SlotLockService,
        private refundService: RefundService,
        private razorpayService: RazorpayService,
        private paymentService: PaymentService,
        private bookingUserService: BookingUserService,
        private notificationService: NotificationService,
    ) { }

    async createBooking(dto: CreateBookingDto, tokenUser?: any): Promise<BookingEntity> {
        // Validate input
        if (!dto.slotNumbers?.length) {
            throw new BadRequestException('No slots selected');
        }

        if (dto.slotNumbers.length !== dto.totalSlots) {
            throw new BadRequestException('Slot count mismatch');
        }

        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Try to acquire locks on all requested slots
            const lockResult = await this.slotLockService.tryLockSlots(
                dto.matchId,
                dto.slotNumbers,
                queryRunner
            );

            if (!lockResult.success) {
                throw new ConflictException('Some slots are no longer available');
            }

            // Get available slot numbers
            const availableSlots = await this.getAvailableSlotNumbers(Number(dto.matchId), dto.totalSlots, queryRunner);

            if (availableSlots.length < dto.totalSlots) {
                throw new ConflictException(`Only ${availableSlots.length} slots available`);
            }

            // Create booking
            const booking = this.bookingRepository.create({
                matchId: Number(dto.matchId),
                userId: dto.userId ? Number(dto.userId) : undefined,
                email: dto.email,
                bookingReference: generateBookingReference(),
                totalSlots: dto.totalSlots,
                amount: dto.metadata?.amount || 0, // Set amount from metadata
                status: BookingStatus.INITIATED,
                metadata: {
                    ...dto.metadata,
                    lockKey: lockResult.lockKey
                },
            });

            const savedBooking = await queryRunner.manager.save(booking);

            // Update matches table to confirm the locked slots
            await queryRunner.query(
                `UPDATE matches 
                 SET booked_slots = booked_slots + $1,
                     version = version + 1
                 WHERE match_id = $2`,
                [dto.totalSlots, dto.matchId]
            );

            // Create or find users for each player
            const playerUsers: User[] = [];
            for (let i = 0; i < dto.players.length; i++) {
                const player = dto.players[i];

                // For the first player (main user), get phone from token user
                // For additional players, use provided phone
                let phoneToUse = player.phone;

                if (i === 0 && tokenUser?.phoneNumber) {
                    // First player is the main user - get their phone from JWT token
                    phoneToUse = tokenUser.phoneNumber;
                }

                const user = await this.bookingUserService.findOrCreateUserByPhone(phoneToUse, {
                    firstName: player.firstName,
                    lastName: player.lastName
                });
                playerUsers.push(user);
            }

            // Create booking slots with assigned slot numbers and player IDs
            const bookingSlots = availableSlots.slice(0, dto.totalSlots).map((slotNumber, index) => {
                const player = dto.players[index];
                const playerUser = playerUsers[index];

                // Use phone from token user for first player, provided phone for others
                let phoneToUse = player.phone;
                if (index === 0 && tokenUser?.phoneNumber) {
                    phoneToUse = tokenUser.phoneNumber;
                }

                return this.bookingSlotRepository.create({
                    bookingId: savedBooking.id,
                    slotNumber,
                    playerId: playerUser.id,
                    playerName: `${playerUser.firstName} ${playerUser.lastName}`, // Use user's name from database
                    playerEmail: dto.email, // Use main booking email
                    playerPhone: phoneToUse,
                    status: BookingSlotStatus.ACTIVE,
                });
            });

            await queryRunner.manager.save(bookingSlots);
            await queryRunner.commitTransaction();

            return savedBooking;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    private async getAvailableSlotNumbers(matchId: number, requestedSlots: number, queryRunner: any): Promise<number[]> {
        // Get all currently active slot numbers for this match
        const activeSlots = await queryRunner.query(`
            SELECT bs.slot_number 
            FROM booking_slots bs 
            JOIN bookings b ON bs.booking_id = b.id 
            WHERE b.match_id = $1 AND bs.status = $2
        `, [matchId, BookingSlotStatus.ACTIVE]);

        const bookedSlotNumbers = activeSlots.map(row => row.slot_number);

        // Get match capacity
        const match = await queryRunner.query(`
            SELECT player_capacity FROM matches WHERE match_id = $1
        `, [matchId]);

        const totalCapacity = match[0]?.player_capacity || 0;

        // Generate all possible slot numbers
        const allSlots = Array.from({ length: totalCapacity }, (_, i) => i + 1);

        // Find available slots
        const availableSlots = allSlots.filter(slot => !bookedSlotNumbers.includes(slot));

        return availableSlots;
    }

    async getBookingById(bookingId: string): Promise<BookingEntity> {
        const booking = await this.bookingRepository.findOne({
            where: { id: Number(bookingId) },
            relations: ['slots']
        });

        if (!booking) {
            throw new NotFoundException(`Booking with ID ${bookingId} not found`);
        }

        return booking;
    }

    async getBookings(filters: { userId?: string; email?: string; status?: string }) {
        const query = this.bookingRepository.createQueryBuilder('booking');

        if (filters.userId) {
            query.andWhere('booking.userId = :userId', { userId: filters.userId });
        }

        if (filters.email) {
            query.andWhere('booking.email = :email', { email: filters.email });
        }

        if (filters.status) {
            query.andWhere('booking.status = :status', { status: filters.status });
        }

        return query.getMany();
    }

    async initiatePayment(dto: InitiatePaymentDto & { bookingId: string }) {
        const booking = await this.getBookingById(dto.bookingId);

        if (booking.status !== BookingStatus.INITIATED) {
            throw new BadRequestException('Invalid booking status for payment');
        }

        try {
            // Create Razorpay order using PaymentService (saves to database)
            const order = await this.paymentService.createOrder({
                bookingId: dto.bookingId,
                amount: dto.amount,
                currency: dto.currency,
                receipt: `booking_${dto.bookingId}`,
                notes: {
                    bookingId: dto.bookingId,
                    matchId: booking.matchId
                }
            });

            // Update booking with Razorpay order details
            booking.status = BookingStatus.PAYMENT_PENDING;
            booking.metadata = {
                ...booking.metadata,
                razorpayOrderId: order?.orderId,
                paymentAmount: dto.amount,
                paymentCurrency: dto.currency
            };

            const updatedBooking = await this.bookingRepository.save(booking);

            return {
                booking: updatedBooking,
                razorpayOrder: {
                    id: order?.orderId,
                    amount: order?.amount,
                    currency: order?.currency,
                    receipt: `booking_${dto.bookingId}`
                }
            };
        } catch (error) {
            throw new BadRequestException(`Failed to initiate payment: ${error.message}`);
        }
    }

    async handlePaymentCallback(bookingId: string, dto: PaymentCallbackDto) {
        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const booking = await this.getBookingById(bookingId);

            if (booking.status !== BookingStatus.PAYMENT_PENDING) {
                throw new BadRequestException('Invalid booking status for payment callback');
            }

            // Verify Razorpay signature
            const isValidSignature = await this.razorpayService.verifyPaymentSignature(
                dto.razorpay_order_id,
                dto.razorpay_payment_id,
                dto.razorpay_signature
            );

            if (!isValidSignature) {
                booking.status = BookingStatus.PAYMENT_FAILED;
                await queryRunner.manager.save(booking);
                await queryRunner.commitTransaction();
                throw new BadRequestException('Invalid payment signature');
            }

            // Get payment details from Razorpay
            const paymentDetails = await this.razorpayService.getPaymentDetails(dto.razorpay_payment_id);

            // Update booking with payment details
            booking.status = BookingStatus.CONFIRMED;
            booking.amount = paymentDetails.amount; // Set the amount from payment details
            booking.metadata = {
                ...booking.metadata,
                razorpayPaymentId: dto.razorpay_payment_id,
                paymentStatus: paymentDetails.status,
                paymentCaptured: paymentDetails.captured,
                paymentMethod: paymentDetails.method,
                paymentDetails: paymentDetails
            };

            await queryRunner.manager.save(booking);

            // Remove lock from matches table and update booked_slots
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
                } else {
                    // Fallback: try to find and remove any lock that matches this booking's slots
                    const bookingSlots = booking.slots?.map(slot => slot.slotNumber) || [];
                    Object.keys(lockedSlots).forEach(key => {
                        const lockData = lockedSlots[key];
                        if (lockData.slots && lockData.slots.some(slot => bookingSlots.includes(slot))) {
                            delete lockedSlots[key];
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

            // Send booking confirmation notifications
            await this.sendBookingConfirmationNotifications(booking);

            return booking;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            const booking = await this.getBookingById(bookingId);
            booking.status = BookingStatus.PAYMENT_FAILED;
            await this.bookingRepository.save(booking);
            throw new BadRequestException(`Payment verification failed: ${error.message}`);
        } finally {
            await queryRunner.release();
        }
    }

    async cancelBookingSlots(dto: CancelBookingDto) {
        const booking = await this.getBookingById(dto.bookingId);
        const slotNumbers = dto.slotNumbers || [];

        if (!booking) {
            throw new NotFoundException(`Booking with ID ${dto.bookingId} not found`);
        }

        if (booking.status === BookingStatus.CANCELLED) {
            throw new BadRequestException('Booking is already cancelled');
        }

        const queryRunner = this.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Calculate refund amount
            const perSlotAmount = booking.amount / booking.totalSlots;
            const refundAmount = perSlotAmount * (slotNumbers.length || booking.totalSlots);

            if (slotNumbers.length > 0) {
                // Partial cancellation
                await queryRunner.manager.update(
                    BookingSlotEntity,
                    { bookingId: dto.bookingId, slotNumber: In(slotNumbers) },
                    { status: BookingSlotStatus.CANCELLED_REFUND_PENDING }
                );

                // Set booking status to partially cancelled
                const remainingActiveSlots = await queryRunner.manager.count(
                    BookingSlotEntity,
                    { where: { bookingId: Number(dto.bookingId), status: BookingSlotStatus.ACTIVE } }
                );

                booking.status = remainingActiveSlots > 0
                    ? BookingStatus.PARTIALLY_CANCELLED
                    : BookingStatus.CANCELLED;
            } else {
                // Full cancellation
                await queryRunner.manager.update(
                    BookingSlotEntity,
                    { bookingId: dto.bookingId },
                    { status: BookingSlotStatus.CANCELLED_REFUND_PENDING }
                );
                booking.status = BookingStatus.CANCELLED;
            }

            // Update booking refund status
            booking.refundStatus = RefundStatus.PENDING;
            await queryRunner.manager.save(booking);

            // Initiate refund
            await this.refundService.initiateRefund({
                bookingId: dto.bookingId,
                amount: refundAmount,
                reason: dto.reason || 'Booking cancelled',
                slots: slotNumbers,
                metadata: {
                    cancelledAt: new Date(),
                    cancelledSlots: slotNumbers,
                    originalAmount: booking.amount
                }
            }, queryRunner);

            await queryRunner.commitTransaction();
            return booking;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    private async sendBookingConfirmationNotifications(booking: BookingEntity) {
        try {
            // Get booking details with slots
            const bookingWithSlots = await this.getBookingById(booking.id.toString());

            // Get match details
            const matchDetails = await this.connection.query(
                `SELECT m.*, v.name as venue_name, v.address as venue_address, 
                        fc.first_name as fc_first_name, fc.last_name as fc_last_name, fc.phone_number as fc_phone
                 FROM matches m 
                 LEFT JOIN venues v ON m.venue = v.id
                 LEFT JOIN users fc ON m.football_chief = fc.id
                 WHERE m.match_id = $1`,
                [booking.matchId]
            );

            const match = matchDetails[0];

            console.log('📧 Sending booking confirmation email to:', booking.email);
            console.log('📧 Match details:', match);
            console.log('📧 Template data:', {
                bookingReference: booking.bookingReference,
                totalSlots: booking.totalSlots,
                amount: booking.amount / 100.0, // Convert paise to rupees
                matchId: booking.matchId,
                bookingId: booking.id,
                matchDetails: {
                    venueName: match?.venue_name || 'TBD',
                    venueAddress: match?.venue_address || 'TBD',
                    startTime: match?.start_time,
                    endTime: match?.end_time,
                    date: match?.match_date
                },
                footballChief: {
                    name: `${match?.fc_first_name || ''} ${match?.fc_last_name || ''}`.trim() || 'Football Chief',
                    phone: match?.fc_phone || 'N/A'
                }
            });

            // Send email notification
            await this.notificationService.sendNotification({
                type: NotificationType.BOOKING_CONFIRMATION,
                recipient: {
                    email: booking.email,
                    name: bookingWithSlots.slots?.[0]?.playerName || 'User'
                },
                templateData: {
                    bookingReference: booking.bookingReference,
                    totalSlots: booking.totalSlots,
                    amount: booking.amount / 100.0, // Convert paise to rupees
                    matchId: booking.matchId,
                    bookingId: booking.id,
                    matchDetails: {
                        venueName: match?.venue_name || 'TBD',
                        venueAddress: match?.venue_address || 'TBD',
                        startTime: match?.start_time,
                        endTime: match?.end_time,
                        date: match?.match_date
                    },
                    footballChief: {
                        name: `${match?.fc_first_name || ''} ${match?.fc_last_name || ''}`.trim() || 'Football Chief',
                        phone: match?.fc_phone || 'N/A'
                    }
                }
            });

            // Send push notification (if user has device token)
            // This would require user device token from user profile
            // await this.notificationService.sendPushNotification(...)

            console.log(`✅ Booking confirmed: ${booking.bookingReference} - ${booking.totalSlots} slots for ₹${booking.amount}`);

        } catch (error) {
            // Log error but don't fail the booking
            console.error('Failed to send booking confirmation notifications:', error);
        }
    }
}