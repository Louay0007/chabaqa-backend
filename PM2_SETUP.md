# Chabaqa Backend - PM2 Setup Guide

This guide explains how to run the Chabaqa backend using PM2 instead of Docker, which resolves networking issues.

## Architecture

- **MongoDB**: Runs in Docker (port 27017)
- **Backend**: Runs directly on VPS with PM2 (port 3000)

## Quick Start

### 1. First Time Setup

```bash
cd ~/chabaqa-backend
chmod +x setup-pm2.sh
./setup-pm2.sh
```

This script will:
- Install Node.js and PM2 if needed
- Install project dependencies
- Build the application
- Start MongoDB in Docker
- Start the backend with PM2
- Configure PM2 to start on system boot

### 2. Start Services

```bash
chmod +x start-with-pm2.sh
./start-with-pm2.sh
```

### 3. Stop All Services

```bash
chmod +x stop-all.sh
./stop-all.sh
```

## PM2 Commands

### View Application Status
```bash
pm2 status
```

### View Logs
```bash
# Real-time logs
pm2 logs chabaqa-backend

# Last 100 lines
pm2 logs chabaqa-backend --lines 100

# Error logs only
pm2 logs chabaqa-backend --err
```

### Monitor Resources
```bash
pm2 monit
```

### Restart Application
```bash
pm2 restart chabaqa-backend
```

### Stop Application
```bash
pm2 stop chabaqa-backend
```

### Delete Application from PM2
```bash
pm2 delete chabaqa-backend
```

### View Detailed Info
```bash
pm2 show chabaqa-backend
```

## MongoDB Commands

### Check MongoDB Status
```bash
sudo docker ps | grep mongodb
```

### View MongoDB Logs
```bash
sudo docker logs chabaqa-mongodb
sudo docker logs -f chabaqa-mongodb  # Follow logs
```

### Access MongoDB Shell
```bash
sudo docker exec -it chabaqa-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin
```

### Restart MongoDB
```bash
sudo docker restart chabaqa-mongodb
```

## Troubleshooting

### Backend Can't Connect to MongoDB

1. Check if MongoDB is running:
```bash
sudo docker ps | grep mongodb
```

2. Check MongoDB logs:
```bash
sudo docker logs chabaqa-mongodb --tail 50
```

3. Test MongoDB connection:
```bash
sudo docker exec chabaqa-mongodb mongosh --eval "db.adminCommand('ping')" --quiet
```

4. Restart MongoDB:
```bash
sudo docker restart chabaqa-mongodb
sleep 10
pm2 restart chabaqa-backend
```

### Application Crashes

1. View error logs:
```bash
pm2 logs chabaqa-backend --err --lines 50
```

2. Check application status:
```bash
pm2 status
```

3. Restart with fresh logs:
```bash
pm2 restart chabaqa-backend
pm2 logs chabaqa-backend
```

### Port Already in Use

If port 3000 is already in use:

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill the process
sudo kill -9 <PID>

# Restart application
pm2 restart chabaqa-backend
```

### Memory Issues

If the application uses too much memory:

1. Check memory usage:
```bash
pm2 monit
```

2. Restart to free memory:
```bash
pm2 restart chabaqa-backend
```

3. Adjust memory limit in `ecosystem.config.js`:
```javascript
max_memory_restart: '1G'  // Reduce if needed
```

## Updating the Application

### After Code Changes

```bash
# Stop the application
pm2 stop chabaqa-backend

# Pull latest code
git pull

# Install dependencies (if package.json changed)
npm install

# Rebuild
npm run build

# Restart
pm2 restart chabaqa-backend
```

### Quick Rebuild and Restart

```bash
npm run build && pm2 restart chabaqa-backend
```

## System Boot Configuration

PM2 is configured to start automatically on system boot. To verify:

```bash
pm2 startup
pm2 save
```

## File Locations

- **Application**: `~/chabaqa-backend`
- **PM2 Logs**: `~/chabaqa-backend/logs/`
- **MongoDB Data**: Docker volume `mongodb_data`
- **Uploads**: `~/chabaqa-backend/uploads/`

## Environment Variables

Edit `.env` file to change configuration:

```bash
nano ~/chabaqa-backend/.env
```

After changing `.env`, restart the application:

```bash
pm2 restart chabaqa-backend
```

## Health Check

Check if the application is responding:

```bash
curl http://localhost:3000/api/health
```

## Performance Monitoring

### CPU and Memory Usage
```bash
pm2 monit
```

### Application Metrics
```bash
pm2 show chabaqa-backend
```

## Backup MongoDB

```bash
sudo docker exec chabaqa-mongodb mongodump --username admin --password admin123 --authenticationDatabase admin --out /data/backup
```

## Complete Reinstall

If you need to start fresh:

```bash
# Stop everything
./stop-all.sh

# Remove PM2 process
pm2 delete chabaqa-backend
pm2 save

# Remove Docker volumes (WARNING: This deletes all data!)
sudo docker-compose down -v

# Run setup again
./setup-pm2.sh
```

## Support

For issues, check:
1. PM2 logs: `pm2 logs chabaqa-backend`
2. MongoDB logs: `sudo docker logs chabaqa-mongodb`
3. System logs: `journalctl -u pm2-$USER -n 50`
