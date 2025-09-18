import { MigrationInterface, QueryRunner } from "typeorm";

export class FixTimestampTimezone1734567890003 implements MigrationInterface {
    name = 'FixTimestampTimezone1734567890003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Set timezone for the session
        await queryRunner.query(`SET timezone = 'Asia/Kolkata';`);

        // Update start_time column to include timezone
        await queryRunner.query(`
            ALTER TABLE matches 
            ALTER COLUMN start_time TYPE TIMESTAMP WITH TIME ZONE;
        `);

        // Update end_time column to include timezone (if it exists)
        await queryRunner.query(`
            ALTER TABLE matches 
            ALTER COLUMN end_time TYPE TIMESTAMP WITH TIME ZONE;
        `);

        // Add comments for documentation
        await queryRunner.query(`COMMENT ON COLUMN matches.start_time IS 'Match start time in IST timezone';`);
        await queryRunner.query(`COMMENT ON COLUMN matches.end_time IS 'Match end time in IST timezone';`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert back to TIMESTAMP without timezone
        await queryRunner.query(`
            ALTER TABLE matches 
            ALTER COLUMN start_time TYPE TIMESTAMP;
        `);

        await queryRunner.query(`
            ALTER TABLE matches 
            ALTER COLUMN end_time TYPE TIMESTAMP;
        `);
    }
}
