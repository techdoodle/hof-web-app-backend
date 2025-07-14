import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('football_teams')
export class FootballTeam {
  @PrimaryGeneratedColumn('increment', { name: 'id' })
  id: number;

  @Column({ name: 'api_team_id', type: 'integer', nullable: false })
  apiTeamId: number;

  @Column({ name: 'team_name', type: 'varchar', length: 255, nullable: false })
  teamName: string;

  @Column({ name: 'team_code', type: 'varchar', length: 10, nullable: true })
  teamCode: string;

  @Column({ name: 'country', type: 'varchar', length: 100, nullable: false })
  country: string;

  @Column({ name: 'founded', type: 'integer', nullable: true })
  founded: number;

  @Column({ name: 'national', type: 'boolean', default: false })
  national: boolean;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string;

  @Column({ name: 'league_id', type: 'integer', nullable: true })
  leagueId: number;

  @Column({ name: 'league_name', type: 'varchar', length: 255, nullable: true })
  leagueName: string;

  @Column({ name: 'league_country', type: 'varchar', length: 100, nullable: true })
  leagueCountry: string;

  @Column({ name: 'season', type: 'integer', nullable: true })
  season: number;

  @Column({ name: 'starred', type: 'boolean', default: false })
  starred: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
} 