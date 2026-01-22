#!/bin/bash

echo "🔧 Fixing MongoDB Connection Issues..."
echo ""

# Stop PM2
echo "🛑 Stopping PM2..."
pm2 stop chabaqa-backend 2>/dev/null || true
pm2 delete chabaqa-backend 2>/dev/null || true

# Restart MongoDB with proper settings
echo "🔄 Restarting MongoDB..."
sudo docker-compose down mongodb
sudo docker-compose up -d mongodb

echo "⏳ Waiting for MongoDB to be ready..."
sleep 15

# Test MongoDB from inside container
echo "🔍 Testing MongoDB from inside container..."
if sudo docker exec chabaqa-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin --eval "db.adminCommand('ping')" --quiet &> /dev/null; then
    echo "✅ MongoDB is accessible from inside container"
else
    echo "❌ MongoDB is NOT accessible from inside container"
    exit 1
fi

# Test MongoDB connection from host using Node.js
echo ""
echo "🔍 Testing MongoDB connection from host..."
node test-mongodb-connection.js

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ MongoDB connection test passed!"
    echo ""
    echo "🚀 Starting backend with PM2..."
    pm2 start ecosystem.config.js
    pm2 save
    
    echo ""
    echo "📊 Status:"
    pm2 status
    
    echo ""
    echo "📝 View logs: pm2 logs chabaqa-backend"
else
    echo ""
    echo "❌ MongoDB connection test failed!"
    echo ""
    echo "Possible solutions:"
    echo "1. Check if MongoDB port is accessible:"
    echo "   nc -zv localhost 27017"
    echo ""
    echo "2. Check MongoDB logs:"
    echo "   sudo docker logs chabaqa-mongodb --tail 50"
    echo ""
    echo "3. Try connecting from inside the container:"
    echo "   sudo docker exec -it chabaqa-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin"
    exit 1
fi
