import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMatchTypesTable1734567890002 implements MigrationInterface {
    name = 'CreateMatchTypesTable1734567890002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create match_types table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS match_types (
                id SERIAL PRIMARY KEY,
                match_type VARCHAR(50) NOT NULL UNIQUE,
                match_name VARCHAR(100) NOT NULL,
                description TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create updated_at trigger
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_match_types_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        await queryRunner.query(`
            CREATE TRIGGER update_match_types_updated_at
                BEFORE UPDATE ON match_types
                FOR EACH ROW
                EXECUTE FUNCTION update_match_types_updated_at();
        `);

        // Insert default match types
        await queryRunner.query(`
            INSERT INTO match_types (match_type, match_name, description)
            VALUES 
                ('HOF_PLAY', 'HOF Play', 'Standard match format without detailed statistics and highlights tracking. Perfect for casual players looking to enjoy the game without performance analysis.'),
                ('HOF_SELECT', 'HOF Select', 'Premium match format with comprehensive statistics tracking and highlights recording. Ideal for players seeking detailed performance analysis and professional-level game insights.')
            ON CONFLICT (match_type) DO NOTHING;
        `);

        // Add comments
        await queryRunner.query(`COMMENT ON TABLE match_types IS 'Stores different types of matches available in the system';`);
        await queryRunner.query(`COMMENT ON COLUMN match_types.match_type IS 'Unique identifier code for the match type';`);
        await queryRunner.query(`COMMENT ON COLUMN match_types.match_name IS 'Display name for the match type';`);
        await queryRunner.query(`COMMENT ON COLUMN match_types.description IS 'Detailed description of the match type and its features';`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS update_match_types_updated_at ON match_types;`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS update_match_types_updated_at();`);
        await queryRunner.query(`DROP TABLE IF EXISTS match_types;`);
    }
}
