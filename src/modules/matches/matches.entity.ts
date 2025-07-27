import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';
import { City } from '../cities/cities.entity';
import { Venue } from '../venue/venue.entity';
import { MatchType } from '../../common/enums/match-type.enum';

@Entity('matches')
export class Match {
  @PrimaryGeneratedColumn('increment', { name: 'match_id' })
  matchId: number;

  @Column({ name: 'match_stats_id', type: 'varchar', length: 255, unique: true, nullable: true })
  matchStatsId: string;

  @Column({ 
    name: 'match_type', 
    type: 'enum', 
    enum: MatchType, 
    nullable: false 
  })
  matchType: MatchType;

  @Column({ name: 'start_time', type: 'timestamp', nullable: false })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamp', nullable: true })
  endTime: Date;

  @Column({ name: 'stats_received', type: 'boolean', default: false })
  statsReceived: boolean;

  @Column({ name: 'team_a_score', type: 'int', nullable: true })
  teamAScore: number;

  @Column({ name: 'team_b_score', type: 'int', nullable: true })
  teamBScore: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'football_chief' })
  footballChief: User;

  @ManyToOne(() => City, { nullable: true })
  @JoinColumn({ name: 'city' })
  city: City;

  @ManyToOne(() => Venue, { nullable: true })
  @JoinColumn({ name: 'venue' })
  venue: Venue;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
} 