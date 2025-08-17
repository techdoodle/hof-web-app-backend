import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchParticipantStatsController } from './match-participant-stats.controller';
import { MatchParticipantStatsService } from './match-participant-stats.service';
import { MatchParticipantStats } from './match-participant-stats.entity';
import { CsvUploadService } from './csv-upload.service';
import { MatchParticipant } from '../match-participants/match-participants.entity';
import { User } from '../user/user.entity';
import { Match } from '../matches/matches.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MatchParticipantStats,
      MatchParticipant,
      User,
      Match,
    ])
  ],
  controllers: [MatchParticipantStatsController],
  providers: [MatchParticipantStatsService, CsvUploadService],
  exports: [MatchParticipantStatsService, CsvUploadService],
})
export class MatchParticipantStatsModule {} 