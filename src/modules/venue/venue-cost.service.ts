import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match } from '../matches/matches.entity';
import { VenueFormatEntity } from './venue-formats.entity';
import { VenueFormat } from './venue-format.enum';

@Injectable()
export class VenueCostService {
  constructor(
    @InjectRepository(VenueFormatEntity)
    private venueFormatRepository: Repository<VenueFormatEntity>,
  ) {}

  /**
   * Determines match format from player capacity
   */
  private getFormatFromCapacity(playerCapacity: number | null | undefined): VenueFormat {
    if (!playerCapacity || playerCapacity <= 0) {
      return VenueFormat.ELEVEN_VS_ELEVEN; // Default
    }

    const perTeam = Math.round(playerCapacity / 2);
    const size = Math.min(11, Math.max(5, perTeam));

    const formatMap: Record<number, VenueFormat> = {
      5: VenueFormat.FIVE_VS_FIVE,
      6: VenueFormat.SIX_VS_SIX,
      7: VenueFormat.SEVEN_VS_SEVEN,
      8: VenueFormat.EIGHT_VS_EIGHT,
      9: VenueFormat.NINE_VS_NINE,
      10: VenueFormat.TEN_VS_TEN,
      11: VenueFormat.ELEVEN_VS_ELEVEN,
    };

    return formatMap[size] || VenueFormat.ELEVEN_VS_ELEVEN;
  }

  /**
   * Checks if match is in the morning (before venue-specific cutoff, default 12:00 PM)
   */
  private isMorning(startTime: Date, morningEndHour?: number): boolean {
    const hours = new Date(startTime).getHours();
    const cutoff = typeof morningEndHour === 'number' ? morningEndHour : 12;
    return hours < cutoff;
  }

  /**
   * Checks if match is on weekend (Saturday or Sunday)
   */
  private isWeekend(startTime: Date): boolean {
    const day = new Date(startTime).getDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
  }

  /**
   * Calculates venue cost for a match based on format, time, and day type
   */
  async calculateVenueCost(match: Match): Promise<number> {
    if (!match.venue || !match.playerCapacity) {
      return 0;
    }

    const format = this.getFormatFromCapacity(match.playerCapacity);
    const morningEndHour = (match.venue as any)?.morningEndHour;
    const isMorningMatch = this.isMorning(match.startTime, morningEndHour);
    const isWeekendMatch = this.isWeekend(match.startTime);

    // Find venue format configuration
    const venueFormat = await this.venueFormatRepository.findOne({
      where: {
        venue: { id: match.venue.id },
        format: format,
      },
    });

    if (!venueFormat) {
      return 0; // No format configuration found
    }

    // Apply fallback logic based on time and day
    let cost: number | null = null;

    if (isWeekendMatch && isMorningMatch) {
      // Weekend morning: weekend_morning_cost → weekend_cost → morning_cost → cost
      cost = venueFormat.weekendMorningCost ?? 
             venueFormat.weekendCost ?? 
             venueFormat.morningCost ?? 
             venueFormat.cost;
    } else if (isWeekendMatch) {
      // Weekend: weekend_cost → cost
      cost = venueFormat.weekendCost ?? venueFormat.cost;
    } else if (isMorningMatch) {
      // Weekday morning: morning_cost → cost
      cost = venueFormat.morningCost ?? venueFormat.cost;
    } else {
      // Weekday: cost
      cost = venueFormat.cost;
    }

    return Number(cost) || 0;
  }
}

