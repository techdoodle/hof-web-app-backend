import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreatePushSubscriptionsTable1734567890006 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'push_subscriptions',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                    },
                    {
                        name: 'endpoint',
                        type: 'varchar',
                    },
                    {
                        name: 'expiration_time',
                        type: 'bigint',
                        isNullable: true,
                    },
                    {
                        name: 'keys',
                        type: 'jsonb',
                    },
                    {
                        name: 'user_id',
                        type: 'integer',  // Changed to integer
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'now()',
                    },
                ],
            }),
            true,
        );

        await queryRunner.createForeignKey(
            'push_subscriptions',
            new TableForeignKey({
                columnNames: ['user_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'users',
                onDelete: 'CASCADE',
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('push_subscriptions');
    }
}