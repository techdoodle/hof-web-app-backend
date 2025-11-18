import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { City } from '../cities/cities.entity';
import { VenueFormatEntity } from './venue-formats.entity';

@Entity('venues')
export class Venue {
  @PrimaryGeneratedColumn('increment', { name: 'id' })
  id: number;

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @ManyToOne(() => City, { nullable: true })
  @JoinColumn({ name: 'city_id' })
  city: City;

  @Column({ name: 'phone_number', type: 'varchar', length: 15, unique: true })
  phoneNumber: string;

  @Column({ name: 'address', type: 'varchar', length: 500, nullable: true })
  address: string;

  @Column({ name: 'display_banner', type: 'text', nullable: true })
  displayBanner: string;

  @Column({ name: 'latitude', type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column({ name: 'longitude', type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number;

  @Column({ name: 'maps_url', type: 'text', nullable: true })
  mapsUrl: string;

  @OneToMany(() => VenueFormatEntity, (venueFormat) => venueFormat.venue, { cascade: true })
  venueFormats: VenueFormatEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}