#!/bin/bash

echo "🔄 Rebuilding and restarting Chabaqa Backend..."
echo ""

# Stop PM2 app
echo "🛑 Stopping PM2 application..."
pm2 stop chabaqa-backend 2>/dev/null || true

# Remove old build
echo "🧹 Cleaning old build..."
rm -rf dist

# Build using Docker
echo "🔨 Building with Docker..."
sudo docker-compose build backend

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Extract build
echo "📦 Extracting build..."
CONTAINER_ID=$(sudo docker create chabaqa-backend:latest)
sudo docker cp $CONTAINER_ID:/app/dist ./dist
sudo docker cp $CONTAINER_ID:/app/node_modules ./node_modules
sudo docker rm $CONTAINER_ID
sudo chown -R $USER:$USER dist node_modules

# Restart PM2
echo "🚀 Restarting with PM2..."
pm2 restart chabaqa-backend || pm2 start ecosystem.config.js

echo ""
echo "✅ Rebuild complete!"
echo ""
pm2 status
echo ""
echo "📝 View logs: pm2 logs chabaqa-backend"
