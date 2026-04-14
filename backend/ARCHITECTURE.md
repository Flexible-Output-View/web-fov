# FOV Backend - Architecture & Design

## 1. System Overview

The FOV Backend is a **modular Express.js REST API** with media streaming capabilities. It separates concerns into:
- **API Layer**: RESTful routes for data management
- **Database Layer**: MySQL connection pooling
- **Media Layer**: HLS video streaming (RTMP ingest)
- **Middleware Layer**: CORS, logging, error handling

```
┌─────────────────────────────────────┐
│         Client Applications          │
│    (Angular Frontend, Mobile, etc)   │
└──────────────┬──────────────────────┘
               │ HTTPS/HTTP
┌──────────────▼──────────────────────┐
│     Express.js REST API Server       │
│  (Port 4000 - Main API)              │
├──────────────────────────────────────┤
│  Routes: /api/users, /streams, etc   │
│  Middleware: CORS, Morgan, JSON      │
│  Error Handling: Centralized         │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼─────┐   ┌──────▼─────────┐
│ MySQL Pool │   │ Media Server    │
│ (Port 3306)│   │ RTMP/HLS        │
│            │   │ (Port 1935)     │
└────────────┘   └─────────────────┘
       │                │
       │                │
┌──────▼──────┐  ┌──────▼──────────┐
│  Database   │  │  Media Files    │
│  fovwebdb   │  │  /media/hls/    │
│             │  │  (segments, m3u)│
└─────────────┘  └─────────────────┘
```

---

## 2. Technology Stack & Justification

### Core Framework: **Express.js**

**Why Express?**
- Lightweight and performant
- Large ecosystem & community support
- Flexible routing and middleware system
- Minimal setup overhead (perfect for microservices)
- Battle-tested in production environments

**Alternatives Considered:**
- Fastify: Faster but smaller ecosystem; Express sufficient for our throughput
- NestJS: Excellent but heavier; unnecessary for our current scope
- Koa: Modern but less mature; Express more stable

### Database: **MySQL 8.0+**

**Why MySQL?**
- Mature, stable, widely-hosted (AWS RDS, DigitalOcean, Linode)
- ACID compliance ensures data integrity
- Good performance for structured data (users, streams, categories)
- Connection pooling support (mysql2/promise)
- Cost-effective at scale

**Schema Highlights:**
- Users: `id`, `username`, `display_name`, `created_at`
- Streams: `id`, `title`, `description`, `category_id`, `creator_id`, `status`
- Categories: `id`, `name`, `description`

### Media Streaming: **RTMP → HLS**

**Why RTMP Ingest + HLS Delivery?**

| Component | Purpose | Alternative | Why Not |
|-----------|---------|-------------|---------|
| **RTMP Input** | Encoder standard (OBS, FFmpeg) | HTTP Live Push | Limited tooling |
| **HLS Output** | HTTP-based delivery | DASH, HLS via RTMP | Most compatible (Safari, iOS native) |
| **FFmpeg** | Transcoding/segmentation | Node-media-server only | Better quality control, codec flexibility |

**Media Pipeline:**
```
Encoder → RTMP Server → FFmpeg → Segmentation → HLS Segments → CDN/Client
(OBS)     (Port 1935)  (Transcode) (/media/hls/) (.m3u8, .ts files)
```

### Connection Management: **mysql2/promise Pool**

**Why Pooling?**
- Reuses connections, reduces overhead
- Prevents "too many connections" errors
- Auto-reconnection on failure
- Default: 5 connections (configurable)

---

## 3. Module Structure & Responsibility

### `src/index.js` - Application Entry Point

**Responsibility:**
- Initialize Express app
- Configure middleware (CORS, Morgan, JSON parser)
- Mount routes and media server
- Start HTTP listener
- Handle application-level errors

**Key Design:**
- Error handler at bottom (Express middleware order)
- Database validation before server start
- Graceful error messages

### `src/db.js` - Database Access Layer

**Responsibility:**
- Create and manage connection pool
- Provide query interface
- Handle connection cleanup

**Design Pattern:** **Singleton Pool**
```javascript
const pool = mysql.createPool({...})
export default { pool, getConnection(), query() }
```

**Why:**
- Single pool instance across app lifetime
- All modules share connections
- Automatic cleanup via connection release

### `src/routes/index.js` - Route Aggregator

**Responsibility:**
- Mount sub-routers at `/api` prefix
- Provide root health check

**Separation of Concerns:**
```
/api/users → routes/users.js
/api/streams → routes/streams.js
/api/categories → routes/categories.js
```

### `src/routes/users.js` - User API

