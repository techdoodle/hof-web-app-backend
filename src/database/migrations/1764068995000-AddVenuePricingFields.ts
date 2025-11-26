import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVenuePricingFields1764068995000 implements MigrationInterface {
  name = 'AddVenuePricingFields1764068995000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add time-based and day-based pricing columns to venue_formats table
    await queryRunner.query(`
      ALTER TABLE "venue_formats"
      ADD COLUMN IF NOT EXISTS "morning_cost" decimal(10,2) NULL,
      ADD COLUMN IF NOT EXISTS "weekend_cost" decimal(10,2) NULL,
      ADD COLUMN IF NOT EXISTS "weekend_morning_cost" decimal(10,2) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "venue_formats"
      DROP COLUMN IF EXISTS "weekend_morning_cost",
      DROP COLUMN IF EXISTS "weekend_cost",
      DROP COLUMN IF EXISTS "morning_cost"
    `);
  }
}

