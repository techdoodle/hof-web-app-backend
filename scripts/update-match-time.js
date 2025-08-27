const { Client } = require('pg');
require('dotenv').config();

async function updateMatchTime() {
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

    // Example: Update a specific match time
    const matchId = 4; // Change this to your match ID
    const newStartTime = '2025-08-25 19:00:00'; // Change this to your desired time
    
    console.log(`\nUpdating Match ID ${matchId} to start at ${newStartTime} IST`);
    
    const result = await client.query(`
      UPDATE matches 
      SET start_time = $1::timestamp 
      WHERE match_id = $2
      RETURNING match_id, start_time, end_time;
    `, [newStartTime, matchId]);
    
    if (result.rows.length > 0) {
      console.log('✓ Update successful!');
      console.log(`Match ID ${result.rows[0].match_id}:`);
      console.log(`  - Start time: ${result.rows[0].start_time}`);
      console.log(`  - End time: ${result.rows[0].end_time || 'Not set'}`);
    } else {
      console.log('❌ No match found with that ID');
    }

    // Show all matches
    console.log('\n=== ALL MATCHES (IST TIMEZONE) ===');
    const allMatches = await client.query(`
      SELECT match_id, start_time, end_time, match_type
      FROM matches 
      ORDER BY match_id;
    `);
    
    allMatches.rows.forEach(row => {
      console.log(`Match ID ${row.match_id} (${row.match_type}):`);
      console.log(`  - Start: ${row.start_time}`);
      console.log(`  - End: ${row.end_time || 'Not set'}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

updateMatchTime();
