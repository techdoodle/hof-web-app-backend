import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';
import { Buffer } from 'buffer';
import { FirebaseStorageService } from './firebase-storage.service';

@Injectable()
export class ImageProcessingService {
  private readonly pythonServiceUrl: string;

  constructor(
    private configService: ConfigService,
    private firebaseStorageService: FirebaseStorageService
  ) {
    this.pythonServiceUrl = this.configService.get<string>('PYTHON_SERVICE_URL') || 'http://localhost:8001';
  }

  async processProfilePicture(file: Express.Multer.File, userId: string | number): Promise<string> {
    try {
      // Convert file to buffer if needed
      const imageBuffer = file.buffer;
      
      // Send to Python service for processing
      const processedImageBuffer = await this.sendToPythonService(imageBuffer, file.mimetype);
      
      // Store processed image with user ID
      const processedImageUrl = await this.storeProcessedImage(processedImageBuffer, userId);
      
      return processedImageUrl;
    } catch (error) {
      throw new HttpException(
        `Image processing failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async processProfilePictureBase64(imageData: string, userId: string | number): Promise<string> {
    try {
      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Detect mime type from base64 data
      const mimeType = this.getMimeTypeFromBase64(imageData);
      
      // Send to Python service for processing
      const processedImageBuffer = await this.sendToPythonService(imageBuffer, mimeType);
      
      // Store processed image
      const processedImageUrl = await this.storeProcessedImage(processedImageBuffer, userId);
      
      return processedImageUrl;
    } catch (error) {
      throw new HttpException(
        `Image processing failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async extractFaceFromBase64(imageData: string, userId: string | number): Promise<string> {
    try {
      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Detect mime type from base64 data
      const mimeType = this.getMimeTypeFromBase64(imageData);
      
      // Send to Python service for face extraction
      const faceImageBuffer = await this.sendToPythonServiceForFaceExtraction(imageBuffer, mimeType);
      
      // Store face image
      const faceImageUrl = await this.storeProcessedImage(faceImageBuffer, userId);
      
      return faceImageUrl;
    } catch (error) {
      throw new HttpException(
        `Face extraction failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async sendToPythonService(imageBuffer: Buffer, mimeType: string): Promise<Buffer> {
    try {
      // Create form data for Python service
      const formData = new FormData();
      formData.append('image', imageBuffer, {
        filename: 'profile.jpg',
        contentType: mimeType
      });

      // Send to Python service
      const response = await axios.post(
        `${this.pythonServiceUrl}/process-selfie`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          responseType: 'arraybuffer'
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.error('Python service error:', error);
      throw new Error(`Python service communication failed: ${error.message}`);
    }
  }

  private async sendToPythonServiceForFaceExtraction(imageBuffer: Buffer, mimeType: string): Promise<Buffer> {
    try {
      // Create form data for Python service
      const formData = new FormData();
      formData.append('image', imageBuffer, {
        filename: 'face.jpg',
        contentType: mimeType
      });

      // Send to Python service for face extraction
      const response = await axios.post(
        `${this.pythonServiceUrl}/extract-face`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          responseType: 'arraybuffer'
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.error('Python face extraction error:', error);
      // Fallback to regular processing if face extraction fails
      return await this.sendToPythonService(imageBuffer, mimeType);
    }
  }

  private async storeProcessedImage(imageBuffer: Buffer, userId: string | number): Promise<string> {
    try {
      // Upload to Firebase Storage and return the public URL
      const firebaseUrl = await this.firebaseStorageService.uploadImage(imageBuffer, userId);
      return firebaseUrl;
    } catch (error) {
      console.error('Failed to upload to Firebase Storage:', error);
      
      // Fallback to base64 data URL if Firebase fails
      const base64Image = imageBuffer.toString('base64');
      return `data:image/png;base64,${base64Image}`;
    }
  }

  private getMimeTypeFromBase64(base64Data: string): string {
    const matches = base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
    return matches ? matches[1] : 'image/jpeg';
  }
} 