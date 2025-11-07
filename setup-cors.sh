#!/bin/bash

# Script to set up Firebase Storage CORS for local development
# This allows localhost origins to upload files to Firebase Storage

echo "Setting up Firebase Storage CORS configuration..."

# Check if gsutil is available
if ! command -v gsutil &> /dev/null; then
    echo "Error: gsutil is not installed or not in PATH"
    echo "Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set the bucket name (replace with your actual bucket name)
BUCKET_NAME="hof-storage.firebasestorage.app"

# Apply CORS configuration
echo "Applying CORS configuration to bucket: $BUCKET_NAME"
gsutil cors set setup-firebase-cors.json gs://$BUCKET_NAME

if [ $? -eq 0 ]; then
    echo "✅ CORS configuration applied successfully!"
    echo "You can now upload files from localhost:3000 to Firebase Storage"
else
    echo "❌ Failed to apply CORS configuration"
    echo "Make sure you have the necessary permissions and the bucket name is correct"
    exit 1
fi

# Verify the CORS configuration
echo "Verifying CORS configuration..."
gsutil cors get gs://$BUCKET_NAME
