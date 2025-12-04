import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { User } from './user.entity';
import { MatchParticipantStatsService } from '../match-participant-stats/match-participant-stats.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { UserSearchDto } from './dto/user-search.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly matchParticipantStatsService: MatchParticipantStatsService,
    private readonly leaderboardService: LeaderboardService,
  ) { }

  async create(data: Partial<User>) {
    const user = this.userRepository.create(data);
    const savedUser = await this.userRepository.save(user);
    // Return the user with relations loaded
    return this.userRepository.findOne({
      where: { id: savedUser.id },
      relations: ['city', 'preferredTeam']
    });
  }

  findAll() {
    return this.userRepository.find();
  }

  findOne(id: number) {
    return this.userRepository.findOne({
      where: { id },
      relations: ['city', 'preferredTeam']
    });
  }

  async update(id: number, data: Partial<User>) {
    // First update with the provided data
    await this.userRepository.update({ id }, data);

    // Get the updated user to check if all mandatory fields are filled
    const updatedUser = await this.userRepository.findOne({
      where: { id },
      relations: ['city', 'preferredTeam']
    });

    if (updatedUser) {
      // Check if all mandatory onboarding fields are filled
      // Note: profilePicture is intentionally NOT required so users can complete onboarding without a photo
      const mandatoryFieldsFilled = updatedUser.firstName &&
        updatedUser.lastName &&
        updatedUser.city &&
        updatedUser.gender &&
        updatedUser.playerCategory &&
        updatedUser.preferredTeam;

      // If all mandatory fields are filled and onboarding is not already complete, mark it as complete
      if (mandatoryFieldsFilled && !updatedUser.onboardingComplete) {
        await this.userRepository.update({ id }, { onboardingComplete: true });
      }
    }

    return this.userRepository.findOne({
      where: { id },
      relations: ['city', 'preferredTeam']
    });
  }

  remove(id: number) {
    return this.userRepository.delete({ id });
  }

  async findByMobile(mobile: string) {
    return this.userRepository.findOne({
      where: { phoneNumber: mobile },
      relations: ['city', 'preferredTeam']
    });
  }

  async findByEmail(email: string) {
    return this.userRepository.findOne({
      where: { email },
      relations: ['city', 'preferredTeam']
    });
  }

  async setWhatsappInviteOpt(userId: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['city', 'preferredTeam']
    });

    if (!user) {
      throw new Error('User not found');
    }

    // If whatsapp invite flag is already true, set invite sent flag to false
    if (user.whatsappInviteOpt) {
      await this.userRepository.update({ id: userId }, { inviteSent: false });
    } else {
      // If whatsapp invite flag is false, set it to true
      await this.userRepository.update({ id: userId }, { whatsappInviteOpt: true });
    }

    // Return the updated user
    const updatedUser = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['city', 'preferredTeam']
    });
    if (!updatedUser) {
      throw new Error('Failed to retrieve updated user');
    }
    return updatedUser;
  }

  async getCalibrationStatus(userId: number): Promise<{ isCalibrated: boolean; isMinimumRequisiteCompleteForCalibration: boolean; rank: number | null }> {
    // Check if user has at least 1 match stat (same as me API)
    const isCalibrated = await this.matchParticipantStatsService.hasStatsForPlayer(userId);

    // Check if user has at least 3 match stats
    const statsCount = await this.matchParticipantStatsService.countStatsForPlayer(userId);
    const isMinimumRequisiteCompleteForCalibration = statsCount >= 3;

    let rank: number | null = null;
    if (isCalibrated && isMinimumRequisiteCompleteForCalibration) {
      rank = await this.leaderboardService.getOverallRankForUser(userId);
    }

    return {
      isCalibrated,
      isMinimumRequisiteCompleteForCalibration,
      rank,
    };
  }

  /**
   * Normalize phone numbers to a consistent 10-digit format so that
   * search and booking mappings don't break due to formatting differences.
   * This mirrors the logic used in BookingService.
   */
  private normalizePhone(raw: string | null | undefined): string {
    if (!raw) return '';
    let digits = String(raw).replace(/\D/g, '');
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length > 10) return digits.slice(-10);
    return digits;
  }

  /**
   * Lightweight, paginated search for existing users, primarily used
   * for bulk booking flows. Supports city-scoped search and a single
   * query string that matches name or phone.
   */
  async searchUsers(params: UserSearchDto) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 && params.limit <= 50 ? params.limit : 25;
    const skip = (page - 1) * limit;

    const qb: SelectQueryBuilder<User> = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.city', 'city')
      .leftJoinAndSelect('user.preferredTeam', 'preferredTeam');

    // City filtering removed - show all users regardless of city

    if (params.query && params.query.trim().length > 0) {
      const q = params.query.trim();
      const normalizedPhone = this.normalizePhone(q);

      // Always match on name fields
      const conditions: string[] = [
        `LOWER(COALESCE(user.firstName, '')) LIKE :nameQuery`,
        `LOWER(COALESCE(user.lastName, '')) LIKE :nameQuery`,
        `LOWER(CONCAT(COALESCE(user.firstName, ''), ' ', COALESCE(user.lastName, ''))) LIKE :nameQuery`,
      ];

      const params: Record<string, any> = {
        nameQuery: `%${q.toLowerCase()}%`,
      };

      // Only add phone condition if query looks like a phone number
      if (normalizedPhone) {
        conditions.push(
          `REPLACE(REGEXP_REPLACE(COALESCE(user.phoneNumber, ''), '\\\\D', '', 'g'), '91', '') LIKE :phoneQuery`,
        );
        params.phoneQuery = `%${normalizedPhone}%`;
      }

      qb.andWhere(`(${conditions.join(' OR ')})`, params);
    }

    // Simple, safe alphabetical ordering for all cases
    qb.orderBy('user.firstName', 'ASC')
      .addOrderBy('user.lastName', 'ASC')
      .skip(skip)
      .take(limit);

    const [users, total] = await qb.getManyAndCount();

    return {
      success: true,
      message: 'Users fetched successfully',
      data: {
        users: users.map(u => ({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          phoneNumber: u.phoneNumber,
          city: u.city ? { id: (u.city as any).id, name: (u.city as any).name } : null,
          preferredTeam: u.preferredTeam
            ? { id: (u.preferredTeam as any).id, teamName: (u.preferredTeam as any).teamName }
            : null,
        })),
        pagination: {
          page,
          limit,
          total,
        },
      },
    };
  }
}
