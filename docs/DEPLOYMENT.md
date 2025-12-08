# Production Deployment Guide

Comprehensive guide for safe, zero-downtime deployments using Blue-Green deployment strategy.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Deployment Process](#deployment-process)
- [Monitoring](#monitoring)
- [Rollback](#rollback)
- [Backup & Restore](#backup--restore)
- [Troubleshooting](#troubleshooting)
- [SSL/HTTPS Setup](#sslhttps-setup)

---

## Overview

This project uses a **Blue-Green deployment** strategy for zero-downtime updates with automatic rollback on failure.

### Key Features

- ✅ Zero-downtime deployments
- ✅ Automatic database backups before deployment
- ✅ Health checks and smoke tests
- ✅ Automatic rollback on failure
- ✅ Graceful WebSocket connection handling
- ✅ Traffic switching via Nginx
- ✅ Post-deployment monitoring

### What Gets Preserved

During deployments, the following are **never lost**:
- 💬 All messages and chat history
- 👥 Users and their permissions
- 🗂️ Uploaded files
- 📊 Chat participants and settings
- 🔔 Notification subscriptions

---

## Architecture

### Blue-Green Setup

```
┌─────────────────────────────────────────┐
│          Nginx Load Balancer            │
│      (Port 80/443 - Public Facing)      │
└──────────────┬──────────────────────────┘
               │ Routes traffic to active
               │ backend (blue or green)
               │
     ┌─────────┴─────────┐
     │                   │
┌────▼─────┐      ┌─────▼────┐
│  Blue    │      │  Green   │
│ Backend  │      │ Backend  │
│ Port 3001│      │ Port 3002│
└────┬─────┘      └─────┬────┘
     │                  │
     └──────┬───────────┘
            │
    ┌───────▼────────┐
    │   PostgreSQL   │
    │   (Shared DB)  │
    └────────────────┘
```

### Containers

1. **corporate-chat-db** - PostgreSQL database (shared)
2. **corporate-chat-backend-blue** - Blue environment (port 3001)
3. **corporate-chat-backend-green** - Green environment (port 3002)
4. **corporate-chat-nginx** - Nginx load balancer (ports 80/443)

---

## Prerequisites

### Required Software

- Docker (20.10+)
- docker-compose (1.29+)
- curl
- PostgreSQL client tools (pg_dump, psql)

### Required Files

Ensure you have a `.env` file with:

```bash
# Database
DB_PASSWORD=your_secure_password
DB_HOST=postgres
DB_PORT=5432
DB_NAME=corporate_chat
DB_USER=postgres

# JWT Secrets
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here

# CORS
CORS_ORIGIN=https://your-domain.com

# Node Environment
NODE_ENV=production
```

---

## Initial Setup

### 1. Verify Prerequisites

```bash
# Check Docker
docker --version
docker-compose --version

# Check PostgreSQL tools
pg_dump --version
psql --version

# Check curl
curl --version
```

### 2. Make Scripts Executable

```bash
chmod +x scripts/*.sh
```

### 3. Create Required Directories

```bash
mkdir -p backups logs nginx/ssl uploads
```

### 4. Start Initial Deployment

For the first deployment, start the Blue environment:

```bash
docker-compose -f docker-compose.production.yml up -d postgres backend-blue nginx
```

### 5. Verify Initial Setup

```bash
# Check containers are running
docker ps

# Check health endpoint
curl http://localhost/api/health

# Check logs
docker logs corporate-chat-backend-blue
```

---

## Deployment Process

### Automatic Deployment (Recommended)

The deployment script handles everything automatically:

```bash
./scripts/deploy.sh
```

### What the Script Does

The deployment process consists of **8 automated steps**:

#### **Step 1: Database Backup**
- Creates timestamped backup of PostgreSQL database
- Stores in `./backups/` directory
- Maintains 7-day retention policy
- **Aborts deployment if backup fails**

#### **Step 2: Build & Start New Version**
- Determines which color (blue/green) is currently active
- Builds Docker image for the inactive color
- Starts new container on alternate port
- **Aborts if build or start fails**

#### **Step 3: Run Migrations**
- Executes database migrations in new container
- **Aborts and stops new container if migrations fail**

#### **Step 4: Health Check**
- Checks `/api/health` endpoint
- Makes 30 attempts with 2-second intervals
- **Aborts and stops new container if health check fails**

#### **Step 5: Smoke Tests**
- Tests critical endpoints:
  - `/api/health` - Server health
  - `/api/auth/login` - Authentication system
  - `/` - Static files serving
- **Aborts and stops new container if any test fails**

#### **Step 6: Switch Traffic**
- Updates `nginx/active_backend.conf`
- Reloads Nginx to route traffic to new version
- **Aborts if Nginx reload fails**

#### **Step 7: Monitor New Version**
- Monitors health for 30 seconds (6 checks)
- Automatically rolls back if new version becomes unhealthy
- **Reverts to old version if monitoring fails**

#### **Step 8: Cleanup**
- Stops old version container
- Keeps old container for quick rollback if needed

### Deployment Output

You'll see color-coded output:

```
========================================
🚀 Starting Blue-Green Deployment
========================================
Version: latest
Time: 2025-12-08 10:30:00

📊 Current active: blue
📊 Deploying to: green

========================================
📦 STEP 1: Creating database backup
========================================
✅ Backup created successfully...

[... continues through all 8 steps ...]

========================================
✅ DEPLOYMENT COMPLETED SUCCESSFULLY!
========================================
Active version: green
Deployment log: ./logs/deploy_20251208_103000.log
```

### Deployment Logs

Each deployment creates a timestamped log file:

```bash
# View deployment log
cat logs/deploy_20251208_103000.log

# View latest deployment
ls -t logs/deploy_*.log | head -1 | xargs cat
```

---

## Monitoring

### During Deployment

Watch the deployment script output for:
- ✅ Green checkmarks = success
- ❌ Red X's = failure (automatic rollback)
- ⚠️ Yellow warnings = informational

### Post-Deployment

#### Check Active Version

```bash
# See which backend is active
cat nginx/active_backend.conf

# Check running containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

#### Monitor Logs

```bash
# Follow logs of active backend
docker logs -f corporate-chat-backend-green  # or blue

# All containers
docker-compose -f docker-compose.production.yml logs -f
```

#### Health Checks

```bash
# Check backend health
curl http://localhost/api/health

# Check both backends directly
curl http://localhost:3001/api/health  # Blue
curl http://localhost:3002/api/health  # Green

# Check Nginx
curl http://localhost/health
```

#### WebSocket Connections

```bash
# Count active Socket.IO connections
docker exec corporate-chat-backend-green \
  sh -c "wget -qO- http://localhost:3000/api/health"
```

---

## Rollback

### Automatic Rollback

The deployment script automatically rolls back if:
- Database backup fails
- Build fails
- Migrations fail
- Health checks fail
- Smoke tests fail
- Nginx reload fails
- New version becomes unhealthy during monitoring

### Manual Rollback

If you need to manually rollback after a successful deployment:

#### Quick Rollback (Switch Traffic)

```bash
# Determine which version is currently active
cat nginx/active_backend.conf

# If green is active, switch to blue:
cat > nginx/active_backend.conf <<EOF
upstream backend {
    server corporate-chat-backend-blue:3000;
}
EOF

# Reload Nginx
docker exec corporate-chat-nginx nginx -s reload
```

#### Full Rollback (Restart Old Version)

```bash
# Start the old version if it's stopped
docker-compose -f docker-compose.production.yml up -d backend-blue

# Switch traffic (as above)
cat > nginx/active_backend.conf <<EOF
upstream backend {
    server corporate-chat-backend-blue:3000;
}
EOF

docker exec corporate-chat-nginx nginx -s reload

# Stop new version
docker-compose -f docker-compose.production.yml stop backend-green
```

---

## Backup & Restore

### Manual Backup

Create a manual database backup:

```bash
./scripts/backup_database.sh
```

This creates:
- `backups/corporate_chat_YYYYMMDD_HHMMSS.sql` - Plain SQL
- `backups/corporate_chat_YYYYMMDD_HHMMSS.sql.gz` - Compressed
- `backups/latest.sql` - Symlink to latest backup

### View Backups

```bash
# List all backups
ls -lh backups/corporate_chat_*.sql

# View 5 most recent
ls -lt backups/corporate_chat_*.sql | head -5
```

### Restore from Backup

**⚠️ WARNING: This will REPLACE the current database!**

```bash
# Restore latest backup
./scripts/restore_database.sh

# Restore specific backup
./scripts/restore_database.sh backups/corporate_chat_20251208_103000.sql
```

The restore script will:
1. Ask for confirmation
2. Create a pre-restore backup of current database
3. Restore the specified backup
4. Provide rollback instructions if restore fails

### Backup Retention

Automatic cleanup removes backups older than **7 days**.

To change retention:

```bash
# Edit backup script
nano scripts/backup_database.sh

# Find and modify:
RETENTION_DAYS=7  # Change to desired days
```

---

## Troubleshooting

### Deployment Fails at Backup Step

**Problem**: `❌ Backup failed! Aborting deployment.`

**Solutions**:
```bash
# Check database is running
docker ps | grep postgres

# Check database connectivity
docker exec corporate-chat-db psql -U postgres -c "SELECT version();"

# Check disk space
df -h

# Manually create backup directory
mkdir -p backups
```

### Deployment Fails at Build Step

**Problem**: `❌ Build failed! Aborting deployment.`

**Solutions**:
```bash
# Check Dockerfile syntax
docker build -t test-build .

# Check for missing dependencies in package.json
cat package.json

# Clear Docker build cache
docker builder prune
```

### Health Check Fails

**Problem**: `❌ Health check failed after 30 attempts`

**Solutions**:
```bash
# Check container logs
docker logs corporate-chat-backend-green  # or blue

# Check if port is available
netstat -tuln | grep 3001
netstat -tuln | grep 3002

# Check database connectivity from container
docker exec corporate-chat-backend-green \
  sh -c "wget -qO- http://localhost:3000/api/health"

# Check environment variables
docker exec corporate-chat-backend-green env | grep DB_
```

### Smoke Tests Fail

**Problem**: `❌ Smoke tests failed! Rolling back...`

**Solutions**:
```bash
# Test each endpoint manually
curl -v http://localhost:3002/api/health
curl -v http://localhost:3002/api/auth/login
curl -v http://localhost:3002/

# Check application logs
docker logs corporate-chat-backend-green | tail -50
```

### Nginx Reload Fails

**Problem**: `❌ Failed to reload nginx!`

**Solutions**:
```bash
# Check nginx configuration syntax
docker exec corporate-chat-nginx nginx -t

# Check nginx logs
docker logs corporate-chat-nginx

# Verify active_backend.conf exists
cat nginx/active_backend.conf

# Restart nginx
docker restart corporate-chat-nginx
```

### WebSocket Connections Drop During Deployment

**Expected Behavior**:
- Users see: "⚙️ Сервер обновляется. Подключение будет восстановлено автоматически..."
- Connections automatically reconnect within 15-45 seconds

**If reconnection doesn't work**:
```bash
# Check Socket.IO configuration
docker logs corporate-chat-backend-green | grep Socket

# Verify nginx WebSocket proxy settings
docker exec corporate-chat-nginx cat /etc/nginx/nginx.conf | grep -A 10 socket.io
```

### Both Containers Running, Wrong One Active

**Problem**: Traffic going to old version after deployment

**Solutions**:
```bash
# Check active backend
cat nginx/active_backend.conf

# Should show the new version (green or blue)
# If not, manually update:
cat > nginx/active_backend.conf <<EOF
upstream backend {
    server corporate-chat-backend-green:3000;
}
EOF

docker exec corporate-chat-nginx nginx -s reload
```

### Disk Space Issues

**Problem**: Backups filling up disk

**Solutions**:
```bash
# Check disk usage
df -h
du -sh backups/

# Clean old backups manually
find backups/ -name "corporate_chat_*.sql" -mtime +7 -delete

# Clean old Docker images
docker system prune -a
```

---

## SSL/HTTPS Setup

### Using Let's Encrypt (Production)

1. **Install Certbot**:
   ```bash
   sudo apt-get update
   sudo apt-get install certbot
   ```

2. **Generate Certificate**:
   ```bash
   sudo certbot certonly --standalone -d your-domain.com
   ```

3. **Copy Certificates**:
   ```bash
   sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
   sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem
   ```

4. **Enable HTTPS in Nginx**:
   ```bash
   # Edit nginx.conf
   nano nginx/nginx.conf

   # Uncomment the HTTPS server block (search for "# server {")
   ```

5. **Reload Nginx**:
   ```bash
   docker exec corporate-chat-nginx nginx -s reload
   ```

6. **Setup Auto-Renewal**:
   ```bash
   # Add to crontab
   sudo crontab -e

   # Add this line:
   0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /path/to/nginx/ssl/cert.pem && cp /etc/letsencrypt/live/your-domain.com/privkey.pem /path/to/nginx/ssl/key.pem && docker exec corporate-chat-nginx nginx -s reload
   ```

### Using Self-Signed Certificate (Development)

```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/CN=localhost"

# Enable HTTPS in nginx.conf (uncomment HTTPS server block)
nano nginx/nginx.conf

# Reload nginx
docker exec corporate-chat-nginx nginx -s reload
```

---

## Best Practices

### Before Deployment

- ✅ Test changes in development environment
- ✅ Run `npm test` to ensure tests pass
- ✅ Review recent commits for breaking changes
- ✅ Notify users of upcoming maintenance (if needed)
- ✅ Ensure disk space is available for backups

### During Deployment

- ✅ Monitor the deployment script output
- ✅ Don't interrupt the script (it handles rollback)
- ✅ Keep logs for troubleshooting

### After Deployment

- ✅ Verify all critical features work
- ✅ Check WebSocket connections are stable
- ✅ Monitor error logs for 10-15 minutes
- ✅ Test user login and message sending
- ✅ Verify file uploads work

### Maintenance Schedule

- **Daily**: Automated backups (7-day retention)
- **Weekly**: Review deployment logs
- **Monthly**: Clean up old Docker images
- **Quarterly**: Update SSL certificates (if not auto-renewed)

---

## Quick Reference

### Common Commands

```bash
# Deploy new version
./scripts/deploy.sh

# Manual backup
./scripts/backup_database.sh

# Restore backup
./scripts/restore_database.sh

# Check active version
cat nginx/active_backend.conf

# View logs
docker logs -f corporate-chat-backend-green

# Health check
curl http://localhost/api/health

# Restart container
docker-compose -f docker-compose.production.yml restart backend-green
```

### File Locations

- **Backups**: `./backups/`
- **Logs**: `./logs/`
- **Nginx configs**: `./nginx/`
- **Uploads**: `./uploads/`
- **Deploy script**: `./scripts/deploy.sh`
- **Backup script**: `./scripts/backup_database.sh`
- **Restore script**: `./scripts/restore_database.sh`

### Important URLs

- **Health**: `http://your-domain/api/health`
- **API**: `http://your-domain/api/`
- **WebSocket**: `ws://your-domain/socket.io/`
- **Admin Panel**: `http://your-domain/admin`

---

## Support

If you encounter issues not covered in this guide:

1. Check the logs: `docker logs corporate-chat-backend-[color]`
2. Review deployment log: `cat logs/deploy_*.log | tail -100`
3. Check database connectivity: `docker exec corporate-chat-db psql -U postgres -c "SELECT version();"`
4. Verify `.env` file has all required variables

For additional help, see:
- `docs/architecture.md` - System architecture
- `docs/runbooks/common-issues.md` - Common issues and solutions
- `docs/ai-coding.md` - Development guidelines
