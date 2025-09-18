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
    extra: {
        timezone: 'Asia/Kolkata',
    },
    ssl: {
        rejectUnauthorized: false,
    },
});
