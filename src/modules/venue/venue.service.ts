import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Venue } from './venue.entity';

@Injectable()
export class VenueService {
  constructor(
    @InjectRepository(Venue)
    private readonly venueRepository: Repository<Venue>,
  ) {}

  async create(createVenueDto: Partial<Venue>): Promise<Venue> {
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

  async update(id: number, updateVenueDto: Partial<Venue>): Promise<Venue> {
    const venue = await this.findOne(id);
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