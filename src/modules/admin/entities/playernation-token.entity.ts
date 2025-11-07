import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('playernation_tokens')
export class PlayerNationToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'access_token', type: 'text' })
  accessToken: string;

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
