import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('increment', { name: 'id' })
  id: number;

  @Column({ name: 'phone_number', type: 'varchar', length: 15, unique: true })
  phoneNumber: string;

  @Column({ name: 'username', type: 'varchar', length: 50, unique: true, nullable: true })
  username: string;

  @Column({ name: 'email', type: 'varchar', length: 100, unique: true, nullable: true })
  email: string;

  @Column({ name: 'onboarding_complete', type: 'boolean', default: false })
  onboardingComplete: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ name: 'player_category', type: 'varchar', length: 10, nullable: true })
  playerCategory: string; // 'forward', 'defender', 'goalkeeper'

  @Column({ name: 'invites_left', type: 'int', default: 3 })
  invitesLeft: number;

  @Column({ name: 'profile_picture', type: 'varchar', length: 100, nullable: true })
  profilePicture: string;

  @Column({ name: 'added_to_community', type: 'boolean', default: false })
  addedToCommunity: boolean;
}
