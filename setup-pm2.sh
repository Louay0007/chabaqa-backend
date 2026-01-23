#!/bin/bash

set -e

echo "=========================================="
echo "🚀 Chabaqa Backend PM2 Setup"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}❌ Please do not run as root${NC}"
   exit 1
fi

echo -e "${YELLOW}📦 Step 1: Installing Node.js and npm if needed...${NC}"
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js already installed: $(node -v)"
fi

echo ""
echo -e "${YELLOW}📦 Step 2: Installing PM2 globally...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    echo "✅ PM2 installed"
else
    echo "✅ PM2 already installed: $(pm2 -v)"
fi

echo ""
echo -e "${YELLOW}🔨 Step 3: Building the application using Docker...${NC}"
echo "This avoids memory issues and ensures consistent builds..."

# Build using Docker (which has proper memory settings)
sudo docker-compose build backend

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed!${NC}"
    exit 1
fi

# Extract the built files from Docker image
echo "📦 Extracting built files from Docker image..."
CONTAINER_ID=$(sudo docker create chabaqa-backend:latest)
sudo docker cp $CONTAINER_ID:/app/dist ./dist
sudo docker cp $CONTAINER_ID:/app/node_modules ./node_modules
sudo docker rm $CONTAINER_ID

# Fix permissions
sudo chown -R $USER:$USER dist node_modules

echo -e "${GREEN}✅ Build extracted successfully!${NC}"

echo ""
echo -e "${YELLOW}📁 Step 4: Creating necessary directories...${NC}"
mkdir -p logs uploads/image uploads/video uploads/document uploads/audio public

echo ""
echo -e "${YELLOW}🐳 Step 5: Starting MongoDB and Redis with Docker...${NC}"
sudo docker-compose up -d mongodb redis

echo ""
echo -e "${YELLOW}⏳ Waiting for MongoDB and Redis to be ready...${NC}"
sleep 10

# Check MongoDB health
if sudo docker exec chabaqa-mongodb mongosh --eval "db.adminCommand('ping')" --quiet &> /dev/null; then
    echo -e "${GREEN}✅ MongoDB is healthy${NC}"
else
    echo -e "${RED}❌ MongoDB is not responding. Please check Docker logs.${NC}"
    exit 1
fi

# Check Redis health
if sudo docker exec chabaqa-redis redis-cli -a chabaqa_redis_2024 ping 2>/dev/null | grep -q PONG; then
    echo -e "${GREEN}✅ Redis is healthy${NC}"
else
    echo -e "${RED}❌ Redis is not responding. Please check Docker logs.${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}🚀 Step 6: Starting application with PM2...${NC}"
pm2 delete chabaqa-backend 2>/dev/null || true
pm2 start ecosystem.config.js

echo ""
echo -e "${YELLOW}💾 Step 7: Saving PM2 configuration...${NC}"
pm2 save

echo ""
echo -e "${YELLOW}🔄 Step 8: Setting up PM2 to start on system boot...${NC}"
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "📊 Application Status:"
pm2 status

echo ""
echo "📝 Useful Commands:"
echo "  • View logs:        pm2 logs chabaqa-backend"
echo "  • Monitor:          pm2 monit"
echo "  • Restart:          pm2 restart chabaqa-backend"
echo "  • Stop:             pm2 stop chabaqa-backend"
echo "  • View status:      pm2 status"
echo "  • Redis CLI:        docker exec -it chabaqa-redis redis-cli -a chabaqa_redis_2024"
echo ""
echo "🌐 Application should be running at: http://51.254.132.77:3000"
echo "🔴 Redis is enabled and running on port 6379"
echo ""
