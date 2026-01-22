#!/bin/bash

# Script to update VPS IP in configuration files

if [ -z "$1" ]; then
    echo "Usage: ./update-vps-ip.sh <new-ip-address>"
    echo "Example: ./update-vps-ip.sh 192.168.1.100"
    exit 1
fi

NEW_IP=$1
OLD_IP="51.254.132.77"

echo "🔄 Updating VPS IP from $OLD_IP to $NEW_IP..."
echo ""

# Backup .env
cp .env .env.backup
echo "✅ Backed up .env to .env.backup"

# Update .env
sed -i "s|http://$OLD_IP|http://$NEW_IP|g" .env
echo "✅ Updated .env"

# Update mob