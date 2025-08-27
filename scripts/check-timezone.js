const { Client } = require('pg');
require('dotenv').config();

async function checkTimezone() {
  const client = new Client({
    connectionString: process.env.DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check current timezone settings
    console.log('\n=== DATABASE TIMEZONE SETTINGS ===');
    
    const timezoneResult = await client.query('SHOW timezone;');
    console.log('Database timezone:', timezoneResult.rows[0].TimeZone);
    
    const timeResult = await client.query('SELECT NOW();');
    console.log('Current database time:', timeResult.rows[0].now);
    
    const timezoneAbbrevResult = await client.query('SHOW timezone_abbreviations;');
    console.log('Timezone abbreviations available:', timezoneAbbrevResult.rows[0].timezone_abbreviations);

    // Check matches table structure
    console.log('\n=== MATCHES TABLE STRUCTURE ===');
    const tableStructure = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'matches' 
      AND column_name IN ('start_time', 'end_time')
      ORDER BY column_name;
    `);
    
    console.log('Timestamp columns:');
    tableStructure.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

    // Check a sample match record
    console.log('\n=== SAMPLE MATCH RECORDS ===');
    const sampleMatches = await client.query(`
      SELECT match_id, start_time, end_time, 
             start_time AT TIME ZONE 'UTC' as start_time_utc,
             start_time AT TIME ZONE 'Asia/Kolkata' as start_time_ist
      FROM matches 
      ORDER BY created_at DESC 
      LIMIT 3;
    `);
    
    console.log('Recent matches:');
    sampleMatches.rows.forEach(row => {
      console.log(`Match ID ${row.match_id}:`);
      console.log(`  - Original: ${row.start_time}`);
      console.log(`  - UTC: ${row.start_time_utc}`);
      console.log(`  - IST: ${row.start_time_ist}`);
      console.log('');
    });

    // Test inserting a timestamp
    console.log('\n=== TESTING TIMESTAMP INSERTION ===');
    const testTime = '2025-08-25 19:00:00';
    console.log(`Testing insertion of: ${testTime}`);
    
    const testResult = await client.query(`
      SELECT 
        '${testTime}'::timestamp as input_time,
        '${testTime}'::timestamp AT TIME ZONE 'Asia/Kolkata' as ist_time,
        '${testTime}'::timestamp AT TIME ZONE 'UTC' as utc_time;
    `);
    
    console.log('Results:');
    console.log(`  - Input: ${testResult.rows[0].input_time}`);
    console.log(`  - IST: ${testResult.rows[0].ist_time}`);
    console.log(`  - UTC: ${testResult.rows[0].utc_time}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkTimezone();
