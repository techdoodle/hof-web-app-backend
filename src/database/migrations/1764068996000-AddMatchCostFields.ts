import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMatchCostFields1764068996000 implements MigrationInterface {
  name = 'AddMatchCostFields1764068996000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add football_chief_cost column to matches table
    await queryRunner.query(`
      ALTER TABLE "matches"
      ADD COLUMN IF NOT EXISTS "football_chief_cost" decimal(10,2) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "matches"
      DROP COLUMN IF EXISTS "football_chief_cost"
    `);
  }
}

