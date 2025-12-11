import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddAdminPanelPerformanceIndexes1763000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Index on match_participants.match_id for faster participant count queries
        await queryRunner.createIndex(
            'match_participants',
            new TableIndex({
                name: 'IDX_match_participants_match_id',
                columnNames: ['match_id'],
            })
        );

        // Index on matches.status for faster status filtering
        await queryRunner.createIndex(
            'matches',
            new TableIndex({
                name: 'IDX_matches_status',
                columnNames: ['status'],
            })
        );

        // Composite index on matches for status + start_time (common admin query pattern)
        await queryRunner.createIndex(
            'matches',
            new TableIndex({
                name: 'IDX_matches_status_start_time',
                columnNames: ['status', 'start_time'],
            })
        );

        // Index on users.created_at for faster user count queries
        await queryRunner.createIndex(
            'users',
            new TableIndex({
                name: 'IDX_users_created_at',
                columnNames: ['created_at'],
            })
        );

        // Index on match_participants.created_at for faster participant count queries
        await queryRunner.createIndex(
            'match_participants',
            new TableIndex({
                name: 'IDX_match_participants_created_at',
                columnNames: ['created_at'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex('match_participants', 'IDX_match_participants_match_id');
        await queryRunner.dropIndex('matches', 'IDX_matches_status');
        await queryRunner.dropIndex('matches', 'IDX_matches_status_start_time');
        await queryRunner.dropIndex('users', 'IDX_users_created_at');
        await queryRunner.dropIndex('match_participants', 'IDX_match_participants_created_at');
    }
}

