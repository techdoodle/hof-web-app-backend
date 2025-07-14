# Firebase Storage Setup

## Overview
Firebase Storage has been integrated into the backend for storing processed profile pictures. The system will upload processed images to Firebase Storage and store the public URLs in the database.

## Configuration Required

Add the following environment variables to your `.env` file:

```bash
# Firebase Configuration
FIREBASE_TYPE=service_account
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=your_client_cert_url
FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com

# Firebase Storage Path Configuration
FIREBASE_STORAGE_ROOT=profile_pictures
```

## Setup Steps

1. **Create Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project or select existing one

2. **Enable Storage**
   - Navigate to Storage in the Firebase Console
   - Click "Get started" and set up storage rules

3. **Generate Service Account Key**
   - Go to Project Settings → Service Accounts
   - Click "Generate new private key"
   - Download the JSON file

4. **Extract Configuration**
   - Open the downloaded JSON file
   - Copy the values to your `.env` file:
     - `type` → `FIREBASE_TYPE`
     - `project_id` → `FIREBASE_PROJECT_ID`
     - `private_key_id` → `FIREBASE_PRIVATE_KEY_ID`
     - `private_key` → `FIREBASE_PRIVATE_KEY`
     - `client_email` → `FIREBASE_CLIENT_EMAIL`
     - `client_id` → `FIREBASE_CLIENT_ID`
     - `auth_uri` → `FIREBASE_AUTH_URI`
     - `token_uri` → `FIREBASE_TOKEN_URI`
     - `auth_provider_x509_cert_url` → `FIREBASE_AUTH_PROVIDER_X509_CERT_URL`
     - `client_x509_cert_url` → `FIREBASE_CLIENT_X509_CERT_URL`

5. **Set Storage Bucket**
   - The bucket name is usually `your_project_id.appspot.com`
   - Set this as `FIREBASE_STORAGE_BUCKET`

## Storage Rules

Configure your Firebase Storage rules to allow public read access:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /profile-pictures/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## Features Implemented

### FirebaseStorageService
- `uploadImage(buffer, folder)` - Upload image buffer to Firebase Storage
- `uploadBase64Image(base64Data, folder)` - Upload base64 image to Firebase Storage
- `deleteImage(imageUrl)` - Delete image from Firebase Storage
- `getSignedUrl(filePath, expiresInMinutes)` - Generate signed URL for private access

### Integration Points
- **ImageProcessingService** - Uses Firebase Storage for storing processed images
- **User Profile Pictures** - Stores URLs in database, files in Firebase Storage
- **Automatic Fallback** - Falls back to base64 data URLs if Firebase fails

## File Structure
```
profile_pictures/
├── user_123/
│   ├── uuid-1.png
│   ├── uuid-2.png
│   └── ...
├── user_456/
│   ├── uuid-3.png
│   └── ...
└── ...
```

Path convention: `{FIREBASE_STORAGE_ROOT}/{user_id}/{uuid}.png`

## Public URLs
Images are stored with public URLs in format:
```
https://storage.googleapis.com/your-bucket-name/profile_pictures/user_123/uuid.png
```

## Error Handling
- Graceful fallback to base64 data URLs if Firebase is unavailable
- Detailed error logging for debugging
- Proper error messages for different failure scenarios 