import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Match } from '../../matches/matches.entity';
import { PlayerNationService } from '../services/playernation.service';

@Injectable()
export class PlayerNationPollingJob {
  private readonly logger = new Logger(PlayerNationPollingJob.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    private readonly playerNationService: PlayerNationService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async pollPlayerNationStats() {
    this.logger.log('Starting PlayerNation polling job');

    try {
      // Find matches that need polling (exclude SUCCESS, IMPORTED, ERROR, and TIMEOUT)
      const matchesToPoll = await this.matchRepository.find({
        where: [
          {
            playernationStatus: 'PENDING',
            playernationPollAttempts: LessThan(12),
          },
          {
            playernationStatus: 'PROCESSING',
            playernationPollAttempts: LessThan(12),
            playernationNextPollAt: LessThan(new Date()),
          },
        ],
      });

      this.logger.log(`Found ${matchesToPoll.length} matches to poll`);

      for (const match of matchesToPoll) {
        try {
          await this.playerNationService.pollMatchStats(match.matchId);
          
          // Refresh match to get updated status
          const updatedMatch = await this.matchRepository.findOne({
            where: { matchId: match.matchId },
          });
          
          // Only log success if status wasn't changed to SUCCESS/IMPORTED by pollMatchStats
          if (updatedMatch && updatedMatch.playernationStatus && !['SUCCESS', 'IMPORTED'].includes(updatedMatch.playernationStatus)) {
            this.logger.log(`Polled match ${match.matchId}, status: ${updatedMatch.playernationStatus}`);
          } else {
            this.logger.log(`Successfully polled and processed match ${match.matchId}`);
          }
        } catch (error) {
          this.logger.error(`Failed to poll match ${match.matchId}:`, error);
          
          // Refresh match to check current status before incrementing attempts
          const currentMatch = await this.matchRepository.findOne({
            where: { matchId: match.matchId },
          });
          
          // Don't increment attempts or mark as timeout if status was already set to SUCCESS/IMPORTED
          if (currentMatch && currentMatch.playernationStatus && ['SUCCESS', 'IMPORTED'].includes(currentMatch.playernationStatus)) {
            this.logger.log(`Match ${match.matchId} already has status ${currentMatch.playernationStatus}, skipping error handling`);
            continue;
          }
          
          // Increment poll attempts on failure
          const newAttemptCount = (currentMatch?.playernationPollAttempts || match.playernationPollAttempts) + 1;
          await this.matchRepository.update(match.matchId, {
            playernationPollAttempts: newAttemptCount,
          });

          // If we've exceeded max attempts, mark as timeout (only if not already SUCCESS/IMPORTED)
          if (newAttemptCount >= 12) {
            await this.matchRepository.update(match.matchId, {
              playernationStatus: 'TIMEOUT',
            });
            this.logger.warn(`Match ${match.matchId} marked as TIMEOUT after 12 failed attempts`);
          }
        }
      }

      this.logger.log('PlayerNation polling job completed');
    } catch (error) {
      this.logger.error('PlayerNation polling job failed:', error);
    }
  }

  // Manual polling method for immediate execution
  async pollMatchNow(matchId: number): Promise<void> {
    this.logger.log(`Manually polling match ${matchId}`);
    
    try {
      await this.playerNationService.pollMatchStats(matchId);
      this.logger.log(`Successfully polled match ${matchId} manually`);
    } catch (error) {
      this.logger.error(`Failed to manually poll match ${matchId}:`, error);
      throw error;
    }
  }
}
