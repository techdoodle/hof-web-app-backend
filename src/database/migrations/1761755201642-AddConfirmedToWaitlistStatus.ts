import { MigrationInterface, QueryRunner } from "typeorm";

export class AddConfirmedToWaitlistStatus1761755201642 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add CONFIRMED to the waitlist_status_enum
        await queryRunner.query(`ALTER TYPE waitlist_status_enum ADD VALUE 'CONFIRMED'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Note: PostgreSQL doesn't support removing enum values directly
        // This would require recreating the enum type and updating all references
        // For now, we'll leave CONFIRMED in the enum as it's safe to have extra values
        throw new Error('Cannot remove CONFIRMED from waitlist_status_enum - requires manual database migration');
    }

}
