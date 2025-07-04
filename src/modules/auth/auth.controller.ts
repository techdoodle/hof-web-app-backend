import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('send-otp')
  @Throttle({ sendOtp: { limit: 1, ttl: 30000 } })
  async sendOtp(@Body('mobile') mobile: number) {
    // Validate mobile number (10 digits)
    if (!/^\d{10}$/.test(String(mobile))) {
      return { error: 'Invalid mobile number' };
    }
    const result = await this.authService.sendOtp(mobile);
    return { ...result };
  }

  @Post('verify-otp')
  verifyOtp(
    @Body('encryptedOtp') encryptedOtp: string,
    @Body('iv') iv: string,
    @Body('otp') otp: string,
    @Body('mobile') mobile: number,
  ) {
    const isValid = this.authService.verifyOtp(encryptedOtp, iv, otp, mobile);
    if (!isValid) {
      return { valid: false, message: 'Invalid OTP' };
    }
    // Generate JWT token
    const accessToken = this.authService.generateJwtAccessToken({ mobile: String(mobile) });
    const refreshToken = this.authService.generateJwtRefreshToken({ mobile: String(mobile) });
    return { valid: true, accessToken, refreshToken };
  }

  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    const accessToken = this.authService.regenerateAccessToken(refreshToken);
    return { accessToken };
  }
}
