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
    // this.pythonServiceUrl = 'http://localhost:8001';
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
      console.log('=== ImageProcessingService: Starting base64 processing ===');

      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      console.log(`Image buffer size: ${imageBuffer.length} bytes`);

      // Detect mime type from base64 data
      const mimeType = this.getMimeTypeFromBase64(imageData);
      console.log(`Detected mime type: ${mimeType}`);

      // Send to Python service for processing
      console.log('Sending to Python service...');
      const pythonStartTime = Date.now();
      const processedImageBuffer = await this.sendToPythonService(imageBuffer, mimeType);
      const pythonEndTime = Date.now();
      console.log(`Python service processing took: ${pythonEndTime - pythonStartTime}ms`);

      // Store processed image
      console.log('Storing processed image...');
      const storageStartTime = Date.now();
      const processedImageUrl = await this.storeProcessedImage(processedImageBuffer, userId);
      const storageEndTime = Date.now();
      console.log(`Image storage took: ${storageEndTime - storageStartTime}ms`);

      console.log('=== ImageProcessingService: Processing completed ===');
      return processedImageUrl;
    } catch (error) {
      console.error('ImageProcessingService error:', error);
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
      const faceImageBuffer = await this.sendToPythonService(imageBuffer, mimeType);

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

  /**
   * Validate and process image WITHOUT storing to cloud storage
   * Returns base64 data URL for preview/validation purposes
   * Only store to cloud when user actually confirms the image
   */
  async validateProfilePictureBase64(imageData: string): Promise<{ url: string; isBase64: boolean }> {
    try {
      console.log('=== ImageProcessingService: Validating image (no storage) ===');

      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      console.log(`Image buffer size: ${imageBuffer.length} bytes`);

      // Detect mime type from base64 data
      const mimeType = this.getMimeTypeFromBase64(imageData);
      console.log(`Detected mime type: ${mimeType}`);

      // Send to Python service for processing and face detection
      console.log('Sending to Python service for validation...');
      const pythonStartTime = Date.now();
      const processedImageBuffer = await this.sendToPythonService(imageBuffer, mimeType);
      const pythonEndTime = Date.now();
      console.log(`Python service processing took: ${pythonEndTime - pythonStartTime}ms`);

      // Return as base64 data URL (NOT stored to cloud)
      const base64Image = processedImageBuffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64Image}`;

      console.log('=== ImageProcessingService: Validation completed (no storage) ===');
      return {
        url: dataUrl,
        isBase64: true
      };
    } catch (error) {
      console.error('ImageProcessingService validation error:', error);
      throw new HttpException(
        `Image validation failed: ${error.message}`,
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

      console.log(`Sending request to Python service: ${this.pythonServiceUrl}/process-selfie`);

      // Send to Python service with SSL configuration and timeout
      const response = await axios.post(
        `${this.pythonServiceUrl}/process-selfie/`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          responseType: 'arraybuffer',
          timeout: 75000, // 75 second timeout
          maxContentLength: 50 * 1024 * 1024, // 50MB max
          maxBodyLength: 50 * 1024 * 1024, // 50MB max
          // SSL configuration for Railway
          httpsAgent: new (require('https').Agent)({
            rejectUnauthorized: false, // Allow self-signed certificates
            secureProtocol: 'TLSv1_2_method',
          }),
        }
      );

      console.log(`Python service response received, size: ${response.data.length} bytes`);
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Python service error:', error);
      if (error.code === 'ECONNABORTED') {
        throw new Error('Python service request timed out after 75 seconds');
      }
      if (error.code === 'ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC') {
        throw new Error('SSL/TLS connection failed. Please check the Python service URL and SSL configuration.');
      }
      if (error.response) {
        throw new Error(`Python service error: ${error.response.status} - ${error.response.statusText}`);
      }
      throw new Error(`Python service communication failed: ${error.message}`);
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

  async isImageServiceAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.pythonServiceUrl}/health`, { timeout: 2000 });
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      return false;
    }
  }

  private getMimeTypeFromBase64(base64Data: string): string {
    const matches = base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
    return matches ? matches[1] : 'image/jpeg';
  }
} 