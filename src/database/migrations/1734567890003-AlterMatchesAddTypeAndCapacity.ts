import { MigrationInterface, QueryRunner } from "typeorm";

export class AlterMatchesAddTypeAndCapacity1734567890003 implements MigrationInterface {
    name = 'AlterMatchesAddTypeAndCapacity1734567890003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add new columns to matches table
        await queryRunner.query(`
            ALTER TABLE matches
            ADD COLUMN IF NOT EXISTS match_type_id INTEGER,
            ADD COLUMN IF NOT EXISTS player_capacity INTEGER,
            ADD COLUMN IF NOT EXISTS buffer_capacity INTEGER DEFAULT 0;
        `);

        // Add foreign key constraint
        await queryRunner.query(`
            ALTER TABLE matches
            ADD CONSTRAINT fk_match_type
            FOREIGN KEY (match_type_id)
            REFERENCES match_types(id);
        `);

        // Set default match_type_id to HOF_PLAY for existing matches
        await queryRunner.query(`
            UPDATE matches
            SET match_type_id = (SELECT id FROM match_types WHERE match_type = 'HOF_PLAY')
            WHERE match_type_id IS NULL;
        `);

        // Make match_type_id required for future entries
        await queryRunner.query(`
            ALTER TABLE matches
            ALTER COLUMN match_type_id SET NOT NULL;
        `);

        // Add comments
        await queryRunner.query(`COMMENT ON COLUMN matches.match_type_id IS 'Reference to the type of match (HOF Play/HOF Select)';`);
        await queryRunner.query(`COMMENT ON COLUMN matches.player_capacity IS 'Maximum number of players that can participate in the match';`);
        await queryRunner.query(`COMMENT ON COLUMN matches.buffer_capacity IS 'Additional buffer capacity for the match';`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove foreign key constraint first
        await queryRunner.query(`ALTER TABLE matches DROP CONSTRAINT IF EXISTS fk_match_type;`);

        // Remove columns
        await queryRunner.query(`
            ALTER TABLE matches
            DROP COLUMN IF EXISTS match_type_id,
            DROP COLUMN IF EXISTS player_capacity,
            DROP COLUMN IF EXISTS buffer_capacity;
        `);
    }
}
