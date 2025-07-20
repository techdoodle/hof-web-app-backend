import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

// Load environment variables from root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '../../..');

// Manually load .env file
const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n');
    
    envLines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=').replace(/^["']|["']$/g, '');
                process.env[key.trim()] = value.trim();
            }
        }
    });
}

// Database configuration
console.log('🔍 Environment check:');
console.log('   DB_URL:', process.env.DB_URL ? 'Set' : 'Not set');
console.log('   DB_HOST:', process.env.DB_HOST || 'Not set');
console.log('   DB_USERNAME:', process.env.DB_USERNAME || 'Not set');

const pool = new Pool({
    connectionString: process.env.DB_URL || 'postgresql://postgres:mRbKgXGFaLfbeoRMGjEVHBqWUsiWEYaF@nozomi.proxy.rlwy.net:24450/hof',
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
    // Normalize line endings and split by newlines
    const normalizedContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedContent.trim().split('\n');
    const headers = lines[0].split(',').map(header => header.trim());
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
                AND table_name = 'cities'
            );
        `;
        
        const tableResult = await client.query(tableExistsQuery);
        const tableExists = tableResult.rows[0].exists;
        
        if (tableExists) {
            console.log('✅ Cities table already exists');
            client.release();
            return;
        }

        console.log('🔧 Creating cities table...');
        
        // Create the cities table based on the entity definition
        const createTableSQL = `
            CREATE TABLE cities (
                id SERIAL PRIMARY KEY,
                city_name VARCHAR(100) NOT NULL,
                state_name VARCHAR(100) NOT NULL,
                country VARCHAR(100) NOT NULL,
                latitude DECIMAL(10,8) NOT NULL,
                longitude DECIMAL(11,8) NOT NULL
            );
            
            CREATE UNIQUE INDEX idx_cities_city_state ON cities(city_name, state_name);
            CREATE INDEX idx_cities_country ON cities(country);
            CREATE INDEX idx_cities_coordinates ON cities(latitude, longitude);
        `;
        
        await client.query(createTableSQL);
        console.log('✅ Cities table created successfully');
        
        client.release();
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

/**
 * Insert city data into PostgreSQL database
 */
async function insertCityToDatabase(cityData) {
    const client = await pool.connect();
    
    try {
        const query = `
            INSERT INTO cities (
                city_name, state_name, country, latitude, longitude
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (city_name, state_name) 
            DO UPDATE SET 
                country = EXCLUDED.country,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude
            RETURNING id;
        `;
        
        const values = [
            cityData.City?.trim() || null,
            cityData.State?.trim() || null,
            cityData.country?.trim() || 'India',
            parseFloat(cityData.Lat) || null,
            parseFloat(cityData.Long) || null
        ];
        
        const result = await client.query(query, values);
        return result.rows[0].id;
    } catch (error) {
        console.error('❌ Error inserting city to database:', error);
        console.error('City data:', cityData);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Find the Indian cities CSV file
 */
function findIndianCitiesCSV() {
    const outputDir = path.join(__dirname, '../output');
    
    if (!fs.existsSync(outputDir)) {
        console.log('❌ Output directory not found');
        return null;
    }
    
    const files = fs.readdirSync(outputDir);
    const csvFile = files.find(file => file.toLowerCase().includes('indian cities database'));
    
    if (!csvFile) {
        console.log('❌ Indian Cities Database CSV file not found');
        return null;
    }
    
    return path.join(outputDir, csvFile);
}

/**
 * Main function to import Indian cities CSV data to database
 */
async function importIndianCitiesToDatabase() {
    console.log('🚀 Starting Indian Cities CSV to Database import...');
    
    try {
        // Initialize database
        await initializeDatabase();
        
        // Find CSV file
        const csvFile = findIndianCitiesCSV();
        
        if (!csvFile) {
            console.log('❌ Indian Cities CSV file not found in output directory');
            return;
        }
        
        console.log(`📁 Found CSV file: ${path.basename(csvFile)}`);
        
        let totalImported = 0;
        let totalErrors = 0;
        let totalSkipped = 0;
        
        // Process CSV file
        console.log(`\n📄 Processing: ${path.basename(csvFile)}`);
        
        try {
            const csvContent = fs.readFileSync(csvFile, 'utf8');
            const cities = parseCSV(csvContent);
            
            console.log(`   📊 Found ${cities.length} cities in CSV`);
            
            // Import each city
            for (const city of cities) {
                try {
                    // Validate required fields
                    if (city.City && city.State && city.Lat && city.Long) {
                        await insertCityToDatabase(city);
                        totalImported++;
                        console.log(`   ✅ ${city.City}, ${city.State} - Lat: ${city.Lat}, Long: ${city.Long}`);
                    } else {
                        totalSkipped++;
                        console.log(`   ⚠️  Skipping incomplete city data: ${city.City || 'Unknown'}, ${city.State || 'Unknown'}`);
                    }
                } catch (error) {
                    totalErrors++;
                    console.error(`   ❌ Failed to import ${city.City}, ${city.State}:`, error.message);
                }
            }
            
        } catch (error) {
            console.error(`❌ Error processing ${csvFile}:`, error);
            totalErrors++;
        }
        
        console.log(`\n📈 Import Summary:`);
        console.log(`   ✅ Successfully imported: ${totalImported} cities`);
        console.log(`   ⚠️  Skipped: ${totalSkipped} cities`);
        console.log(`   ❌ Errors: ${totalErrors}`);
        
        // Get final count from database
        const client = await pool.connect();
        const countResult = await client.query('SELECT COUNT(*) FROM cities');
        const totalCitiesInDB = countResult.rows[0].count;
        client.release();
        
        console.log(`   🗄️  Total cities in database: ${totalCitiesInDB}`);
        
    } catch (error) {
        console.error('❌ Import failed:', error);
    } finally {
        await pool.end();
        console.log('🔚 Database connection closed');
    }
}

// Run the import
importIndianCitiesToDatabase().catch(console.error); 