const { Client } = require('pg');
require('dotenv').config();

async function fixNullTimestamps() {
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

    // Check for NULL values
    console.log('\n=== CHECKING FOR NULL VALUES ===');
    const nullCheck = await client.query(`
      SELECT 
        COUNT(*) as total_matches,
        COUNT(start_time) as matches_with_start_time,
        COUNT(end_time) as matches_with_end_time,
        COUNT(*) - COUNT(start_time) as null_start_times,
        COUNT(*) - COUNT(end_time) as null_end_times
      FROM matches;
    `);
    
    const stats = nullCheck.rows[0];
    console.log('Database Statistics:');
    console.log(`  - Total matches: ${stats.total_matches}`);
    console.log(`  - Matches with start_time: ${stats.matches_with_start_time}`);
    console.log(`  - Matches with end_time: ${stats.matches_with_end_time}`);
    console.log(`  - NULL start_times: ${stats.null_start_times}`);
    console.log(`  - NULL end_times: ${stats.null_end_times}`);

    // Show matches with NULL start_time
    if (parseInt(stats.null_start_times) > 0) {
      console.log('\n=== MATCHES WITH NULL START_TIME ===');
      const nullMatches = await client.query(`
        SELECT match_id, match_type, start_time, end_time, created_at
        FROM matches 
        WHERE start_time IS NULL
        ORDER BY match_id;
      `);
      
      nullMatches.rows.forEach(row => {
        console.log(`Match ID ${row.match_id} (${row.match_type}):`);
        console.log(`  - Start time: ${row.start_time || 'NULL'}`);
        console.log(`  - End time: ${row.end_time || 'NULL'}`);
        console.log(`  - Created: ${row.created_at}`);
        console.log('');
      });
    }

    // Fix NULL start_time values
    if (parseInt(stats.null_start_times) > 0) {
      console.log('\n=== FIXING NULL START_TIME VALUES ===');
      
      // Set default start time to 1 hour from now
      const defaultStartTime = new Date();
      defaultStartTime.setHours(defaultStartTime.getHours() + 1);
      defaultStartTime.setMinutes(0);
      defaultStartTime.setSeconds(0);
      defaultStartTime.setMilliseconds(0);
      
      const formattedStartTime = defaultStartTime.toISOString().replace('T', ' ').substring(0, 19);
      
      console.log(`Setting NULL start_times to: ${formattedStartTime}`);
      
      const updateResult = await client.query(`
        UPDATE matches 
        SET start_time = $1::timestamp 
        WHERE start_time IS NULL
        RETURNING match_id, start_time;
      `, [formattedStartTime]);
      
      console.log(`✓ Updated ${updateResult.rows.length} matches`);
      
      updateResult.rows.forEach(row => {
        console.log(`  - Match ID ${row.match_id}: ${row.start_time}`);
      });
    }

    // Fix NULL end_time values (set to 1 hour after start_time)
    if (parseInt(stats.null_end_times) > 0) {
      console.log('\n=== FIXING NULL END_TIME VALUES ===');
      
      const updateEndResult = await client.query(`
        UPDATE matches 
        SET end_time = start_time + INTERVAL '1 hour'
        WHERE end_time IS NULL AND start_time IS NOT NULL
        RETURNING match_id, start_time, end_time;
      `);
      
      console.log(`✓ Updated ${updateEndResult.rows.length} end times`);
      
      updateEndResult.rows.forEach(row => {
        console.log(`  - Match ID ${row.match_id}: ${row.start_time} → ${row.end_time}`);
      });
    }

    // Verify all matches now have valid times
    console.log('\n=== VERIFICATION ===');
    const finalCheck = await client.query(`
      SELECT 
        COUNT(*) as total_matches,
        COUNT(start_time) as matches_with_start_time,
        COUNT(end_time) as matches_with_end_time
      FROM matches;
    `);
    
    const finalStats = finalCheck.rows[0];
    console.log('Final Statistics:');
    console.log(`  - Total matches: ${finalStats.total_matches}`);
    console.log(`  - Matches with start_time: ${finalStats.matches_with_start_time}`);
    console.log(`  - Matches with end_time: ${finalStats.matches_with_end_time}`);
    
    if (finalStats.total_matches === finalStats.matches_with_start_time) {
      console.log('✓ All matches now have valid start times!');
    } else {
      console.log('❌ Some matches still have NULL start times');
    }

    // Show all matches
    console.log('\n=== ALL MATCHES (FINAL STATE) ===');
    const allMatches = await client.query(`
      SELECT match_id, match_type, start_time, end_time
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

fixNullTimestamps();
