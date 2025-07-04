// src/config/configuration.ts
export default () => ({
    port: process.env.PORT,
    digimiles: {
        username: process.env.DIGIMILES_USERNAME,
        password: process.env.DIGIMILES_PASSWORD,
    },
    encryption: {
        key: process.env.OTP_ENCRYPTION_KEY
    }
});
