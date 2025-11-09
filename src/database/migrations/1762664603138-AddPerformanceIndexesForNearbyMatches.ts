import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddPerformanceIndexesForNearbyMatches1762664603138 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Index on matches.start_time for filtering upcoming matches
        await queryRunner.createIndex(
            'matches',
            new TableIndex({
                name: 'IDX_matches_start_time',
                columnNames: ['start_time'],
            })
        );

        // Index on matches.venue for faster JOINs with venues table
        await queryRunner.createIndex(
            'matches',
            new TableIndex({
                name: 'IDX_matches_venue',
                columnNames: ['venue'],
            })
        );

        // Composite index on matches for venue + start_time (common query pattern)
        await queryRunner.createIndex(
            'matches',
            new TableIndex({
                name: 'IDX_matches_venue_start_time',
                columnNames: ['venue', 'start_time'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex('matches', 'IDX_matches_start_time');
        await queryRunner.dropIndex('matches', 'IDX_matches_venue');
        await queryRunner.dropIndex('matches', 'IDX_matches_venue_start_time');
    }
}

