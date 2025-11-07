import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { EmailService } from './services/email.service';
import { Notification } from './entities/notification.entity';
import { NotificationController } from './notification.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    ConfigModule
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    EmailService
  ],
  exports: [NotificationService]
})
export class NotificationModule { }