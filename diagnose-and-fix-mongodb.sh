#!/bin/bash

echo "🔍 Diagnosing MongoDB Connection Issue..."
echo ""

# Check if MongoDB container is running
echo "1️⃣ Checking if MongoDB container is running..."
if sudo docker ps | grep -q chabaqa-mongodb; then
    echo "✅ MongoDB container is running"
else
    echo "❌ MongoDB container is NOT running"
    exit 1
fi

# Check MongoDB logs
echo ""
echo "2️⃣ Checking MongoDB logs for errors..."
sudo docker logs chabaqa-mongodb --tail 20

# Check if port 27017 is listening
echo ""
echo "3️⃣ Checking if port 27017 is listening..."
sudo ss -tlnp | grep 27017

# Check Docker network
echo ""
echo "4️⃣ Checking Docker network..."
sudo docker inspect chabaqa-mongodb | grep -A 10 "Networks"

# Get MongoDB container IP
echo ""
echo "5️⃣ Getting MongoDB container IP..."
MONGO_IP=$(sudo docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' chabaqa-mongodb)
echo "MongoDB IP: $MONGO_IP"

# Test connection using container IP
echo ""
echo "6️⃣ Testing connection using container IP..."
mongosh "mongodb://admin:admin123@${MONGO_IP}:27017/chabaqa?authSource=admin" --eval "db.adminCommand('ping')" --quiet 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Connection works with container IP!"
    echo ""
    echo "💡 Solution: Update .env to use container IP"
    echo "MONGO_URI=mongodb://admin:admin123@${MONGO_IP}:27017/chabaqa?authSource=admin&directConnection=true"
else
    echo "❌ Connection failed even with container IP"
fi

echo ""
echo "7️⃣ Recommended Solution: Use MongoDB Atlas (cloud database)"
echo "This avoids all Docker networking issues."
echo ""
echo "Would you like to:"
echo "A) Use MongoDB Atlas (recommended)"
echo "B) Try to fix local MongoDB networking"
