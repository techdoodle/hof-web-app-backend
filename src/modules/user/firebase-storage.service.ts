import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseConfig } from '../../config/firebase.config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FirebaseStorageService {
  private readonly storageRoot: string;

  constructor(
    private firebaseConfig: FirebaseConfig,
    private configService: ConfigService
  ) {
    this.storageRoot = this.configService.get<string>('FIREBASE_STORAGE_ROOT') || 'profile_pictures';
  }

  async uploadImage(imageBuffer: Buffer, userId: string | number): Promise<string> {
    try {
      const bucket = this.firebaseConfig.getBucket();
      
      // Clear existing images in user folder before uploading new one
      await this.clearUserFolder(userId);
      
      const fileName = `${this.storageRoot}/${userId}/${uuidv4()}.png`;
      const file = bucket.file(fileName);

      // Upload the buffer to Firebase Storage
      await file.save(imageBuffer, {
        metadata: {
          contentType: 'image/png',
          cacheControl: 'public, max-age=31536000', // 1 year
        },
      });

      // Make the file publicly accessible
      await file.makePublic();

      // Return the public URL
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      return publicUrl;
    } catch (error) {
      console.error('Firebase Storage upload error:', error);
      throw new Error(`Failed to upload image to Firebase Storage: ${error.message}`);
    }
  }

  async uploadBase64Image(base64Data: string, userId: string | number): Promise<string> {
    try {
      // Remove data URL prefix if present
      const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64String, 'base64');
      
      return await this.uploadImage(imageBuffer, userId);
    } catch (error) {
      console.error('Firebase Storage base64 upload error:', error);
      throw new Error(`Failed to upload base64 image to Firebase Storage: ${error.message}`);
    }
  }

  async deleteImage(imageUrl: string): Promise<void> {
    try {
      const bucket = this.firebaseConfig.getBucket();
      
      // Extract file path from URL
      const urlParts = imageUrl.split(`https://storage.googleapis.com/${bucket.name}/`);
      if (urlParts.length !== 2) {
        throw new Error('Invalid Firebase Storage URL');
      }
      
      const filePath = urlParts[1];
      const file = bucket.file(filePath);
      
      await file.delete();
    } catch (error) {
      console.error('Firebase Storage delete error:', error);
      throw new Error(`Failed to delete image from Firebase Storage: ${error.message}`);
    }
  }

  async getSignedUrl(filePath: string, expiresInMinutes: number = 60): Promise<string> {
    try {
      const bucket = this.firebaseConfig.getBucket();
      const file = bucket.file(filePath);
      
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + (expiresInMinutes * 60 * 1000),
      });
      
      return signedUrl;
    } catch (error) {
      console.error('Firebase Storage signed URL error:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  async clearUserFolder(userId: string | number): Promise<void> {
    try {
      const bucket = this.firebaseConfig.getBucket();
      const folderPath = `${this.storageRoot}/${userId}/`;
      
      // List all files in the user's folder
      const [files] = await bucket.getFiles({
        prefix: folderPath,
      });

      // Delete all files in the folder
      if (files.length > 0) {
        await Promise.all(files.map(file => file.delete()));
        console.log(`Cleared ${files.length} files from user ${userId} folder`);
      }
    } catch (error) {
      console.error('Error clearing user folder:', error);
      // Don't throw error - continue with upload even if cleanup fails
    }
  }
} 