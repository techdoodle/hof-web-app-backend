import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import * as crypto from 'crypto';
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
        this.key = Buffer.from(String(this.configService.get<string>('encryption.key')), 'hex');
    }

    async sendOtp(mobile: string): Promise<object> {
        // Generate a secure 6-digit OTP
        const otp = (await crypto.randomInt(100000, 1000000)).toString();

        // Prepare SMS message
        const message = `Dear Customer, Your OTP for login is ${otp} and do not share it with anyone. Thank you, HUMANS OF FOOTBALL.`;

        // Prepare API parameters
        const params = {
            username: this.configService.get<string>('digimiles.username'),
            password: this.configService.get<string>('digimiles.password'),
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
        await axios.get('https://rslri.connectbind.com:8443/bulksms/bulksms', { params });

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
        return this.jwtService.sign(payload, { secret: this.configService.get('JWT_REFRESH_SECRET'), expiresIn: '7d' });
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
}
