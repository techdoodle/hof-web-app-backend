import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('send-otp')
  async sendOtp(@Body('mobile') mobile: string) {
    // Validate mobile number (10 digits)
    if (!/^\d{10}$/.test(mobile)) {
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
  ) {
    const isValid = this.authService.verifyOtp(encryptedOtp, iv, otp);
    return { valid: isValid };
  }
}
