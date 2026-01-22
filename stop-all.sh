#!/bin/bash

echo "🛑 Stopping all services..."
echo ""

# Stop PM2 app
if pm2 list | grep -q chabaqa-backend; then
    echo "🛑 Stopping PM2 application..."
    pm2 stop chabaqa-backend
    pm2 delete chabaqa-backend
else
    echo "ℹ️  PM2 application not running"
fi

# Stop Docker containers
echo "🛑 Stopping Docker containers..."
sudo docker-compose down

echo ""
echo "✅ All services stopped"
