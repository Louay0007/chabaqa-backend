#!/bin/bash

# ================================
# Chabaqa Backend Deployment Script
# ================================

set -e

echo "🚀 Starting Chabaqa Backend Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please create .env file from .env.production.example"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Error: docker-compose not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Stop existing containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose down || true

# Pull latest changes (if in git repo)
if [ -d .git ]; then
    echo -e "${YELLOW}📥 Pulling latest changes...${NC}"
    git pull origin main || echo "Skipping git pull"
fi

# Build production image
echo -e "${YELLOW}🔨 Building production image...${NC}"
docker-compose build --no-cache

# Start services
echo -e "${YELLOW}🚀 Starting services...${NC}"
docker-compose up -d

# Wait for health check
echo -e "${YELLOW}⏳ Waiting for service to be healthy...${NC}"
sleep 10

# Check health
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Service is healthy!${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT+1))
    echo "Waiting for service... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}❌ Service failed to start${NC}"
    echo "Checking logs..."
    docker-compose logs --tail=50 backend
    exit 1
fi

# Show status
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo "📊 Container Status:"
docker-compose ps

echo ""
echo "📝 Recent Logs:"
docker-compose logs --tail=20 backend

echo ""
echo "🌐 Service URLs:"
echo "   API: http://localhost:3000"
echo "   Docs: http://localhost:3000/api/docs"
echo "   Health: http://localhost:3000/api/health"

echo ""
echo "💡 Useful Commands:"
echo "   View logs: docker-compose logs -f backend"
echo "   Restart: docker-compose restart backend"
echo "   Stop: docker-compose down"
echo "   Stats: docker stats chabaqa-backend"
