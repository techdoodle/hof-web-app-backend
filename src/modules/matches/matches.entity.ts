import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, VersionColumn } from 'typeorm';
import { User } from '../user/user.entity';
import { City } from '../cities/cities.entity';
import { Venue } from '../venue/venue.entity';
import { MatchType as MatchTypeEntity } from '../match-types/match-types.entity';
import { MatchType } from '../../common/enums/match-type.enum';

@Entity('matches')
export class Match {
  @PrimaryGeneratedColumn('increment', { name: 'match_id' })
  matchId: number;

  @Column({ name: 'match_stats_id', type: 'varchar', length: 255, unique: true, nullable: true })
  matchStatsId: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'match_type', type: 'enum', enum: MatchType, default: MatchType.NON_RECORDED })
  matchType: MatchType;

  @ManyToOne(() => MatchTypeEntity, { nullable: false })
  @JoinColumn({ name: 'match_type_id' })
  matchTypeRef: MatchTypeEntity;

  @Column({ name: 'player_capacity', type: 'integer', nullable: true })
  playerCapacity: number;

  @Column({ name: 'buffer_capacity', type: 'integer', default: 0 })
  bufferCapacity: number;

  @Column({
    name: 'start_time',
    type: 'timestamp with time zone',
    precision: 6,
    nullable: false
  })
  startTime: Date;

  @Column({
    name: 'end_time',
    type: 'timestamp with time zone',
    precision: 6,
    nullable: false
  })
  endTime: Date;

  @Column({ name: 'stats_received', type: 'boolean', default: false })
  statsReceived: boolean;

  @Column({ name: 'team_a_score', type: 'int', nullable: true })
  teamAScore: number;

  @Column({ name: 'team_b_score', type: 'int', nullable: true })
  teamBScore: number;

  @Column({ name: 'match_highlights', nullable: true, default: null })
  matchHighlights?: string;

  @Column({ name: 'match_recap', nullable: true, default: null })
  matchRecap?: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'football_chief' })
  footballChief: User;

  @ManyToOne(() => City, { nullable: true })
  @JoinColumn({ name: 'city' })
  city: City;

  @ManyToOne(() => Venue, { nullable: true })
  @JoinColumn({ name: 'venue' })
  venue: Venue;

  // New columns for booking tracking
  @VersionColumn({ name: 'version', default: 1 })
  version: number;

  @Column({ name: 'booked_slots', type: 'integer', default: 0 })
  bookedSlots: number;

  @Column({ name: 'locked_slots', type: 'jsonb', default: '{}' })
  lockedSlots: Record<string, any>;

  @Column({ name: 'slot_price', type: 'decimal', precision: 10, scale: 2, default: 0 })
  slotPrice: number;

  @Column({ name: 'offer_price', type: 'decimal', precision: 10, scale: 2, default: 0 })
  offerPrice: number;

  // Optional team names; default to Home/Away when not provided
  @Column({ name: 'team_a_name', type: 'varchar', length: 100, nullable: true, default: 'Home' })
  teamAName: string;

  @Column({ name: 'team_b_name', type: 'varchar', length: 100, nullable: true, default: 'Away' })
  teamBName: string;

  // PlayerNation integration columns
  @Column({ name: 'playernation_status', type: 'varchar', length: 50, nullable: true })
  playernationStatus?: string;

  @Column({ name: 'playernation_next_poll_at', type: 'timestamp with time zone', nullable: true })
  playernationNextPollAt?: Date;

  @Column({ name: 'playernation_poll_attempts', type: 'integer', default: 0 })
  playernationPollAttempts: number;

  @Column({ name: 'playernation_payload', type: 'jsonb', nullable: true })
  playernationPayload?: any;

  @Column({ name: 'playernation_last_response', type: 'jsonb', nullable: true })
  playernationLastResponse?: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}