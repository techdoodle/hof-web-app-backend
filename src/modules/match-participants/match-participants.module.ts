import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchParticipantsController } from './match-participants.controller';
import { MatchParticipantsService } from './match-participants.service';
import { MatchParticipant } from './match-participants.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MatchParticipant])],
  controllers: [MatchParticipantsController],
  providers: [MatchParticipantsService],
  exports: [MatchParticipantsService],
})
export class MatchParticipantsModule {} 