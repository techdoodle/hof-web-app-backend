const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check if enum type already exists
    const enumCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'venue_format_enum'
      );
    `);

    if (!enumCheck.rows[0].exists) {
      console.log('Creating venue_format_enum type...');
      await client.query(`
        CREATE TYPE "venue_format_enum" AS ENUM (
          'FIVE_VS_FIVE',
          'SIX_VS_SIX',
          'SEVEN_VS_SEVEN',
          'EIGHT_VS_EIGHT',
          'NINE_VS_NINE',
          'TEN_VS_TEN',
          'ELEVEN_VS_ELEVEN'
        );
      `);
      console.log('✓ Created venue_format_enum type');
    } else {
      console.log('✓ venue_format_enum type already exists');
    }

    // Check if table already exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'venue_formats'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('Creating venue_formats table...');
      await client.query(`
        CREATE TABLE "venue_formats" (
          "id" SERIAL NOT NULL,
          "venue_id" integer NOT NULL,
          "format" "venue_format_enum" NOT NULL,
          "cost" decimal(10,2) NOT NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PK_venue_formats" PRIMARY KEY ("id"),
          CONSTRAINT "FK_venue_formats_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE,
          CONSTRAINT "UQ_venue_formats_venue_format" UNIQUE ("venue_id", "format")
        );
      `);
      console.log('✓ Created venue_formats table');

      // Create index
      await client.query(`
        CREATE INDEX "IDX_venue_formats_venue_id" ON "venue_formats" ("venue_id");
      `);
      console.log('✓ Created index on venue_id');
    } else {
      console.log('✓ venue_formats table already exists');
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();

