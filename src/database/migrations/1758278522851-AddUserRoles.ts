import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserRoles1758278522851 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enum type for user roles
        await queryRunner.query(`
            CREATE TYPE user_role_enum AS ENUM ('admin', 'super_admin', 'football_chief', 'academy_admin', 'player');
        `);

        // Add role column to users table with default value
        await queryRunner.query(`
            ALTER TABLE "users" 
            ADD COLUMN "role" user_role_enum NOT NULL DEFAULT 'player';
        `);

        // Set default role for existing users (if any don't have the default)
        await queryRunner.query(`
            UPDATE "users" SET "role" = 'player' WHERE "role" IS NULL;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove role column
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "role";
        `);

        // Drop enum type
        await queryRunner.query(`
            DROP TYPE user_role_enum;
        `);
    }

}
