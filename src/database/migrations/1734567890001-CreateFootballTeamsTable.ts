import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFootballTeamsTable1734567890001 implements MigrationInterface {
    name = 'CreateFootballTeamsTable1734567890001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS football_teams (
                id SERIAL PRIMARY KEY,
                api_team_id INTEGER NOT NULL,
                team_name VARCHAR(255) NOT NULL,
                team_code VARCHAR(10),
                country VARCHAR(100) NOT NULL,
                founded INTEGER,
                national BOOLEAN DEFAULT FALSE,
                logo_url TEXT,
                league_id INTEGER,
                league_name VARCHAR(255),
                league_country VARCHAR(100),
                season INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                -- Ensure unique combination of api_team_id and league_id for each season
                UNIQUE(api_team_id, league_id, season)
            );
        `);

        // Create indexes for better query performance
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_football_teams_country ON football_teams(country);`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_football_teams_league_id ON football_teams(league_id);`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_football_teams_season ON football_teams(season);`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_football_teams_api_team_id ON football_teams(api_team_id);`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_football_teams_created_at ON football_teams(created_at);`);

        // Create updated_at trigger
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        await queryRunner.query(`
            CREATE TRIGGER update_football_teams_updated_at 
                BEFORE UPDATE ON football_teams 
                FOR EACH ROW 
                EXECUTE FUNCTION update_updated_at_column();
        `);

        // Add comments to table and columns
        await queryRunner.query(`COMMENT ON TABLE football_teams IS 'Stores football team data fetched from API-Football service';`);
        await queryRunner.query(`COMMENT ON COLUMN football_teams.api_team_id IS 'Team ID from API-Football service';`);
        await queryRunner.query(`COMMENT ON COLUMN football_teams.team_code IS 'Team code (e.g., BIL for Athletic Club)';`);
        await queryRunner.query(`COMMENT ON COLUMN football_teams.logo_url IS 'URL to team logo image';`);
        await queryRunner.query(`COMMENT ON COLUMN football_teams.founded IS 'Year the team was founded';`);
        await queryRunner.query(`COMMENT ON COLUMN football_teams.national IS 'Whether this is a national team';`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS update_football_teams_updated_at ON football_teams;`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at_column();`);
        await queryRunner.query(`DROP TABLE IF EXISTS football_teams;`);
    }
}
