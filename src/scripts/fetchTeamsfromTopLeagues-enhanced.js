import fetch from 'node-fetch';
import pkg from 'pg';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pkg;

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API Configuration
const API_KEY = "6bfb2380f5ca2ddd77cd37c46bdc8a99"; 
const BASE_URL = "https://v3.football.api-sports.io";

const HEADERS = {
    "x-apisports-key": API_KEY
};

// Database Configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'hof',
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'test1234',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

// Initialize PostgreSQL pool
const pool = new Pool(dbConfig);

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
    try {
        // Try to initialize with service account key
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'your-bucket-name.appspot.com'
        });
    } catch (error) {
        console.error('Firebase initialization error:', error);
        console.log('Continuing without Firebase storage...');
    }
}

// League Configuration
const TOP_LEAGUE_IDS = [
    4335,  // English Premier League
    4378, // Spanish La Liga
    4399, // Italian Serie A
    4346,  // German Bundesliga
    4347,  // French Ligue 1
    
];

const CURRENT_SEASON = 2022;

let allTopTeamsData = [];
let uniqueTopTeams = new Set();

/**
 * Fetches data from the API-Football.
 */
async function fetchData(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

    try {
        console.log("url", url.toString());
        const response = await fetch(url.toString(), { headers: HEADERS });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`HTTP error! Status: ${response.status}, Body: ${errorText}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error(`Error fetching data from ${endpoint}:`, error);
        return null;
    }
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
            console.log('✅ Football teams table already exists, skipping creation');
            client.release();
            return;
        }

        console.log('🔧 Creating football teams table...');
        
        // Read and execute the migration SQL
        const migrationPath = path.join(__dirname, '../database/migrations/create-football-teams-table.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        await client.query(migrationSQL);
        console.log('✅ Database table initialized successfully');
        
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
            ON CONFLICT (api_team_id, league_id, season) 
            DO UPDATE SET 
                team_name = EXCLUDED.team_name,
                team_code = EXCLUDED.team_code,
                country = EXCLUDED.country,
                founded = EXCLUDED.founded,
                national = EXCLUDED.national,
                logo_url = EXCLUDED.logo_url,
                league_name = EXCLUDED.league_name,
                league_country = EXCLUDED.league_country,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id;
        `;
        
        const values = [
            teamData.api_team_id,
            teamData.team_name,
            teamData.team_code,
            teamData.country,
            teamData.founded,
            teamData.national,
            teamData.logo_url,
            teamData.league_id,
            teamData.league_name,
            teamData.league_country,
            teamData.season
        ];
        
        const result = await client.query(query, values);
        return result.rows[0]?.id;
        
    } catch (error) {
        console.error('Database insert error:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Generate CSV content from teams data
 */
function generateCSVContent(teamsData) {
    const headers = [
        'id',
        'api_team_id',
        'team_name',
        'team_code',
        'country',
        'founded',
        'national',
        'logo_url',
        'league_id',
        'league_name',
        'league_country',
        'season',
        'created_at'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    teamsData.forEach((team, index) => {
        const row = [
            index + 1,
            team.api_team_id || '',
            `"${team.team_name}"`,
            `"${team.team_code || ''}"`,
            `"${team.country}"`,
            team.founded || '',
            team.national || false,
            `"${team.logo_url || ''}"`,
            team.league_id || '',
            `"${team.league_name || ''}"`,
            `"${team.league_country || ''}"`,
            team.season || '',
            new Date().toISOString()
        ];
        csvContent += row.join(',') + '\n';
    });
    
    return csvContent;
}

/**
 * Upload CSV to Firebase Storage
 */
async function uploadCSVToFirebase(csvContent, filename) {
    try {
        if (!admin.apps.length) {
            console.log('⚠️  Firebase not initialized, skipping CSV upload');
            return null;
        }
        
        const bucket = admin.storage().bucket();
        const file = bucket.file(`football-teams-data/${filename}`);
        
        await file.save(csvContent, {
            metadata: {
                contentType: 'text/csv',
                metadata: {
                    uploadedAt: new Date().toISOString(),
                    source: 'football-teams-script'
                }
            }
        });
        
        console.log(`✅ CSV uploaded to Firebase: football-teams-data/${filename}`);
        return `football-teams-data/${filename}`;
        
    } catch (error) {
        console.error('❌ Firebase upload error:', error);
        return null;
    }
}

/**
 * Save CSV locally as backup
 */
async function saveCSVLocally(csvContent, filename) {
    try {
        const outputDir = path.join(__dirname, '../output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const filePath = path.join(outputDir, filename);
        fs.writeFileSync(filePath, csvContent);
        
        console.log(`✅ CSV saved locally: ${filePath}`);
        return filePath;
        
    } catch (error) {
        console.error('❌ Local CSV save error:', error);
        return null;
    }
}

/**
 * Enhanced main function with database and CSV storage
 */
async function listTopSoccerTeams() {
    console.log('🚀 Starting enhanced football teams data collection...');
    console.log(`📅 Season: ${CURRENT_SEASON}`);
    console.log(`🏆 Processing ${TOP_LEAGUE_IDS.length} leagues`);
    
    try {
        // Initialize database
        await initializeDatabase();
        
        // Process each league
        for (const leagueId of TOP_LEAGUE_IDS) {
            try {
                console.log(`\n🔄 Processing league ID: ${leagueId}`);
                
                // Fetch teams for the specific league and season
                const teamsData = await fetchData("/teams", { league: leagueId, season: CURRENT_SEASON });
                console.log("teamsData", teamsData.response);
                if (teamsData && teamsData.response && teamsData.response.length > 0) {
                    // Fetch league info
                    const leagueInfoData = await fetchData("/leagues", { id: leagueId });
                    let leagueName = "Unknown League";
                    let leagueCountry = "Unknown Country";

                    if (leagueInfoData && leagueInfoData.response && leagueInfoData.response.length > 0) {
                        const actualLeague = leagueInfoData.response[0].league;
                        const actualCountry = leagueInfoData.response[0].country;
                        leagueName = actualLeague?.name || "Unknown League";
                        leagueCountry = actualCountry?.name || "Unknown Country";
                    }

                    console.log(`   📊 ${leagueName} (${leagueCountry}) - ${teamsData.response.length} teams`);

                    // Process each team
                    for (const teamEntry of teamsData.response) {
                        const team = teamEntry.team;
                        
                        if (team?.name && team?.country && team?.id) {
                            const teamIdentifier = `${team.id}|${leagueId}|${CURRENT_SEASON}`;
                            
                            if (!uniqueTopTeams.has(teamIdentifier)) {
                                uniqueTopTeams.add(teamIdentifier);
                                
                                const teamData = {
                                    api_team_id: team.id,
                                    team_name: team.name,
                                    team_code: team.code || null,
                                    country: team.country,
                                    founded: team.founded || null,
                                    national: team.national || false,
                                    logo_url: team.logo || null,
                                    league_id: leagueId,
                                    league_name: leagueName,
                                    league_country: leagueCountry,
                                    season: CURRENT_SEASON
                                };
                                
                                // Insert into database
                                try {
                                    await insertTeamToDatabase(teamData);
                                    allTopTeamsData.push(teamData);
                                    console.log(`   ✅ ${team.name} (${team.country}) - ID: ${team.id}`);
                                } catch (dbError) {
                                    console.error(`   ❌ Failed to insert ${team.name}:`, dbError.message);
                                }
                            }
                        }
                    }
                } else {
                    console.log(`   ⚠️  No teams found for league ID ${leagueId}`);
                }
                
                // Rate limiting - wait 1 second between requests
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`❌ Error processing league ID ${leagueId}:`, error);
            }
        }

        // Generate and save CSV
        if (allTopTeamsData.length > 0) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `football-teams-${timestamp}.csv`;
            const csvContent = generateCSVContent(allTopTeamsData);
            
            // Save CSV locally
            await saveCSVLocally(csvContent, filename);
            
            // Upload to Firebase
            await uploadCSVToFirebase(csvContent, filename);
            
            console.log(`\n📈 Summary:`);
            console.log(`   Total unique teams processed: ${allTopTeamsData.length}`);
            console.log(`   Database records: Updated/Inserted`);
            console.log(`   CSV file: ${filename}`);
            console.log(`   Firebase path: football-teams-data/${filename}`);
        }

    } catch (error) {
        console.error('❌ Main process error:', error);
    } finally {
        // Close database connection
        await pool.end();
        console.log('\n🏁 Process completed');
    }
}

// Execute the main function
listTopSoccerTeams().catch(console.error); 