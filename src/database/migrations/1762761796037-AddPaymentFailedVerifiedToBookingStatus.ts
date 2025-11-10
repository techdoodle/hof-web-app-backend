import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentFailedVerifiedToBookingStatus1762761796037 implements MigrationInterface {
    name = 'AddPaymentFailedVerifiedToBookingStatus1762761796037'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Increase the status column length to accommodate 'PAYMENT_FAILED_VERIFIED' (25 chars)
        // Using 30 to match booking_slots and provide room for future statuses
        await queryRunner.query(`
            ALTER TABLE bookings 
            ALTER COLUMN status TYPE varchar(30)
        `);

        // Drop existing constraint if it exists
        await queryRunner.query(`
            ALTER TABLE bookings
            DROP CONSTRAINT IF EXISTS valid_booking_status
        `);

        // Add CHECK constraint with all BookingStatus enum values including PAYMENT_FAILED_VERIFIED
        await queryRunner.query(`
            ALTER TABLE bookings
            ADD CONSTRAINT valid_booking_status CHECK (
                status IN (
                    'INITIATED',
                    'PAYMENT_PENDING',
                    'PAYMENT_FAILED',
                    'PAYMENT_EXPIRED',
                    'PAYMENT_FAILED_VERIFIED',
                    'PAYMENT_CANCELLED',
                    'CONFIRMED',
                    'CANCELLED',
                    'PARTIALLY_CANCELLED',
                    'EXPIRED'
                )
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the CHECK constraint
        await queryRunner.query(`
            ALTER TABLE bookings
            DROP CONSTRAINT IF EXISTS valid_booking_status
        `);

        // Revert the status column length back to 20 characters
        await queryRunner.query(`
            ALTER TABLE bookings 
            ALTER COLUMN status TYPE varchar(20)
        `);
    }
}

