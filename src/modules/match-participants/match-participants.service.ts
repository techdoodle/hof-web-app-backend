import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchParticipant } from './match-participants.entity';


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

    // Validate that we don't exceed 2 teams
    const existingParticipants = await this.findByMatch(createMatchParticipantDto.match.matchId);
    const existingTeamNames = new Set(existingParticipants.map(p => p.teamName));
    
    if (createMatchParticipantDto.teamName && !existingTeamNames.has(createMatchParticipantDto.teamName) && existingTeamNames.size >= 2) {
      throw new ConflictException('Cannot add more than 2 teams to a match');
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
      order: { teamName: 'ASC', createdAt: 'ASC' },
    });
  }

  async findByUser(userId: number): Promise<MatchParticipant[]> {
    return await this.matchParticipantRepository.find({
      where: { user: { id: userId } },
      relations: ['match', 'match.venue', 'user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByMatchAndTeamName(matchId: number, teamName: string): Promise<MatchParticipant[]> {
    return await this.matchParticipantRepository.find({
      where: { 
        match: { matchId },
        teamName 
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

  async getMatchParticipantsCount(matchId: number): Promise<{ teams: Record<string, number>; total: number }> {
    const participants = await this.findByMatch(matchId);
    
    const teams: Record<string, number> = {};
    participants.forEach(p => {
      teams[p.teamName] = (teams[p.teamName] || 0) + 1;
    });
    
    return {
      teams,
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

  async updateTeamName(matchParticipantId: number, teamName: string): Promise<MatchParticipant> {
    const participant = await this.findOne(matchParticipantId);
    
    // Check if the new team name is different from current
    if (participant.teamName !== teamName) {
      // Get all participants in this match
      const matchParticipants = await this.findByMatch(participant.match.matchId);
      const existingTeamNames = new Set(matchParticipants.map(p => p.teamName));
      
      // If this is a new team name and we already have 2 teams, prevent the change
      if (!existingTeamNames.has(teamName) && existingTeamNames.size >= 2) {
        throw new ConflictException('Cannot add more than 2 teams to a match');
      }
    }
    
    participant.teamName = teamName;
    return await this.matchParticipantRepository.save(participant);
  }

  async updatePaidStatsOptIn(matchParticipantId: number, paidStatsOptIn: boolean): Promise<MatchParticipant> {
    const participant = await this.findOne(matchParticipantId);
    participant.paidStatsOptIn = paidStatsOptIn;
    return await this.matchParticipantRepository.save(participant);
  }

  async getUsersByMatch(matchId: number): Promise<{ teams: Record<string, any[]> }> {
    const participants = await this.findByMatch(matchId);
    
    const teams: Record<string, any[]> = {};
    participants.forEach(p => {
      if (!teams[p.teamName]) {
        teams[p.teamName] = [];
      }
      teams[p.teamName].push(p.user);
    });
    
    return { teams };
  }

  async getTwoTeamsForMatch(matchId: number): Promise<{ team1: { name: string; users: any[] }; team2: { name: string; users: any[] } } | null> {
    const participants = await this.findByMatch(matchId);
    
    const teamNames = [...new Set(participants.map(p => p.teamName))];
    
    if (teamNames.length !== 2) {
      return null; // Return null if there aren't exactly 2 teams
    }
    
    const team1Name = teamNames[0];
    const team2Name = teamNames[1];
    
    const team1Users = participants.filter(p => p.teamName === team1Name).map(p => p.user);
    const team2Users = participants.filter(p => p.teamName === team2Name).map(p => p.user);
    
    return {
      team1: { name: team1Name, users: team1Users },
      team2: { name: team2Name, users: team2Users }
    };
  }
} 