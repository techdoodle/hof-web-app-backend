import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPlayernationVideoUrlToMatchParticipantsSimple1761478126660 implements MigrationInterface {
    name = 'AddPlayernationVideoUrlToMatchParticipantsSimple1761478126660'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "match_participants" ADD "playernation_video_url" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "match_participants" DROP COLUMN "playernation_video_url"`);
    }
}
