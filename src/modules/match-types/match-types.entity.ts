import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('match_types')
export class MatchType {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'match_type', type: 'varchar', length: 50, unique: true })
  matchType: string;

  @Column({ name: 'match_name', type: 'varchar', length: 100 })
  matchName: string;

  @Column({ type: 'text' })
  description: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
