import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../user/user.entity';
import { Match } from '../matches/matches.entity';
import { MatchParticipant } from '../match-participants/match-participants.entity';
import { MatchParticipantStats } from '../match-participant-stats/match-participant-stats.entity';
import { FootballTeam } from '../football-teams/football-teams.entity';
import { City } from '../cities/cities.entity';
import { Venue } from '../venue/venue.entity';
import { MatchType } from '../match-types/match-types.entity';
import { CsvUploadService } from '../match-participant-stats/csv-upload.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            User,
            Match,
            MatchParticipant,
            MatchParticipantStats,
            FootballTeam,
            City,
            Venue,
            MatchType,
        ]),
    ],
    controllers: [AdminController],
    providers: [AdminService, CsvUploadService],
    exports: [AdminService],
})
export class AdminModule { }
