import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';
import { Buffer } from 'buffer';

@Injectable()
export class ImageProcessingService {
  private readonly pythonServiceUrl: string;

  constructor(private configService: ConfigService) {
    this.pythonServiceUrl = this.configService.get<string>('PYTHON_SERVICE_URL') || 'http://localhost:8001';
  }

  async processProfilePicture(file: Express.Multer.File): Promise<string> {
    try {
      // Convert file to buffer if needed
      const imageBuffer = file.buffer;
      
      // Send to Python service for processing
      const processedImageBuffer = await this.sendToPythonService(imageBuffer, file.mimetype);
      
      // For now, return a mock URL - in production, you'd upload to S3/Firebase/etc.
      // You can store in PostgreSQL as base64 or upload to cloud storage
      const processedImageUrl = await this.storeProcessedImage(processedImageBuffer);
      
      return processedImageUrl;
    } catch (error) {
      throw new HttpException(
        `Image processing failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async processProfilePictureBase64(imageData: string): Promise<string> {
    try {
      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Detect mime type from base64 data
      const mimeType = this.getMimeTypeFromBase64(imageData);
      
      // Send to Python service for processing
      const processedImageBuffer = await this.sendToPythonService(imageBuffer, mimeType);
      
      // Store processed image
      const processedImageUrl = await this.storeProcessedImage(processedImageBuffer);
      
      return processedImageUrl;
    } catch (error) {
      throw new HttpException(
        `Image processing failed: ${error.message}`,
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

  private async storeProcessedImage(imageBuffer: Buffer): Promise<string> {
    // For now, return a base64 data URL
    // In production, you'd upload to cloud storage and return the URL
    const base64Image = imageBuffer.toString('base64');
    return `data:image/png;base64,${base64Image}`;
    
    // TODO: Implement actual storage
    // Example for S3:
    // const s3Key = `profile-pictures/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
    // await this.s3Service.upload(s3Key, imageBuffer);
    // return `https://your-bucket.s3.amazonaws.com/${s3Key}`;
    
    // Example for PostgreSQL storage:
    // const imageRecord = await this.imageRepository.save({
    //   data: imageBuffer,
    //   mimeType: 'image/png',
    //   createdAt: new Date()
    // });
    // return `/api/images/${imageRecord.id}`;
  }

  private getMimeTypeFromBase64(base64Data: string): string {
    const matches = base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
    return matches ? matches[1] : 'image/jpeg';
  }
} 