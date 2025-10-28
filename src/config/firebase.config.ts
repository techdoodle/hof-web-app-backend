import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseConfig {
  private app: admin.app.App;

  constructor(private configService: ConfigService) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    // Check if Firebase app already exists
    if (admin.apps.length > 0) {
      this.app = admin.app();
      return;
    }

    const firebaseConfig = {
      type: this.configService.get<string>('FIREBASE_TYPE') || '',
      project_id: this.configService.get<string>('FIREBASE_PROJECT_ID') || '',
      private_key_id: this.configService.get<string>('FIREBASE_PRIVATE_KEY_ID') || '',
      private_key: this.configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n') || '',
      client_email: this.configService.get<string>('FIREBASE_CLIENT_EMAIL') || '',
      client_id: this.configService.get<string>('FIREBASE_CLIENT_ID') || '',
      auth_uri: this.configService.get<string>('FIREBASE_AUTH_URI') || '',
      token_uri: this.configService.get<string>('FIREBASE_TOKEN_URI') || '',
      auth_provider_x509_cert_url: this.configService.get<string>('FIREBASE_AUTH_PROVIDER_X509_CERT_URL') || '',
      client_x509_cert_url: this.configService.get<string>('FIREBASE_CLIENT_X509_CERT_URL') || '',
    };

    const storageBucket = this.configService.get<string>('FIREBASE_STORAGE_BUCKET') || '';

    try {
      this.app = admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig as admin.ServiceAccount),
        storageBucket: storageBucket,
      });
    } catch (error) {
      console.error('Firebase initialization error:', error);
      // Initialize with empty config for development
      this.app = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        storageBucket: storageBucket,
      });
    }
  }

  getApp(): admin.app.App {
    return this.app;
  }

  getStorage(): admin.storage.Storage {
    return this.app.storage();
  }

  getBucket() {
    return this.app.storage().bucket();
  }
} 