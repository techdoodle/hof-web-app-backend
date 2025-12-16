import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Match } from '../../matches/matches.entity';
import { User } from '../../user/user.entity';

export type TicketStatus = 'open' | 'in_progress' | 'resolved';
export type TicketPriority = 'low' | 'medium' | 'high';

@Entity('tickets')
@Index(['matchId', 'status', 'createdAt'])
export class Ticket {
  @PrimaryGeneratedColumn('increment', { name: 'id' })
  id: number;

  @Column({ name: 'match_id', type: 'int' })
  matchId: number;

  @ManyToOne(() => Match, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id', referencedColumnName: 'matchId' })
  match: Match;

  @Column({ name: 'created_by_admin_id', type: 'int' })
  createdByAdminId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_admin_id', referencedColumnName: 'id' })
  createdByAdmin: User;

  @Column({ name: 'assigned_to_admin_id', type: 'int', nullable: true })
  assignedToAdminId?: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_to_admin_id', referencedColumnName: 'id' })
  assignedToAdmin?: User | null;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text' })
  description: string;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes?: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'open' })
  status: TicketStatus;

  @Column({ name: 'priority', type: 'varchar', length: 20, default: 'medium' })
  priority: TicketPriority;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date;
}


