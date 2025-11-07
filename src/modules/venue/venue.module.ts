import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VenueController } from './venue.controller';
import { VenueService } from './venue.service';
import { Venue } from './venue.entity';
import { VenueFormatEntity } from './venue-formats.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Venue, VenueFormatEntity])],
  controllers: [VenueController],
  providers: [VenueService],
  exports: [VenueService],
})
export class VenueModule {} 