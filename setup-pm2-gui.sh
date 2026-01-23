#!/bin/bash

echo "🎨 Setting up PM2 GUI Dashboard..."
echo ""

# Install pm2-gui
echo "📦 Installing pm2-gui..."
sudo npm install -g pm2-gui

# Start pm2-gui
echo "🚀 Starting PM2 GUI..."
pm2-gui start 9001

echo ""
echo "✅ PM2 GUI installed and started!"
echo ""
echo "🌐 Access at: http://51.254.132.77:9001"
echo ""
echo "Commands:"
echo "  • Start:   pm2-gui start 9001"
echo "  • Stop:    pm2-gui stop"
echo "  • Restart: pm2-gui restart"
echo ""
echo "Features:"
echo "  ✓ Real-time process monitoring"
echo "  ✓ Live log streaming"
echo "  ✓ CPU & Memory graphs"
echo "  ✓ Process management (start/stop/restart)"
