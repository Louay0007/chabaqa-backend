#!/bin/bash

echo "🔍 Verifying Chabaqa Backend Setup..."
echo ""

# Check if dist folder exists
if [ -d "dist" ]; then
    echo "✅ dist folder exists"
    if [ -f "dist/main.js" ]; then
        echo "✅ dist/main.js found"
    else
        echo "❌ dist/main.js NOT found"
        echo "   Run: ./rebuild-and-restart.sh"
    fi
else
    echo "❌ dist folder NOT found"
    echo "   Run: ./rebuild-and-restart.sh"
fi

echo ""

# Check if node_modules exists
if [ -d "node_modules" ]; then
    echo "✅ node_modules exists"
else
    echo "❌ node_modules NOT found"
    echo "   Run: ./rebuild-and-restart.sh"
fi

echo ""

# Check MongoDB
if sudo docker ps | grep -q chabaqa-mongodb; then
    echo "✅ MongoDB container running"
    if sudo docker exec chabaqa-mongodb mongosh --eval "db.adminCommand('ping')" --quiet &> /dev/null; then
        echo "✅ MongoDB is healthy"
    else
        echo "⚠️  MongoDB container running but not responding"
    fi
else
    echo "❌ MongoDB container NOT running"
    echo "   Run: sudo docker-compose up -d mongodb"
fi

echo ""

# Check PM2
if command -v pm2 &> /dev/null; then
    echo "✅ PM2 installed"
    if pm2 list | grep -q chabaqa-backend; then
        echo "✅ PM2 app registered"
        pm2 status chabaqa-backend
    else
        echo "⚠️  PM2 app not registered"
        echo "   Run: pm2 start ecosystem.config.js"
    fi
else
    echo "❌ PM2 NOT installed"
    echo "   Run: sudo npm install -g pm2"
fi

echo ""
echo "=========================================="
