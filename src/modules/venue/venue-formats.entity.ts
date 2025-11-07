import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Venue } from './venue.entity';
import { VenueFormat } from './venue-format.enum';

@Entity('venue_formats')
@Unique(['venue', 'format'])
export class VenueFormatEntity {
  @PrimaryGeneratedColumn('increment', { name: 'id' })
  id: number;

  @ManyToOne(() => Venue, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venue_id' })
  venue: Venue;

  @Column({ name: 'format', type: 'enum', enum: VenueFormat, nullable: false })
  format: VenueFormat;

  @Column({ name: 'cost', type: 'decimal', precision: 10, scale: 2, nullable: false })
  cost: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

