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

    // First, let's check the current state
    console.log('Checking current table structure...');
    const checkResult = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'match_participants' 
      AND column_name = 'team_name'
    `);
    console.log('Current team_name column:', checkResult.rows[0]);

    // Check for NULL values
    const nullCheck = await client.query(`
      SELECT COUNT(*) as null_count 
      FROM match_participants 
      WHERE team_name IS NULL
    `);
    console.log('NULL values found:', nullCheck.rows[0].null_count);

    // Update NULL values to default
    if (parseInt(nullCheck.rows[0].null_count) > 0) {
      console.log('Updating NULL values to default...');
      await client.query(`
        UPDATE match_participants 
        SET team_name = 'Team A' 
        WHERE team_name IS NULL
      `);
      console.log('NULL values updated successfully');
    }

    // Make column NOT NULL
    console.log('Making team_name column NOT NULL...');
    await client.query(`
      ALTER TABLE match_participants 
      ALTER COLUMN team_name SET NOT NULL
    `);
    console.log('Column made NOT NULL successfully');

    console.log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
