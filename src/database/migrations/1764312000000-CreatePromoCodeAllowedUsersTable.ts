import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePromoCodeAllowedUsersTable1764312000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create promo_code_allowed_users table
        await queryRunner.query(`
            CREATE TABLE "promo_code_allowed_users" (
                "id" SERIAL NOT NULL,
                "promo_code_id" INTEGER NOT NULL,
                "user_id" INTEGER NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_promo_code_allowed_users" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_promo_code_allowed_users_promo_user" UNIQUE ("promo_code_id", "user_id"),
                CONSTRAINT "FK_promo_code_allowed_users_promo_code" 
                    FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_promo_code_allowed_users_user" 
                    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
        `);

        // Create indexes for performance
        await queryRunner.query(`
            CREATE INDEX "IDX_promo_code_allowed_users_promo_code_id" 
            ON "promo_code_allowed_users" ("promo_code_id");
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_promo_code_allowed_users_user_id" 
            ON "promo_code_allowed_users" ("user_id");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_promo_code_allowed_users_user_id";
        `);

        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_promo_code_allowed_users_promo_code_id";
        `);

        // Drop table
        await queryRunner.query(`
            DROP TABLE IF EXISTS "promo_code_allowed_users";
        `);
    }
}

