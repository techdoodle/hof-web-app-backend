import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateBookingSlotsStatusConstraint1710010 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the existing constraint
        await queryRunner.query(`
            ALTER TABLE booking_slots
            DROP CONSTRAINT IF EXISTS valid_slot_status
        `);

        // Add the updated constraint with PENDING_PAYMENT
        await queryRunner.query(`
            ALTER TABLE booking_slots
            ADD CONSTRAINT valid_slot_status CHECK (
                status IN (
                    'PENDING_PAYMENT',
                    'ACTIVE',
                    'CANCELLED',
                    'CANCELLED_REFUND_PENDING',
                    'CANCELLED_REFUNDED',
                    'EXPIRED'
                )
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the updated constraint
        await queryRunner.query(`
            ALTER TABLE booking_slots
            DROP CONSTRAINT IF EXISTS valid_slot_status
        `);

        // Restore the original constraint
        await queryRunner.query(`
            ALTER TABLE booking_slots
            ADD CONSTRAINT valid_slot_status CHECK (
                status IN (
                    'ACTIVE',
                    'CANCELLED',
                    'CANCELLED_REFUND_PENDING',
                    'CANCELLED_REFUNDED',
                    'EXPIRED'
                )
            )
        `);
    }
}
