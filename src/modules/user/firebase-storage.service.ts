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

      // Archive existing images in user folder before uploading new one
      await this.archiveUserImages(userId);

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

  async archiveUserImages(userId: string | number): Promise<void> {
    try {
      const bucket = this.firebaseConfig.getBucket();
      const folderPath = `${this.storageRoot}/${userId}/`;
      const archiveFolderPath = `${this.storageRoot}/${userId}/archive/`;

      // List all files in the user's folder (excluding already archived files)
      const [files] = await bucket.getFiles({
        prefix: folderPath,
      });

      // Filter out files already in archive folder
      const filesToArchive = files.filter(file => !file.name.includes('/archive/'));

      if (filesToArchive.length > 0) {
        const timestamp = Date.now();

        // Move each file to archive folder with timestamp
        const archivePromises = filesToArchive.map(async (file) => {
          const originalFileName = file.name.split('/').pop(); // Get just the filename
          const archiveFileName = `${archiveFolderPath}${timestamp}_${originalFileName}`;

          try {
            // Copy file to archive location
            await file.copy(archiveFileName);

            // Delete original file
            await file.delete();

            console.log(`Archived ${file.name} to ${archiveFileName}`);
          } catch (error) {
            console.error(`Failed to archive ${file.name}:`, error);
          }
        });

        await Promise.all(archivePromises);
        console.log(`Archived ${filesToArchive.length} files for user ${userId}`);
      }
    } catch (error) {
      console.error('Error archiving user images:', error);
      // Don't throw error - continue with upload even if archiving fails
    }
  }

  async clearUserFolder(userId: string | number): Promise<void> {
    // Keep this method for backward compatibility, but now it calls archive
    await this.archiveUserImages(userId);
  }

  async generateSignedUploadUrl(
    fileName: string, 
    contentType: string, 
    expiresIn: number = 15 * 60 * 1000 // 15 minutes default
  ): Promise<{ uploadUrl: string; downloadUrl: string }> {
    try {
      const bucket = this.firebaseConfig.getBucket();
      const filePath = `playernation_temp/${fileName}`;
      const file = bucket.file(filePath);

      // Generate signed URL for upload (PUT)
      const [uploadUrl] = await file.getSignedUrl({
        action: 'write',
        expires: Date.now() + expiresIn,
        contentType: contentType,
      });

      // Generate signed URL for download (GET) - valid for 48 hours
      const [downloadUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + (48 * 60 * 60 * 1000), // 48 hours
      });

      return { uploadUrl, downloadUrl };
    } catch (error) {
      console.error('Firebase Storage signed URL generation error:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  async deletePlayerNationFile(fileName: string): Promise<void> {
    try {
      const bucket = this.firebaseConfig.getBucket();
      const filePath = `playernation_temp/${fileName}`;
      const file = bucket.file(filePath);

      await file.delete();
    } catch (error) {
      console.error('Firebase Storage delete error:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  async uploadPlayerNationVideo(fileName: string, buffer: Buffer, contentType: string): Promise<string> {
    try {
      const bucket = this.firebaseConfig.getBucket();
      const filePath = `playernation_temp/${fileName}`;
      const file = bucket.file(filePath);

      // Upload the file
      await file.save(buffer, {
        metadata: {
          contentType: contentType,
        },
      });

      // Make the file publicly accessible
      await file.makePublic();

      // Return the public URL
      return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    } catch (error) {
      console.error('Firebase Storage upload error:', error);
      throw new Error(`Failed to upload video: ${error.message}`);
    }
  }
} 