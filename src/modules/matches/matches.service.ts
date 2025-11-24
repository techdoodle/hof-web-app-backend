import { Injectable, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, Connection } from 'typeorm';
import { Match } from './matches.entity';
import { MatchType } from '../../common/enums/match-type.enum';
import { BookingSlotEntity, BookingSlotStatus } from '../booking/booking-slot.entity';
import { WaitlistEntry, WaitlistStatus } from '../waitlist/entities/waitlist-entry.entity';
import { PlayerNationPlayerMapping, PlayerMappingStatus } from '../admin/entities/playernation-player-mapping.entity';

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    @InjectRepository(BookingSlotEntity)
    private readonly bookingSlotRepository: Repository<BookingSlotEntity>,
    @InjectRepository(WaitlistEntry)
    private readonly waitlistRepository: Repository<WaitlistEntry>,
    @InjectRepository(PlayerNationPlayerMapping)
    private readonly mappingRepository: Repository<PlayerNationPlayerMapping>,
    private readonly connection: Connection,
  ) { }

  async create(createMatchDto: Partial<Match>): Promise<Match> {
    // Set offer_price equal to slot_price if not provided or null
    if (createMatchDto.slotPrice !== undefined && (createMatchDto.offerPrice === undefined || createMatchDto.offerPrice === null)) {
      createMatchDto.offerPrice = createMatchDto.slotPrice;
    }

    // Validate pricing
    this.validatePricing(createMatchDto.slotPrice ?? 0, createMatchDto.offerPrice ?? 0);

    // For recorded matches without matchStatsId, set status to STATS_SUBMISSION_PENDING
    if (createMatchDto.matchType === MatchType.RECORDED && !createMatchDto.matchStatsId) {
      if (!createMatchDto.status || createMatchDto.status === 'ACTIVE') {
        createMatchDto.status = 'STATS_SUBMISSION_PENDING';
      }
    }

    const match = this.matchRepository.create(createMatchDto);
    const savedMatch = await this.matchRepository.save(match);

    // Ensure status is correct after save (in case of any edge cases)
    await this.updateMatchStatusIfNeeded(savedMatch.matchId);

    // Reload to get updated status
    return await this.findOne(savedMatch.matchId);
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

    // Get confirmed participants grouped by team
    const participants = await this.connection.query(`
      SELECT 
        mp.team_name,
        u.first_name,
        u.last_name,
        u.profile_picture
      FROM match_participants mp
      INNER JOIN users u ON mp.user_id = u.id
      WHERE mp.match_id = $1
      ORDER BY mp.team_name, mp.created_at
    `, [matchId]);

    // Group participants by team
    const teamAParticipants = participants.filter(p => p.team_name === match.teamAName);
    const teamBParticipants = participants.filter(p => p.team_name === match.teamBName);
    const unassignedParticipants = participants.filter(p => p.team_name === 'Unassigned');

    // Add participants to match object
    (match as any).participants = {
      [match.teamAName]: teamAParticipants.map(p => ({
        firstName: p.first_name,
        lastName: p.last_name,
        profilePicture: p.profile_picture
      })),
      [match.teamBName]: teamBParticipants.map(p => ({
        firstName: p.first_name,
        lastName: p.last_name,
        profilePicture: p.profile_picture
      })),
      ...(unassignedParticipants.length > 0 ? {
        'Unassigned': unassignedParticipants.map(p => ({
          firstName: p.first_name,
          lastName: p.last_name,
          profilePicture: p.profile_picture
        }))
      } : {})
    };

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

  async checkSlotAvailability(matchId: number, slots: number): Promise<{ availableSlots: number }> {
    const match = await this.matchRepository.findOne({ where: { matchId } });
    if (!match) {
      throw new HttpException('Match not found', HttpStatus.NOT_FOUND);
    }

    // Get currently active slots
    const activeSlots = await this.connection.query(`
      SELECT bs.slot_number 
      FROM booking_slots bs 
      JOIN bookings b ON bs.booking_id = b.id 
      WHERE b.match_id = $1 AND bs.status = $2
    `, [matchId, 'ACTIVE']);

    const bookedSlotNumbers = activeSlots.map(row => row.slot_number);
    const totalCapacity = match.playerCapacity || 0;
    const allSlots = Array.from({ length: totalCapacity }, (_, i) => i + 1);
    const availableSlots = allSlots.filter(slot => !bookedSlotNumbers.includes(slot));

    return { availableSlots: availableSlots.length };
  }

  async findNearbyMatches(location: { latitude: number; longitude: number }) {
    // Calculate bounding box (approximately 50km radius)
    // 1 degree latitude ≈ 111 km, so 50km ≈ 0.45 degrees
    // Longitude varies by latitude, using approximate value
    const latDelta = 0.45; // ~50km
    const lonDelta = 0.45 / Math.cos(location.latitude * Math.PI / 180); // Adjust for latitude

    const minLat = location.latitude - latDelta;
    const maxLat = location.latitude + latDelta;
    const minLon = location.longitude - lonDelta;
    const maxLon = location.longitude + lonDelta;
    const currentTime = new Date();

    const startTime = Date.now();
    console.log("findNearbyMatches query starts here", location, startTime);

    // Optimized: Use raw SQL with distance calculation in database
    // This reduces data transfer and calculates distance efficiently
    // Using CTE to avoid duplicate distance calculation
    const matches = await this.connection.query(`
      WITH matches_with_distance AS (
        SELECT 
          m.match_id as id,
          m.start_time as "startTime",
          m.end_time as "endTime",
          m.slot_price as "slotPrice",
          m.offer_price as "offerPrice",
          m.player_capacity as "playerCapacity",
          m.booked_slots as "bookedSlots",
          v.id as "venueId",
          v.name as "venueName",
          v.latitude as "venueLatitude",
          v.longitude as "venueLongitude",
          v.address as "venueAddress",
          v.display_banner as "venueDisplayBanner",
          v.phone_number as "venuePhoneNumber",
          v.maps_url as "venueMapsUrl",
          mt.match_name as "matchTypeName",
          u.id as "footballChiefId",
          u.first_name as "footballChiefFirstName",
          u.phone_number as "footballChiefPhoneNumber",
          u.email as "footballChiefEmail",
          -- Calculate distance using Haversine formula (in km)
          (
            6371 * acos(
              cos(radians($1)) * 
              cos(radians(v.latitude::numeric)) * 
              cos(radians(v.longitude::numeric) - radians($2)) + 
              sin(radians($1)) * 
              sin(radians(v.latitude::numeric))
            )
          ) as distance
        FROM matches m
        INNER JOIN venues v ON m.venue = v.id
        LEFT JOIN match_types mt ON m.match_type_id = mt.id
        LEFT JOIN users u ON m.football_chief = u.id
        WHERE v.latitude IS NOT NULL
          AND v.longitude IS NOT NULL
          AND v.latitude != 0
          AND v.longitude != 0
          AND v.latitude BETWEEN $3 AND $4
          AND v.longitude BETWEEN $5 AND $6
          AND m.start_time > $7
      )
      SELECT * FROM matches_with_distance
      WHERE distance <= 50
      ORDER BY distance ASC
      LIMIT 100
    `, [
      location.latitude,
      location.longitude,
      minLat,
      maxLat,
      minLon,
      maxLon,
      currentTime
    ]);

    const endTime = Date.now();
    console.log("query ends here", endTime, "time taken", endTime - startTime);

    // Group matches by venue and calculate exact distance
    const venueMap = new Map();
    const startTime2 = Date.now();
    console.log("venueMap query starts here", startTime2);

    matches.forEach((row: any) => {
      const venueId = row.venueId;
      const distance = Math.round(parseFloat(row.distance) * 100) / 100;

      if (!venueMap.has(venueId)) {
        venueMap.set(venueId, {
          venue: {
            id: venueId,
            name: row.venueName,
            latitude: parseFloat(row.venueLatitude),
            longitude: parseFloat(row.venueLongitude),
            address: row.venueAddress,
            displayBanner: row.venueDisplayBanner,
            phoneNumber: row.venuePhoneNumber,
            mapsUrl: row.venueMapsUrl,
            distance: distance
          },
          matches: []
        });
      }

      venueMap.get(venueId).matches.push({
        id: row.id,
        startTime: row.startTime,
        endTime: row.endTime,
        matchType: row.matchTypeName || 'HOF Play',
        slotPrice: parseFloat(row.slotPrice || 0),
        offerPrice: parseFloat(row.offerPrice || 0),
        playerCapacity: parseInt(row.playerCapacity || 0),
        bookedSlots: parseInt(row.bookedSlots || 0),
        footballChief: {
          id: row.footballChiefId || null,
          name: row.footballChiefFirstName || '',
          number: row.footballChiefPhoneNumber || '',
          email: row.footballChiefEmail || ''
        }
      });
    });

    const endTime2 = Date.now();
    console.log("venueMap query ends here", endTime2, "time taken", endTime2 - startTime2);

    // Sort matches within each venue by start time (ascending)
    venueMap.forEach((venueData) => {
      venueData.matches.sort((a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
    });

    // Convert to array and sort by distance
    return Array.from(venueMap.values())
      .sort((a, b) => a.venue.distance - b.venue.distance)
      .slice(0, 10);
  }

  async getCriticalBookingInfo(matchId: number): Promise<any> {
    const match = await this.findOne(matchId);

    // Get locked slots count directly from database to ensure accuracy
    const lockedSlotsResult = await this.matchRepository.query(`
      SELECT locked_slots FROM matches WHERE match_id = $1
    `, [matchId]);

    const lockedSlots = lockedSlotsResult[0]?.locked_slots || {};
    const lockedSlotsCount: number = typeof lockedSlots === 'object' && lockedSlots !== null
      ? Object.values(lockedSlots as any).reduce((count: number, item: any) => {
        return count + (item as any).slots.length;
      }, 0) as number
      : 0;
    console.log("lockedSlotsCount", lockedSlotsCount);

    // Query confirmed booked slots using raw SQL to avoid relationship issues
    const confirmedBookedSlotsResult = await this.bookingSlotRepository.query(`
      SELECT COUNT(*) as count 
      FROM booking_slots bs 
      JOIN bookings b ON bs.booking_id = b.id 
      WHERE b.match_id = $1 AND bs.status = $2
    `, [matchId.toString(), BookingSlotStatus.ACTIVE]);

    const confirmedBookedSlots = parseInt(confirmedBookedSlotsResult[0]?.count || '0');

    // Get team-wise slot counts from match_participants
    const teamSlotsResult = await this.connection.query(`
      SELECT team_name, COUNT(*) as count
      FROM match_participants
      WHERE match_id = $1
      GROUP BY team_name
    `, [matchId]);

    // Calculate team-wise availability
    const perTeamCapacity = Math.floor(match.playerCapacity / 2);
    const teamASlots = teamSlotsResult.find(t => t.team_name === match.teamAName)?.count || 0;
    const teamBSlots = teamSlotsResult.find(t => t.team_name === match.teamBName)?.count || 0;
    const unassignedSlots = teamSlotsResult.find(t => t.team_name === 'Unassigned')?.count || 0;

    const availableTeamASlots = Math.max(0, perTeamCapacity - parseInt(teamASlots));
    const availableTeamBSlots = Math.max(0, perTeamCapacity - parseInt(teamBSlots));

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
      isLocked: lockedSlotsCount > 0,
      // Team information
      teamAName: match.teamAName,
      teamBName: match.teamBName,
      perTeamCapacity,
      teamASlots: parseInt(teamASlots),
      teamBSlots: parseInt(teamBSlots),
      unassignedSlots: parseInt(unassignedSlots),
      availableTeamASlots,
      availableTeamBSlots
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

  /**
   * Calculate the appropriate status for a match based on its type and stats workflow state.
   * For recorded matches, determines status based on PlayerNation submission and processing state.
   * CANCELLED status always takes priority.
   * 
   * @param match - The match entity
   * @returns The calculated status string
   */
  async calculateMatchStatus(match: Match): Promise<string> {
    // CANCELLED status always takes highest priority
    if (match.status === 'CANCELLED') {
      return 'CANCELLED';
    }

    // Stats workflow statuses only apply to recorded matches
    if (match.matchType !== MatchType.RECORDED) {
      return match.status || 'ACTIVE';
    }

    // For recorded matches, determine status based on stats workflow
    // 1. If not submitted to PlayerNation (no matchStatsId)
    if (!match.matchStatsId) {
      return 'STATS_SUBMISSION_PENDING';
    }

    // 2. If polling is in progress
    if (match.playernationStatus === 'PENDING' || match.playernationStatus === 'PROCESSING') {
      return 'POLLING_STATS';
    }

    // 3. If stats received, status is SS_MAPPING_PENDING (ready for mapping or processing)
    // This applies whether players are mapped or not - the status indicates stats are ready
    if (match.playernationStatus === 'SUCCESS' || match.playernationStatus === 'SUCCESS_WITH_UNMATCHED') {
      return 'SS_MAPPING_PENDING';
    }

    // 4. If stats are imported/completed
    if (match.playernationStatus === 'IMPORTED') {
      return 'STATS_UPDATED';
    }

    // Default to existing status or ACTIVE
    return match.status || 'ACTIVE';
  }

  /**
   * Update match status based on current state (for recorded matches with stats workflow)
   * This should be called after any change that might affect the status
   */
  async updateMatchStatusIfNeeded(matchId: number): Promise<void> {
    const match = await this.matchRepository.findOne({ where: { matchId } });
    if (!match) {
      return;
    }

    const calculatedStatus = await this.calculateMatchStatus(match);
    if (calculatedStatus !== match.status) {
      await this.matchRepository.update({ matchId }, { status: calculatedStatus });
    }
  }
} 