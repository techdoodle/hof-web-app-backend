import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEligibleMatchesToPromoCodes1764310000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add eligible_matches column to promo_codes table
        await queryRunner.query(`
            ALTER TABLE "promo_codes"
            ADD COLUMN "eligible_matches" JSONB;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop column
        await queryRunner.query(`
            ALTER TABLE "promo_codes"
            DROP COLUMN IF EXISTS "eligible_matches";
        `);
    }
}

