import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateBookingSlotsTable1710004 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'booking_slots',
                columns: [
                    {
                        name: 'id',
                        type: 'integer',
                        isPrimary: true,
                        isGenerated: true,
                        generationStrategy: 'increment',
                    },
                    {
                        name: 'booking_id',
                        type: 'integer',
                    },
                    {
                        name: 'slot_number',
                        type: 'integer',
                    },
                    {
                        name: 'player_name',
                        type: 'varchar',
                        length: '100',
                        isNullable: true,
                    },
                    {
                        name: 'player_email',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'player_phone',
                        type: 'varchar',
                        length: '20',
                        isNullable: true,
                    },
                    {
                        name: 'status',
                        type: 'varchar',
                        length: '20',
                    },
                    {
                        name: 'refund_status',
                        type: 'varchar',
                        length: '20',
                        isNullable: true,
                    },
                    {
                        name: 'refund_amount',
                        type: 'decimal',
                        precision: 10,
                        scale: 2,
                        isNullable: true,
                    },
                    {
                        name: 'cancelled_at',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'refunded_at',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                    {
                        name: 'metadata',
                        type: 'jsonb',
                        isNullable: true,
                    },
                ],
                foreignKeys: [
                    {
                        columnNames: ['booking_id'],
                        referencedTableName: 'bookings',
                        referencedColumnNames: ['id'],
                        onDelete: 'CASCADE',
                    },
                ],
                indices: [
                    {
                        name: 'idx_booking_slots_booking_id',
                        columnNames: ['booking_id'],
                    },
                    {
                        name: 'idx_booking_slots_status',
                        columnNames: ['status'],
                    },
                    {
                        name: 'unique_slot_per_booking',
                        columnNames: ['booking_id', 'slot_number'],
                        isUnique: true,
                    },
                ],
            }),
            true
        );

        // Add check constraint for valid status values
        await queryRunner.query(`
            ALTER TABLE booking_slots
            ADD CONSTRAINT valid_slot_status CHECK (
                status IN (
                    'ACTIVE',
                    'PENDING_PAYMENT',
                    'CANCELLED',
                    'CANCELLED_REFUND_PENDING',
                    'CANCELLED_REFUNDED',
                    'EXPIRED'
                )
            )
        `);

        // Add check constraint for valid refund status values
        await queryRunner.query(`
            ALTER TABLE booking_slots
            ADD CONSTRAINT valid_refund_status CHECK (
                refund_status IN (
                    'PENDING',
                    'PROCESSING',
                    'COMPLETED',
                    'FAILED'
                )
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('booking_slots');
    }
}
