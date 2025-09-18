// src/config/configuration.ts
export default () => ({
    port: process.env.PORT || 8000,
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
});
