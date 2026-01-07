import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsPrivateToMatches1766000000000 implements MigrationInterface {
    name = 'AddIsPrivateToMatches1766000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add is_private column to matches table
        await queryRunner.query(`
            ALTER TABLE matches
            ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
        `);

        // Set all existing matches to false (not private) if they don't have a value
        await queryRunner.query(`
            UPDATE matches
            SET is_private = false
            WHERE is_private IS NULL;
        `);

        // Make is_private NOT NULL after setting defaults
        await queryRunner.query(`
            ALTER TABLE matches
            ALTER COLUMN is_private SET NOT NULL;
        `);

        // Add comment for documentation
        await queryRunner.query(`COMMENT ON COLUMN matches.is_private IS 'If true, match will not appear on frontend unless accessed via direct link';`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove is_private column
        await queryRunner.query(`
            ALTER TABLE matches
            DROP COLUMN IF EXISTS is_private;
        `);
    }
}

