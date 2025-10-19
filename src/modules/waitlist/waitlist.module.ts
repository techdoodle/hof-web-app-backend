import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { NotificationModule } from '../notification/notification.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([WaitlistEntry]),
        NotificationModule
    ],
    controllers: [WaitlistController],
    providers: [WaitlistService],
    exports: [WaitlistService]
})
export class WaitlistModule { }
