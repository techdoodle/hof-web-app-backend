import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVenueFormatsTable1734567890007 implements MigrationInterface {
  name = 'CreateVenueFormatsTable1734567890007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for venue format
    await queryRunner.query(`
      CREATE TYPE "venue_format_enum" AS ENUM (
        'FIVE_VS_FIVE',
        'SIX_VS_SIX',
        'SEVEN_VS_SEVEN',
        'EIGHT_VS_EIGHT',
        'NINE_VS_NINE',
        'TEN_VS_TEN',
        'ELEVEN_VS_ELEVEN'
      )
    `);

    // Create venue_formats table
    await queryRunner.query(`
      CREATE TABLE "venue_formats" (
        "id" SERIAL NOT NULL,
        "venue_id" integer NOT NULL,
        "format" "venue_format_enum" NOT NULL,
        "cost" decimal(10,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_venue_formats" PRIMARY KEY ("id"),
        CONSTRAINT "FK_venue_formats_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_venue_formats_venue_format" UNIQUE ("venue_id", "format")
      )
    `);

    // Create index on venue_id for faster lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_venue_formats_venue_id" ON "venue_formats" ("venue_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_venue_formats_venue_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "venue_formats"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "venue_format_enum"`);
  }
}

