import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchParticipant } from './match-participants.entity';
import { TeamSide } from '../../common/enums/team-side.enum';

@Injectable()
export class MatchParticipantsService {
  constructor(
    @InjectRepository(MatchParticipant)
    private readonly matchParticipantRepository: Repository<MatchParticipant>,
  ) {}

  async create(createMatchParticipantDto: Partial<MatchParticipant>): Promise<MatchParticipant> {
    // Check if participant already exists for this match
    if (!createMatchParticipantDto.match?.matchId || !createMatchParticipantDto.user?.id) {
      throw new ConflictException('Match or user information is missing');
    }
    const existingParticipant = await this.matchParticipantRepository.findOne({
      where: {
        match: { matchId: createMatchParticipantDto.match.matchId },
        user: { id: createMatchParticipantDto.user.id }
      }
    });

    if (existingParticipant) {
      throw new ConflictException('User is already a participant in this match');
    }

    const matchParticipant = this.matchParticipantRepository.create(createMatchParticipantDto);
    return await this.matchParticipantRepository.save(matchParticipant);
  }

  async findAll(): Promise<MatchParticipant[]> {
    return await this.matchParticipantRepository.find({
      relations: ['match', 'user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(matchParticipantId: number): Promise<MatchParticipant> {
    const matchParticipant = await this.matchParticipantRepository.findOne({ 
      where: { matchParticipantId },
      relations: ['match', 'user'],
    });
    if (!matchParticipant) {
      throw new NotFoundException(`Match participant with ID ${matchParticipantId} not found`);
    }
    return matchParticipant;
  }

  async update(matchParticipantId: number, updateMatchParticipantDto: Partial<MatchParticipant>): Promise<MatchParticipant> {
    const matchParticipant = await this.findOne(matchParticipantId);
    Object.assign(matchParticipant, updateMatchParticipantDto);
    return await this.matchParticipantRepository.save(matchParticipant);
  }

  async remove(matchParticipantId: number): Promise<void> {
    const matchParticipant = await this.findOne(matchParticipantId);
    await this.matchParticipantRepository.remove(matchParticipant);
  }

  async findByMatch(matchId: number): Promise<MatchParticipant[]> {
    return await this.matchParticipantRepository.find({
      where: { match: { matchId } },
      relations: ['match', 'user'],
      order: { teamSide: 'ASC', createdAt: 'ASC' },
    });
  }

  async findByUser(userId: number): Promise<MatchParticipant[]> {
    return await this.matchParticipantRepository.find({
      where: { user: { id: userId } },
      relations: ['match', 'user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByMatchAndTeamSide(matchId: number, teamSide: TeamSide): Promise<MatchParticipant[]> {
    return await this.matchParticipantRepository.find({
      where: { 
        match: { matchId },
        teamSide 
      },
      relations: ['match', 'user'],
      order: { createdAt: 'ASC' },
    });
  }

  async findByUserAndMatch(userId: number, matchId: number): Promise<MatchParticipant | null> {
    return await this.matchParticipantRepository.findOne({
      where: { 
        user: { id: userId },
        match: { matchId }
      },
      relations: ['match', 'user'],
    });
  }

  async findByPaidStatsOptIn(paidStatsOptIn: boolean): Promise<MatchParticipant[]> {
    return await this.matchParticipantRepository.find({
      where: { paidStatsOptIn },
      relations: ['match', 'user'],
      order: { createdAt: 'DESC' },
    });
  }

  async getMatchParticipantsCount(matchId: number): Promise<{ teamA: number; teamB: number; total: number }> {
    const participants = await this.findByMatch(matchId);
    
    const teamA = participants.filter(p => p.teamSide === TeamSide.A).length;
    const teamB = participants.filter(p => p.teamSide === TeamSide.B).length;
    
    return {
      teamA,
      teamB,
      total: participants.length
    };
  }

  async removeUserFromMatch(userId: number, matchId: number): Promise<void> {
    const participant = await this.findByUserAndMatch(userId, matchId);
    if (!participant) {
      throw new NotFoundException('User is not a participant in this match');
    }
    await this.matchParticipantRepository.remove(participant);
  }

  async updateTeamSide(matchParticipantId: number, teamSide: TeamSide): Promise<MatchParticipant> {
    const participant = await this.findOne(matchParticipantId);
    participant.teamSide = teamSide;
    return await this.matchParticipantRepository.save(participant);
  }

  async updatePaidStatsOptIn(matchParticipantId: number, paidStatsOptIn: boolean): Promise<MatchParticipant> {
    const participant = await this.findOne(matchParticipantId);
    participant.paidStatsOptIn = paidStatsOptIn;
    return await this.matchParticipantRepository.save(participant);
  }

  async getUsersByMatch(matchId: number): Promise<{ teamA: any[]; teamB: any[] }> {
    const participants = await this.findByMatch(matchId);
    
    const teamA = participants
      .filter(p => p.teamSide === TeamSide.A)
      .map(p => p.user);
    
    const teamB = participants
      .filter(p => p.teamSide === TeamSide.B)
      .map(p => p.user);
    
    return { teamA, teamB };
  }
} 