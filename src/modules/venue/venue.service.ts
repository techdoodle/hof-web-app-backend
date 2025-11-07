import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Venue } from './venue.entity';
import { parseGoogleMapsUrl } from '../../common/utils/google-maps.util';

@Injectable()
export class VenueService {
  constructor(
    @InjectRepository(Venue)
    private readonly venueRepository: Repository<Venue>,
  ) { }

  async create(createVenueDto: Partial<Venue> & { googleMapsUrl?: string; mapsUrl?: string; googleMaps?: string; mapUrl?: string }): Promise<Venue> {
    // Parse Google Maps URL if provided
    const googleMapsUrl = createVenueDto.googleMapsUrl || createVenueDto.mapsUrl || createVenueDto.googleMaps || createVenueDto.mapUrl;
    if (googleMapsUrl && (!createVenueDto.latitude || !createVenueDto.longitude)) {
      const coords = parseGoogleMapsUrl(googleMapsUrl);
      if (coords) {
        createVenueDto.latitude = coords.latitude;
        createVenueDto.longitude = coords.longitude;
      }
    }

    // Remove URL fields from DTO
    delete (createVenueDto as any).googleMapsUrl;
    delete (createVenueDto as any).mapsUrl;
    delete (createVenueDto as any).googleMaps;
    delete (createVenueDto as any).mapUrl;

    const venue = this.venueRepository.create(createVenueDto);
    return await this.venueRepository.save(venue);
  }

  async findAll(): Promise<Venue[]> {
    return await this.venueRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Venue> {
    const venue = await this.venueRepository.findOne({ where: { id } });
    if (!venue) {
      throw new NotFoundException(`Venue with ID ${id} not found`);
    }
    return venue;
  }

  async update(id: number, updateVenueDto: Partial<Venue> & { googleMapsUrl?: string; mapsUrl?: string; googleMaps?: string; mapUrl?: string }): Promise<Venue> {
    const venue = await this.findOne(id);

    // Parse Google Maps URL if provided
    const googleMapsUrl = updateVenueDto.googleMapsUrl || updateVenueDto.mapsUrl || updateVenueDto.googleMaps || updateVenueDto.mapUrl;
    if (googleMapsUrl) {
      const coords = parseGoogleMapsUrl(googleMapsUrl);
      if (coords) {
        updateVenueDto.latitude = coords.latitude;
        updateVenueDto.longitude = coords.longitude;
      }
    }

    // Remove URL fields from DTO
    delete (updateVenueDto as any).googleMapsUrl;
    delete (updateVenueDto as any).mapsUrl;
    delete (updateVenueDto as any).googleMaps;
    delete (updateVenueDto as any).mapUrl;

    Object.assign(venue, updateVenueDto);
    return await this.venueRepository.save(venue);
  }

  async remove(id: number): Promise<void> {
    const venue = await this.findOne(id);
    await this.venueRepository.remove(venue);
  }

  async findByCity(city: any): Promise<Venue[]> {
    return await this.venueRepository.find({
      where: { city },
      order: { name: 'ASC' },
    });
  }

  async searchVenues(query: string, limit: number = 10): Promise<Venue[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = query.trim();

    return await this.venueRepository.find({
      where: [
        { name: Like(`%${searchTerm}%`) },
        { address: Like(`%${searchTerm}%`) },
      ],
      order: { name: 'ASC' },
      take: limit,
    });
  }

  async findByPhoneNumber(phoneNumber: string): Promise<Venue[]> {
    return await this.venueRepository.find({
      where: { phoneNumber },
      order: { name: 'ASC' },
    });
  }
} 