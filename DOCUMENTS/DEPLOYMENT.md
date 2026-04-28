# FOV Backend - Deployment Guide

## Overview

This document covers deploying FOV Backend to production environments using Docker, Docker Compose, and cloud platforms.

---

## Table of Contents

1. [Docker Deployment](#docker-deployment)
2. [Docker Compose](#docker-compose)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Monitoring & Logging](#monitoring--logging)
6. [Backup & Recovery](#backup--recovery)
7. [Troubleshooting](#troubleshooting)

---

## Docker Deployment

### Building the Docker Image

**Build command:**
```bash
docker build -t fov-backend:1.0.0 .
```

**With platform specification (M1/M2 Mac compatibility):**
```bash
docker buildx build --platform linux/amd64 -t fov-backend:1.0.0 .
```

### Running as Docker Container

**Basic launch:**
```bash
docker run -d \
  -p 4000:4000 \
  -e DB_HOST=mysql-server \
  -e DB_USER=admin \
  -e DB_PASSWORD=secure_password \
  -e DB_NAME=fovwebdb \
  -e NODE_ENV=production \
  --name fov-backend \
  fov-backend:1.0.0
```

**With volume mounts (for media storage and SRT ingest):**
```bash
docker run -d \
  -p 4000:4000 \
  -p 9999:9999/udp \
  -v /var/fov/media:/app/media \
  -e DB_HOST=mysql-server \
  -e DB_USER=admin \
  -e DB_PASSWORD=secure_password \
  -e DB_NAME=fovwebdb \
  -e NODE_ENV=production \
  --name fov-backend \
  fov-backend:1.0.0
```

**View logs:**
```bash
docker logs -f fov-backend
```

**Stop container:**
```bash
docker stop fov-backend
docker rm fov-backend
```

---

## Docker Compose

### Single Server Setup

**File: `docker-compose.yml` (already exists)**

```bash
docker-compose up --build
```

**Check services:**
```bash
docker-compose ps
```

**View logs:**
```bash
docker-compose logs -f backend
```

**Stop services:**
```bash
docker-compose down
```

### Production Setup with External Database

**File: `docker-compose.prod.yml` (already exists)**

For deployments where MySQL runs separately (e.g., AWS RDS):

**Edit environment in compose:**
```yaml
services:
  backend:
    build: ./backend
    ports:
      - "4000:4000"
    environment:
      DB_HOST: your-rds.amazonaws.com
      DB_USER: produser
      DB_PASSWORD: ${DB_PASSWORD}  # From .env file
      DB_NAME: fovwebdb
      NODE_ENV: production
```

**Start with .env file:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## Environment Configuration

### Production .env Setup

**Create `.env.production`:**
```bash
cp .env.production.example .env.production
```

**Critical variables:**
```bash
NODE_ENV=production
PORT=4000

# Database (use managed service)
DB_HOST=prod-db.example.com
DB_USER=produser
DB_PASSWORD=<use_secrets_manager>
DB_NAME=fovwebdb

# Media Storage
MEDIA_ROOT=/mnt/media-volume

# Security
CORS_ORIGIN=https://yourdomain.com
```

### Secrets Management

**Using Docker Secrets (Swarm):**
```bash
echo "secure_password" | docker secret create db_password -
```

**Using AWS Secrets Manager:**
```bash
aws secretsmanager create-secret \
  --name fov/db/password \
  --secret-string "secure_password"
```

**Using environment variables in Docker Compose:**
```yaml
environment:
  DB_PASSWORD: ${DB_PASSWORD}
```

Then run:
```bash
export DB_PASSWORD=secure_password
docker-compose up
```

---

## Database Setup

### Initial Database Creation

**On production MySQL server:**
```sql
CREATE DATABASE IF NOT EXISTS fovwebdb;
CREATE USER 'produser'@'%' IDENTIFIED BY 'secure_password';
GRANT ALL PRIVILEGES ON fovwebdb.* TO 'produser'@'%';
FLUSH PRIVILEGES;
```

### Schema Migration

**If using migration files (future enhancement):**
```bash
npm run migrate
```

**Manual setup (current):**
```bash
mysql -h your-db.com -u produser -p fovwebdb < schema.sql
```

### Backup Strategy

**Daily backup (cron job):**
```bash
# AWS RDS: Use automated backups (7+ days retention)
aws rds modify-db-instance \
  --db-instance-identifier fov-db \
  --backup-retention-period 30 \
  --apply-immediately
```

**Manual backup to S3:**
```bash
mysqldump -h your-db.com -u produser -p fovwebdb | \
  gzip | \
  aws s3 cp - s3://fov-backups/db-$(date +%Y%m%d).sql.gz
```

**Restore from backup:**
```bash
aws s3 cp s3://fov-backups/db-20240101.sql.gz - | gunzip | \
  mysql -h your-db.com -u produser -p fovwebdb
```

---

## Monitoring & Logging

### Container Health Checks

**In Dockerfile:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"
```

**Check health:**
```bash
docker inspect --format='{{.State.Health.Status}}' fov-backend
```

### Application Logging

**Current:** Morgan request logging

**Production improvement:** Use structured logging (Winston)

**Redirect logs to file:**
```bash
docker run ... fov-backend:1.0.0 > /var/log/fov-backend.log 2>&1 &
```

**With log rotation (logrotate):**
```
/var/log/fov-backend.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 nobody nobody
    sharedscripts
}
```

### Performance Monitoring

**Database query monitoring:**
```sql
-- Enable slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;
```

**Memory usage:**
```bash
docker stats fov-backend
```

**Port monitoring:**
```bash
lsof -i :4000  # Check port 4000
```

---

## Backup & Recovery

### Media Files Backup

**S3 sync (daily):**
```bash
aws s3 sync /var/fov/media s3://fov-media-backup/daily/ --delete
```

**With versioning enabled on S3 bucket:**
```bash
aws s3api put-bucket-versioning \
  --bucket fov-media-backup \
  --versioning-configuration Status=Enabled
```

### Complete System Backup

**Weekly snapshot (AWS):**
```bash
# Create EBS snapshot
aws ec2 create-snapshot \
  --volume-id vol-12345678 \
  --description "FOV Backend weekly backup"
```

### Disaster Recovery Plan

| Component | RTO | RPO | Method |
|-----------|-----|-----|--------|
| Database | 4 hours | 1 hour | AWS RDS automated backups |
| Media Files | 2 hours | 30 min | S3 versioning + daily sync |
| Application Code | 30 min | 0 min | Git repository |

**Recovery Steps:**
1. Spin up new EC2 instance with latest AMI
2. Restore RDS from snapshot
3. Restore media from S3 backup
4. Deploy latest backend container
5. Run health checks

---

## Scaling

### Horizontal Scaling (Multiple Instances)

**Using Docker Swarm:**
```bash
# Initialize swarm
docker swarm init

# Deploy service with replicas
docker service create \
  --name fov-backend \
  --replicas 3 \
  -p 4000:4000 \
  -e DB_HOST=mysql-server \
  fov-backend:1.0.0
```

**Using Kubernetes:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fov-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fov-backend
  template:
    metadata:
      labels:
        app: fov-backend
    spec:
      containers:
      - name: backend
        image: fov-backend:1.0.0
        ports:
        - containerPort: 4000
        env:
        - name: DB_HOST
          value: mysql-service
```

### Load Balancing

**Nginx as reverse proxy:**
```nginx
upstream backend {
    server backend-1:4000;
    server backend-2:4000;
    server backend-3:4000;
}

server {
    listen 80;
    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
    }
}
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs fov-backend

# Common issues:
# - Port already in use: Change PORT or kill existing process
# - Database unreachable: Check DB_HOST, credentials, firewall
# - Out of memory: Increase container memory limit
```

### High CPU Usage

```bash
# Identify bottleneck
docker stats fov-backend

# Check slow queries
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME -e "SHOW PROCESSLIST;"
```

### Media Files Not Accessible

```bash
# Verify volume mount
docker inspect fov-backend | grep -A 10 Mounts

# Check permissions
ls -la /var/fov/media/hls/

# Verify Docker user has access
docker exec fov-backend ls -la /app/media/
```

---

**Last Updated:** April 2026
