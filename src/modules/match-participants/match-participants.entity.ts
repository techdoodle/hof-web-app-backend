import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Match } from '../matches/matches.entity';
import { User } from '../user/user.entity';
import { TeamSide } from '../../common/enums/team-side.enum';

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
    name: 'team_side', 
    type: 'varchar', 
    length: 1, 
    nullable: false 
  })
  teamSide: TeamSide;

  @Column({ name: 'paid_stats_opt_in', type: 'boolean', default: false })
  paidStatsOptIn: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
} 