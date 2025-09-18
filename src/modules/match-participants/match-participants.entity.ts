import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Match } from '../matches/matches.entity';
import { User } from '../user/user.entity';

@Entity('match_participants')
@Unique(['match', 'user'])
export class MatchParticipant {
  @PrimaryGeneratedColumn('increment', { name: 'match_participant_id' })
  matchParticipantId: number;

  @ManyToOne(() => Match, { nullable: false })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    name: 'team_name',
    type: 'varchar',
    length: 100,
    nullable: false
  })
  teamName: string;

  @Column({ name: 'paid_stats_opt_in', type: 'boolean', default: false })
  paidStatsOptIn: boolean;

  @Column({ name: 'player_highlights', nullable: true, default: null })
  playerHighlights?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
} 