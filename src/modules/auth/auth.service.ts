import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import * as crypto from 'crypto';
import * as https from 'https';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
    private algorithm = 'aes-256-cbc';
    private key: Buffer;

    constructor(
        private configService: ConfigService,
        private jwtService: JwtService,
        private userService: UserService,
    ) {
        // Use direct environment variable since ConfigService is not working properly
        const encryptionKey = process.env.OTP_ENCRYPTION_KEY;
        console.log('Using direct env variable:', encryptionKey);
        console.log('Key length:', encryptionKey ? encryptionKey.length : 'undefined');

        if (!encryptionKey) {
            throw new Error('OTP_ENCRYPTION_KEY environment variable is not set');
        }

        if (encryptionKey.length !== 64) {
            throw new Error(`OTP_ENCRYPTION_KEY must be 64 characters long, got ${encryptionKey.length}`);
        }

        this.key = Buffer.from(encryptionKey, 'hex');
        console.log('Key buffer length:', this.key.length);
    }

    async sendOtp(mobile: string): Promise<object> {
        // Generate a secure 6-digit OTP
        const otp = (await crypto.randomInt(100000, 1000000)).toString();

        // Prepare SMS message
        const message = `Dear Customer, Your OTP for login is ${otp} and do not share it with anyone. Thank you, HUMANS OF FOOTBALL.`;

        // Prepare API parameters - try different ways to access config
        const username = this.configService.get<string>('digimiles.username') ||
            this.configService.get<string>('app.digimiles.username');
        const password = this.configService.get<string>('digimiles.password') ||
            this.configService.get<string>('app.digimiles.password');

        // Debug: Check what ConfigService is returning
        console.log('ConfigService debug:');
        console.log('- digimiles.username:', username);
        console.log('- digimiles.password:', password);
        console.log('- All digimiles config:', this.configService.get('digimiles'));
        console.log('- All app config:', this.configService.get('app'));
        console.log('- Direct env check:', process.env.DIGIMILES_USERNAME);

        console.log('SMS Credentials:', { username, password });
        console.log('SMS Message:', message);
        console.log('Mobile:', mobile);
        console.log("development mode:", process.env.NODE_ENV);

        const params = {
            username,
            password,
            type: '0',
            dlr: '1',
            destination: String(mobile),
            source: 'HOFTXT',
            message,
            entityid: '1101396430000082007',
            tempid: '1107172751406512768',
            tmid: '1101396430000082007,1602100000000009244',
        };

        // Send SMS via API
        // await axios.get('https://rslri.connectbind.com:8443/bulksms/bulksms', { params });
        // Send SMS via API with timeout and error handling
        try {
            console.log('Sending SMS to:', mobile);
            console.log('SMS API URL:', 'https://rslri.connectbind.com:8443/bulksms/bulksms');
            console.log('SMS Parameters:', params);

            if (process.env.NODE_ENV === 'development') {
                console.log('Development mode: SMS sending skipped');
                return {
                    ...this.encryptOtp(otp),
                    mobile
                }
            }

            const response = await axios.get('https://rslri.connectbind.com:8443/bulksms/bulksms', {
                params,
                timeout: 10000, // 10 second timeout
                headers: {
                    'User-Agent': 'HOF-Backend/1.0'
                },
                // SSL configuration to handle certificate verification issues
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false, // Allow self-signed or incomplete certificate chains
                    secureProtocol: 'TLSv1_2_method',
                }),
            });

            console.log('SMS API Response:', response.data);
            console.log('SMS sent successfully');
        } catch (error) {
            console.error('SMS sending failed:', error.message);
            console.error('SMS Error Details:', {
                code: error.code,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });

            // For development: log OTP, for production: might want to throw error
            const isDevelopment = this.configService.get<string>('NODE_ENV') === 'development';
            if (isDevelopment || process.env.NODE_ENV === 'development') {
                console.log(`Development mode: OTP for ${mobile} is ${otp}`);
            } else {
                throw new Error('Failed to send SMS. Please try again later.');
            }
        }

        // Return OTP (for demo; do NOT return in production)
        return {
            ...this.encryptOtp(otp),
            mobile
        }
    }

    encryptOtp(otp: string) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
        let encrypted = cipher.update(otp, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return {
            iv: iv.toString('hex'),
            encryptedOtp: encrypted,
        };
    }

    verifyOtp(encryptedOtp: string, iv: string, userOtp: string, mobile: string): boolean {
        const decipher = crypto.createDecipheriv(
            this.algorithm,
            this.key,
            Buffer.from(iv, 'hex'),
        );
        let decrypted = decipher.update(encryptedOtp, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted === userOtp;
    }

    generateJwtAccessToken(payload: { mobile: string; sub: number }) {
        return this.jwtService.sign(payload);
    }

    generateJwtRefreshToken(payload: { mobile: string; sub: number }) {
        return this.jwtService.sign(payload, { secret: this.configService.get('JWT_REFRESH_SECRET'), expiresIn: '60d' });
    }

    regenerateAccessToken(refreshToken: string) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
            });
            const newAccessToken = this.generateJwtAccessToken({ mobile: payload.mobile, sub: payload.sub });
            return newAccessToken;
        } catch (err) {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    async findOrCreateUser(mobile: string) {
        let user = await this.userService.findByMobile(mobile);
        if (!user) {
            user = await this.userService.create({ phoneNumber: mobile, lastLoginAt: new Date() });
        } else {
            await this.userService.update(user.id, { lastLoginAt: new Date() });
        }
        return user;
    }

    async logout(userId: number) {
        return true;
    }
}
