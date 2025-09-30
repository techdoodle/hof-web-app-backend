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
import { VenueService } from './venue.service';
import { Venue } from './venue.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('venues')
export class VenueController {
  constructor(private readonly venueService: VenueService) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createVenueDto: any): Promise<Venue> {
    try {
      return await this.venueService.create(createVenueDto);
    } catch (error) {
      throw new HttpException(
        `Failed to create venue: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get()
  async findAll(): Promise<Venue[]> {
    return await this.venueService.findAll();
  }

  @Get('search')
  async searchVenues(
    @Query('q') query: string,
    @Query('limit') limit?: string
  ): Promise<Venue[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.venueService.searchVenues(query.trim(), limitNum);
  }

  @Get('city/:city')
  async findByCity(@Param('city') city: any): Promise<Venue[]> {
    return await this.venueService.findByCity(city);
  }

  @Get('phone/:phoneNumber')
  async findByPhoneNumber(@Param('phoneNumber') phoneNumber: string): Promise<Venue[]> {
    const phoneNum = parseInt(phoneNumber, 10);
    if (isNaN(phoneNum)) {
      throw new HttpException(
        'Invalid phone number parameter',
        HttpStatus.BAD_REQUEST
      );
    }
    return await this.venueService.findByPhoneNumber(String(phoneNum));
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Venue> {
    return await this.venueService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVenueDto: any
  ): Promise<Venue> {
    try {
      return await this.venueService.update(id, updateVenueDto);
    } catch (error) {
      throw new HttpException(
        `Failed to update venue: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    await this.venueService.remove(id);
    return { message: 'Venue deleted successfully' };
  }
} 