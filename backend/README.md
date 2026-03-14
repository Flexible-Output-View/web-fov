# FOV Backend - Complete Technical Documentation

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Tech Stack & Justification](#tech-stack--justification)
4. [Installation & Setup](#installation--setup)
5. [Deployment](#deployment)
6. [Project Structure](#project-structure)
7. [API Endpoints](#api-endpoints)
8. [Environment Variables](#environment-variables)
9. [Key Commands](#key-commands)
10. [Database Schema](#database-schema)
11. [Media Processing Pipeline](#media-processing-pipeline)
12. [Error Handling & Logging](#error-handling--logging)
13. [Security Considerations](#security-considerations)
14. [Performance & Optimization](#performance--optimization)
15. [Troubleshooting](#troubleshooting)

---

## 🎯 Project Overview

**FOV (Field of View)** is a modern live streaming platform backend that enables:

- **Live streaming ingestion** via SRT (Secure Reliable Transport) protocol
- **Adaptive bitrate streaming** using HLS (HTTP Live Streaming)
- **Multi-track video delivery** supporting multiple video qualities simultaneously
- **Stream metadata management** with user authentication, category management, and viewer tracking
- **RESTful API** for stream discovery, user management, and category browsing

### Core Use Cases

1. **Content Ingestion**: Streamers connect via SRT to push live video feeds
2. **Stream Processing**: FFmpeg transcodes and segments video into HLS playlists
3. **Stream Discovery**: Clients query API for available streams, categories, and user profiles
4. **Stream Delivery**: HLS playlist delivery enables adaptive bitrate streaming to clients

---

## 🏗️ Architecture

### System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     FOV Backend System                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Express.js HTTP Server (Port 4000)        │    │
│  │  - Request/Response handling                         │    │
│  │  - CORS support for Angular frontend                │    │
│  │  - Morgan logging middleware                        │    │
│  └──────────────┬──────────────────────────────────────┘    │
│                 │                                             │
│  ┌──────────────┴──────────────────────────────────────┐    │
│  │         API Routes Layer (/api)                      │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │ ├─ /categories - Category discovery & browsing      │    │
│  │ ├─ /streams - Stream listing & status               │    │
│  │ └─ /users - User profiles & metadata                │    │
│  └──────────────▲──────────────────────────────────────┘    │
│                 │                                             │
│  ┌──────────────┴──────────────────────────────────────┐    │
│  │     Media Routes Layer (HLS & Streaming)            │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │ ├─ GET /hls/:streamId/:track/playlist.m3u8 (HLS)   │    │
│  │ ├─ GET /hls/:streamId/:track/seg:number.ts (TS)    │    │
│  │ ├─ POST /register (Stream registration)            │    │
│  │ ├─ POST /start (Stream start & FFmpeg spawn)       │    │
│  │ └─ POST /stop (Stream termination)                 │    │
│  └──────────────┬──────────────────────────────────────┘    │
│                 │                                             │
│  ┌──────────────┴──────────────────────────────────────┐    │
│  │         Service & Processing Layer                  │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │ ┌─────────────────────────────────────────────┐     │    │
│  │ │  Database Service (MySQL Connection Pool)   │     │    │
│  │ │  - Connection pooling (5 connections)       │     │    │
│  │ │  - Query execution with error handling      │     │    │
│  │ └─────────────────────────────────────────────┘     │    │
│  │ ┌─────────────────────────────────────────────┐     │    │
│  │ │  Media Processing Service (FFmpeg)          │     │    │
│  │ │  - SRT stream ingestion                      │     │    │
│  │ │  - Video transcoding & segmentation         │     │    │
│  │ │  - HLS playlist generation                  │     │    │
│  │ └─────────────────────────────────────────────┘     │    │
│  └──────────────┬──────────────────────────────────────┘    │
│                 │                                             │
│  ┌──────────────┴──────────────────────────────────────┐    │
│  │         External Services & Storage                 │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │ ┌──────────────┐  ┌──────────────┐  ┌───────────┐   │    │
│  │ │   MySQL DB   │  │ HLS Segments │  │  Logs     │   │    │
│  │ │   (Users,    │  │  (./media    │  │  (stdout) │   │    │
│  │ │  Streams,    │  │  /hls)       │  │           │   │    │
│  │ │  Categories) │  │              │  │           │   │    │
│  │ └──────────────┘  └──────────────┘  └───────────┘   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

EXTERNAL SYSTEMS:
┌──────────────────┐    ┌──────────────────┐    ┌──────────────┐
│  Streamers (SRT) │    │  Angular Client  │    │  FFmpeg CLI  │
│  -> Port 9999    │    │  (HTTP Requests) │    │  (Subprocess)│
└──────────────────┘    └──────────────────┘    └──────────────┘
```

### Data Flow

#### Stream Ingestion Flow
```
Streamer (OBS/FFmpeg)
     │ (SRT Protocol, Port 9999)
     ▼
POST /start (register stream metadata)
     │
     ▼
Express receives stream & socket connection
     │
     ▼
FFmpeg spawned as subprocess
     │
     ├─ Input: SRT listener socket
     │ Output: HLS segments & playlists
     │
     ▼
HLS files written to ./media/hls/{streamId}/{track}/
     │
     ▼
Available via GET /hls/:streamId/:track/...
```

#### API Client Flow
```
Angular Client
     │
     ├─ GET /api/categories → [Category List]
     │
     ├─ GET /api/streams → [Stream List with HLS URL]
     │
     ├─ GET /api/users/:id → [User Profile]
     │
     └─ GET /hls/{streamId}/0/playlist.m3u8 → [HLS Playlist]
         │
         ├─ GET /hls/{streamId}/0/seg00001.ts
         │
         └─ (adaptive bitrate based on client capacity)
```

---

## 🛠️ Tech Stack & Justification

### Core Technologies

| Component | Technology | Justification |
|-----------|-----------|--------------|
| **Runtime** | Node.js (v18+) ES Modules | Asynchronous I/O, ideal for streaming; ES Modules provide native module support without transpilation |
| **HTTP Server** | Express.js 4.x | Industry-standard lightweight web framework; excellent middleware ecosystem; minimal overhead |
| **Database** | MySQL 8.x | ACID compliance for transaction safety; strong relational structure for users/streams/categories; widespread hosting support |
| **Media Processing** | FFmpeg | Industry-standard for transcoding/streaming; supports SRT protocol; HLS segmentation; proven reliability |
| **Streaming Protocol** | SRT | Low-latency, secure alternative to RTMP; built-in encryption and error recovery; modern streaming standard |
| **Delivery Format** | HLS (HTTP Live Streaming) | Browser-native support via HTTP; adaptive bitrate capability; easy CDN integration; iOS/Android compatible |
| **Containerization** | Docker | Environment parity across dev/staging/prod; easy deployment; simplified dependency management |
| **Dev Tools** | Nodemon | Hot-reload during development; improved iteration speed |
| **Logging** | Morgan + Console | Simple, effective request logging; structured error output |
| **Security** | CORS + dotenv | Cross-origin request handling; environment-based configuration separation |

### Why NOT (Alternative Justifications)

- **Not RTMP**: SRT provides better latency, security, and modern support (RTMP is legacy)
- **Not DASH**: HLS is simpler, more widely supported, adequate for this use case
- **Not WebSockets for API**: REST is stateless, simpler, and better for resource-driven API
- **Not PostgreSQL**: MySQL is adequate for current schema; simpler ops in current environment
- **Not Fastify**: Express complexity trade-off justified by ecosystem maturity

---

## 💻 Installation & Setup

### Prerequisites

```bash
# Required
- Node.js >= 18.0.0
- npm >= 9.0.0
- FFmpeg >= 5.0
- MySQL >= 8.0

# Recommended
- Docker & Docker Compose (for containerized setup)
- Git
- Postman or curl (for API testing)
```

### Local Development Setup

```bash
# 1. Clone and navigate to backend
cd backend

# 2. Install dependencies
npm install

# 3. Create .env file (copy from .env.example)
cp .env.example .env
# Edit .env with your local configuration

# 4. Verify FFmpeg installation
ffmpeg -version

# 5. Create media directory structure
mkdir -p media/hls

# 6. Test database connection (ensure MySQL is running)
npm run test:db

# 7. Start development server
npm run dev
# Server runs on http://localhost:4000
```

### Docker Setup

```bash
# Build the image
docker build -t fov-backend .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### Database Setup

```bash
# Connect to MySQL
mysql -h DB_HOST -u DB_USER -p

# Create database and tables (if not exists)
CREATE DATABASE IF NOT EXISTS fovwebdb;
USE fovwebdb;

# Create core tables (see Database Schema section)
# Tables: users, streams, categories, stream_tracks
```

---

## 🚀 Deployment

### Production Deployment Checklist

- [ ] **Environment**: Configure `.env` with production values
- [ ] **Database**: Configure external MySQL instance with backups enabled
- [ ] **SSL/TLS**: Enable HTTPS (via reverse proxy like Nginx)
- [ ] **Logging**: Configure log aggregation (e.g., ELK stack)
- [ ] **Monitoring**: Set up alerts for FFmpeg process failures
- [ ] **Scaling**: Use Nginx reverse proxy for load balancing
- [ ] **Storage**: Configure persistent volume for HLS segments

### Nginx Reverse Proxy Example

```nginx
upstream fov_backend {
    server localhost:4000;
    server localhost:4001;
    server localhost:4002;
}

server {
    listen 80;
    server_name api.fov.example.com;

    location / {
        proxy_pass http://fov_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Docker Compose Deployment

```yaml
# See docker-compose.yml in project root
# Services: backend, mysql, nginx
# Run: docker-compose -f docker-compose.prod.yml up -d
```

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── index.js                 # Entry point, Express app initialization
│   ├── db.js                    # MySQL connection pool & query execution
│   ├── mediaServer.mjs          # FFmpeg-based streaming server
│   │
│   └── routes/
│       ├── index.js             # Route aggregator
│       ├── categories.js        # Category CRUD endpoints
│       ├── streams.js           # Stream status & HLS playlist endpoints
│       └── users.js             # User profile endpoints
│
├── tests/
│   ├── db.test.js              # Database connection pooling tests
│   ├── api.test.js             # Route integration tests
│   └── mediaServer.test.js     # FFmpeg spawning tests
│
├── media/
│   └── hls/                     # HLS segments & playlists (generated at runtime)
│       └── {streamId}/
│           └── {track}/
│               ├── playlist.m3u8
│               └── seg*.ts
│
├── .env.example                 # Environment variables template
├── .env.prod                    # Production environment (git-ignored)
├── .eslintrc.json              # ESLint configuration
├── Dockerfile                   # Docker container definition
├── docker-compose.yml          # Local dev compose
├── docker-compose.prod.yml     # Production compose
├── package.json                # Dependencies & scripts
├── README.md                   # This file
├── TECHNICAL.md                # Detailed architecture & design decisions
├── SECURITY.md                 # Security hardening guide
└── CHANGELOG.md                # Version history & changes
```

---

## 🔌 API Endpoints

### Base URL
- **Development**: `http://localhost:4000`
- **Production**: `https://api.fov.example.com`

### Categories Endpoints

| Method | Endpoint | Description | Query Params |
|--------|----------|-------------|--------------|
| GET | `/api/categories` | List all categories | — |
| GET | `/api/categories/:id` | Get single category | — |

**Response Example**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "Gaming",
      "viewers": 15000,
      "image_url": "https://example.com/gaming.jpg"
    }
  ]
}
```

### Streams Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/streams` | List active streams |
| GET | `/api/streams/:id` | Get stream details |
| GET | `/hls/:streamId/:track/playlist.m3u8` | HLS master playlist |
| GET | `/hls/:streamId/:track/seg:number.ts` | HLS segment (TS) |

**Stream Response**:
```json
{
  "id": "uuid-stream-id",
  "user_id": 123,
  "title": "Gaming Session",
  "category_id": 1,
  "viewers": 500,
  "hls_url": "http://localhost:4000/hls/uuid-stream-id/0/playlist.m3u8",
  "tracks": [0, 1, 2],
  "status": "active",
  "started_at": "2025-03-14T12:00:00Z"
}
```

### Users Endpoints

| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| GET | `/api/users/:id` | Get user profile | — |
| POST | `/api/users` | Create new user | `{username, display_name?}` |

**User Response**:
```json
{
  "data": {
    "id": 123,
    "username": "streamer_name",
    "display_name": "Streamer's Display Name",
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

### Media Control Endpoints

| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| POST | `/register` | Register a new stream | `{streamId, userId?, tracks}` |
| POST | `/start` | Start streaming with SRT | `{streamId, srtUrl?}` |
| POST | `/stop` | Stop active stream | `{streamId}` |

---

## 🔐 Environment Variables

### Configuration (.env)

Create a `.env` file by copying `.env.example` and filling in your values:

```env
# Server
PORT=4000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=password
DB_NAME=fovwebdb

# Media
MEDIA_ROOT=./media
FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
SRT_PORT=9999

# CORS
CORS_ORIGIN=http://localhost:4200

# Logging
LOG_LEVEL=debug
```

### Variable Descriptions

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | 4000 | HTTP server listening port |
| `NODE_ENV` | string | development | Execution environment |
| `DB_HOST` | string | localhost | MySQL server hostname |
| `DB_USER` | string | admin | Database user |
| `DB_PASSWORD` | string | — | Database password (required) |
| `DB_NAME` | string | fovwebdb | Database name |
| `MEDIA_ROOT` | string | ./media | HLS segments storage path |
| `FFMPEG_PATH` | string | ffmpeg | FFmpeg executable path |
| `SRT_PORT` | number | 9999 | SRT listener port |
| `CORS_ORIGIN` | string | * | Allowed CORS origin |

---

## 🔑 Key Commands

```bash
# Development
npm run dev              # Start with auto-reload (nodemon)
npm start               # Start production server

# Testing
npm test                # Run all tests
npm run test:db         # Test database connection
npm run test:api        # Test API endpoints
npm run test:media      # Test FFmpeg functionality

# Code Quality
npm run lint            # Run ESLint
npm run lint:fix        # Auto-fix linting issues
npm run sonar           # Generate SonarQube report

# Docker
docker build -t fov-backend .
docker run -d --name fov -p 4000:4000 --env-file .env fov-backend
docker-compose up -d
docker-compose logs -f
docker-compose down

# Database
npm run migrate         # Run database migrations
npm run db:seed         # Seed database with test data

# Utilities
npm run clean           # Remove media/hls files
npm run health-check    # System health diagnostic
```

---

## 🗄️ Database Schema

### Tables

#### users
```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    avatar_url VARCHAR(255),
    bio TEXT,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username)
);
```

#### categories
```sql
CREATE TABLE categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) UNIQUE,
    description TEXT,
    image_url VARCHAR(255),
    viewers INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name)
);
```

#### streams
```sql
CREATE TABLE streams (
    id VARCHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category_id INT,
    status ENUM('offline', 'active', 'ended') DEFAULT 'offline',
    viewers INT DEFAULT 0,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    hls_playlist_url VARCHAR(255),
    thumbnail_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_started_at (started_at)
);
```

#### stream_tracks
```sql
CREATE TABLE stream_tracks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stream_id VARCHAR(36) NOT NULL,
    track_number INT NOT NULL,
    bitrate INT,
    resolution VARCHAR(32),
    codec VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE,
    UNIQUE KEY unique_track (stream_id, track_number)
);
```

---

## 📹 Media Processing Pipeline

### FFmpeg Workflow

```
SRT Stream Input (Port 9999)
    │
    ▼
FFmpeg Process
    │
    ├─ Input: SRT listener with optimized parameters
    │   (latency=4s, buffer=128MB, error detection)
    │
    ├─ Processing:
    │   - Detect video/audio tracks
    │   - Copy codec (no re-encoding for speed)
    │   - Segment into HLS chunks (2 seconds each)
    │
    └─ Output:
        └─ ./media/hls/{streamId}/
            ├─ 0/
            │   ├─ playlist.m3u8 (track 0)
            │   ├─ seg00001.ts
            │   ├─ seg00002.ts
            │   └─ ...
            ├─ 1/
            │   └─ ...
            └─ ...
```

### SRT Configuration

**Optimized for low-latency streaming**:
```javascript
const srtParams = {
    mode: 'listener',           // Server mode
    latency: 4000000,          // 4 seconds
    rcvbuf: 134217728,         // 128 MB
    sndbuf: 134217728,         // 128 MB
    peerlatency: 4000000,      // 4 seconds
    tlpktdrop: 0,              // Drop packets on timeout
    nakreport: 1,              // NAK feedback
    connect_timeout: 5000      // Connection timeout
};
```

### HLS Configuration

```javascript
ffmpeg_args: {
    hls_time: 2,               // 2-second segments
    hls_list_size: 15,         // 30 seconds of buffer (15 × 2s)
    hls_flags: 'delete_segments+independent_segments+omit_endlist',
    hls_segment_type: 'mpegts', // MPEG-TS container
    hls_segment_filename: 'seg%05d.ts'
};
```

---

## 📊 Error Handling & Logging

### Logging Strategy

```javascript
// Request logging (Morgan)
app.use(morgan('dev')); // dev: :remote-addr :method :url :status :response-time ms

// Error logging
try {
    // operation
} catch (err) {
    console.error('Context message:', err); // Logged to stdout
    next(err); // Pass to error handler
}

// Global error handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});
```

### Error Examples

| Scenario | Status | Response |
|----------|--------|----------|
| Missing query param | 400 | `{error: "username required"}` |
| Database connection fails | 500 | `{error: "Unable to connect to DB"}` |
| Stream not found | 404 | `{error: "Stream not found"}` |
| FFmpeg spawn fails | 500 | `{error: "Media server error"}` |

### Logging Output Examples

```
Development:
  GET / 200 1.234 ms
  ✅ Connected to BDD
  📺 HLS available at http://localhost:4000/hls
  📀 Spawning FFmpeg for stream abc-123

Production:
  [2025-03-14T12:00:00Z] GET /api/streams 200
  [2025-03-14T12:00:05Z] ℹ️ FFmpeg for stream abc-123 exited (code=0)
  [2025-03-14T12:00:10Z] 📊 Active streams: 5
```

---

## 🔒 Security Considerations

### Current Implementation

✅ **CORS**: Restrict cross-origin requests
✅ **dotenv**: Secure configuration management
✅ **Error Handling**: Generic error messages to clients
✅ **HTTP Methods**: Proper REST semantics

### Recommended Enhancements (see SECURITY.md)

⚠️ **Authentication**: Implement JWT-based auth for API
⚠️ **Input Validation**: Add request validation middleware
⚠️ **Rate Limiting**: Prevent abuse on public endpoints
⚠️ **Database Hardening**: Parameterized queries, principle of least privilege
⚠️ **Secrets Management**: Use HashiCorp Vault or AWS Secrets Manager
⚠️ **HTTPS/TLS**: Enforce encrypted communication
⚠️ **OWASP Compliance**: SQL injection, XSS, CSRF mitigation
⚠️ **Monitoring**: Alert on suspicious activity

---

## ⚡ Performance & Optimization

### Current Optimizations

| Aspect | Implementation |
|--------|----------------|
| **Database** | Connection pooling (5 connections) |
| **Streaming** | SRT optimized for low latency |
| **Codec** | Copy codec (no re-encoding) |
| **Segments** | 2-second chunks for quick adaptation |
| **Buffering** | 128MB SRT buffers |

### Metrics to Monitor

```
- Response time (p50, p95, p99)
- FFmpeg process memory usage
- Database query execution time
- HLS segment generation latency
- Active stream count
- Error rate (5xx responses)
```

### Scaling Strategy

```
Vertical:    Increase server resources (CPU, RAM)
Horizontal:  Add Nginx load balancer + multiple backend instances
Caching:     Cache category list, user profiles
CDN:         Distribute HLS segments via edge servers
```

---

## 🔧 Troubleshooting

### Common Issues

#### 1. "Unable to connect to DB" Error
```bash
# Check MySQL is running
sudo systemctl status mysql

# Verify credentials in .env
echo $DB_HOST $DB_USER

# Test connection directly
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME -e "SELECT 1"
```

#### 2. FFmpeg Not Found
```bash
# Install FFmpeg
brew install ffmpeg          # macOS
sudo apt install ffmpeg      # Ubuntu

# Verify installation
ffmpeg -version

# Update .env with correct path
which ffmpeg
```

#### 3. SRT Connection Timeout
```bash
# Check SRT port is listening
lsof -i :9999

# Test SRT connectivity
ffmpeg -f lavfi -i testsrc=size=320x240:duration=5:rate=30 \
  -f lavfi -i sine=frequency=1000:duration=5 \
  -c:v libx264 -c:a aac \
  'srt://localhost:9999?peerlatency=4000000'
```

#### 4. HLS Playlist Not Generating
```bash
# Check media directory permissions
ls -la media/hls/
chmod -R 755 media/

# Monitor FFmpeg process logs
ps aux | grep ffmpeg
tail -f logs/ffmpeg.log
```

#### 5. High Memory Usage
```bash
# Monitor FFmpeg processes
top -p $(pgrep -f ffmpeg | tr '\n' ',')

# Check HLS segment accumulation
du -sh media/hls/

# Clear old segments
npm run clean
```

---

## 📚 Additional Resources

- [Architecture Details](./TECHNICAL.md)
- [Security Hardening Guide](./SECURITY.md)
- [Change Log](./CHANGELOG.md)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [SRT Protocol Spec](https://github.com/Haivision/srt)
- [HLS Specification](https://tools.ietf.org/html/draft-pantos-http-live-streaming)
- [Express.js Guide](https://expressjs.com/)

---

## 📝 License & Contribution

FOV Backend is part of the FOV project. For contribution guidelines, see the main project README.

---

**Last Updated**: 2025-03-14
**Version**: 0.1.0
**Maintainer**: FOV Development Team
