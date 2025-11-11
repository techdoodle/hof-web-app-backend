import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMatchStatus1762883881000 implements MigrationInterface {
    name = 'AddMatchStatus1762883881000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add status column to matches table
        await queryRunner.query(`
            ALTER TABLE matches
            ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
        `);

        // Set all existing matches to ACTIVE if they don't have a status
        await queryRunner.query(`
            UPDATE matches
            SET status = 'ACTIVE'
            WHERE status IS NULL;
        `);

        // Make status NOT NULL after setting defaults
        await queryRunner.query(`
            ALTER TABLE matches
            ALTER COLUMN status SET NOT NULL;
        `);

        // Add comment for documentation
        await queryRunner.query(`COMMENT ON COLUMN matches.status IS 'Match status: ACTIVE or CANCELLED';`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove status column
        await queryRunner.query(`
            ALTER TABLE matches
            DROP COLUMN IF EXISTS status;
        `);
    }
}

