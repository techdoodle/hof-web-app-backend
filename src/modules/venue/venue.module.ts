import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VenueController } from './venue.controller';
import { VenueService } from './venue.service';
import { Venue } from './venue.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Venue])],
  controllers: [VenueController],
  providers: [VenueService],
  exports: [VenueService],
})
export class VenueModule {} 