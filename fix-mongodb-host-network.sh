#!/bin/bash

echo "🔧 Fixing MongoDB with Host Network Mode..."
echo ""

# Stop PM2
echo "🛑 Stopping PM2..."
pm2 stop chabaqa-backend 2>/dev/null || true
pm2 delete chabaqa-backend 2>/dev/null || true

# Stop existing MongoDB
echo "🛑 Stopping existing MongoDB..."
sudo docker-compose down mongodb redis

# Start MongoDB with host network mode
echo "🚀 Starting MongoDB with host network mode..."
sudo docker-compose -f docker-compose-mongodb-host.yml up -d

echo "⏳ Waiting for MongoDB to be ready..."
sleep 15

# Test connection
echo "🔍 Testing MongoDB connection..."
node test-mongodb-connection.js

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ MongoDB connection successful!"
    echo ""
    echo "🚀 Starting backend with PM2..."
    pm2 start ecosystem.config.js
    pm2 save
    
    echo ""
    echo "📊 Status:"
    pm2 status
    
    echo ""
    echo "✅ Setup complete!"
    echo "📝 View logs: pm2 logs chabaqa-backend"
else
    echo ""
    echo "❌ MongoDB connection still failing!"
    echo ""
    echo "🔄 Reverting to MongoDB Atlas (cloud database)..."
    
    # Update .env to use Atlas
    sed -i 's|^MONGO_URI=.*|MONGO_URI=mongodb+srv://admin:admin@chabaqa.bmmujoq.mongodb.net/?appName=chabaqa|' .env
    
    echo "✅ Updated .env to use MongoDB Atlas"
    echo ""
    echo "🚀 Starting backend with PM2..."
    pm2 start ecosystem.config.js
    pm2 save
    
    echo ""
    echo "📊 Status:"
    pm2 status
fi
