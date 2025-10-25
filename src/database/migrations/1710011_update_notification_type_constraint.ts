import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateNotificationTypeConstraint1710011 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the existing constraint if it exists
        await queryRunner.query(`
            ALTER TABLE email_notifications
            DROP CONSTRAINT IF EXISTS valid_notification_type;
        `);

        // Add the updated constraint with WAITLIST_CONFIRMATION
        await queryRunner.query(`
            ALTER TABLE email_notifications
            ADD CONSTRAINT valid_notification_type CHECK (
                type IN (
                    'BOOKING_CONFIRMATION',
                    'PAYMENT_SUCCESS',
                    'PAYMENT_FAILED',
                    'BOOKING_CANCELLED',
                    'REFUND_INITIATED',
                    'REFUND_COMPLETED',
                    'BOOKING_REMINDER',
                    'WAITLIST_CONFIRMATION',
                    'WAITLIST_NOTIFICATION'
                )
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert to the previous constraint (or drop it entirely if preferred)
        await queryRunner.query(`
            ALTER TABLE email_notifications
            DROP CONSTRAINT IF EXISTS valid_notification_type;
        `);
        await queryRunner.query(`
            ALTER TABLE email_notifications
            ADD CONSTRAINT valid_notification_type CHECK (
                type IN (
                    'BOOKING_CONFIRMATION',
                    'PAYMENT_SUCCESS',
                    'PAYMENT_FAILED',
                    'BOOKING_CANCELLED',
                    'REFUND_INITIATED',
                    'REFUND_COMPLETED',
                    'BOOKING_REMINDER',
                    'WAITLIST_NOTIFICATION'
                )
            );
        `);
    }
}
