import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like } from 'typeorm';
import { Match } from './matches.entity';
import { MatchType } from '../../common/enums/match-type.enum';

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
  ) { }

  async create(createMatchDto: Partial<Match>): Promise<Match> {
    const match = this.matchRepository.create(createMatchDto);
    return await this.matchRepository.save(match);
  }

  async findAll(): Promise<Match[]> {
    return await this.matchRepository.find({
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async findOne(matchId: number): Promise<Match> {
    const match = await this.matchRepository.findOne({
      where: { matchId },
      relations: ['footballChief', 'city', 'venue'],
    });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }
    return match;
  }

  async update(matchId: number, updateMatchDto: Partial<Match>): Promise<Match> {
    const match = await this.findOne(matchId);
    Object.assign(match, updateMatchDto);
    return await this.matchRepository.save(match);
  }

  async remove(matchId: number): Promise<void> {
    const match = await this.findOne(matchId);
    await this.matchRepository.remove(match);
  }

  async findByMatchType(matchTypeId: number): Promise<Match[]> {
    return await this.matchRepository.find({
      where: { matchTypeRef: { id: matchTypeId } as any },
      relations: ['footballChief', 'city', 'venue', 'matchTypeRef'],
      order: { startTime: 'DESC' },
    });
  }

  async findByFootballChief(footballChiefId: number): Promise<Match[]> {
    return await this.matchRepository.find({
      where: { footballChief: { id: footballChiefId } },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async findByCity(cityId: number): Promise<Match[]> {
    return await this.matchRepository.find({
      where: { city: { id: cityId } },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async findByVenue(venueId: number): Promise<Match[]> {
    return await this.matchRepository.find({
      where: { venue: { id: venueId } },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<Match[]> {
    return await this.matchRepository.find({
      where: {
        startTime: Between(startDate, endDate),
      },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async findByStatsReceived(statsReceived: boolean): Promise<Match[]> {
    return await this.matchRepository.find({
      where: { statsReceived },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
    });
  }

  async searchMatches(query: string, limit: number = 10): Promise<Match[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = query.trim();

    return await this.matchRepository.find({
      where: [
        { matchStatsId: Like(`%${searchTerm}%`) },
      ],
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
      take: limit,
    });
  }

  async getUpcomingMatches(limit: number = 10): Promise<Match[]> {
    const now = new Date();
    return await this.matchRepository.find({
      where: {
        startTime: Between(now, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)), // Next 30 days
      },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'ASC' },
      take: limit,
    });
  }

  async getCompletedMatches(limit: number = 10): Promise<Match[]> {
    const now = new Date();
    return await this.matchRepository.find({
      where: {
        startTime: Between(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), now), // Last year
        endTime: Between(new Date(0), now), // Has end time
      },
      relations: ['footballChief', 'city', 'venue'],
      order: { startTime: 'DESC' },
      take: limit,
    });
  }

  async updateMatchHighlights(matchId: number, matchHighlights: string): Promise<Match> {
    const match = await this.findOne(matchId);
    match.matchHighlights = matchHighlights;
    return await this.matchRepository.save(match);
  }

  async updateMatchRecap(matchId: number, matchRecap: string): Promise<Match> {
    const match = await this.findOne(matchId);
    match.matchRecap = matchRecap;
    return await this.matchRepository.save(match);
  }

  async updateMatchHighlightsAndRecap(matchId: number, matchHighlights: string, matchRecap: string): Promise<Match> {
    const match = await this.findOne(matchId);
    match.matchHighlights = matchHighlights;
    match.matchRecap = matchRecap;
    return await this.matchRepository.save(match);
  }

} 