import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchParticipantStatsController } from './match-participant-stats.controller';
import { MatchParticipantStatsService } from './match-participant-stats.service';
import { MatchParticipantStats } from './match-participant-stats.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MatchParticipantStats])],
  controllers: [MatchParticipantStatsController],
  providers: [MatchParticipantStatsService],
  exports: [MatchParticipantStatsService],
})
export class MatchParticipantStatsModule {} 