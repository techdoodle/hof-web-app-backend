import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TicketPriority, TicketStatus } from '../entities/ticket.entity';

const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved'];
const TICKET_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high'];

export class CreateTicketDto {
  @IsInt()
  matchId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsEnum(TICKET_PRIORITIES)
  priority?: TicketPriority;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsEnum(TICKET_STATUSES)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TICKET_PRIORITIES)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  resolutionNotes?: string;

  @IsOptional()
  @IsInt()
  assignedToAdminId?: number;
}


