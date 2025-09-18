import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMissingStatsColumns1734567890002 implements MigrationInterface {
    name = 'AddMissingStatsColumns1734567890002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add total_tackles column
        await queryRunner.query(`
            ALTER TABLE match_participant_stats 
            ADD COLUMN IF NOT EXISTS total_tackles INTEGER;
        `);

        // Add total_interceptions column  
        await queryRunner.query(`
            ALTER TABLE match_participant_stats 
            ADD COLUMN IF NOT EXISTS total_interceptions INTEGER;
        `);

        // Add team_a_goals column
        await queryRunner.query(`
            ALTER TABLE match_participant_stats 
            ADD COLUMN IF NOT EXISTS team_a_goals INTEGER;
        `);

        // Add team_b_goals column
        await queryRunner.query(`
            ALTER TABLE match_participant_stats 
            ADD COLUMN IF NOT EXISTS team_b_goals INTEGER;
        `);

        // Add comments for documentation
        await queryRunner.query(`COMMENT ON COLUMN match_participant_stats.total_tackles IS 'Total number of tackles attempted by the player';`);
        await queryRunner.query(`COMMENT ON COLUMN match_participant_stats.total_interceptions IS 'Total number of interceptions made by the player';`);
        await queryRunner.query(`COMMENT ON COLUMN match_participant_stats.team_a_goals IS 'Goals scored by Team A in the match';`);
        await queryRunner.query(`COMMENT ON COLUMN match_participant_stats.team_b_goals IS 'Goals scored by Team B in the match';`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE match_participant_stats DROP COLUMN IF EXISTS total_tackles;`);
        await queryRunner.query(`ALTER TABLE match_participant_stats DROP COLUMN IF EXISTS total_interceptions;`);
        await queryRunner.query(`ALTER TABLE match_participant_stats DROP COLUMN IF EXISTS team_a_goals;`);
        await queryRunner.query(`ALTER TABLE match_participant_stats DROP COLUMN IF EXISTS team_b_goals;`);
    }
}
