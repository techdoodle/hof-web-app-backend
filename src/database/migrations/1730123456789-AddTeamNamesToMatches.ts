import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTeamNamesToMatches1730123456789 implements MigrationInterface {
  name = 'AddTeamNamesToMatches1730123456789'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "matches" ADD "team_a_name" varchar(100) DEFAULT 'Home'`);
    await queryRunner.query(`ALTER TABLE "matches" ADD "team_b_name" varchar(100) DEFAULT 'Away'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "team_b_name"`);
    await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "team_a_name"`);
  }
}


