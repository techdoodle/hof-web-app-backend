import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FootballTeamsController } from './football-teams.controller';
import { FootballTeamsService } from './football-teams.service';
import { FootballTeam } from './football-teams.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FootballTeam])],
  controllers: [FootballTeamsController],
  providers: [FootballTeamsService],
  exports: [FootballTeamsService],
})
export class FootballTeamsModule {} 