import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMorningEndHourToVenues1764068998000 implements MigrationInterface {
  name = 'AddMorningEndHourToVenues1764068998000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "venues"
      ADD COLUMN IF NOT EXISTS "morning_end_hour" integer
    `);

    // Set default 12 for existing rows if null
    await queryRunner.query(`
      UPDATE "venues"
      SET "morning_end_hour" = 12
      WHERE "morning_end_hour" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "venues"
      DROP COLUMN IF EXISTS "morning_end_hour"
    `);
  }
}


