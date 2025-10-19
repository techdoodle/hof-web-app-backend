import { registerAs } from '@nestjs/config';

// Register configuration sections
const config = registerAs('app', () => ({
    port: process.env.PORT || 8000,
    email: {
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587', 10),
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASSWORD,
        from: process.env.EMAIL_FROM,
        secure: process.env.EMAIL_PORT === '465'
    },
    database: {
        url: process.env.DB_URL,
        synchronize: process.env.NODE_ENV === 'development',
        migrationsRun: process.env.NODE_ENV !== 'development',
        logging: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
    },
    digimiles: {
        username: process.env.DIGIMILES_USERNAME,
        password: process.env.DIGIMILES_PASSWORD,
    },
    encryption: {
        key: process.env.OTP_ENCRYPTION_KEY
    }
}));

export default config;