**Operations:**
- `GET /:id` - Fetch user by ID
- `POST /` - Create user (minimal validation)

**Implementation Notes:**
- Uses async/await for DB calls
- Error passed to next() middleware
- Input validation basic; strengthen in security review

### `src/routes/streams.js` - Stream Management

**Operations:**
- HLS playlist validation & serving
- Stream status checking
- Segment counting for health monitoring

**Key Functions:**
- `isPlaylistReady()` - Ensures 2+ segments before serving (reliability)
- `getSegmentCount()` - Monitors growth (debugging)

### `src/mediaServer.mjs` - Media Server

**Features:**
- RTMP server (ingest from encoders)
- RTMP → HLS transcoding
- Stream monitoring

**Why Separate File:**
- Complex live-streaming logic isolated
- Future migration to dedicated media service easier

---

## 4. Data Flow Architecture

### API Request Flow

```
Client Request (JSON)
    ↓
Express Middleware (CORS, JSON parse, logging)
    ↓
Route Handler (async)
    ↓
Database Query (mysql2/promise)
    ↓
Response (JSON)
    ↓
Error Handler (if exception)
```

### Live Stream Ingestion Flow

```
Encoder (OBS)
    ↓ RTMP (Port 1935)
RTMP Server
    ↓ Transcode
FFmpeg Process
    ↓ Segment
/media/hls/ (m3u8 + .ts files)
    ↓ HTTP GET
Client HLS Player
```

---

## 5. Error Handling Strategy

**Layers:**

1. **Application Level** (`src/index.js`):
   ```javascript
   app.use((err, req, res, next) => {
       console.error(err);
       res.status(err.status || 500).json({ error: err.message });
   });
   ```

2. **Route Level** (`src/routes/*.js`):
   ```javascript
   try {
       // DB operation
   } catch (err) {
       next(err); // Pass to app handler
   }
   ```

3. **Database Level** (`src/db.js`):
   - Finally block ensures connection release
   - Pool handles reconnection

**Future Improvements:**
- Circuit breaker for DB failover
- Structured logging (Winston, Pino)
- Error tracking (Sentry)

---

## 6. Security Architecture

**Current State:**
- ✅ CORS enabled (configurable)
- ✅ Morgan request logging
- ⚠️ No authentication (to be implemented)
- ⚠️ Basic input validation
- ⚠️ No rate limiting

**Roadmap:**
- JWT authentication for protected endpoints
- Input sanitization (SQL injection prevention)
- Rate limiting (Express-limiter)
- HTTPS enforcement in production
- Database credentials rotation

See [SECURITY.md](SECURITY.md) for detailed policies.

---

## 7. Scalability Considerations

### Current Limitations

| Component | Bottleneck | Solution |
|-----------|-----------|----------|
| **Single Express** | CPU-bound work | Cluster module / Load balancer |
| **Single DB Pool** | Connection limit | Read replicas, sharding |
| **Local Media Files** | Disk I/O | S3/Object storage + CDN |

### Scaling Strategy

**Phase 1 (Current):**
- Single region, containerized

**Phase 2:**
- Load balancer (Nginx)
- Dedicated media server (Wowza/SRT Live Server)

**Phase 3:**
- Database replication (Master-Slave)
- Media on S3 + CloudFront CDN

---

## 8. Deployment Architecture

### Development
```
Laptop → npm run dev → localhost:4000
```

### Production (Docker)
```
Dockerfile → Image → Container → Port 4000
    ↓
  Volume Mounts: /media/hls
    ↓
  Docker Network: postgres, frontend
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions.

---

## 9. Module Dependencies

```
index.js
  ├── express
  ├── cors
  ├── morgan
  ├── db.js
  │   └── mysql2/promise
  ├── routes/
  │   ├── users.js → db.js
  │   ├── streams.js → db.js, fs, path
  │   └── categories.js → db.js
  └── mediaServer.mjs

jest.config.js (Testing)
supertest (API testing)
```

---

## 10. Code Quality Standards

**Enforced by ESLint:**
- Indentation: 4 spaces
- Quotes: Single
- Semicolons: Always
- Variable: prefer `const`
- Equality: Strict (`===`)

**Testing:**
- Unit tests for critical modules (DB, routes)
- Mocked external dependencies
- 50%+ code coverage threshold

---

## 11. Version Control & Releases

**Current Version:** 0.1.0

**Versioning:** Semantic Versioning (MAJOR.MINOR.PATCH)
- MAJOR: Breaking API changes
- MINOR: New features (backwards compatible)
- PATCH: Bug fixes

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

**Document Version:** 1.0  
**Last Updated:** April 2024
