#!/bin/bash

set -e

echo "=========================================="
echo "🗑️  Chabaqa Database Reset for Production"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Database configuration
DB_NAME="chabaqa"
MONGO_USER="admin"
MONGO_PASS="admin123"
CONTAINER_NAME="chabaqa-mongodb"

echo -e "${RED}⚠️  WARNING: This will permanently delete ALL data in the local MongoDB database!${NC}"
echo -e "${RED}⚠️  This action is IRREVERSIBLE!${NC}"
echo ""
echo -e "${YELLOW}Database to be cleared: ${DB_NAME}${NC}"
echo -e "${YELLOW}MongoDB Container: ${CONTAINER_NAME}${NC}"
echo ""

# Confirmation prompt
read -p "Are you sure you want to proceed? Type 'YES' to continue: " confirmation
if [ "$confirmation" != "YES" ]; then
    echo -e "${BLUE}❌ Operation cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}🔍 Step 1: Checking if MongoDB container is running...${NC}"

if ! sudo docker ps | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}❌ MongoDB container '$CONTAINER_NAME' is not running.${NC}"
    echo "Starting MongoDB container..."
    sudo docker-compose up -d mongodb
    echo "⏳ Waiting for MongoDB to be ready..."
    sleep 15
fi

echo -e "${GREEN}✅ MongoDB container is running${NC}"

echo ""
echo -e "${YELLOW}🔍 Step 2: Testing MongoDB connection...${NC}"

# Test connection
if sudo docker exec "$CONTAINER_NAME" mongosh --username "$MONGO_USER" --password "$MONGO_PASS" --authenticationDatabase admin --eval "db.adminCommand('ping')" --quiet &> /dev/null; then
    echo -e "${GREEN}✅ MongoDB connection successful${NC}"
else
    echo -e "${RED}❌ Cannot connect to MongoDB. Please check the container status.${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}📊 Step 3: Listing current collections...${NC}"

# List collections before deletion
echo "Current collections in database '$DB_NAME':"
sudo docker exec "$CONTAINER_NAME" mongosh --username "$MONGO_USER" --password "$MONGO_PASS" --authenticationDatabase admin "$DB_NAME" --eval "db.listCollectionNames()" --quiet

echo ""
echo -e "${YELLOW}🗑️  Step 4: Dropping the entire database...${NC}"

# Drop the entire database
sudo docker exec "$CONTAINER_NAME" mongosh --username "$MONGO_USER" --password "$MONGO_PASS" --authenticationDatabase admin "$DB_NAME" --eval "db.dropDatabase()" --quiet

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database '$DB_NAME' has been completely dropped${NC}"
else
    echo -e "${RED}❌ Failed to drop database${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}🔄 Step 5: Clearing Redis cache...${NC}"

# Clear Redis cache
if sudo docker ps | grep -q "chabaqa-redis"; then
    sudo docker exec chabaqa-redis redis-cli -a chabaqa_redis_2024 FLUSHALL &> /dev/null
    echo -e "${GREEN}✅ Redis cache cleared${NC}"
else
    echo -e "${YELLOW}⚠️  Redis container not running, skipping cache clear${NC}"
fi

echo ""
echo -e "${YELLOW}🧹 Step 6: Cleaning up uploaded files...${NC}"

# Clean up uploads directory (keep structure but remove files)
if [ -d "uploads" ]; then
    # Create backup of .gitkeep files
    find uploads -name ".gitkeep" -exec cp {} {}.backup \;
    
    # Remove all files except .gitkeep
    find uploads -type f ! -name ".gitkeep" -delete
    
    # Restore .gitkeep files
    find uploads -name ".gitkeep.backup" -exec sh -c 'mv "$1" "${1%.backup}"' _ {} \;
    
    echo -e "${GREEN}✅ Upload files cleaned (directory structure preserved)${NC}"
else
    echo -e "${YELLOW}⚠️  Uploads directory not found${NC}"
fi

echo ""
echo -e "${YELLOW}📊 Step 7: Verifying database is empty...${NC}"

# Verify database is empty
COLLECTIONS=$(sudo docker exec "$CONTAINER_NAME" mongosh --username "$MONGO_USER" --password "$MONGO_PASS" --authenticationDatabase admin "$DB_NAME" --eval "db.listCollectionNames().length" --quiet)

if [ "$COLLECTIONS" = "0" ]; then
    echo -e "${GREEN}✅ Database is completely empty${NC}"
else
    echo -e "${RED}❌ Warning: Database still contains $COLLECTIONS collections${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Production Database Reset Complete!${NC}"
echo "=========================================="
echo ""
echo -e "${BLUE}📝 What was cleared:${NC}"
echo "  • All MongoDB collections and data"
echo "  • Redis cache"
echo "  • Uploaded files (structure preserved)"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo "  1. Run: ./setup-pm2.sh"
echo "  2. Your application will start with a fresh database"
echo "  3. Create admin accounts and initial data as needed"
echo ""
echo -e "${YELLOW}⚠️  Remember to:${NC}"
echo "  • Set up admin accounts"
echo "  • Configure initial settings"
echo "  • Test all functionality"
echo ""