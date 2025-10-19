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
import { generateBookingReference } from 'src/common/utils/reference.util';

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
    ) { }

    async createBooking(dto: CreateBookingDto): Promise<BookingEntity> {
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
            const lockedSlots = await this.slotLockService.tryLockSlots(
                dto.matchId,
                dto.slotNumbers,
                queryRunner
            );

            if (!lockedSlots) {
                throw new ConflictException('Some slots are no longer available');
            }

            // Create booking
            const booking = this.bookingRepository.create({
                matchId: dto.matchId,
                userId: dto.userId,
                email: dto.email,
                bookingReference: generateBookingReference(),
                totalSlots: dto.totalSlots,
                status: BookingStatus.INITIATED,
                metadata: dto.metadata,
            });

            const savedBooking = await queryRunner.manager.save(booking);

            // Update match_slots with booking reference
            await queryRunner.query(
                `UPDATE match_slots 
                 SET status = 'LOCKED', 
                     booking_id = $1,
                     locked_at = CURRENT_TIMESTAMP,
                     lock_expires_at = CURRENT_TIMESTAMP + interval '15 minutes'
                 WHERE match_id = $2 
                 AND slot_number = ANY($3)`,
                [savedBooking.id, dto.matchId, dto.slotNumbers]
            );

            // Create booking slots
            const bookingSlots = dto.slotNumbers.map(slotNumber => {
                return this.bookingSlotRepository.create({
                    bookingId: savedBooking.id,
                    slotNumber,
                    status: BookingSlotStatus.ACTIVE,
                    playerEmail: dto.email,
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

    async getBookingById(bookingId: string): Promise<BookingEntity> {
        const booking = await this.bookingRepository.findOne({
            where: { id: bookingId },
            relations: ['bookingSlots']
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

        // Implement your payment gateway integration here
        // This is a placeholder for the actual implementation
        booking.status = BookingStatus.PAYMENT_PENDING;
        return this.bookingRepository.save(booking);
    }

    async handlePaymentCallback(bookingId: string, dto: PaymentCallbackDto) {
        const booking = await this.getBookingById(bookingId);

        if (booking.status !== BookingStatus.PAYMENT_PENDING) {
            throw new BadRequestException('Invalid booking status for payment callback');
        }

        // Implement your payment verification logic here
        // This is a placeholder for the actual implementation
        booking.status = BookingStatus.CONFIRMED;
        return this.bookingRepository.save(booking);
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
                    { where: { bookingId: dto.bookingId, status: BookingSlotStatus.ACTIVE } }
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
}