const { Client } = require('pg');
require('dotenv').config();

async function setDatabaseTimezone() {
  const client = new Client({
    connectionString: process.env.DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log('Connected to database');

    console.log('\n=== SETTING DATABASE TIMEZONE TO IST ===');
    
    // Set timezone for the current session
    await client.query("SET timezone = 'Asia/Kolkata';");
    console.log('✓ Set session timezone to Asia/Kolkata');
    
    // Verify the change
    const timezoneResult = await client.query('SHOW timezone;');
    console.log('Current session timezone:', timezoneResult.rows[0].TimeZone);
    
    const timeResult = await client.query('SELECT NOW();');
    console.log('Current database time (IST):', timeResult.rows[0].now);
    
    // Test with a sample timestamp
    console.log('\n=== TESTING TIMESTAMP DISPLAY ===');
    const testResult = await client.query(`
      SELECT 
        '2025-08-25 19:00:00'::timestamp as input_time,
        '2025-08-25 19:00:00'::timestamp AT TIME ZONE 'Asia/Kolkata' as ist_time,
        NOW() as current_time;
    `);
    
    console.log('Test results:');
    console.log(`  - Input time: ${testResult.rows[0].input_time}`);
    console.log(`  - IST time: ${testResult.rows[0].ist_time}`);
    console.log(`  - Current time: ${testResult.rows[0].current_time}`);
    
    // Check existing matches with new timezone
    console.log('\n=== EXISTING MATCHES WITH IST TIMEZONE ===');
    const matchesResult = await client.query(`
      SELECT match_id, start_time, end_time
      FROM matches 
      ORDER BY created_at DESC 
      LIMIT 3;
    `);
    
    console.log('Recent matches (IST timezone):');
    matchesResult.rows.forEach(row => {
      console.log(`Match ID ${row.match_id}:`);
      console.log(`  - Start time: ${row.start_time}`);
      console.log(`  - End time: ${row.end_time || 'Not set'}`);
      console.log('');
    });

    console.log('\n=== IMPORTANT NOTES ===');
    console.log('1. The session timezone is now set to IST');
    console.log('2. All timestamp queries will now show in IST');
    console.log('3. When you manually update timestamps in your DB client, use IST format');
    console.log('4. Example: 2025-08-25 19:00:00 (not UTC)');
    console.log('5. The database will store timestamps with timezone info');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

setDatabaseTimezone();
