import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePromoCodesTables1764309585000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create promo_codes table
        await queryRunner.query(`
            CREATE TYPE "discount_type_enum" AS ENUM('PERCENTAGE', 'FLAT_AMOUNT');
        `);

        await queryRunner.query(`
            CREATE TABLE "promo_codes" (
                "id" SERIAL NOT NULL,
                "code" VARCHAR(50) NOT NULL,
                "description" TEXT,
                "discount_type" "discount_type_enum" NOT NULL,
                "discount_value" DECIMAL(10,2) NOT NULL,
                "min_order_value" DECIMAL(10,2),
                "max_discount_amount" DECIMAL(10,2),
                "is_active" BOOLEAN NOT NULL DEFAULT true,
                "valid_from" TIMESTAMP NOT NULL,
                "valid_until" TIMESTAMP,
                "max_uses" INTEGER,
                "max_uses_per_user" INTEGER,
                "usage_count" INTEGER NOT NULL DEFAULT 0,
                "eligible_cities" JSONB,
                "first_time_users_only" BOOLEAN NOT NULL DEFAULT false,
                "created_by" INTEGER,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_promo_codes" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_promo_codes_code" UNIQUE ("code")
            );
        `);

        // Create indexes for promo_codes
        await queryRunner.query(`
            CREATE INDEX "IDX_promo_codes_code" ON "promo_codes" ("code");
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_promo_codes_active_dates" ON "promo_codes" ("is_active", "valid_from", "valid_until");
        `);

        // Create promo_code_usage table
        await queryRunner.query(`
            CREATE TABLE "promo_code_usage" (
                "id" SERIAL NOT NULL,
                "promo_code_id" INTEGER NOT NULL,
                "user_id" INTEGER,
                "booking_id" INTEGER NOT NULL,
                "discount_amount" DECIMAL(10,2) NOT NULL,
                "original_amount" DECIMAL(10,2) NOT NULL,
                "final_amount" DECIMAL(10,2) NOT NULL,
                "used_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_promo_code_usage" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_promo_code_usage_booking_id" UNIQUE ("booking_id")
            );
        `);

        // Create indexes for promo_code_usage
        await queryRunner.query(`
            CREATE INDEX "IDX_promo_code_usage_promo_user" ON "promo_code_usage" ("promo_code_id", "user_id");
        `);

        // Add foreign key constraints
        await queryRunner.query(`
            ALTER TABLE "promo_codes"
            ADD CONSTRAINT "FK_promo_codes_created_by"
            FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
        `);

        await queryRunner.query(`
            ALTER TABLE "promo_code_usage"
            ADD CONSTRAINT "FK_promo_code_usage_promo_code"
            FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE CASCADE;
        `);

        await queryRunner.query(`
            ALTER TABLE "promo_code_usage"
            ADD CONSTRAINT "FK_promo_code_usage_user"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
        `);

        await queryRunner.query(`
            ALTER TABLE "promo_code_usage"
            ADD CONSTRAINT "FK_promo_code_usage_booking"
            FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraints
        await queryRunner.query(`
            ALTER TABLE "promo_code_usage"
            DROP CONSTRAINT IF EXISTS "FK_promo_code_usage_booking";
        `);

        await queryRunner.query(`
            ALTER TABLE "promo_code_usage"
            DROP CONSTRAINT IF EXISTS "FK_promo_code_usage_user";
        `);

        await queryRunner.query(`
            ALTER TABLE "promo_code_usage"
            DROP CONSTRAINT IF EXISTS "FK_promo_code_usage_promo_code";
        `);

        await queryRunner.query(`
            ALTER TABLE "promo_codes"
            DROP CONSTRAINT IF EXISTS "FK_promo_codes_created_by";
        `);

        // Drop tables
        await queryRunner.query(`DROP TABLE IF EXISTS "promo_code_usage";`);
        await queryRunner.query(`DROP TABLE IF EXISTS "promo_codes";`);
        await queryRunner.query(`DROP TYPE IF EXISTS "discount_type_enum";`);
    }
}

