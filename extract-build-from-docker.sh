#!/bin/bash

echo "🐳 Building application using Docker (to avoid memory issues)..."
echo ""

# Build using Docker (which has proper memory settings)
echo "🔨 Building Docker image..."
sudo docker-compose build backend

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed!"
    exit 1
fi

echo ""
echo "📦 Extracting built files from Docker image..."

# Create a temporary container
CONTAINER_ID=$(sudo docker create chabaqa-backend:latest)

# Extract the dist folder
sudo docker cp $CONTAINER_ID:/app/dist ./dist

# Extract node_modules (production only)
sudo docker cp $CONTAINER_ID:/app/node_modules ./node_modules

# Remove the temporary container
sudo docker rm $CONTAINER_ID

# Fix permissions
sudo chown -R $USER:$USER dist node_modules

echo ""
echo "✅ Build extracted successfully!"
echo "📁 Files ready in ./dist"
