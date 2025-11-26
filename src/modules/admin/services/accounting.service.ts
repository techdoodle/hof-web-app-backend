import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Match } from '../../matches/matches.entity';
import { BookingEntity } from '../../booking/booking.entity';
import { RefundEntity } from '../../payment/refund.entity';
import { BookingStatus, PaymentStatus, RefundStatus } from '../../../common/types/booking.types';
import { VenueCostService } from '../../venue/venue-cost.service';
import { PlayerNationCostService } from './playernation-cost.service';

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(Match)
    private matchRepository: Repository<Match>,
    @InjectRepository(BookingEntity)
    private bookingRepository: Repository<BookingEntity>,
    @InjectRepository(RefundEntity)
    private refundRepository: Repository<RefundEntity>,
    private venueCostService: VenueCostService,
    private playerNationCostService: PlayerNationCostService,
  ) {}

  /**
   * Get overall accounting summary
   */
  async getAccountingSummary(dateFrom?: Date, dateTo?: Date) {
    const dateFilter = this.buildDateFilter(dateFrom, dateTo);

    // Get all matches in date range
    const matches = await this.matchRepository.find({
      where: dateFilter,
      relations: ['venue', 'city', 'footballChief'],
    });

    // Calculate costs
    const venueCosts = await this.calculateTotalVenueCosts(matches);
    const footballChiefCosts = await this.calculateTotalFootballChiefCosts(matches);
    const playerNationCosts = await this.calculateTotalPlayerNationCosts(matches);

    // Get income from confirmed bookings
    const incomeQuery = this.bookingRepository
      .createQueryBuilder('booking')
      .select('COALESCE(SUM(booking.total_amount), 0)', 'total')
      .leftJoin('matches', 'm', 'm.match_id = booking.match_id')
      .where('booking.status = :status', { status: BookingStatus.CONFIRMED });
    
    if (dateFrom || dateTo) {
      if (dateFrom) {
        incomeQuery.andWhere('m.start_time >= :dateFrom', { dateFrom: dateFrom.toISOString() });
      }
      if (dateTo) {
        incomeQuery.andWhere('m.start_time <= :dateTo', { dateTo: dateTo.toISOString() });
      }
    }
    
    const incomeResult = await incomeQuery.getRawOne();

    const totalIncome = Number(incomeResult?.total || 0);

    // Calculate Razorpay payment fees (2% of online payments)
    const paymentFeesQuery = this.bookingRepository
      .createQueryBuilder('booking')
      .select('COALESCE(SUM(booking.total_amount), 0)', 'total')
      .leftJoin('matches', 'm', 'm.match_id = booking.match_id')
      .where('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('booking.payment_status = :paymentStatus', { paymentStatus: PaymentStatus.COMPLETED })
      .andWhere('booking.payment_status != :cashStatus', { cashStatus: PaymentStatus.PAID_CASH });
    
    if (dateFrom || dateTo) {
      if (dateFrom) {
        paymentFeesQuery.andWhere('m.start_time >= :dateFrom', { dateFrom: dateFrom.toISOString() });
      }
      if (dateTo) {
        paymentFeesQuery.andWhere('m.start_time <= :dateTo', { dateTo: dateTo.toISOString() });
      }
    }
    
    const paymentFeesResult = await paymentFeesQuery.getRawOne();

    const totalRazorpayPaymentFees = Number(paymentFeesResult?.total || 0) * 0.02;

    // Get refund amounts and fees
    const refundData = await this.getRefundData(dateFrom, dateTo);
    const totalRefundAmount = refundData.totalAmount;
    const totalRazorpayRefundFees = refundData.totalFees;

    // Calculate cancelled match costs
    const cancelledMatches = matches.filter(m => m.status === 'CANCELLED');
    const cancelledCosts = await this.calculateCancelledMatchCosts(cancelledMatches);

    const totalCosts = venueCosts + footballChiefCosts + playerNationCosts;
    const totalRazorpayFees = totalRazorpayPaymentFees + totalRazorpayRefundFees;
    const netProfit = totalIncome - totalCosts - totalRazorpayFees;

    return {
      totalIncome,
      totalVenueCosts: venueCosts,
      totalFootballChiefCosts: footballChiefCosts,
      totalPlayerNationCosts: playerNationCosts,
      totalRazorpayPaymentFees,
      totalRefundAmount,
      totalRazorpayRefundFees,
      totalRazorpayFees,
      cancelledMatchCosts: cancelledCosts,
      totalCosts,
      netProfit,
      matchCount: matches.length,
      bookingCount: await this.bookingRepository.count({
        where: { status: BookingStatus.CONFIRMED },
      }),
      dateRange: {
        from: dateFrom || new Date(0),
        to: dateTo || new Date(),
      },
    };
  }

  /**
   * Get accounting details for a specific match
   */
  async getMatchAccounting(matchId: number) {
    const match = await this.matchRepository.findOne({
      where: { matchId },
      relations: ['venue', 'city', 'footballChief'],
    });

    if (!match) {
      throw new Error(`Match with ID ${matchId} not found`);
    }

    // Get income from bookings (total)
    const incomeResult = await this.bookingRepository
      .createQueryBuilder('booking')
      .select('COALESCE(SUM(booking.total_amount), 0)', 'total')
      .where('booking.match_id = :matchId', { matchId })
      .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .getRawOne();

    const income = Number(incomeResult?.total || 0);

    // Split income into cash vs online
    const cashIncomeResult = await this.bookingRepository
      .createQueryBuilder('booking')
      .select('COALESCE(SUM(booking.total_amount), 0)', 'total')
      .where('booking.match_id = :matchId', { matchId })
      .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('booking.payment_status = :cashStatus', { cashStatus: PaymentStatus.PAID_CASH })
      .getRawOne();

    const onlineIncomeResult = await this.bookingRepository
      .createQueryBuilder('booking')
      .select('COALESCE(SUM(booking.total_amount), 0)', 'total')
      .where('booking.match_id = :matchId', { matchId })
      .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('booking.payment_status = :paymentStatus', { paymentStatus: PaymentStatus.COMPLETED })
      .getRawOne();

    const cashIncome = Number(cashIncomeResult?.total || 0);
    const onlineIncome = Number(onlineIncomeResult?.total || 0);

    // Calculate costs
    const venueCost = await this.venueCostService.calculateVenueCost(match);
    const footballChiefCost = Number(match.footballChiefCost || 0);
    const playerNationCost = await this.playerNationCostService.calculatePlayerNationCost(matchId);

    // Calculate Razorpay payment fees (2% of online income)
    const razorpayPaymentFees = onlineIncome * 0.02;

    // Get refund data for this match
    const refundData = await this.getRefundDataForMatch(matchId);
    const refundAmount = refundData.totalAmount;
    const razorpayRefundFees = refundData.totalFees;

    const totalCosts = venueCost + footballChiefCost + playerNationCost;
    const totalFees = razorpayPaymentFees + razorpayRefundFees;
    const netProfit = income - totalCosts - totalFees;

    return {
      matchId: match.matchId,
      matchDate: match.startTime,
      venue: match.venue?.name,
      city: match.city?.cityName,
      footballChief: match.footballChief?.firstName + ' ' + match.footballChief?.lastName,
      income,
      cashIncome,
      onlineIncome,
      venueCost,
      footballChiefCost,
      playerNationCost,
      razorpayPaymentFees,
      refundAmount,
      razorpayRefundFees,
      totalCosts,
      totalFees,
      netProfit,
    };
  }

  /**
   * Get accounting details for a list of matches (per-match breakdown)
   */
  private async getMatchAccountingForMatches(matches: Match[]) {
    const details: any[] = [];
    for (const match of matches) {
      const info = await this.getMatchAccounting(match.matchId);
      details.push(info);
    }
    return details;
  }

  /**
   * Get accounting breakdown by city
   */
  async getAccountingByCity(dateFrom?: Date, dateTo?: Date) {
    const dateFilter = this.buildDateFilter(dateFrom, dateTo);

    const matches = await this.matchRepository.find({
      where: dateFilter,
      relations: ['venue', 'city', 'footballChief'],
    });

    // Group matches by city
    const cityMap = new Map<number, Match[]>();
    matches.forEach(match => {
      if (match.city) {
        const cityId = match.city.id;
        if (!cityMap.has(cityId)) {
          cityMap.set(cityId, []);
        }
        cityMap.get(cityId)!.push(match);
      }
    });

    const results: any[] = [];
    for (const [cityId, cityMatches] of cityMap.entries()) {
      const city = cityMatches[0].city!;
      const accounting = await this.calculateAccountingForMatches(cityMatches);
      
      results.push({
        cityId: city.id,
        cityName: city.cityName,
        matchCount: cityMatches.length,
        ...accounting,
      });
    }

    return results;
  }

  /**
   * Get accounting breakdown by football chief
   */
  async getAccountingByFootballChief(dateFrom?: Date, dateTo?: Date) {
    const dateFilter = this.buildDateFilter(dateFrom, dateTo);

    const matches = await this.matchRepository.find({
      where: dateFilter,
      relations: ['venue', 'city', 'footballChief'],
    });

    // Group matches by football chief
    const chiefMap = new Map<number, Match[]>();
    matches.forEach(match => {
      const chiefId = match.footballChief.id;
      if (!chiefMap.has(chiefId)) {
        chiefMap.set(chiefId, []);
      }
      chiefMap.get(chiefId)!.push(match);
    });

    const results: any[] = [];
    for (const [chiefId, chiefMatches] of chiefMap.entries()) {
      const chief = chiefMatches[0].footballChief;
      const accounting = await this.calculateAccountingForMatches(chiefMatches);
      
      // Calculate their specific costs (football_chief_cost)
      const theirCosts = chiefMatches.reduce((sum, m) => sum + Number(m.footballChiefCost || 0), 0);
      
      results.push({
        footballChiefId: chief.id,
        footballChiefName: `${chief.firstName} ${chief.lastName}`,
        footballChiefEmail: chief.email,
        matchCount: chiefMatches.length,
        ...accounting,
        theirCosts,
      });
    }

    return results;
  }

  /**
   * Paginated match-level accounting for a given city
   */
  async getCityMatchAccounting(
    cityId: number,
    dateFrom?: Date,
    dateTo?: Date,
    page: number = 1,
    pageSize: number = 10,
  ) {
    const dateFilter = this.buildDateFilter(dateFrom, dateTo);

    const qb = this.matchRepository
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.venue', 'venue')
      .leftJoinAndSelect('match.city', 'city')
      .leftJoinAndSelect('match.footballChief', 'footballChief')
      .where('city.id = :cityId', { cityId });

    if (dateFilter.startTime) {
      qb.andWhere('match.startTime BETWEEN :from AND :to', {
        from: (dateFilter.startTime as any).lower ?? dateFrom,
        to: (dateFilter.startTime as any).upper ?? dateTo,
      });
    }

    const [matches, total] = await qb
      .orderBy('match.startTime', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const data = await this.getMatchAccountingForMatches(matches);
    return { data, total };
  }

  /**
   * Paginated match-level accounting for a given football chief
   */
  async getFootballChiefMatchAccounting(
    chiefId: number,
    dateFrom?: Date,
    dateTo?: Date,
    page: number = 1,
    pageSize: number = 10,
  ) {
    const dateFilter = this.buildDateFilter(dateFrom, dateTo);

    const qb = this.matchRepository
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.venue', 'venue')
      .leftJoinAndSelect('match.city', 'city')
      .leftJoinAndSelect('match.footballChief', 'footballChief')
      .where('footballChief.id = :chiefId', { chiefId });

    if (dateFilter.startTime) {
      qb.andWhere('match.startTime BETWEEN :from AND :to', {
        from: (dateFilter.startTime as any).lower ?? dateFrom,
        to: (dateFilter.startTime as any).upper ?? dateTo,
      });
    }

    const [matches, total] = await qb
      .orderBy('match.startTime', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const data = await this.getMatchAccountingForMatches(matches);
    return { data, total };
  }

  /**
   * Get costs incurred from cancelled matches
   */
  async getCancelledMatchCosts(dateFrom?: Date, dateTo?: Date, groupBy?: 'city' | 'football-chief') {
    const dateFilter = this.buildDateFilter(dateFrom, dateTo);
    dateFilter.status = 'CANCELLED';

    const cancelledMatches = await this.matchRepository.find({
      where: dateFilter,
      relations: ['venue', 'city', 'footballChief'],
    });

    const costs = await this.calculateCancelledMatchCosts(cancelledMatches);

    let grouped: any = null;
    if (groupBy === 'city') {
      const cityMap = new Map<number, Match[]>();
      cancelledMatches.forEach(match => {
        if (match.city) {
          const cityId = match.city.id;
          if (!cityMap.has(cityId)) {
            cityMap.set(cityId, []);
          }
          cityMap.get(cityId)!.push(match);
        }
      });

      grouped = [];
      for (const [cityId, cityMatches] of cityMap.entries()) {
        const city = cityMatches[0].city!;
        const cityCosts = await this.calculateCancelledMatchCosts(cityMatches);
        grouped.push({
          cityId: city.id,
          cityName: city.cityName,
          ...cityCosts,
        });
      }
    } else if (groupBy === 'football-chief') {
      const chiefMap = new Map<number, Match[]>();
      cancelledMatches.forEach(match => {
        const chiefId = match.footballChief.id;
        if (!chiefMap.has(chiefId)) {
          chiefMap.set(chiefId, []);
        }
        chiefMap.get(chiefId)!.push(match);
      });

      grouped = [];
      for (const [chiefId, chiefMatches] of chiefMap.entries()) {
        const chief = chiefMatches[0].footballChief;
        const chiefCosts = await this.calculateCancelledMatchCosts(chiefMatches);
        grouped.push({
          footballChiefId: chief.id,
          footballChiefName: `${chief.firstName} ${chief.lastName}`,
          ...chiefCosts,
        });
      }
    }

    return {
      summary: costs,
      matches: cancelledMatches.map(m => ({
        matchId: m.matchId,
        date: m.startTime,
        venue: m.venue?.name,
        city: m.city?.cityName,
        footballChief: `${m.footballChief.firstName} ${m.footballChief.lastName}`,
      })),
      grouped,
    };
  }

  // Private helper methods

  private buildDateFilter(dateFrom?: Date, dateTo?: Date) {
    const filter: any = {};
    if (dateFrom || dateTo) {
      filter.startTime = dateFrom && dateTo 
        ? Between(dateFrom, dateTo)
        : dateFrom 
          ? Between(dateFrom, new Date('2100-01-01'))
          : Between(new Date('1970-01-01'), dateTo);
    }
    return filter;
  }

  private async calculateTotalVenueCosts(matches: Match[]): Promise<number> {
    let total = 0;
    for (const match of matches) {
      total += await this.venueCostService.calculateVenueCost(match);
    }
    return total;
  }

  private async calculateTotalFootballChiefCosts(matches: Match[]): Promise<number> {
    return matches.reduce((sum, m) => sum + Number(m.footballChiefCost || 0), 0);
  }

  private async calculateTotalPlayerNationCosts(matches: Match[]): Promise<number> {
    const costs = await this.playerNationCostService.calculatePlayerNationCostForMatches(matches);
    return Array.from(costs.values()).reduce((sum, cost) => sum + cost, 0);
  }

  private async getRefundData(dateFrom?: Date, dateTo?: Date) {
    const query = this.refundRepository
      .createQueryBuilder('refund')
      .where('refund.status IN (:...statuses)', { 
        statuses: [RefundStatus.PROCESSING, RefundStatus.COMPLETED] 
      });

    if (dateFrom || dateTo) {
      if (dateFrom) {
        query.andWhere('refund.created_at >= :dateFrom', { dateFrom: dateFrom.toISOString() });
      }
      if (dateTo) {
        query.andWhere('refund.created_at <= :dateTo', { dateTo: dateTo.toISOString() });
      }
    }

    const refunds = await query.getMany();
    const totalAmount = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalFees = totalAmount * 0.02;

    return { totalAmount, totalFees };
  }

  private async getRefundDataForMatch(matchId: number) {
    // Get bookings for this match
    const bookings = await this.bookingRepository.find({
      where: { matchId },
      select: ['id'],
    });

    if (bookings.length === 0) {
      return { totalAmount: 0, totalFees: 0 };
    }

    const bookingIds = bookings.map(b => b.id);
    const refunds = await this.refundRepository.find({
      where: {
        bookingId: In(bookingIds),
        status: In([RefundStatus.PROCESSING, RefundStatus.COMPLETED]),
      },
    });

    const totalAmount = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalFees = totalAmount * 0.02;

    return { totalAmount, totalFees };
  }

  private async calculateCancelledMatchCosts(matches: Match[]) {
    const venueCosts = await this.calculateTotalVenueCosts(matches);
    const footballChiefCosts = await this.calculateTotalFootballChiefCosts(matches);
    const playerNationCosts = await this.calculateTotalPlayerNationCosts(matches);

    // Get refund amounts for cancelled match bookings
    const matchIds = matches.map(m => m.matchId);
    const bookings = await this.bookingRepository.find({
      where: {
        matchId: In(matchIds),
      },
      select: ['id'],
    });

    const bookingIds = bookings.map(b => b.id);
    const refunds = bookingIds.length > 0 
      ? await this.refundRepository.find({
          where: {
            bookingId: In(bookingIds),
            status: In([RefundStatus.PROCESSING, RefundStatus.COMPLETED]),
          },
        })
      : [];

    const refundAmount = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    const refundFees = refundAmount * 0.02;

    return {
      venueCosts,
      footballChiefCosts,
      playerNationCosts,
      refundAmount,
      refundFees,
      total: venueCosts + footballChiefCosts + playerNationCosts + refundFees,
    };
  }

  private async calculateAccountingForMatches(matches: Match[]) {
    const matchIds = matches.map(m => m.matchId);

    // Income
    const incomeResult = await this.bookingRepository
      .createQueryBuilder('booking')
      .select('COALESCE(SUM(booking.total_amount), 0)', 'total')
      .where('booking.match_id IN (:...matchIds)', { matchIds })
      .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .getRawOne();

    const income = Number(incomeResult?.total || 0);

    // Costs
    const venueCosts = await this.calculateTotalVenueCosts(matches);
    const footballChiefCosts = await this.calculateTotalFootballChiefCosts(matches);
    const playerNationCosts = await this.calculateTotalPlayerNationCosts(matches);

    // Payment fees
    const paymentFeesResult = await this.bookingRepository
      .createQueryBuilder('booking')
      .select('COALESCE(SUM(booking.total_amount), 0)', 'total')
      .where('booking.match_id IN (:...matchIds)', { matchIds })
      .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('booking.payment_status = :paymentStatus', { paymentStatus: PaymentStatus.COMPLETED })
      .andWhere('booking.payment_status != :cashStatus', { cashStatus: PaymentStatus.PAID_CASH })
      .getRawOne();

    const razorpayPaymentFees = Number(paymentFeesResult?.total || 0) * 0.02;

    // Refunds
    const bookings = await this.bookingRepository.find({
      where: { matchId: In(matchIds) },
      select: ['id'],
    });

    const bookingIds = bookings.map(b => b.id);
    const refunds = bookingIds.length > 0
      ? await this.refundRepository.find({
          where: {
            bookingId: In(bookingIds),
            status: In([RefundStatus.PROCESSING, RefundStatus.COMPLETED]),
          },
        })
      : [];

    const refundAmount = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    const razorpayRefundFees = refundAmount * 0.02;

    const totalCosts = venueCosts + footballChiefCosts + playerNationCosts;
    const totalFees = razorpayPaymentFees + razorpayRefundFees;
    const netProfit = income - totalCosts - totalFees;

    return {
      income,
      venueCosts,
      footballChiefCosts,
      playerNationCosts,
      razorpayPaymentFees,
      refundAmount,
      razorpayRefundFees,
      totalCosts,
      totalFees,
      netProfit,
    };
  }
}

