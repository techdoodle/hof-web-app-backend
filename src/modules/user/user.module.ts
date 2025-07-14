import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './user.entity';
import { ImageProcessingService } from './image-processing.service';
import { FirebaseConfig } from '../../config/firebase.config';
import { FirebaseStorageService } from './firebase-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService, ImageProcessingService, FirebaseConfig, FirebaseStorageService],
  exports: [UserService],
})
export class UserModule {}
