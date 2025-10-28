import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlayerNationSupport1734567890000 implements MigrationInterface {
  name = 'AddPlayerNationSupport1734567890000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add PlayerNation columns to matches table
    await queryRunner.query(`
      ALTER TABLE matches 
      ADD COLUMN playernation_status VARCHAR(50),
      ADD COLUMN playernation_next_poll_at TIMESTAMPTZ,
      ADD COLUMN playernation_poll_attempts INTEGER DEFAULT 0,
      ADD COLUMN playernation_payload JSONB,
      ADD COLUMN playernation_last_response JSONB
    `);

    // Create playernation_tokens table
    await queryRunner.query(`
      CREATE TABLE playernation_tokens (
        id SERIAL PRIMARY KEY,
        access_token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create playernation_player_mappings table
    await queryRunner.query(`
      CREATE TABLE playernation_player_mappings (
        id SERIAL PRIMARY KEY,
        match_id INTEGER REFERENCES matches(match_id),
        external_player_id VARCHAR(255),
        external_name TEXT,
        external_team CHAR(1),
        thumbnail_urls TEXT[],
        internal_player_id INTEGER REFERENCES users(id),
        internal_phone TEXT,
        status VARCHAR(20) DEFAULT 'UNMATCHED',
        created_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create indexes for better performance
    await queryRunner.query(`
      CREATE INDEX idx_playernation_tokens_expires_at ON playernation_tokens(expires_at)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_playernation_mappings_match_id ON playernation_player_mappings(match_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_playernation_mappings_status ON playernation_player_mappings(status)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_matches_playernation_status ON matches(playernation_status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_matches_playernation_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_playernation_mappings_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_playernation_mappings_match_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_playernation_tokens_expires_at`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS playernation_player_mappings`);
    await queryRunner.query(`DROP TABLE IF EXISTS playernation_tokens`);

    // Remove columns from matches table
    await queryRunner.query(`
      ALTER TABLE matches 
      DROP COLUMN IF EXISTS playernation_status,
      DROP COLUMN IF EXISTS playernation_next_poll_at,
      DROP COLUMN IF EXISTS playernation_poll_attempts,
      DROP COLUMN IF EXISTS playernation_payload,
      DROP COLUMN IF EXISTS playernation_last_response
    `);
  }
}
