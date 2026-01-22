#!/bin/bash

echo "🛑 Stopping all containers..."
sudo docker-compose down

echo "🗑️  Removing old images..."
sudo docker rmi chabaqa-backend:latest 2>/dev/null || true

echo "🧹 Cleaning Docker system..."
sudo docker system prune -af --volumes

echo "🔨 Building without cache..."
sudo docker-compose build --no-cache --pull

echo "🚀 Starting services..."
sudo docker-compose up -d

echo "⏳ Waiting for services to initialize..."
sleep 15

echo ""
echo "📊 Service Status:"
sudo docker-compose ps

echo ""
echo "🔍 Checking MongoDB health..."
sudo docker exec chabaqa-mongodb mongosh --eval "db.adminCommand('ping')" --quiet 2>/dev/null && echo "✅ MongoDB is healthy" || echo "❌ MongoDB not ready yet"

echo ""
echo "📝 MongoDB Logs (last 30 lines):"
sudo docker logs chabaqa-mongodb --tail 30

echo ""
echo "📝 Backend Logs (last 30 lines):"
sudo docker logs chabaqa-backend --tail 30

echo ""
echo "=========================================="
echo "✅ Rebuild complete!"
echo "=========================================="
echo ""
echo "📊 Monitor logs with:"
echo "   sudo docker logs -f chabaqa-backend"
echo ""
echo "🔍 Check all services:"
echo "   sudo docker-compose ps"
echo ""
echo "🔄 Restart if needed:"
echo "   sudo docker-compose restart backend"
