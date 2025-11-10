import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Venue } from './venue.entity';
import { parseGoogleMapsUrl } from '../../common/utils/google-maps.util';

@Injectable()
export class VenueService {
  private readonly logger = new Logger(VenueService.name);

  constructor(
    @InjectRepository(Venue)
    private readonly venueRepository: Repository<Venue>,
  ) { }

  async create(createVenueDto: Partial<Venue> & { googleMapsUrl?: string; mapsUrl?: string; googleMaps?: string; mapUrl?: string }): Promise<Venue> {
    // Parse Google Maps URL if provided
    const googleMapsUrl = createVenueDto.googleMapsUrl || createVenueDto.mapsUrl || createVenueDto.googleMaps || createVenueDto.mapUrl;
    if (googleMapsUrl && (!createVenueDto.latitude || !createVenueDto.longitude)) {
      this.logger.log(`[create] Parsing Google Maps URL: ${googleMapsUrl}`);
      const coords = await parseGoogleMapsUrl(googleMapsUrl);
      this.logger.log(`[create] Google Maps URL parser returned: ${JSON.stringify(coords)}`);
      if (coords) {
        createVenueDto.latitude = coords.latitude;
        createVenueDto.longitude = coords.longitude;
        this.logger.log(`[create] Extracted coordinates: latitude=${coords.latitude}, longitude=${coords.longitude}`);
      } else {
        this.logger.warn(`[create] Failed to parse Google Maps URL: ${googleMapsUrl}`);
      }
    }

    // Remove URL fields from DTO
    delete (createVenueDto as any).googleMapsUrl;
    delete (createVenueDto as any).mapsUrl;
    delete (createVenueDto as any).googleMaps;
    delete (createVenueDto as any).mapUrl;

    const venue = this.venueRepository.create(createVenueDto);
    const savedVenue = await this.venueRepository.save(venue);
    
    // Reload to get relations
    const venueWithRelations = await this.venueRepository.findOne({
      where: { id: savedVenue.id },
      relations: ['city']
    });
    
    this.logger.log(`[create] Created venue details: ${JSON.stringify({
      id: venueWithRelations?.id,
      name: venueWithRelations?.name,
      phoneNumber: venueWithRelations?.phoneNumber,
      address: venueWithRelations?.address,
      city: venueWithRelations?.city ? `${venueWithRelations.city.cityName}, ${venueWithRelations.city.stateName}` : null,
      latitude: venueWithRelations?.latitude,
      longitude: venueWithRelations?.longitude,
    }, null, 2)}`);
    
    return savedVenue;
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
      this.logger.log(`[update] Parsing Google Maps URL for venue ID ${id}: ${googleMapsUrl}`);
      const coords = await parseGoogleMapsUrl(googleMapsUrl);
      this.logger.log(`[update] Google Maps URL parser returned: ${JSON.stringify(coords)}`);
      if (coords) {
        updateVenueDto.latitude = coords.latitude;
        updateVenueDto.longitude = coords.longitude;
        this.logger.log(`[update] Extracted coordinates: latitude=${coords.latitude}, longitude=${coords.longitude}`);
      } else {
        this.logger.warn(`[update] Failed to parse Google Maps URL: ${googleMapsUrl}`);
      }
    }

    // Remove URL fields from DTO
    delete (updateVenueDto as any).googleMapsUrl;
    delete (updateVenueDto as any).mapsUrl;
    delete (updateVenueDto as any).googleMaps;
    delete (updateVenueDto as any).mapUrl;

    Object.assign(venue, updateVenueDto);
    const savedVenue = await this.venueRepository.save(venue);
    
    // Reload to get relations
    const venueWithRelations = await this.venueRepository.findOne({
      where: { id: savedVenue.id },
      relations: ['city']
    });
    
    this.logger.log(`[update] Updated venue details: ${JSON.stringify({
      id: venueWithRelations?.id,
      name: venueWithRelations?.name,
      phoneNumber: venueWithRelations?.phoneNumber,
      address: venueWithRelations?.address,
      city: venueWithRelations?.city ? `${venueWithRelations.city.cityName}, ${venueWithRelations.city.stateName}` : null,
      latitude: venueWithRelations?.latitude,
      longitude: venueWithRelations?.longitude,
    }, null, 2)}`);
    
    return savedVenue;
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