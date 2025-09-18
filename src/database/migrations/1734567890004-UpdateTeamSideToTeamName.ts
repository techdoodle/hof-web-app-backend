import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateTeamSideToTeamName1734567890004 implements MigrationInterface {
    name = 'UpdateTeamSideToTeamName1734567890004'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if team_side column exists and team_name doesn't exist
        const hasTeamSide = await queryRunner.hasColumn('match_participants', 'team_side');
        const hasTeamName = await queryRunner.hasColumn('match_participants', 'team_name');

        if (hasTeamSide && !hasTeamName) {
            // Rename the column from team_side to team_name
            await queryRunner.query(`
                ALTER TABLE match_participants 
                RENAME COLUMN team_side TO team_name;
            `);
        }

        // Update the column type to allow longer team names (varchar(100))
        await queryRunner.query(`
            ALTER TABLE match_participants 
            ALTER COLUMN team_name TYPE VARCHAR(100);
        `);

        // Update any NULL values to a default value (for existing records)
        await queryRunner.query(`
            UPDATE match_participants 
            SET team_name = 'Team A' 
            WHERE team_name IS NULL;
        `);

        // Make the column NOT NULL after updating existing records
        await queryRunner.query(`
            ALTER TABLE match_participants 
            ALTER COLUMN team_name SET NOT NULL;
        `);

        // Add comment for documentation
        await queryRunner.query(`COMMENT ON COLUMN match_participants.team_name IS 'Name of the team the player belongs to (e.g., Team A, Team B, Red Team, etc.)';`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert back to team_side column name and original type
        await queryRunner.query(`
            ALTER TABLE match_participants 
            RENAME COLUMN team_name TO team_side;
        `);

        // Revert to original column type (assuming it was a smaller varchar or enum)
        await queryRunner.query(`
            ALTER TABLE match_participants 
            ALTER COLUMN team_side TYPE VARCHAR(50);
        `);

        // Remove NOT NULL constraint
        await queryRunner.query(`
            ALTER TABLE match_participants 
            ALTER COLUMN team_side DROP NOT NULL;
        `);
    }
}
