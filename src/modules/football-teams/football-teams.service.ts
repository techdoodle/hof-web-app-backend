import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { FootballTeam } from './football-teams.entity';

@Injectable()
export class FootballTeamsService {
  constructor(
    @InjectRepository(FootballTeam)
    private footballTeamsRepository: Repository<FootballTeam>,
  ) {}

  async getTopTeams(limit: number = 9): Promise<FootballTeam[]> {
    return this.footballTeamsRepository.find({
      take: limit,
      where: {
        starred: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async searchTeamsByName(query: string): Promise<FootballTeam[]> {
    return this.footballTeamsRepository.find({
      where: {
        teamName: ILike(`%${query}%`),
      },
      take: 10,
      order: {
        teamName: 'ASC',
      },
    });
  }

  async findById(id: number): Promise<FootballTeam | null> {
    return this.footballTeamsRepository.findOneBy({ id });
  }

  async findAll(): Promise<FootballTeam[]> {
    return this.footballTeamsRepository.find({
      order: {
        teamName: 'ASC',
      },
    });
  }
} 