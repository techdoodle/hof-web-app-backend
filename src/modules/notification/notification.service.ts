import { Injectable } from '@nestjs/common';
import * as webPush from 'web-push';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import type { PushSubscription } from './types';
import { PushSubscriptionEntity } from './notification.entity';

@Injectable()
export class NotificationService {
  private vapidDetails: { publicKey: string; privateKey: string };

  constructor(
    private configService: ConfigService,
    @InjectRepository(PushSubscriptionEntity)
    private subscriptionRepo: Repository<PushSubscriptionEntity>,
  ) {
    const publicKey = this.configService.get('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get('VAPID_PRIVATE_KEY');

    if (!publicKey || !privateKey) {
      throw new Error('VAPID keys are not configured in environment variables');
    }

    this.vapidDetails = {
      publicKey,
      privateKey,
    };

    webPush.setVapidDetails(
      'mailto:' + this.configService.get('VAPID_CONTACT_EMAIL'),
      this.vapidDetails.publicKey,
      this.vapidDetails.privateKey,
    );
  }

  async saveSubscription(subscription: PushSubscription, userId: number) {
    const existingSub = await this.subscriptionRepo.findOne({
      where: {
        endpoint: subscription.endpoint,
        user_id: userId
      }
    });

    if (existingSub) {
      return existingSub;
    }

    const newSub = this.subscriptionRepo.create({
      id: uuidv4(),
      endpoint: subscription.endpoint,
      expiration_time: subscription.expiration_time,
      keys: subscription.keys,
      user_id: userId
    });

    return this.subscriptionRepo.save(newSub);
  }

  async sendPushNotification(subscription: PushSubscription, payload: any) {
    try {
      await webPush.sendNotification(subscription, JSON.stringify(payload));
      return true;
    } catch (error) {
      if (error.statusCode === 410) {
        await this.subscriptionRepo.delete({ endpoint: subscription.endpoint });
      }
      console.error('Error sending push notification:', error);
      return false;
    }
  }

  async sendNotificationToUser(userId: number, payload: any) {
    const subscriptions = await this.subscriptionRepo.find({
      where: { user_id: userId }
    });

    const results = await Promise.all(
      subscriptions.map(sub => this.sendPushNotification(sub, payload))
    );

    return results.some(result => result === true);
  }

  getVapidPublicKey(): string {
    return this.vapidDetails.publicKey;
  }
}