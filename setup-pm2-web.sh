#!/bin/bash

echo "🌐 Setting up PM2 Web Dashboard..."
echo ""

# Install pm2-web
echo "📦 Installing pm2-web..."
sudo npm install -g pm2-web

# Create systemd service for pm2-web
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/pm2-web.service > /dev/null <<EOF
[Unit]
Description=PM2 Web Dashboard
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=$(which pm2-web) --port 9000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable pm2-web
sudo systemctl start pm2-web

echo ""
echo "✅ PM2 Web Dashboard installed!"
echo ""
echo "🌐 Access at: http://51.254.132.77:9000"
echo ""
echo "Commands:"
echo "  • Check status: sudo systemctl status pm2-web"
echo "  • View logs:    sudo journalctl -u pm2-web -f"
echo "  • Restart:      sudo systemctl restart pm2-web"
echo "  • Stop:         sudo systemctl stop pm2-web"
