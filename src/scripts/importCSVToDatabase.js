import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const pool = new Pool({
    connectionString: 'postgresql://postgres:mRbKgXGFaLfbeoRMGjEVHBqWUsiWEYaF@nozomi.proxy.rlwy.net:24450/hof',
    ssl: {
        rejectUnauthorized: false, // Required for Railway/cloud databases
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

/**
 * Parse CSV content into array of objects
 */
function parseCSV(csvContent) {
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',');
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = [];
        let currentValue = '';
        let inQuotes = false;
        
        for (let j = 0; j < lines[i].length; j++) {
            const char = lines[i][j];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(currentValue.trim());
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue.trim()); // Add the last value
        
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                let value = values[index];
                // Remove quotes if present
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                row[header] = value;
            });
            data.push(row);
        }
    }
    
    return data;
}

/**
 * Initialize database table
 */
async function initializeDatabase() {
    try {
        const client = await pool.connect();
        
        // Check if table exists
        const tableExistsQuery = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'football_teams'
            );
        `;
        
        const tableResult = await client.query(tableExistsQuery);
        const tableExists = tableResult.rows[0].exists;
        
        if (tableExists) {
            console.log('✅ Football teams table already exists');
            client.release();
            return;
        }

        console.log('🔧 Creating football teams table...');
        
        // Read and execute the migration SQL
        const migrationPath = path.join(__dirname, '../database/migrations/create-football-teams-table.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        await client.query(migrationSQL);
        console.log('✅ Database table created successfully');
        
        client.release();
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

/**
 * Insert team data into PostgreSQL database
 */
async function insertTeamToDatabase(teamData) {
    const client = await pool.connect();
    
    try {
        const query = `
            INSERT INTO football_teams (
                api_team_id, team_name, team_code, country, founded, 
                national, logo_url, league_id, league_name, league_country, season
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id;
        `;
        
        const values = [
            parseInt(teamData.api_team_id) || null,
            teamData.team_name || null,
            teamData.team_code || null,
            teamData.country || null,
            parseInt(teamData.founded) || null,
            teamData.national === 'true' || teamData.national === true,
            teamData.logo_url || null,
            parseInt(teamData.league_id) || null,
            teamData.league_name || null,
            teamData.league_country || null,
            parseInt(teamData.season) || null
        ];
        
        const result = await client.query(query, values);
        return result.rows[0].id;
    } catch (error) {
        console.error('❌ Error inserting team to database:', error);
        console.error('Team data:', teamData);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Find CSV files in the output directory
 */
function findCSVFiles() {
    const outputDir = path.join(__dirname, '../output');
    
    if (!fs.existsSync(outputDir)) {
        console.log('❌ Output directory not found');
        return [];
    }
    
    const files = fs.readdirSync(outputDir);
    const csvFiles = files.filter(file => file.endsWith('.csv') && file.includes('football-teams'));
    
    return csvFiles.map(file => path.join(outputDir, file));
}

/**
 * Main function to import CSV data to database
 */
async function importCSVToDatabase() {
    console.log('🚀 Starting CSV to Database import...');
    
    try {
        // Initialize database
        await initializeDatabase();
        
        // Find CSV files
        const csvFiles = findCSVFiles();
        
        if (csvFiles.length === 0) {
            console.log('❌ No CSV files found in output directory');
            return;
        }
        
        console.log(`📁 Found ${csvFiles.length} CSV file(s)`);
        
        let totalImported = 0;
        let totalErrors = 0;
        
        // Process each CSV file
        for (const csvFile of csvFiles) {
            console.log(`\n📄 Processing: ${path.basename(csvFile)}`);
            
            try {
                const csvContent = fs.readFileSync(csvFile, 'utf8');
                const teams = parseCSV(csvContent);
                
                console.log(`   📊 Found ${teams.length} teams in CSV`);
                
                // Import each team
                for (const team of teams) {
                    try {
                        if (team.api_team_id && team.team_name && team.country) {
                            await insertTeamToDatabase(team);
                            totalImported++;
                            console.log(`   ✅ ${team.team_name} (${team.country}) - ID: ${team.api_team_id}`);
                        } else {
                            console.log(`   ⚠️  Skipping incomplete team data: ${team.team_name || 'Unknown'}`);
                        }
                    } catch (error) {
                        totalErrors++;
                        console.error(`   ❌ Failed to import ${team.team_name}:`, error.message);
                    }
                }
                
            } catch (error) {
                console.error(`❌ Error processing ${csvFile}:`, error);
                totalErrors++;
            }
        }
        
        console.log(`\n📈 Import Summary:`);
        console.log(`   ✅ Successfully imported: ${totalImported} teams`);
        console.log(`   ❌ Errors: ${totalErrors}`);
        
        // Get final count from database
        const client = await pool.connect();
        const countResult = await client.query('SELECT COUNT(*) FROM football_teams');
        const totalTeamsInDB = countResult.rows[0].count;
        client.release();
        
        console.log(`   🗄️  Total teams in database: ${totalTeamsInDB}`);
        
    } catch (error) {
        console.error('❌ Import failed:', error);
    } finally {
        await pool.end();
        console.log('🔚 Database connection closed');
    }
}

// Run the import
importCSVToDatabase().catch(console.error); 