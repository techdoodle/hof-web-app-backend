import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlayerIdToBookingSlots1761375191000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add player_id column to booking_slots table
        await queryRunner.query(`
            ALTER TABLE booking_slots 
            ADD COLUMN player_id INTEGER,
            ADD CONSTRAINT fk_booking_slots_player_id 
            FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE SET NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove the foreign key constraint first
        await queryRunner.query(`
            ALTER TABLE booking_slots 
            DROP CONSTRAINT IF EXISTS fk_booking_slots_player_id
        `);

        // Remove the player_id column
        await queryRunner.query(`
            ALTER TABLE booking_slots 
            DROP COLUMN IF EXISTS player_id
        `);
    }
}
