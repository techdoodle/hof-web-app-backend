import { Controller, Post, Body } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { EmailService } from './services/email.service';

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService
  ) { }

  @Post('test-email')
  async testEmail(@Body() body: { email: string }) {
    return this.emailService.sendTestEmail(body.email);
  }
}