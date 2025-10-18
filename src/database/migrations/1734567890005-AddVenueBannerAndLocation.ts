import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVenueBannerAndLocation1734567890005 implements MigrationInterface {
    name = 'AddVenueBannerAndLocation1734567890005'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add display_banner column
        await queryRunner.query(`
            ALTER TABLE venues
            ADD COLUMN IF NOT EXISTS display_banner TEXT DEFAULT NULL;
        `);

        // Add comment for display_banner
        await queryRunner.query(`
            COMMENT ON COLUMN venues.display_banner IS 'Base64 encoded venue banner image (jpg/png)';
        `);

        // Add latitude/longitude columns if they don't exist
        await queryRunner.query(`
            ALTER TABLE venues
            ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
            ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
        `);

        // Add comments
        await queryRunner.query(`
            COMMENT ON COLUMN venues.latitude IS 'Venue latitude coordinate';
            COMMENT ON COLUMN venues.longitude IS 'Venue longitude coordinate';
        `);

        // Backfill venue coordinates from their cities
        await queryRunner.query(`
            UPDATE venues v
            SET 
                latitude = c.latitude,
                longitude = c.longitude
            FROM cities c
            WHERE v.city_id = c.id
            AND v.latitude IS NULL
            AND v.longitude IS NULL;
        `);

        // Create indexes for lat/long
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_venues_lat_long ON venues (latitude, longitude);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop index
        await queryRunner.query(`DROP INDEX IF EXISTS idx_venues_lat_long;`);

        // Drop columns
        await queryRunner.query(`
            ALTER TABLE venues
            DROP COLUMN IF EXISTS display_banner,
            DROP COLUMN IF EXISTS latitude,
            DROP COLUMN IF EXISTS longitude;
        `);
    }
}