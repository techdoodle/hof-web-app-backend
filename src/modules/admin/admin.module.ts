import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { AdminController } from './admin.controller';
import { TestController } from './test.controller';
import { AdminService } from './admin.service';
import { User } from '../user/user.entity';
import { Match } from '../matches/matches.entity';
import { MatchParticipant } from '../match-participants/match-participants.entity';
import { MatchParticipantStats } from '../match-participant-stats/match-participant-stats.entity';
import { FootballTeam } from '../football-teams/football-teams.entity';
import { City } from '../cities/cities.entity';
import { Venue } from '../venue/venue.entity';
import { VenueFormatEntity } from '../venue/venue-formats.entity';
import { MatchType } from '../match-types/match-types.entity';
import { CsvUploadService } from '../match-participant-stats/csv-upload.service';
import { PlayerNationService } from './services/playernation.service';
import { VenueCsvUploadService } from './services/venue-excel-upload.service';
import { PlayerNationPollingJob } from './jobs/playernation-polling.job';
import { FirebaseStorageService } from '../user/firebase-storage.service';
import { FirebaseConfig } from '../../config/firebase.config';
import { PlayerNationToken } from './entities/playernation-token.entity';
import { PlayerNationPlayerMapping } from './entities/playernation-player-mapping.entity';
import { BookingEntity } from '../booking/booking.entity';
import { BookingSlotEntity } from '../booking/booking-slot.entity';
import { PaymentModule } from '../payment/payment.module';
import { MatchesModule } from '../matches/matches.module';
import { VenueModule } from '../venue/venue.module';
import { AccountingService } from './services/accounting.service';
import { PlayerNationCostService } from './services/playernation-cost.service';
import { FootballChiefLeaderboardService } from './services/football-chief-leaderboard.service';
import { AnalyticsService } from './services/analytics.service';
import { PlayerNationCostConfig } from './entities/playernation-cost-config.entity';
import { RefundEntity } from '../payment/refund.entity';
import { MatchParticipantsModule } from '../match-participants/match-participants.module';
import { Ticket } from './entities/ticket.entity';
import { TicketsService } from './services/tickets.service';

@Module({
    imports: [
        HttpModule,
        TypeOrmModule.forFeature([
            User,
            Match,
            MatchParticipant,
            MatchParticipantStats,
            FootballTeam,
            City,
            Venue,
            VenueFormatEntity,
            MatchType,
            PlayerNationToken,
            PlayerNationPlayerMapping,
            BookingEntity,
            BookingSlotEntity,
            PlayerNationCostConfig,
            RefundEntity,
            Ticket,
        ]),
        PaymentModule,
        MatchesModule,
        VenueModule,
        MatchParticipantsModule,
    ],
    controllers: [AdminController, TestController],
    providers: [AdminService, CsvUploadService, PlayerNationService, PlayerNationPollingJob, FirebaseStorageService, FirebaseConfig, VenueCsvUploadService, AccountingService, PlayerNationCostService, FootballChiefLeaderboardService, AnalyticsService, TicketsService],
    exports: [AdminService, PlayerNationService],
})
export class AdminModule { }
