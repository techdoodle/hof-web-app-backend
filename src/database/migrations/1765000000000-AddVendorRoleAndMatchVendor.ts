import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVendorRoleAndMatchVendor1765000000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add 'vendor' to the existing user_role_enum
        await queryRunner.query(`
            ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'vendor';
        `);

        // Add vendor column to matches table
        await queryRunner.query(`
            ALTER TABLE "matches" 
            ADD COLUMN "vendor" integer NULL;
        `);

        // Add foreign key constraint
        await queryRunner.query(`
            ALTER TABLE "matches" 
            ADD CONSTRAINT "FK_matches_vendor" 
            FOREIGN KEY ("vendor") 
            REFERENCES "users"("id") 
            ON DELETE SET NULL;
        `);

        // Add index for better query performance
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_matches_vendor" 
            ON "matches"("vendor");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop index
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_matches_vendor";
        `);

        // Drop foreign key constraint
        await queryRunner.query(`
            ALTER TABLE "matches" 
            DROP CONSTRAINT IF EXISTS "FK_matches_vendor";
        `);

        // Remove vendor column
        await queryRunner.query(`
            ALTER TABLE "matches" 
            DROP COLUMN IF EXISTS "vendor";
        `);

        // Note: We cannot remove 'vendor' from the enum type in PostgreSQL
        // The enum value will remain but won't be used
    }

}

