# Quick VPS Update Guide

## The Problem
Your VPS has the old Dockerfile with `tini` that causes "operation not permitted" errors.

## Solution - Update Files on VPS

### Step 1: Stop and Remove Old Container
```bash
ssh ubuntu@51.254.132.77
cd ~/chabaqa-backend
sudo docker compose down -v
sudo docker system prune -af
```

### Step 2: Pull Latest Code from GitHub
```bash
git pull origin main
```

### Step 3: Verify Dockerfile is Correct
```bash
cat Dockerfile | grep -i tini
```
**Expected**: Should return nothing (no tini references)

If you still see tini, the GitHub repo wasn't updated. In that case:

### Alternative: Manually Replace Dockerfile
On your local machine:
```bash
cd chabaqa-backend
git add Dockerfile .env docker-compose.yml
git commit -m "fix: remove tini and optimize-for-size"
git push origin main
```

Then on VPS:
```bash
cd ~/chabaqa-backend
git pull origin main
```

### Step 4: Rebuild and Start
```bash
docker compose build --no-cache
docker compose up -d
```

### Step 5: Check Logs
```bash
docker compose logs -f backend
```

**Expected**: Should see NestJS starting successfully, no "tini" or "optimize-for-size" errors

### Step 6: Access Dozzle (Log Viewer)
Open in browser: `http://51.254.132.77:8888`

## Quick Verification Commands
```bash
# Check if container is running
docker ps

# Check logs
docker compose logs -f backend

# Check health
curl http://51.254.132.77:3000/api/health

# Check Dozzle
curl http://51.254.132.77:8888
```

## If Still Having Issues

### Nuclear Option - Fresh Start
```bash
# Backup uploads first!
cd ~/chabaqa-backend
tar -czf uploads-backup-$(date +%Y%m%d).tar.gz uploads/

# Remove everything
cd ~
sudo docker compose -f chabaqa-backend/docker-compose.yml down -v
sudo rm -rf chabaqa-backend

# Fresh clone
git clone https://github.com/Louay0007/chabaqa-backend.git
cd chabaqa-backend

# Restore uploads
tar -xzf ~/uploads-backup-*.tar.gz

# Build and start
docker compose build --no-cache
docker compose up -d
```
