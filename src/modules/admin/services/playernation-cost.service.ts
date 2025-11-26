import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerNationCostConfig } from '../entities/playernation-cost-config.entity';
import { Match } from '../../matches/matches.entity';
import { MatchParticipant } from '../../match-participants/match-participants.entity';

@Injectable()
export class PlayerNationCostService {
  constructor(
    @InjectRepository(PlayerNationCostConfig)
    private costConfigRepository: Repository<PlayerNationCostConfig>,
    @InjectRepository(MatchParticipant)
    private matchParticipantRepository: Repository<MatchParticipant>,
  ) {}

  /**
   * Gets the current cost per participant from configuration
   */
  async getCostPerParticipant(): Promise<number> {
    // TypeORM v0.3 requires a WHERE clause for findOne; use find with take:1 instead
    const configs = await this.costConfigRepository.find({
      order: { id: 'ASC' },
      take: 1,
    });
    const config = configs[0];

    if (!config) {
      // If no config exists, return 0 (should not happen after migration)
      return 0;
    }

    return Number(config.costPerParticipant) || 0;
  }

  /**
   * Sets the cost per participant (super_admin only)
   */
  async setCostPerParticipant(cost: number): Promise<PlayerNationCostConfig> {
    if (cost < 0) {
      throw new Error('Cost per participant cannot be negative');
    }

    const configs = await this.costConfigRepository.find({
      order: { id: 'ASC' },
      take: 1,
    });
    let config = configs[0];

    if (!config) {
      // Create if doesn't exist
      config = this.costConfigRepository.create({ costPerParticipant: cost });
    } else {
      config.costPerParticipant = cost;
    }

    return await this.costConfigRepository.save(config);
  }

  /**
   * Calculates PlayerNation cost for a specific match
   */
  async calculatePlayerNationCost(matchId: number): Promise<number> {
    const costPerParticipant = await this.getCostPerParticipant();
    
    if (costPerParticipant === 0) {
      return 0;
    }

    // Count participants for this match
    const participantCount = await this.matchParticipantRepository.count({
      where: { match: { matchId } },
    });

    return participantCount * costPerParticipant;
  }

  /**
   * Batch calculation for multiple matches
   */
  async calculatePlayerNationCostForMatches(matches: Match[]): Promise<Map<number, number>> {
    const costPerParticipant = await this.getCostPerParticipant();
    const costs = new Map<number, number>();

    if (costPerParticipant === 0 || matches.length === 0) {
      return costs;
    }

    const matchIds = matches.map(m => m.matchId);

    // Get participant counts for all matches in one query
    const participantCounts = await this.matchParticipantRepository
      .createQueryBuilder('mp')
      .select('m.match_id', 'matchId')
      .addSelect('COUNT(*)', 'count')
      .innerJoin('mp.match', 'm')
      .where('m.match_id IN (:...matchIds)', { matchIds })
      .groupBy('m.match_id')
      .getRawMany();

    // Create a map of matchId -> count
    const countMap = new Map<number, number>();
    participantCounts.forEach((row: any) => {
      countMap.set(Number(row.matchId), Number(row.count));
    });

    // Calculate costs
    matchIds.forEach(matchId => {
      const count = countMap.get(matchId) || 0;
      costs.set(matchId, count * costPerParticipant);
    });

    return costs;
  }
}

