# Chabaqa Backend - Production Deployment Guide

## 🚀 Production Optimizations Applied

### Docker Optimizations
- **Multi-stage build**: Separate dependencies, builder, and production stages
- **Specific Node.js version**: `node:20.11.1-alpine3.19` for consistency
- **Layer caching**: Optimized COPY order for faster rebuilds
- **Security hardening**: Non-root user, minimal base image, security updates
- **Init system**: Tini for proper signal handling and zombie process reaping
- **Health checks**: Optimized intervals and timeouts

### Node.js Performance Tuning
- **Memory management**: `--max-old-space-size=2048` for heap optimization
- **GC optimization**: `--max-semi-space-size=64` for young generation
- **Size optimization**: `--optimize-for-size` flag enabled
- **Thread pool**: `UV_THREADPOOL_SIZE=128` for I/O operations
- **Source maps**: Enabled for better error tracking

### Docker Compose Production Features
- **Resource limits**: CPU (2 cores) and Memory (2GB) constraints
- **Security options**: Dropped capabilities, no-new-privileges
- **Logging**: JSON file driver with rotation (10MB, 3 files)
- **Restart policy**: Always restart on failure
- **Network isolation**: Custom bridge network
- **Health monitoring**: Automated health checks every 30s

## 📋 Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- VPS with minimum 2GB RAM, 2 CPU cores
- Open port 3000 for API access

## 🔧 Deployment Steps

### 1. Prepare Environment Variables

```bash
cd chabaqa-backend
cp .env.production.example .env
nano .env
```

Update the following critical variables:
- `SERVER_URL`: Your VPS IP or domain
- `MONGO_URI`: Your MongoDB connection string
- `JWT_SECRET`: Strong random secret
- `EMAIL_*`: Email service credentials
- `GOOGLE_*`: OAuth credentials
- `STRIPE_*`: Payment gateway keys

### 2. Build Production Image

```bash
# Build the optimized production image
docker-compose build --no-cache

# Or build with specific tag
docker build -t chabaqa-backend:latest -f Dockerfile --target production .
```

### 3. Start Production Services

```bash
# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f backend

# Check container status
docker-compose ps
```

### 4. Verify Deployment

```bash
# Check health endpoint
curl http://localhost:3000/api/health

# Check API documentation
curl http://localhost:3000/api/docs

# View container stats
docker stats chabaqa-backend
```

## 🔍 Monitoring & Maintenance

### View Logs
```bash
# Real-time logs
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend

# Logs since 1 hour ago
docker-compose logs --since 1h backend
```

### Container Management
```bash
# Restart container
docker-compose restart backend

# Stop container
docker-compose stop backend

# Remove container (keeps volumes)
docker-compose down

# Remove everything including volumes
docker-compose down -v
```

### Resource Monitoring
```bash
# Real-time resource usage
docker stats chabaqa-backend

# Inspect container
docker inspect chabaqa-backend

# Check disk usage
docker system df
```

### Database Backup
```bash
# Export database (if using local MongoDB)
npm run export:db

# For MongoDB Atlas, use Atlas backup features
```

## 🔒 Security Checklist

- ✅ Non-root user in container
- ✅ Security updates applied to base image
- ✅ Minimal attack surface (Alpine Linux)
- ✅ Dropped unnecessary Linux capabilities
- ✅ Read-only root filesystem where possible
- ✅ No-new-privileges security option
- ✅ Environment variables not in image
- ✅ Secrets managed via .env file
- ✅ CORS properly configured
- ✅ Rate limiting enabled

## ⚡ Performance Tuning

### For VPS with 4GB RAM:
```yaml
deploy:
  resources:
    limits:
      cpus: '3.0'
      memory: 3G
    reservations:
      cpus: '1.0'
      memory: 1G
```

Update `NODE_OPTIONS`:
```bash
NODE_OPTIONS="--max-old-space-size=3072 --max-semi-space-size=128"
```

### For VPS with 8GB RAM:
```yaml
deploy:
  resources:
    limits:
      cpus: '4.0'
      memory: 6G
    reservations:
      cpus: '2.0'
      memory: 2G
```

Update `NODE_OPTIONS`:
```bash
NODE_OPTIONS="--max-old-space-size=5120 --max-semi-space-size=256"
```

## 🔄 Updates & Rollbacks

### Update Application
```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose build --no-cache
docker-compose up -d

# Verify
docker-compose logs -f backend
```

### Rollback
```bash
# Stop current version
docker-compose down

# Checkout previous version
git checkout <previous-commit>

# Rebuild and start
docker-compose build
docker-compose up -d
```

## 🐛 Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs backend

# Check if port is in use
netstat -tulpn | grep 3000

# Verify environment variables
docker-compose config
```

### High Memory Usage
```bash
# Check memory stats
docker stats chabaqa-backend

# Reduce memory limit in docker-compose.yml
# Adjust NODE_OPTIONS max-old-space-size
```

### Database Connection Issues
```bash
# Test MongoDB connection
docker-compose exec backend node -e "require('mongoose').connect(process.env.MONGO_URI).then(() => console.log('Connected')).catch(e => console.error(e))"

# Check network connectivity
docker-compose exec backend ping -c 3 google.com
```

## 📊 Production Metrics

Monitor these key metrics:
- **Response time**: < 200ms for API endpoints
- **Memory usage**: < 80% of allocated memory
- **CPU usage**: < 70% average
- **Error rate**: < 1% of requests
- **Uptime**: > 99.9%

## 🔗 Additional Resources

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Node.js Performance](https://nodejs.org/en/docs/guides/simple-profiling/)
- [NestJS Production](https://docs.nestjs.com/faq/serverless)
- [MongoDB Atlas](https://www.mongodb.com/docs/atlas/)

## 📞 Support

For issues or questions:
- Check logs: `docker-compose logs -f backend`
- Review health: `curl http://localhost:3000/api/health`
- Contact: support@chabaqa.com
