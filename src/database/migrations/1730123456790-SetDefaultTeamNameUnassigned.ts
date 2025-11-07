import { MigrationInterface, QueryRunner } from "typeorm";

export class SetDefaultTeamNameUnassigned1730123456790 implements MigrationInterface {
  name = 'SetDefaultTeamNameUnassigned1730123456790'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "match_participants" ALTER COLUMN "team_name" SET DEFAULT 'Unassigned'`);
    await queryRunner.query(`UPDATE "match_participants" SET "team_name" = 'Unassigned' WHERE "team_name" IS NULL OR trim("team_name") = ''`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "match_participants" ALTER COLUMN "team_name" DROP DEFAULT`);
  }
}


