# FOV Backend - Technical Architecture & Design Document

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Design Patterns & Decisions](#design-patterns--decisions)
3. [Data Flow & State Management](#data-flow--state-management)
4. [Module Deep Dives](#module-deep-dives)
5. [Technology Rationale](#technology-rationale)
6. [Roadmap & Future Improvements](#roadmap--future-improvements)

---

## System Architecture

### Layered Architecture Model

FOV Backend implements a **3-tier HTTP + Media Server architecture**:

```
┌─────────────────────────────────────┐
│   Presentation Layer                │
│   (HTTP Endpoints / REST API)       │
├─────────────────────────────────────┤
│   Service Layer                     │
│   (Media Processing / DB Services)  │
├─────────────────────────────────────┤
│   Data Access Layer                 │
│   (Database Connections / Storage)  │
├─────────────────────────────────────┤
│   External Systems                  │
│   (MySQL / FFmpeg / File System)    │
└─────────────────────────────────────┘
```

### Component Responsibility Matrix

| Component | Responsibility | Technology |
|-----------|----------------|-----------|
| **index.js** | App initialization, middleware setup, route mounting | Express.js |
| **db.js** | Database abstraction, connection pooling, query execution | mysql2/promise |
| **mediaServer.mjs** | FFmpeg process management, HLS generation, stream lifecycle | Child Process, FFmpeg |
| **routes/\*.js** | HTTP endpoint handlers, request validation, response formatting | Express.js |

---

## Design Patterns & Decisions

### 1. Connection Pooling Pattern

**Implementation**: MySQL Connection Pool (5 connections)

```javascript
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 5,  // Max 5 concurrent connections
    enableKeepAlive: true,
});

// Single connection lifecycle
async getConnection() {
    const conn = await pool.getConnection();
    try {
        return await conn.query(sql, params);
    } finally {
        conn.release(); // Return to pool
    }
}
```

**Rationale**:
- Avoids connection exhaustion
- Reuses connections (expensive to create)
- Automatic cleanup via try/finally
- Enables concurrent requests without thread creation

**Considerations**:
- Pool size empirically set to 5 (suitable for ≤100 concurrent users)
- Scaling: Increase to 10-20 for 1000+ users
- Monitor: Track active connections and wait queue depth

---

### 2. Process Management Pattern

**FFmpeg as Managed Subprocess**

```javascript
// Track running processes
const ffmpegProcesses = new Map(); // {streamId -> {process, tracks, socket, stopped}}

function startFFmpegListener(streamId, tracks, socket, srtUrl = null) {
    const ffmpegProc = spawn("ffmpeg", ffmpegArgs, {
        stdio: srtUrl ? ["inherit", "inherit", "inherit"] : ["pipe", "inherit", "inherit"]
    });

    // Handle lifecycle events
    ffmpegProc.on("exit", (code, signal) => {
        ffmpegProcesses.delete(streamId);
        clearStreamHLSFiles(streamId);
    });

    ffmpegProc.on("error", (err) => {
        console.error(`FFmpeg spawn failed: ${err}`);
        socket.destroy();
    });

    ffmpegProcesses.set(streamId, { process: ffmpegProc, tracks, socket, stopped: false });
}
```

**Rationale**:
- FFmpeg is CPU/IO intensive; subprocess isolation prevents blocking event loop
- Map-based tracking enables per-stream lifecycle management
- Event handlers ensure cleanup (prevent zombie processes)

**Scaling Implications**:
- N streams = N FFmpeg processes (resource-intensive)
- CPU becomes bottleneck at ~50 concurrent streams (assuming 2-core VM)
- Solution: Multi-instance load balancing or dedicated media server

---

### 3. Middleware Chain Pattern

```javascript
// Setup order is critical
app.use(morgan('dev'));                    // 1. Request logging
app.use(cors());                           // 2. CORS headers
app.use(express.json());                   // 3. Body parsing
app.enable('trust proxy');                 // 4. Proxy awareness
app.use(mediaRouter);                      // 5. Media routes (no /api prefix)
app.get('/', (req, res) => ...);           // 6. Health check
app.use('/api', apiRoutes);                // 7. API routes
app.use((err, req, res, next) => ...);     // 8. Error handler (last)
```

**Order Matters**:
1. Logging captures all requests
2. CORS must precede route handlers
3. Body parser before routes (for POST)
4. Error handler MUST be last

---

### 4. Error Handling Pattern

**Centralized Error Handler**:

```javascript
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});
```

**Route-level try/catch**:

```javascript
router.get('/:id', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ data: rows[0] });
    } catch (err) {
        next(err); // Pass to global handler
    }
});
```

**Error Flow**:
```
Route Handler Exception
    ↓
try/catch → next(err)
    ↓
Global Error Handler
    ↓
Log + Response to Client
```

---

## Data Flow & State Management

### Stream Lifecycle State Machine

```
                ┌─ /register ─────────────┐
                │                         ▼
            [REGISTERED]             (Store metadata)
                │
                │ (SRT connection arrives)
                │
                ▼
            [STARTING]
                │ ├─ Validate credentials
                │ ├─ Spawn FFmpeg subprocess
                │ └─ Set up event handlers
                ▼
            [STREAMING]
                │ ├─ Accept input via SRT socket
                │ ├─ Generate HLS playlists
                │ └─ Track viewer count
                │
         ┌──── ┴─────────────────────┐
         │                           │
      /stop                    (connection lost)
         │                           │
         ▼                           ▼
    [STOPPING]               [DISCONNECTED]
         │                           │
         └──────────┬────────────────┘
                    │
         ├─ Kill FFmpeg
         ├─ Clean HLS files
         ├─ Update DB status
         │
         ▼
    [OFFLINE]
```

### Data Consistency Considerations

**Race Condition Example**:
```javascript
// ❌ UNSAFE: Between check and operation
if (!ffmpegProcesses.has(streamId)) {
    startFFmpegListener(streamId);  // What if FFmpeg started between check and spawn?
}

// ✅ SAFE: Atomic operation
function startStream(streamId) {
    if (ffmpegProcesses.has(streamId)) {
        return { error: 'Stream already started' };
    }
    // Start process immediately (no gap)
    startFFmpegListener(streamId);
}
```

**Database Consistency**:
- Stream table has `status` enum (offline|active|ended)
- Always update DB status to reflect FFmpeg state
- No state in memory without database backup

---

## Module Deep Dives

### db.js - Database Abstraction Layer

**Purpose**: Provide safe, pooled database access

**Key Methods**:

```javascript
// Connection lifecycle management
async getConnection() {
    return pool.getConnection();
}

// Parameterized query (prevents SQL injection)
async query(sql, params) {
    const conn = await pool.getConnection();
    try {
        const res = await conn.query(sql, params);
        return res;  // Returns [rows, fields]
    } finally {
        conn.release();
    }
}
```

**Design Decisions**:
- Always use parameterized queries (`?` placeholders)
- Try/finally ensures connection release even on error
- Pool limits to 5 prevents connection explosion
- No transaction support (yet) - suitable for current scale

**Future Improvements**:
- Transaction support for atomic multi-table operations
- Query result caching (Redis)
- Connection metrics (active, waiting, idle)

---

### mediaServer.mjs - Live Media Processing

**Purpose**: Manage FFmpeg-based HLS streaming

**Key Responsibilities**:

1. **Stream Registration** (POST /register)
   - Validate stream metadata
   - Assign SRT port
   - Store in registeredStreams Map

2. **Stream Start** (POST /start)
   - Accept SRT connection socket
   - Spawn FFmpeg subprocess
   - Connect socket → FFmpeg stdin
   - Set up event listeners

3. **Stream Stop** (POST /stop)
   - Send SIGINT to FFmpeg
   - Close SRT socket
   - Clean HLS segment files
   - Update database status

4. **HLS Delivery** (GET /hls/:streamId/:track/...)
   - Serve generated playlists (M3U8)
   - Serve cached segments (TS files)
   - Implement caching headers

**FFmpeg Process Arguments Breakdown**:

```javascript
const ffmpegArgs = [
    // Input validation & error recovery
    "-err_detect", "ignore_err",              // Tolerate format errors
    "-fflags", "+genpts+discardcorrupt+igndts", // Generate timestamps
    "-flags", "low_delay",                    // Minimize buffering
    
    // Input source (SRT or pipe)
    "-strict", "experimental",
    "-i", srtUrl || "pipe:",
    
    // Video mapping (multi-track support)
    "-map", "0:v:0", "-map", "0:a?",         // Map first video + any audio
    "-map", "0:v:1", "-map", "0:a?",         // Map second video track
    
    // Codec strategy (copy = no re-encoding)
    "-c:v", "copy",                          // Copy video bitstream
    "-c:a:0", "copy", "-c:a:1", "copy",    // Copy audio
    
    // HLS segmentation
    "-f", "hls",
    "-hls_time", "2",                        // 2-second segments
    "-hls_list_size", "15",                  // Keep 15 segments in buffer
    "-hls_flags", "delete_segments+independent_segments+omit_endlist",
    "-hls_segment_filename", "seg%05d.ts",
    
    // Output patterns
    "-var_stream_map", "v:0,a:0 v:1,a:1",  // Track mapping
    "playlist%v.m3u8"                        // Per-track playlists
];
```

**HLS Playlist Structure**:
```
./media/hls/{streamId}/
├── 0/                              // Track 0 (720p)
│   ├── playlist.m3u8               // HLS Master playlist
│   ├── seg00001.ts                 // 2-second segment
│   ├── seg00002.ts
│   └── ...
├── 1/                              // Track 1 (480p)
│   ├── playlist.m3u8
│   ├── seg00001.ts
│   └── ...
└── master.m3u8                     // Multi-bitrate playlist
```

---

### routes/\*.js - API Endpoints

**Architecture**: Each resource type (users, categories, streams) gets dedicated router

**Pattern**:
```javascript
import express from 'express';
const router = express.Router();
import db from '../db.js';

// List endpoint
router.get('/', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT ... FROM ...');
        res.json(rows[0]);  // mysql2 returns [rows, fields]
    } catch (err) {
        next(err);
    }
});

// Detail endpoint
router.get('/:id', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT ... WHERE id = ?', [req.params.id]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Not found' });
        }
        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

export default router;
```

**Response Format Consistency**:
- List: `[{...}, {...}]`
- Detail: `{data: {...}}`
- Error: `{error: "message"}`

---

## Technology Rationale

### Why Node.js ES Modules (not CommonJS)

```javascript
// ✅ ES Modules (modern, future-proof)
import express from 'express';
import db from './db.js';

// ❌ CommonJS (legacy)
const express = require('express');
const db = require('./db.js');
```

**Rationale**:
- Native ES6 import/export
- Better tree-shaking (unused code elimination)
- Standard across modern JavaScript ecosystem
- Requires `"type": "module"` in package.json

---

### Why Express (not Fastify/Koa)

| Framework | Performance | Ecosystem | Learning Curve | Decision |
|-----------|-----------|-----------|----------------|----------|
| Express | Good | Massive | Low | ✅ Chosen |
| Fastify | Better | Growing | Moderate | Overkill for this scale |
| Koa | Good | Good | Moderate | Less battle-tested |

**Rationale for Express**:
- Mature, battle-tested (10+ years)
- Vast middleware ecosystem
- Excellent documentation
- Performance sufficient for current load (< 100 RPS)
- Team familiarity

---

### Why SRT (not RTMP)

| Protocol | Latency | Encryption | Reliability | Status |
|----------|---------|-----------|-----------|--------|
| SRT | Low (4s) | Built-in | ARQ | ✅ Modern |
| RTMP | Medium (8s) | Poor | None | ❌ Deprecated |
| RTMPS | Medium | TLS | None | ⚠️ Workaround |

**Rationale**:
- RTMP is Adobe proprietary, no longer maintained
- SRT designed for modern internet (variable bandwidth)
- Lower latency (4s vs 20s for RTMP)
- Security built-in (AES encryption)
- Growing adoption (YouTube, Twitch exploring)

---

### Why HLS (not DASH)

| Format | Compatibility | Complexity | Adaptation | Decision |
|--------|------------|-----------|-----------|----------|
| HLS | Excellent (iOS native) | Simple | Good | ✅ Chosen |
| DASH | Good | Complex | Just as good | Not needed |

**Rationale**:
- Native iOS/macOS support
- Simpler manifest format (M3U8 vs XML)
- Sufficient adaptive bitrate support
- Easier CDN integration
- Most streaming services default to HLS

---

## Roadmap & Future Improvements

### Phase 2: Authentication & Security (Next Quarter)

```javascript
// Add JWT authentication middleware
import jwt from 'jsonwebtoken';

function isAuthenticated(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// Protect routes
router.post('/streams', isAuthenticated, async (req, res) => {
    // Now req.user.id is available
});
```

### Phase 3: Advanced Streaming Features (6 Months)

1. **Adaptive Bitrate Encoding**
   - Generate 3+ quality tiers (1080p, 720p, 480p, 360p)
   - Per-track bitrate balancing
   - Client bandwidth detection

2. **Stream Recording**
   - Save HLS segments to persistent storage
   - VOD (Video on Demand) support
   - Archive management

3. **Analytics & Monitoring**
   - View count tracking
   - Bandwidth usage metrics
   - FFmpeg process health checks
   - ELK stack integration

### Phase 4: Scalability & Infrastructure (1 Year)

1. **Horizontal Scaling**
   ```
   ┌─────────────┐
   │   Nginx     │ (Load balancer)
   └────┬┬┬──────┘
        │││
   ┌────┘│├────────┐
   │     │         │
   ▼     ▼         ▼
Backend-1 Backend-2 Backend-3  (Media streaming)
   ```

2. **Distributed Media Storage**
   - S3-compatible object storage (MinIO)
   - GCS/S3 CDN integration
   - Regional edge servers

3. **Microservices (Optional)**
   - Separate media-server service
   - Dedicated database
   - Message queue (Redis/RabbitMQ)

---

## Monitoring & Observability

### Key Metrics to Track

```
Application Metrics:
├─ HTTP Response Time (p50, p95, p99)
├─ Request Error Rate (5xx)
├─ Active FFmpeg Processes
├─ HLS Segment Generation Latency
├─ Database Query Execution Time
└─ CORS Rejected Requests

Infrastructure Metrics:
├─ CPU Usage (%)
├─ Memory Usage (%)
├─ Disk Space (media/hls/)
├─ Network I/O (in/out)
└─ Process Count

Streaming Metrics:
├─ Concurrent Viewers
├─ Bitrate Distribution
├─ Segment Drop Rate
└─ Connection Duration
```

### Recommended Tools

- **APM**: New Relic, DataDog
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **Metrics**: Prometheus + Grafana
- **Tracing**: Jaeger (for distributed tracing)

---

## Conclusion

FOV Backend is architected for clarity and maintainability at current scale (< 100 concurrent users). As the project grows, this document will guide evolution toward distributed systems. Each design decision prioritizes stability and code clarity over premature optimization.

**Document Version**: 0.1.0
**Last Updated**: 2025-03-14
