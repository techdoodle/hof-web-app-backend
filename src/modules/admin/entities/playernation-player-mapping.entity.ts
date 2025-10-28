import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Match } from '../../matches/matches.entity';
import { User } from '../../user/user.entity';

export enum PlayerMappingStatus {
  UNMATCHED = 'UNMATCHED',
  MATCHED = 'MATCHED',
  IGNORED = 'IGNORED',
}

@Entity('playernation_player_mappings')
export class PlayerNationPlayerMapping {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Match)
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @Column({ name: 'match_id', type: 'integer' })
  matchId: number;

  @Column({ name: 'external_player_id', type: 'varchar', length: 255 })
  externalPlayerId: string;

  @Column({ name: 'external_name', type: 'text' })
  externalName: string;

  @Column({ name: 'external_team', type: 'char', length: 1 })
  externalTeam: string;

  @Column({ name: 'thumbnail_urls', type: 'text', array: true })
  thumbnailUrls: string[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'internal_player_id' })
  internalPlayer?: User;

  @Column({ name: 'internal_player_id', type: 'integer', nullable: true })
  internalPlayerId?: number;

  @Column({ name: 'internal_phone', type: 'text', nullable: true })
  internalPhone?: string;

  @Column({ 
    name: 'status', 
    type: 'enum', 
    enum: PlayerMappingStatus, 
    default: PlayerMappingStatus.UNMATCHED 
  })
  status: PlayerMappingStatus;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'created_by', type: 'integer' })
  createdById: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
