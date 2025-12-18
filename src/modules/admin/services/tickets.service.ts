import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Ticket } from '../entities/ticket.entity';
import { Match } from '../../matches/matches.entity';
import { User } from '../../user/user.entity';
import { CreateTicketDto, UpdateTicketDto } from '../dto/ticket.dto';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }

  async createForMatch(matchId: number, dto: CreateTicketDto, adminId: number): Promise<Ticket> {
    const match = await this.matchRepository.findOne({ where: { matchId } });
    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }

    const admin = await this.userRepository.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new BadRequestException('Invalid admin user');
    }

    const ticket = this.ticketRepository.create({
      matchId,
      title: dto.title,
      description: dto.description,
      priority: dto.priority ?? 'medium',
      status: 'open',
      createdByAdminId: adminId,
    });

    const saved = await this.ticketRepository.save(ticket);
    this.logger.log(`Created ticket ${saved.id} for match ${matchId} by admin ${adminId}`);
    return saved;
  }

  async list(params: {
    page?: number;
    limit?: number;
    status?: string;
    matchId?: number;
    priority?: string;
    createdByAdminId?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(Math.max(1, params.limit || 25), 100);
    const where: FindOptionsWhere<Ticket> = {};

    if (params.status) {
      where.status = params.status as any;
    }
    if (params.matchId) {
      where.matchId = params.matchId;
    }
    if (params.priority) {
      where.priority = params.priority as any;
    }
    if (params.createdByAdminId) {
      where.createdByAdminId = params.createdByAdminId;
    }

    const [items, total] = await this.ticketRepository.findAndCount({
      where,
      relations: {
        createdByAdmin: true,
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data: items, total, page, limit };
  }

  async findById(id: number): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }
    return ticket;
  }

  async update(id: number, dto: UpdateTicketDto): Promise<Ticket> {
    const ticket = await this.findById(id);

    if (dto.assignedToAdminId) {
      const assignee = await this.userRepository.findOne({ where: { id: dto.assignedToAdminId } });
      if (!assignee) {
        throw new BadRequestException('Invalid assignee');
      }
    }

    const updated = Object.assign(ticket, dto);
    const saved = await this.ticketRepository.save(updated);
    this.logger.log(`Updated ticket ${id} (status=${saved.status}, priority=${saved.priority})`);
    return saved;
  }
}


