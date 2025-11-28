import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPromoCodeFieldsToBookings1764309800000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add promo code fields to bookings table
        await queryRunner.query(`
            ALTER TABLE "bookings"
            ADD COLUMN "promo_code_id" INTEGER,
            ADD COLUMN "discount_amount" DECIMAL(10,2),
            ADD COLUMN "original_amount" DECIMAL(10,2);
        `);

        // Add foreign key constraint
        await queryRunner.query(`
            ALTER TABLE "bookings"
            ADD CONSTRAINT "FK_bookings_promo_code"
            FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL;
        `);

        // Add index for promo code lookups
        await queryRunner.query(`
            CREATE INDEX "IDX_bookings_promo_code_id" ON "bookings" ("promo_code_id");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop index
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_bookings_promo_code_id";
        `);

        // Drop foreign key constraint
        await queryRunner.query(`
            ALTER TABLE "bookings"
            DROP CONSTRAINT IF EXISTS "FK_bookings_promo_code";
        `);

        // Drop columns
        await queryRunner.query(`
            ALTER TABLE "bookings"
            DROP COLUMN IF EXISTS "promo_code_id",
            DROP COLUMN IF EXISTS "discount_amount",
            DROP COLUMN IF EXISTS "original_amount";
        `);
    }
}

