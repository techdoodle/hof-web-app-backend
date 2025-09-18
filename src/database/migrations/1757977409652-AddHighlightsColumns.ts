import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHighlightsColumns1757977409652 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE matches 
            ADD COLUMN IF NOT EXISTS 
            match_highlights TEXT`,
        );

        await queryRunner.query(`ALTER TABLE matches 
            ADD COLUMN IF NOT EXISTS 
            match_recap TEXT`,
        );

        await queryRunner.query(`ALTER TABLE match_participants 
            ADD COLUMN IF NOT EXISTS 
            player_highlights TEXT`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE matches DROP COLUMN IF EXISTS match_highlights;`);
        await queryRunner.query(`ALTER TABLE matches DROP COLUMN IF EXISTS match_recap;`);
        await queryRunner.query(`ALTER TABLE match_participants DROP COLUMN IF EXISTS player_highlights;`);
    }

}
