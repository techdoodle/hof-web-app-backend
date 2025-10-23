import { Injectable, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like } from 'typeorm';
import { Match } from './matches.entity';
import { MatchType } from '../../common/enums/match-type.enum';
import { BookingSlotEntity, BookingSlotStatus } from '../booking/booking-slot.entity';
import { WaitlistEntry, WaitlistStatus } from '../waitlist/entities/waitlist-entry.entity';

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    @InjectRepository(BookingSlotEntity)
    private readonly bookingSlotRepository: Repository<BookingSlotEntity>,
    @InjectRepository(WaitlistEntry)
    private readonly waitlistRepository: Repository<WaitlistEntry>,
  ) { }

  async create(createMatchDto: Partial<Match>): Promise<Match> {
    // Set offer_price equal to slot_price if not provided or null
    if (createMatchDto.slotPrice !== undefined && (createMatchDto.offerPrice === undefined || createMatchDto.offerPrice === null)) {
      createMatchDto.offerPrice = createMatchDto.slotPrice;
    }

    // Validate pricing
    this.validatePricing(createMatchDto.slotPrice ?? 0, createMatchDto.offerPrice ?? 0);

    const match = this.matchRepository.create(createMatchDto);
    return await this.matchRepository.save(match);
  }

  async findAll(): Promise<Match[]> {
    return await this.matchRepository.find({
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async findOne(matchId: number): Promise<Match> {
    const match = await this.matchRepository.findOne({
      where: { matchId },
      relations: ['footballChief', 'city', 'venue'],
    });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }
    return match;
  }

  async update(matchId: number, updateMatchDto: Partial<Match>): Promise<Match> {
    const match = await this.findOne(matchId);

    // Validate pricing if either field is being updated
    if (updateMatchDto.slotPrice !== undefined || updateMatchDto.offerPrice !== undefined) {
      const slotPrice = updateMatchDto.slotPrice !== undefined ? updateMatchDto.slotPrice : match.slotPrice;
      const offerPrice = updateMatchDto.offerPrice !== undefined ? updateMatchDto.offerPrice : match.offerPrice;
      this.validatePricing(slotPrice, offerPrice);
    }

    Object.assign(match, updateMatchDto);
    return await this.matchRepository.save(match);
  }

  async remove(matchId: number): Promise<void> {
    const match = await this.findOne(matchId);
    await this.matchRepository.remove(match);
  }

  async findByMatchType(matchTypeId: number): Promise<Match[]> {
    return await this.matchRepository.find({
      where: { matchTypeRef: { id: matchTypeId } as any },
      relations: ['footballChief', 'city', 'venue', 'matchTypeRef'],
      order: { startTime: 'DESC' },
    });
  }

  async findByFootballChief(footballChiefId: number): Promise<Match[]> {
    return await this.matchRepository.find({
      where: { footballChief: { id: footballChiefId } },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async findByCity(cityId: number): Promise<Match[]> {
    return await this.matchRepository.find({
      where: { city: { id: cityId } },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async findByVenue(venueId: number): Promise<Match[]> {
    return await this.matchRepository.find({
      where: { venue: { id: venueId } },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<Match[]> {
    return await this.matchRepository.find({
      where: {
        startTime: Between(startDate, endDate),
      },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async findByStatsReceived(statsReceived: boolean): Promise<Match[]> {
    return await this.matchRepository.find({
      where: { statsReceived },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async searchMatches(query: string, limit: number = 10): Promise<Match[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = query.trim();

    return await this.matchRepository.find({
      where: [
        { matchStatsId: Like(`%${searchTerm}%`) },
      ],
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
      take: limit,
    });
  }

  async getUpcomingMatches(limit: number = 10): Promise<Match[]> {
    const now = new Date();
    return await this.matchRepository.find({
      where: {
        startTime: Between(now, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)), // Next 30 days
      },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'ASC' },
      take: limit,
    });
  }

  async getCompletedMatches(limit: number = 10): Promise<Match[]> {
    const now = new Date();
    return await this.matchRepository.find({
      where: {
        startTime: Between(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), now), // Last year
        endTime: Between(new Date(0), now), // Has end time
      },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
      take: limit,
    });
  }

  async updateMatchHighlights(matchId: number, matchHighlights: string): Promise<Match> {
    const match = await this.findOne(matchId);
    match.matchHighlights = matchHighlights;
    return await this.matchRepository.save(match);
  }

  async updateMatchRecap(matchId: number, matchRecap: string): Promise<Match> {
    const match = await this.findOne(matchId);
    match.matchRecap = matchRecap;
    return await this.matchRepository.save(match);
  }

  async updateMatchHighlightsAndRecap(matchId: number, matchHighlights: string, matchRecap: string): Promise<Match> {
    const match = await this.findOne(matchId);
    match.matchHighlights = matchHighlights;
    match.matchRecap = matchRecap;
    return await this.matchRepository.save(match);
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round((R * c) * 100) / 100;
  }

  private validatePricing(slotPrice: number, offerPrice: number): void {
    // Both prices must be >= 0
    if (slotPrice < 0 || offerPrice < 0) {
      throw new Error('Slot price and offer price must be greater than or equal to 0');
    }

    // Offer price must be <= slot price
    if (offerPrice > slotPrice) {
      throw new Error('Offer price must be less than or equal to slot price');
    }
  }

  async findNearbyMatches(location: { latitude: number; longitude: number }) {
    const matches = await this.matchRepository
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.venue', 'venue')
      .leftJoinAndSelect('match.matchTypeRef', 'matchType')
      .leftJoinAndSelect('match.footballChief', 'footballChief')
      .where('venue.latitude IS NOT NULL')
      .andWhere('venue.longitude IS NOT NULL')
      .andWhere('venue.latitude != 0')
      .andWhere('venue.longitude != 0')
      .andWhere('match.start_time > :currentTime', { currentTime: new Date() })
      .getMany();

    // Group matches by venue
    const venueMap = new Map();

    matches.forEach(match => {
      const distance = this.calculateDistance(
        location.latitude,
        location.longitude,
        match.venue.latitude,
        match.venue.longitude
      );

      if (distance <= 1000) {
        const venueId = match.venue.id;

        if (!venueMap.has(venueId)) {
          venueMap.set(venueId, {
            venue: {
              ...match.venue,
              distance
            },
            matches: []
          });
        }

        venueMap.get(venueId).matches.push({
          id: match.matchId,
          startTime: match.startTime,
          endTime: match.endTime,
          matchType: match.matchTypeRef?.matchName || 'HOF Play',
          slotPrice: match.slotPrice,
          offerPrice: match.offerPrice,
          playerCapacity: match.playerCapacity,
          bookedSlots: match.bookedSlots,
          footballChief: {
            id: match.footballChief?.id || null,
            name: match.footballChief?.firstName || '',
            number: match.footballChief?.phoneNumber || '',
            email: match.footballChief?.email || ''
          }
        });
      }
    });

    // Convert to array and sort by distance
    return Array.from(venueMap.values())
      .sort((a, b) => a.venue.distance - b.venue.distance)
      .slice(0, 10);
  }

  async getCriticalBookingInfo(matchId: number): Promise<any> {
    const match = await this.findOne(matchId);

    // Extract locked slots count from JSONB field
    const lockedSlotsCount = typeof match.lockedSlots === 'object' && match.lockedSlots !== null
      ? Object.keys(match.lockedSlots).length
      : 0;

    // Query confirmed booked slots using raw SQL to avoid relationship issues
    const confirmedBookedSlotsResult = await this.bookingSlotRepository.query(`
      SELECT COUNT(*) as count 
      FROM booking_slots bs 
      JOIN bookings b ON bs.booking_id = b.id 
      WHERE b.match_id = $1 AND bs.status = $2
    `, [matchId.toString(), BookingSlotStatus.ACTIVE]);

    const confirmedBookedSlots = parseInt(confirmedBookedSlotsResult[0]?.count || '0');

    // Query waitlisted slots using raw SQL
    const waitlistedSlotsResult = await this.waitlistRepository.query(`
      SELECT COALESCE(SUM(slots_required), 0) as total_slots 
      FROM waitlist_entries 
      WHERE match_id = $1 AND status = $2
    `, [matchId.toString(), WaitlistStatus.ACTIVE]);

    const waitlistedSlotsCount = parseInt(waitlistedSlotsResult[0]?.total_slots || '0');

    // Calculate available regular slots
    const availableRegularSlots = Math.max(0, match.playerCapacity - confirmedBookedSlots - lockedSlotsCount);

    // Calculate available waitlist slots
    const totalCapacity = match.playerCapacity + match.bufferCapacity;
    const usedSlots = confirmedBookedSlots + lockedSlotsCount + waitlistedSlotsCount;
    const availableWaitlistSlots = Math.max(0, totalCapacity - usedSlots);

    return {
      playerCapacity: match.playerCapacity,
      bufferCapacity: match.bufferCapacity,
      bookedSlots: confirmedBookedSlots,
      lockedSlots: lockedSlotsCount,
      waitlistedSlots: waitlistedSlotsCount,
      availableRegularSlots,
      availableWaitlistSlots,
      offerPrice: match.offerPrice,
      slotPrice: match.slotPrice,
      isLocked: lockedSlotsCount > 0
    };
  }

  async calculateBookingPrice(matchId: number, numSlots: number): Promise<{ finalPrice: number }> {
    const match = await this.findOne(matchId);

    if (!match) {
      throw new HttpException('Match not found', HttpStatus.NOT_FOUND);
    }

    // Calculate final price based on match pricing
    const basePrice = match.offerPrice || match.slotPrice;
    const finalPrice = basePrice * numSlots;

    // You can add additional pricing logic here:
    // - Discounts for multiple slots
    // - Special pricing for certain match types
    // - Dynamic pricing based on demand
    // - Tax calculations if needed

    return {
      finalPrice: Math.round(finalPrice)
    };
  }
} 