import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService
  ) { }

  @Post('send-otp')
  async sendOtp(@Body('mobile') mobile: string) {
    // Validate mobile number (10 digits)
    if (!/^\d{10}$/.test(String(mobile))) {
      return { error: 'Invalid mobile number' };
    }
    const result = await this.authService.sendOtp(mobile);
    return { ...result };
  }

  @Post('verify-otp')
  async verifyOtp(
    @Body('encryptedOtp') encryptedOtp: string,
    @Body('iv') iv: string,
    @Body('otp') otp: string,
    @Body('mobile') mobile: string,
  ) {
    const isValid = this.authService.verifyOtp(encryptedOtp, iv, otp, mobile);
    if (!isValid) {
      return { valid: false, message: 'Invalid OTP' };
    }

    const user = await this.authService.findOrCreateUser(mobile);

    if (!user) {
      return { valid: false, message: 'Failed to create or retrieve user' };
    }

    // Generate JWT token
    const accessToken = this.authService.generateJwtAccessToken({ mobile: String(mobile), sub: user.id });
    const refreshToken = this.authService.generateJwtRefreshToken({ mobile: String(mobile), sub: user.id });
    return { valid: true, accessToken, refreshToken, ...user };
  }

  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    const accessToken = this.authService.regenerateAccessToken(refreshToken);
    return { accessToken };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() req) {
    const userId = req.user?.userId;
    if (!userId) {
      return { error: 'User not found' };
    }

    const user = await this.userService.findOne(userId);
    console.log("DEBUG: user", user);
    return { ...user };
  }
}
