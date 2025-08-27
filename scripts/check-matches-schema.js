const { Client } = require('pg');
require('dotenv').config();

async function checkMatchesSchema() {
  const client = new Client({
    connectionString: process.env.DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check table structure
    console.log('\n=== MATCHES TABLE STRUCTURE ===');
    const structure = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns 
      WHERE table_name = 'matches' 
      ORDER BY ordinal_position;
    `);
    
    console.log('Current table structure:');
    structure.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}${row.numeric_precision ? `(${row.numeric_precision})` : ''} (nullable: ${row.is_nullable})`);
    });

    // Check for any NULL values
    console.log('\n=== NULL VALUE CHECK ===');
    const nullCheck = await client.query(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(start_time) as start_time_count,
        COUNT(end_time) as end_time_count,
        COUNT(*) - COUNT(start_time) as null_start_times,
        COUNT(*) - COUNT(end_time) as null_end_times
      FROM matches;
    `);
    
    const stats = nullCheck.rows[0];
    console.log('NULL value statistics:');
    console.log(`  - Total rows: ${stats.total_rows}`);
    console.log(`  - Rows with start_time: ${stats.start_time_count}`);
    console.log(`  - Rows with end_time: ${stats.end_time_count}`);
    console.log(`  - NULL start_times: ${stats.null_start_times}`);
    console.log(`  - NULL end_times: ${stats.null_end_times}`);

    // Show sample data
    console.log('\n=== SAMPLE DATA ===');
    const sampleData = await client.query(`
      SELECT match_id, match_type, start_time, end_time, created_at
      FROM matches 
      ORDER BY match_id
      LIMIT 5;
    `);
    
    sampleData.rows.forEach(row => {
      console.log(`Match ID ${row.match_id}:`);
      console.log(`  - Type: ${row.match_type}`);
      console.log(`  - Start: ${row.start_time}`);
      console.log(`  - End: ${row.end_time || 'NULL'}`);
      console.log(`  - Created: ${row.created_at}`);
      console.log('');
    });

    // Check if TypeORM is trying to add columns
    console.log('\n=== TYPEORM SYNCHRONIZATION CHECK ===');
    console.log('If TypeORM thinks columns need to be added, it might be because:');
    console.log('1. Column names don\'t match (camelCase vs snake_case)');
    console.log('2. Data types don\'t match');
    console.log('3. Nullable constraints don\'t match');
    console.log('4. Column doesn\'t exist in database but exists in entity');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkMatchesSchema();
