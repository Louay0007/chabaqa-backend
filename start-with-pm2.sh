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

# Start Redis if not running
if ! sudo docker ps | grep -q chabaqa-redis; then
    echo "🔴 Starting Redis..."
    sudo docker-compose up -d redis
    echo "⏳ Waiting for Redis..."
    sleep 5
else
    echo "✅ Redis already running"
fi

# Verify Redis is responding
if sudo docker exec chabaqa-redis redis-cli -a chabaqa_redis_2024 ping 2>/dev/null | grep -q PONG; then
    echo "✅ Redis is healthy"
else
    echo "⚠️ Redis not responding, restarting..."
    sudo docker-compose restart redis
    sleep 5
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
echo "🔴 Redis CLI: docker exec -it chabaqa-redis redis-cli -a chabaqa_redis_2024"
