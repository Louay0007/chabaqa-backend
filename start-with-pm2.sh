#!/bin/bash

echo "🚀 Starting Chabaqa Backend with PM2..."
echo ""

# Start MongoDB if not running
if ! sudo docker ps | grep -q chabaqa-mongodb; then
    echo "📦 Starting MongoDB..."
    sudo docker-compose up -d mongodb
    echo "⏳ Waiting for MongoDB..."
    sleep 10
else
    echo "✅ MongoDB already running"
fi

# Check if app is already running
if pm2 list | grep -q chabaqa-backend; then
    echo "🔄 Restarting application..."
    pm2 restart chabaqa-backend
else
    echo "🚀 Starting application..."
    pm2 start ecosystem.config.js
fi

echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "📝 View logs with: pm2 logs chabaqa-backend"
echo "📊 Monitor with: pm2 monit"
