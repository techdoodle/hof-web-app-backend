import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Param, 
  Body, 
  Query, 
  ParseIntPipe,
  UseGuards,
  HttpStatus,
  HttpException
} from '@nestjs/common';
import { CitiesService } from './cities.service';
import { City } from './cities.entity';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createCityDto: any): Promise<City> {
    try {
      return await this.citiesService.create(createCityDto);
    } catch (error) {
      throw new HttpException(
        `Failed to create city: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get()
  async findAll(): Promise<City[]> {
    return await this.citiesService.findAll();
  }

  @Get('search')
  async searchCities(
    @Query('q') query: string,
    @Query('limit') limit?: string
  ): Promise<City[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }
    
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.citiesService.searchCities(query.trim(), limitNum);
  }

  @Get('country/:country')
  async findByCountry(@Param('country') country: string): Promise<City[]> {
    return await this.citiesService.findByCountry(country);
  }

  @Get('state/:stateName')
  async findByState(@Param('stateName') stateName: string): Promise<City[]> {
    return await this.citiesService.findByState(stateName);
  }

  @Get('nearby')
  async findNearby(
    @Query('lat') latitude: string,
    @Query('lng') longitude: string,
    @Query('radius') radius?: string
  ): Promise<City[]> {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radiusKm = radius ? parseFloat(radius) : 50;

    if (isNaN(lat) || isNaN(lng)) {
      throw new HttpException(
        'Invalid latitude or longitude parameters',
        HttpStatus.BAD_REQUEST
      );
    }

    return await this.citiesService.findNearby(lat, lng, radiusKm);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<City> {
    return await this.citiesService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCityDto: any
  ): Promise<City> {
    try {
      return await this.citiesService.update(id, updateCityDto);
    } catch (error) {
      throw new HttpException(
        `Failed to update city: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    await this.citiesService.remove(id);
    return { message: 'City deleted successfully' };
  }
} 