import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingTrackingToMatches1710005 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add new columns with nullable/default values for safe production deployment
        await queryRunner.query(`
            ALTER TABLE matches
            ADD COLUMN version INTEGER DEFAULT 1,
            ADD COLUMN booked_slots INTEGER DEFAULT 0,
            ADD COLUMN locked_slots JSONB DEFAULT '{}',
            ADD CONSTRAINT valid_slots_count CHECK (
                (booked_slots IS NULL) OR 
                (player_capacity IS NULL) OR 
                (booked_slots <= player_capacity)
            )
        `);

        // Add index for optimistic locking queries
        await queryRunner.query(`
            CREATE INDEX idx_matches_version ON matches(version)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove constraint first
        await queryRunner.query(`
            ALTER TABLE matches
            DROP CONSTRAINT IF EXISTS valid_slots_count
        `);

        // Remove index
        await queryRunner.query(`
            DROP INDEX IF EXISTS idx_matches_version
        `);

        // Remove columns
        await queryRunner.query(`
            ALTER TABLE matches
            DROP COLUMN IF EXISTS version,
            DROP COLUMN IF EXISTS booked_slots,
            DROP COLUMN IF EXISTS locked_slots
        `);
    }
}
