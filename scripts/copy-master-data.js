const { Client } = require('pg');

async function copyMasterTables() {
    const prodDbUrl = process.env.PG_SOURCE_DB_URL;
    const stagingDbUrl = process.env.PG_TARGET_DB_URL;

    if (!prodDbUrl) {
        console.error('❌ PROD_DB_URL environment variable is not set');
        process.exit(1);
    }

    if (!stagingDbUrl) {
        console.error('❌ STAGING_DB_URL or DB_URL environment variable is not set');
        process.exit(1);
    }

    const prodClient = new Client({
        connectionString: prodDbUrl,
        ssl: { rejectUnauthorized: false }
    });

    const stagingClient = new Client({
        connectionString: stagingDbUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔗 Connecting to databases...');
        await prodClient.connect();
        await stagingClient.connect();

        console.log('✅ Connected to both databases');

        // Copy Cities table
        console.log('📊 Copying Cities table...');
        await copyTable(prodClient, stagingClient, 'cities');

        // Copy Football Teams table
        console.log('🏈 Copying Football Teams table...');
        await copyTable(prodClient, stagingClient, 'football_teams');

        console.log('🎉 Master tables copied successfully!');

        // Show record counts
        console.log('\n📊 Record counts in Staging:');
        const citiesCount = await stagingClient.query('SELECT COUNT(*) FROM cities');
        const teamsCount = await stagingClient.query('SELECT COUNT(*) FROM football_teams');
        
        console.log(`Cities: ${citiesCount.rows[0].count}`);
        console.log(`Football Teams: ${teamsCount.rows[0].count}`);

    } catch (error) {
        console.error('❌ Error copying master tables:', error.message);
        process.exit(1);
    } finally {
        await prodClient.end();
        await stagingClient.end();
    }
}

async function copyTable(sourceClient, targetClient, tableName) {
    try {
        // First, clear existing data in staging
        console.log(`  🗑️  Clearing existing ${tableName} data in staging...`);
        await targetClient.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`);

        // Get all data from production
        console.log(`  📥 Fetching ${tableName} data from production...`);
        const result = await sourceClient.query(`SELECT * FROM ${tableName}`);
        
        if (result.rows.length === 0) {
            console.log(`  ⚠️  No data found in ${tableName} table`);
            return;
        }

        console.log(`  📤 Found ${result.rows.length} records in ${tableName}`);

        // Get column names
        const columns = Object.keys(result.rows[0]);
        const columnsList = columns.join(', ');
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');

        // Insert data into staging
        console.log(`  📥 Inserting ${tableName} data into staging...`);
        
        for (const row of result.rows) {
            const values = columns.map(col => row[col]);
            await targetClient.query(
                `INSERT INTO ${tableName} (${columnsList}) VALUES (${placeholders})`,
                values
            );
        }

        console.log(`  ✅ ${tableName} table copied successfully (${result.rows.length} records)`);

    } catch (error) {
        console.error(`  ❌ Error copying ${tableName} table:`, error.message);
        throw error;
    }
}

copyMasterTables();
