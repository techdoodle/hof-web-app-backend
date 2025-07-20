import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('cities')
@Index(['cityName', 'stateName'], { unique: true })
@Index(['country'])
@Index(['latitude', 'longitude'])
export class City {
  @PrimaryGeneratedColumn('increment', { name: 'id' })
  id: number;

  @Column({ name: 'city_name', type: 'varchar', length: 100, nullable: false })
  cityName: string;

  @Column({ name: 'state_name', type: 'varchar', length: 100, nullable: false })
  stateName: string;

  @Column({ name: 'country', type: 'varchar', length: 100, nullable: false })
  country: string;

  @Column({ name: 'latitude', type: 'decimal', precision: 10, scale: 8, nullable: false })
  latitude: number;

  @Column({ name: 'longitude', type: 'decimal', precision: 11, scale: 8, nullable: false })
  longitude: number;

} 