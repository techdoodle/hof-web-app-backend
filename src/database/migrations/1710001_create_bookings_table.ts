import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateBookingsTable1710001 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'bookings',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'booking_reference',
                        type: 'varchar',
                        length: '50',
                        isUnique: true,
                    },
                    {
                        name: 'match_id',
                        type: 'uuid',
                    },
                    {
                        name: 'user_id',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'email',
                        type: 'varchar',
                        length: '255',
                    },
                    {
                        name: 'total_slots',
                        type: 'integer',
                    },
                    {
                        name: 'total_amount',
                        type: 'decimal',
                        precision: 10,
                        scale: 2,
                    },
                    {
                        name: 'status',
                        type: 'varchar',
                        length: '20',
                    },
                    {
                        name: 'payment_status',
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
                        columnNames: ['match_id'],
                        referencedTableName: 'matches',
                        referencedColumnNames: ['id'],
                    },
                    {
                        columnNames: ['user_id'],
                        referencedTableName: 'users',
                        referencedColumnNames: ['id'],
                    },
                ],
            }),
            true
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('bookings');
    }
}
