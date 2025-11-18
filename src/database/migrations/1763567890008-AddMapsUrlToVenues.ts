import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMapsUrlToVenues1763567890008 implements MigrationInterface {
    name = 'AddMapsUrlToVenues1763567890008'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add maps_url column
        await queryRunner.query(`
            ALTER TABLE venues
            ADD COLUMN IF NOT EXISTS maps_url TEXT DEFAULT NULL;
        `);

        // Add comment for maps_url
        await queryRunner.query(`
            COMMENT ON COLUMN venues.maps_url IS 'Google Maps or other maps URL for the venue location';
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop maps_url column
        await queryRunner.query(`
            ALTER TABLE venues
            DROP COLUMN IF EXISTS maps_url;
        `);
    }
}

