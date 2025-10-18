import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import type { PushSubscription } from './types';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    [key: string]: any;
  };
}

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) { }

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return {
      publicKey: this.notificationService.getVapidPublicKey(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(@Body() subscription: PushSubscription, @Req() req: AuthenticatedRequest) {
    const userId = Number(req.user.id);
    const savedSubscription = await this.notificationService.saveSubscription(
      subscription,
      userId
    );
    return { success: true, subscription: savedSubscription };
  }

  @UseGuards(JwtAuthGuard)
  @Post('send')
  async sendNotification(
    @Body() data: { subscription: PushSubscription; payload: any },
  ) {
    const result = await this.notificationService.sendPushNotification(
      data.subscription,
      data.payload,
    );
    return { success: result };
  }

  @UseGuards(JwtAuthGuard)
  @Post('test')
  async testNotification(@Body() subscription: PushSubscription) {
    const testPayload = {
      title: 'Test Notification',
      body: 'This is a test push notification!',
      icon: '/icons/icon-192x192.png',
      data: {
        url: '/matches'
      }
    };

    const result = await this.notificationService.sendPushNotification(
      subscription,
      testPayload
    );
    return { success: result };
  }
}