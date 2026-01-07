import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVenueCostToMatches1767000000000 implements MigrationInterface {
  name = 'AddVenueCostToMatches1767000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add venue_cost column to matches table
    await queryRunner.query(`
      ALTER TABLE "matches"
      ADD COLUMN IF NOT EXISTS "venue_cost" decimal(10,2) NULL
    `);

    // Add comment for documentation
    await queryRunner.query(`
      COMMENT ON COLUMN "matches"."venue_cost" IS 'Manually entered venue cost. If NULL, venue cost will be calculated from venue format configuration.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "matches"
      DROP COLUMN IF EXISTS "venue_cost"
    `);
  }
}

