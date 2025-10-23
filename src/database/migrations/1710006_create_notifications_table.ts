import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateNotificationsTable1710006 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'email_notifications',
                columns: [
                    {
                        name: 'id',
                        type: 'integer',
                        isPrimary: true,
                        isGenerated: true,
                        generationStrategy: 'increment',
                    },
                    {
                        name: 'type',
                        type: 'varchar',
                        length: '50',
                    },
                    {
                        name: 'recipient_email',
                        type: 'varchar',
                    },
                    {
                        name: 'recipient_name',
                        type: 'varchar',
                        isNullable: true,
                    },
                    {
                        name: 'status',
                        type: 'varchar',
                        length: '20',
                    },
                    {
                        name: 'metadata',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                ],
                indices: [
                    {
                        name: 'idx_notifications_email',
                        columnNames: ['recipient_email'],
                    },
                    {
                        name: 'idx_notifications_type_status',
                        columnNames: ['type', 'status'],
                    },
                ],
            }),
            true
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('notifications');
    }
}
