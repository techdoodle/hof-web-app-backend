import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddPerformanceIndexesForBookingInfo1762662398548 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Index on bookings.match_id for faster JOINs
        await queryRunner.createIndex(
            'bookings',
            new TableIndex({
                name: 'IDX_bookings_match_id',
                columnNames: ['match_id'],
            })
        );

        // Composite index on booking_slots for the query pattern: booking_id + status
        await queryRunner.createIndex(
            'booking_slots',
            new TableIndex({
                name: 'IDX_booking_slots_booking_id_status',
                columnNames: ['booking_id', 'status'],
            })
        );

        // Index on waitlist_entries.match_id + status for faster filtering
        await queryRunner.createIndex(
            'waitlist_entries',
            new TableIndex({
                name: 'IDX_waitlist_entries_match_id_status',
                columnNames: ['match_id', 'status'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex('bookings', 'IDX_bookings_match_id');
        await queryRunner.dropIndex('booking_slots', 'IDX_booking_slots_booking_id_status');
        await queryRunner.dropIndex('waitlist_entries', 'IDX_waitlist_entries_match_id_status');
    }
}

