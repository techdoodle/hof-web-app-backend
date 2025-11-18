import { MigrationInterface, QueryRunner } from "typeorm";

export class IncreaseMatchStatusLength1763473560000 implements MigrationInterface {
    name = 'IncreaseMatchStatusLength1763473560000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Increase status column length from VARCHAR(20) to VARCHAR(50) to accommodate new status values
        await queryRunner.query(`
            ALTER TABLE matches
            ALTER COLUMN status TYPE VARCHAR(50);
        `);

        // Update comment for documentation
        await queryRunner.query(`
            COMMENT ON COLUMN matches.status IS 'Match status: ACTIVE, CANCELLED, STATS_SUBMISSION_PENDING, POLLING_STATS, SS_MAPPING_PENDING, STATS_UPDATED (last 4 only for recorded matches)';
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert status column length back to VARCHAR(20)
        await queryRunner.query(`
            ALTER TABLE matches
            ALTER COLUMN status TYPE VARCHAR(20);
        `);

        // Revert comment
        await queryRunner.query(`
            COMMENT ON COLUMN matches.status IS 'Match status: ACTIVE or CANCELLED';
        `);
    }
}

