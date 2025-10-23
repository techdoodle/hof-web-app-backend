import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateWaitlistTable1710003 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enum type for waitlist status
        await queryRunner.query(`
            CREATE TYPE waitlist_status_enum AS ENUM (
                'ACTIVE',
                'NOTIFIED',
                'CANCELLED'
            )
        `);

        await queryRunner.createTable(
            new Table({
                name: 'waitlist_entries',
                columns: [
                    {
                        name: 'id',
                        type: 'integer',
                        isPrimary: true,
                        isGenerated: true,
                        generationStrategy: 'increment',
                    },
                    {
                        name: 'match_id',
                        type: 'integer',
                    },
                    {
                        name: 'user_id',
                        type: 'integer',
                        isNullable: true,
                    },
                    {
                        name: 'email',
                        type: 'varchar',
                        length: '255',
                    },
                    {
                        name: 'slots_required',
                        type: 'integer',
                    },
                    {
                        name: 'status',
                        type: 'waitlist_status_enum',
                        default: "'ACTIVE'",
                    },
                    {
                        name: 'last_notified_at',
                        type: 'timestamp',
                        isNullable: true,
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
                    {
                        name: 'updated_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    }
                ],
                foreignKeys: [
                    {
                        columnNames: ['match_id'],
                        referencedTableName: 'matches',
                        referencedColumnNames: ['match_id'],
                        onDelete: 'CASCADE'
                    },
                    {
                        columnNames: ['user_id'],
                        referencedTableName: 'users',
                        referencedColumnNames: ['id'],
                        onDelete: 'SET NULL'
                    }
                ],
                indices: [
                    {
                        name: 'idx_waitlist_match_status',
                        columnNames: ['match_id', 'status']
                    },
                    {
                        name: 'idx_waitlist_email_match',
                        columnNames: ['email', 'match_id']
                    }
                ]
            }),
            true
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('waitlist_entries');
        await queryRunner.query('DROP TYPE IF EXISTS waitlist_status_enum');
    }
}