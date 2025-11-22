import { DataSource } from 'typeorm';
import { config } from 'dotenv';

// Load environment variables
config();

export const AppDataSource = new DataSource({
    type: 'postgres',
    url: process.env.DB_URL,
    entities: ['src/**/*.entity.ts'],
    migrations: ['src/database/migrations/*.ts'],
    synchronize: false,
    migrationsRun: false, // Let CLI handle this
    logging: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
    
    // Connection pool configuration
    poolSize: 10,  // Smaller pool for migrations (CLI usage)
    
    extra: {
        timezone: 'Asia/Kolkata',
        
        // Timeout settings for migrations
        statement_timeout: 120000,  // 2 minutes - migrations can be slower
        idle_in_transaction_session_timeout: 300000,  // 5 minutes for migrations
        
        // TCP keepalive settings
        tcp_keepalives_idle: 30,
        tcp_keepalives_interval: 10,
        tcp_keepalives_count: 3,
        
        connectionTimeoutMillis: 10000,  // 10 seconds for migration connections
    },
    
    ssl: {
        rejectUnauthorized: false,
    },
});
