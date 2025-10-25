import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection, MoreThan } from 'typeorm';
import { BookingSlotEntity, BookingSlotStatus } from '../booking/booking-slot.entity';
import { WaitlistService } from './waitlist.service';
import { Match } from '../matches/matches.entity';

@Injectable()
export class SlotAvailabilityMonitorService {
    private readonly logger = new Logger(SlotAvailabilityMonitorService.name);

    constructor(
        @InjectRepository(Match)
        private matchRepository: Repository<Match>,
        @InjectRepository(BookingSlotEntity)
        private bookingSlotRepository: Repository<BookingSlotEntity>,
        private connection: Connection,
        @Inject(forwardRef(() => WaitlistService))
        private waitlistService: WaitlistService,
    ) { }

    /**
     * Check for newly available slots and notify waitlist users
     * This should be called whenever slots are released
     */
    async checkAndNotifyAvailableSlots(matchId: number): Promise<void> {
        try {
            this.logger.log(`🔍 Checking for available slots in match ${matchId}`);

            // Get match details
            const match = await this.matchRepository.findOne({
                where: { matchId }
            });

            if (!match) {
                this.logger.warn(`Match ${matchId} not found`);
                return;
            }

            // Get all currently active slots for this match
            const activeSlots = await this.bookingSlotRepository
                .createQueryBuilder('bs')
                .innerJoin('bs.booking', 'b')
                .where('b.matchId = :matchId', { matchId })
                .andWhere('bs.status = :status', { status: BookingSlotStatus.ACTIVE })
                .getMany();

            const bookedSlotNumbers = activeSlots.map(slot => slot.slotNumber);

            // Get all possible slot numbers for this match
            const totalCapacity = match.playerCapacity;
            const allSlots = Array.from({ length: totalCapacity }, (_, i) => i + 1);

            // Find available slots (not booked)
            const availableSlots = allSlots.filter(slot => !bookedSlotNumbers.includes(slot));

            this.logger.log(`📊 Match ${matchId}: ${availableSlots.length} slots available out of ${totalCapacity} total`);

            // If there are available slots, notify waitlist users
            if (availableSlots.length > 0) {
                await this.waitlistService.notifySlotAvailability(
                    matchId.toString(),
                    availableSlots,
                    match.slotPrice || match.offerPrice
                );
                this.logger.log(`📧 Notified waitlist users about ${availableSlots.length} available slots`);
            } else {
                this.logger.log(`📭 No available slots in match ${matchId}`);
            }

        } catch (error) {
            this.logger.error(`Failed to check available slots for match ${matchId}:`, error.stack);
        }
    }

    /**
     * Check all matches for available slots (for cron job)
     */
    async checkAllMatchesForAvailableSlots(): Promise<void> {
        try {
            this.logger.log('🔍 Checking all matches for available slots');

            // Get all active matches
            const matches = await this.matchRepository.find({
                where: { startTime: MoreThan(new Date() as unknown as Date) }
            });

            for (const match of matches) {
                await this.checkAndNotifyAvailableSlots(match.matchId);
            }

        } catch (error) {
            this.logger.error('Failed to check all matches for available slots:', error.stack);
        }
    }
}
