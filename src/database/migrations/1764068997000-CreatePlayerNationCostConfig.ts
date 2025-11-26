import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePlayerNationCostConfig1764068997000 implements MigrationInterface {
  name = 'CreatePlayerNationCostConfig1764068997000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create playernation_cost_config table (singleton pattern - only one row)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "playernation_cost_config" (
        "id" SERIAL NOT NULL,
        "cost_per_participant" decimal(10,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_playernation_cost_config" PRIMARY KEY ("id")
      )
    `);

    // Insert default row with cost_per_participant = 0
    await queryRunner.query(`
      INSERT INTO "playernation_cost_config" ("cost_per_participant")
      VALUES (0)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "playernation_cost_config"`);
  }
}

