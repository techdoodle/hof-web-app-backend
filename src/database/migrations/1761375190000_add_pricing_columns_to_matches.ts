import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPricingColumnsToMatches1761375190000 implements MigrationInterface {
    name = 'AddPricingColumnsToMatches1761375190000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add slot_price column
        await queryRunner.query(`
            ALTER TABLE matches
            ADD COLUMN IF NOT EXISTS slot_price DECIMAL(10,2) DEFAULT 0;
        `);

        // Add offer_price column
        await queryRunner.query(`
            ALTER TABLE matches
            ADD COLUMN IF NOT EXISTS offer_price DECIMAL(10,2) DEFAULT 0;
        `);

        // Add comments
        await queryRunner.query(`
            COMMENT ON COLUMN matches.slot_price IS 'Price per slot for the match';
            COMMENT ON COLUMN matches.offer_price IS 'Discounted price per slot (must be <= slot_price)';
        `);

        // Add check constraint to ensure offer_price <= slot_price and both >= 0
        await queryRunner.query(`
            ALTER TABLE matches
            ADD CONSTRAINT check_offer_price_valid 
            CHECK (slot_price >= 0 AND offer_price >= 0 AND offer_price <= slot_price);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop constraint
        await queryRunner.query(`ALTER TABLE matches DROP CONSTRAINT IF EXISTS check_offer_price_valid;`);

        // Drop columns
        await queryRunner.query(`
            ALTER TABLE matches
            DROP COLUMN IF EXISTS slot_price,
            DROP COLUMN IF EXISTS offer_price;
        `);
    }
}
