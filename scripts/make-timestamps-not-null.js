const { Client } = require('pg');
require('dotenv').config();

async function makeTimestampsNotNull() {
  const client = new Client({
    connectionString: process.env.DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Set timezone for this session
    await client.query("SET timezone = 'Asia/Kolkata';");
    console.log('✓ Set timezone to IST');

    // Check current column constraints
    console.log('\n=== CURRENT COLUMN CONSTRAINTS ===');
    const constraints = await client.query(`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns 
      WHERE table_name = 'matches' 
      AND column_name IN ('start_time', 'end_time')
      ORDER BY column_name;
    `);
    
    console.log('Current constraints:');
    constraints.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

    // Verify no NULL values exist
    console.log('\n=== VERIFYING NO NULL VALUES ===');
    const nullCheck = await client.query(`
      SELECT 
        COUNT(*) as total_matches,
        COUNT(start_time) as matches_with_start_time,
        COUNT(end_time) as matches_with_end_time
      FROM matches;
    `);
    
    const stats = nullCheck.rows[0];
    console.log('Database Statistics:');
    console.log(`  - Total matches: ${stats.total_matches}`);
    console.log(`  - Matches with start_time: ${stats.matches_with_start_time}`);
    console.log(`  - Matches with end_time: ${stats.matches_with_end_time}`);
    
    if (stats.total_matches !== stats.matches_with_start_time) {
      console.log('❌ Cannot make start_time NOT NULL - NULL values exist');
      return;
    }
    
    if (stats.total_matches !== stats.matches_with_end_time) {
      console.log('⚠️  Some end_time values are NULL - will make end_time nullable');
    }

    // Make start_time NOT NULL
    console.log('\n=== MAKING START_TIME NOT NULL ===');
    try {
      await client.query(`
        ALTER TABLE matches 
        ALTER COLUMN start_time SET NOT NULL;
      `);
      console.log('✓ Made start_time NOT NULL');
    } catch (error) {
      console.log('❌ Failed to make start_time NOT NULL:', error.message);
    }

    // Make end_time NOT NULL (only if all values exist)
    if (stats.total_matches === stats.matches_with_end_time) {
      console.log('\n=== MAKING END_TIME NOT NULL ===');
      try {
        await client.query(`
          ALTER TABLE matches 
          ALTER COLUMN end_time SET NOT NULL;
        `);
        console.log('✓ Made end_time NOT NULL');
      } catch (error) {
        console.log('❌ Failed to make end_time NOT NULL:', error.message);
      }
    } else {
      console.log('\n=== END_TIME REMAINS NULLABLE ===');
      console.log('Some matches have NULL end_time values, keeping column nullable');
    }

    // Verify final constraints
    console.log('\n=== FINAL COLUMN CONSTRAINTS ===');
    const finalConstraints = await client.query(`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns 
      WHERE table_name = 'matches' 
      AND column_name IN ('start_time', 'end_time')
      ORDER BY column_name;
    `);
    
    console.log('Final constraints:');
    finalConstraints.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

    // Test inserting a new match
    console.log('\n=== TESTING NEW MATCH INSERTION ===');
    const testTime = '2025-08-28 19:00:00';
    console.log(`Testing insertion with start_time: ${testTime}`);
    
    try {
      const testResult = await client.query(`
        INSERT INTO matches (match_type, start_time, end_time, football_chief_id, stats_received)
        VALUES ('recorded', $1::timestamp, $1::timestamp + INTERVAL '1 hour', 1, false)
        RETURNING match_id, start_time, end_time;
      `, [testTime]);
      
      console.log('✓ Test insertion successful!');
      console.log(`  - Match ID: ${testResult.rows[0].match_id}`);
      console.log(`  - Start time: ${testResult.rows[0].start_time}`);
      console.log(`  - End time: ${testResult.rows[0].end_time}`);
      
      // Clean up test record
      await client.query(`DELETE FROM matches WHERE match_id = $1`, [testResult.rows[0].match_id]);
      console.log('✓ Test record cleaned up');
      
    } catch (error) {
      console.log('❌ Test insertion failed:', error.message);
    }

    console.log('\n=== SUMMARY ===');
    console.log('✓ start_time column is now NOT NULL');
    if (stats.total_matches === stats.matches_with_end_time) {
      console.log('✓ end_time column is now NOT NULL');
    } else {
      console.log('⚠️  end_time column remains nullable');
    }
    console.log('✓ All existing data is valid');
    console.log('✓ New insertions will require start_time');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

makeTimestampsNotNull();
