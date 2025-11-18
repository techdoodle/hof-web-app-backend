import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { Match } from './matches.entity';
import { Venue } from '../venue/venue.entity';
import { BookingSlotEntity } from '../booking/booking-slot.entity';
import { WaitlistEntry } from '../waitlist/entities/waitlist-entry.entity';
import { PlayerNationPlayerMapping } from '../admin/entities/playernation-player-mapping.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Match, Venue, BookingSlotEntity, WaitlistEntry, PlayerNationPlayerMapping])],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule { } 