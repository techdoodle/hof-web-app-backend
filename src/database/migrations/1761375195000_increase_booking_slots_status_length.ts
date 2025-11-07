import { MigrationInterface, QueryRunner } from "typeorm";

export class IncreaseBookingSlotsStatusLength1761375195000 implements MigrationInterface {
    name = 'IncreaseBookingSlotsStatusLength1761375195000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Increase the status column length from 20 to 30 characters
        await queryRunner.query(`
            ALTER TABLE booking_slots 
            ALTER COLUMN status TYPE varchar(30)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert the status column length back to 20 characters
        await queryRunner.query(`
            ALTER TABLE booking_slots 
            ALTER COLUMN status TYPE varchar(20)
        `);
    }
}
