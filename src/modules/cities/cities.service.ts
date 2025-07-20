import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between } from 'typeorm';
import { City } from './cities.entity';

@Injectable()
export class CitiesService {
  constructor(
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
  ) {}

  async create(createCityDto: Partial<City>): Promise<City> {
    const city = this.cityRepository.create(createCityDto);
    return await this.cityRepository.save(city);
  }

  async findAll(): Promise<City[]> {
    return await this.cityRepository.find({
      order: { cityName: 'ASC' },
    });
  }

  async findOne(id: number): Promise<City> {
    const city = await this.cityRepository.findOne({ where: { id } });
    if (!city) {
      throw new NotFoundException(`City with ID ${id} not found`);
    }
    return city;
  }

  async update(id: number, updateCityDto: Partial<City>): Promise<City> {
    const city = await this.findOne(id);
    Object.assign(city, updateCityDto);
    return await this.cityRepository.save(city);
  }

  async remove(id: number): Promise<void> {
    const city = await this.findOne(id);
    await this.cityRepository.remove(city);
  }

  async searchCities(query: string, limit: number = 10): Promise<City[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = query.trim();
    
    return await this.cityRepository.find({
      where: [
        { cityName: Like(`%${searchTerm}%`) },
        { stateName: Like(`%${searchTerm}%`) },
        { country: Like(`%${searchTerm}%`) },
      ],
      order: { cityName: 'ASC' },
      take: limit,
    });
  }

  async findByCountry(country: string): Promise<City[]> {
    return await this.cityRepository.find({
      where: { country: Like(`%${country}%`) },
      order: { cityName: 'ASC' },
    });
  }

  async findByState(stateName: string): Promise<City[]> {
    return await this.cityRepository.find({
      where: { stateName: Like(`%${stateName}%`) },
      order: { cityName: 'ASC' },
    });
  }

  async findNearby(latitude: number, longitude: number, radiusKm: number = 50): Promise<City[]> {
    // Simple distance calculation using bounding box
    // For more accurate results, consider using PostGIS or implementing Haversine formula
    const latDelta = radiusKm / 111.32; // Approximate km per degree latitude
    const lonDelta = radiusKm / (111.32 * Math.cos(latitude * Math.PI / 180));

    return await this.cityRepository.find({
      where: {
        latitude: Between(latitude - latDelta, latitude + latDelta),
        longitude: Between(longitude - lonDelta, longitude + lonDelta),
      },
      order: { cityName: 'ASC' },
    });
  }

  async getCitiesByCountry(country: string): Promise<City[]> {
    return await this.cityRepository.find({
      where: { country },
      order: { cityName: 'ASC' },
    });
  }

  async getCitiesByState(stateName: string): Promise<City[]> {
    return await this.cityRepository.find({
      where: { stateName },
      order: { cityName: 'ASC' },
    });
  }
} 