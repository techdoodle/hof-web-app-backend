import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('playernation_cost_config')
export class PlayerNationCostConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'cost_per_participant', type: 'decimal', precision: 10, scale: 2 })
  costPerParticipant: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

