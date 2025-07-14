// src/config/configuration.ts
export default () => ({
    port: process.env.PORT || 8000,
    digimiles: {
        username: process.env.DIGIMILES_USERNAME,
        password: process.env.DIGIMILES_PASSWORD,
    },
    encryption: {
        key: process.env.OTP_ENCRYPTION_KEY
    }
});
