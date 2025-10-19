import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreatePaymentTables1710002 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create razorpay_orders table
        await queryRunner.createTable(
            new Table({
                name: 'razorpay_orders',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'booking_id',
                        type: 'uuid',
                    },
                    {
                        name: 'razorpay_order_id',
                        type: 'varchar',
                        length: '100',
                        isUnique: true,
                    },
                    {
                        name: 'amount',
                        type: 'decimal',
                        precision: 10,
                        scale: 2,
                    },
                    {
                        name: 'currency',
                        type: 'varchar',
                        length: '3',
                        default: "'INR'",
                    },
                    {
                        name: 'status',
                        type: 'varchar',
                        length: '20',
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
                    },
                ],
            }),
            true
        );

        // Create payment_attempts table
        await queryRunner.createTable(
            new Table({
                name: 'payment_attempts',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'razorpay_order_id',
                        type: 'varchar',
                        length: '100',
                    },
                    {
                        name: 'razorpay_payment_id',
                        type: 'varchar',
                        length: '100',
                        isNullable: true,
                    },
                    {
                        name: 'amount',
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
                        name: 'payment_method',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'error_code',
                        type: 'varchar',
                        length: '100',
                        isNullable: true,
                    },
                    {
                        name: 'error_description',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                    {
                        name: 'completed_at',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'metadata',
                        type: 'jsonb',
                        isNullable: true,
                    },
                ],
                foreignKeys: [
                    {
                        columnNames: ['razorpay_order_id'],
                        referencedTableName: 'razorpay_orders',
                        referencedColumnNames: ['razorpay_order_id'],
                    },
                ],
            }),
            true
        );

        // Create refunds table
        await queryRunner.createTable(
            new Table({
                name: 'refunds',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'booking_id',
                        type: 'uuid',
                    },
                    {
                        name: 'razorpay_payment_id',
                        type: 'varchar',
                        length: '100',
                    },
                    {
                        name: 'razorpay_refund_id',
                        type: 'varchar',
                        length: '100',
                        isNullable: true,
                    },
                    {
                        name: 'amount',
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
                        name: 'reason',
                        type: 'text',
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
                    },
                ],
            }),
            true
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('refunds');
        await queryRunner.dropTable('payment_attempts');
        await queryRunner.dropTable('razorpay_orders');
    }
}
