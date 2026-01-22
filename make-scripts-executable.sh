#!/bin/bash

echo "🔧 Making all scripts executable..."

chmod +x setup-pm2.sh
chmod +x start-with-pm2.sh
chmod +x stop-all.sh
chmod +x restart-services.sh
chmod +x rebuild-no-cache.sh

echo "✅ All scripts are now executable!"
echo ""
echo "Available scripts:"
echo "  • ./setup-pm2.sh          - First time setup with PM2"
echo "  • ./start-with-pm2.sh     - Start services"
echo "  • ./stop-all.sh           - Stop all services"
echo "  • ./restart-services.sh   - Restart Docker services"
echo "  • ./rebuild-no-cache.sh   - Rebuild Docker without cache"
