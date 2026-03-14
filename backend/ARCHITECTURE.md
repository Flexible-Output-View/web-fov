# FOV Backend - Architecture & Deployment Diagrams

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FOV LIVE STREAMING BACKEND                         │
│                              (Port: 4000)                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────── INGESTION LAYER ──────────────────────────────────┐
│                                                                              │
│  ┌──────────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │   SRT LISTENER (Port 9999)    │  │   HTTP Endpoints (Express.js)       │ │
│  │  ┌────────────────────────┐   │  │  ┌────────────────────────────────┐ │ │
│  │  │ FFmpeg SRT Input Mode  │   │  │  │ POST /register                 │ │ │
│  │  │ - Multi-track support  │   │  │  │   Register stream metadata     │ │ │
│  │  │ - Low latency (4s)     │   │  │  │                                │ │ │
│  │  │ - Error correction     │   │  │  │ POST /start                    │ │ │
│  │  │ - Large buffers (128MB)│   │  │  │   Start stream & FFmpeg spawn  │ │ │
│  │  │                        │   │  │  │                                │ │ │
│  │  │ Streamer Connection   │   │  │  │ POST /stop                     │ │ │
│  │  │ (OBS/FFmpeg Client)   │   │  │  │   Terminate stream             │ │ │
│  │  └────────────────────────┘   │  │  └────────────────────────────────┘ │ │
│  └──────────────────────────────┘  └──────────────────────────────────────┘ │
│          │                                          │                        │
│          │ (SRT Stream Data)                        │ (JSON Requests)       │
│          └───────────────────────┬──────────────────┘                        │
│                                  ▼                                           │
└──────────────────────────────────┼────────────────────────────────────────────┘
                                   │
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              ▼
┌──────────────────────────────┐      ┌────────────────────────────┐
│   MEDIA PROCESSING LAYER     │      │   DATA ACCESS LAYER        │
│  ┌─ mediaServer.mjs          │      │  ┌─ db.js                  │
│  │                           │      │  │                         │
│  │ FFmpeg Process Factory    │      │  │ Connection Pool (5)     │
│  │ ├─ Spawn process          │      │  │ ├─ Reusable connections │
│  │ ├─ Monitor lifecycle      │      │  │ ├─ Error recovery       │
│  │ ├─ Pipe SRT → FFmpeg      │      │  │ ├─ Auto-release         │
│  │ ├─ Handle exit events     │      │  │                         │
│  │ └─ Cleanup files          │      │  │ Parameterized Queries   │
│  │                           │      │  │ ├─ SQL injection safe    │
│  │ Stream Registry           │      │  │ ├─ Error propagation    │
│  │ ├─ Active processes map   │      │  │ └─ Try/finally cleanup  │
│  │ ├─ Stream metadata        │      │  └─────────────────────────┘
│  │ ├─ Track information      │      │
│  │ └─ Socket management      │      │
│  └─────────────────────────┘      │
│         │                          │
│         ▼                          ▼
│  HLS Segmentation Output    MySQL Database
│  ├─ ./media/hls/            ├─ users
│  │  ├─ {streamId}/          ├─ categories
│  │  │  ├─ 0/                ├─ streams
│  │  │  │  ├─ playlist.m3u8  └─ stream_tracks
│  │  │  │  ├─ seg00001.ts
│  │  │  │  └─ seg00002.ts
│  │  │  └─ 1/...
│  │  └─ ...
└─────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                         DELIVERY LAYER                                        │
│                     (HLS HTTP Live Streaming)                                │
│                                                                              │
│  Media Routes Handler (Express Middleware)                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ GET /hls/:streamId/:track/playlist.m3u8                               │ │
│  │   Serves HLS master playlist                                           │ │
│  │   Response: #EXTM3U ... [segment list]                                │ │
│  │   Headers: Cache-Control: max-age=2, Content-Type: application/vnd... │ │
│  │                                                                        │ │
│  │ GET /hls/:streamId/:track/seg:number.ts                              │ │
│  │   Serves TS segments (2 seconds each)                                 │ │
│  │   Response: Binary MPEG-TS data                                       │ │
│  │   Headers: Cache-Control: max-age=86400 (immutable)                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ CORS Headers Applied (if origin matches CORS_ORIGIN)                    ││
│  │ ├─ Access-Control-Allow-Origin                                         ││
│  │ ├─ Access-Control-Allow-Methods                                        ││
│  │ └─ Access-Control-Allow-Headers                                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
         │                                                                      
         ▼                                                                      
┌──────────────────────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                                            │
│                                                                              │
│  Angular Frontend / Web Browser                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 1. Fetch Stream List & Metadata                                        ││
│  │    GET /api/users/:id, GET /api/categories, GET /api/streams          ││
│  │                                                                         ││
│  │ 2. Get HLS Playlist                                                    ││
│  │    GET /hls/{streamId}/0/playlist.m3u8                                ││
│  │                                                                         ││
│  │ 3. Download Segments (Adaptive)                                       ││
│  │    GET /hls/{streamId}/0/seg00001.ts                                  ││
│  │    GET /hls/{streamId}/0/seg00002.ts -> switch to track 1 if slow    ││
│  │    GET /hls/{streamId}/1/seg00003.ts                                  ││
│  │                                                                         ││
│  │ 4. Play via HLS.js Library (in-browser player)                       ││
│  │    ├─ Manifest parsing                                                ││
│  │    ├─ Segment buffering                                               ││
│  │    ├─ Bitrate adaptation                                              ││
│  │    └─ Playback rendering                                              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## API Routes Hierarchy

```
Express App (Port 4000)
│
├─ Middleware Stack
│  ├─ morgan (request logging)
│  ├─ cors (cross-origin headers)
│  ├─ express.json (body parser)
│  └─ trust proxy (X-Forwarded-* headers)
│
├─ Media Routes (no /api prefix)
│  ├─ GET  /hls/:streamId/:track/playlist.m3u8
│  ├─ GET  /hls/:streamId/:track/seg:number.ts
│  ├─ POST /register (stream registration)
│  ├─ POST /start (spawn FFmpeg)
│  └─ POST /stop (terminate stream)
│
├─ Health Check
│  └─ GET  /
│
├─ API Routes (prefix /api)
│  │
│  ├─ /categories
│  │  ├─ GET  / (list all)
│  │  └─ GET  /:id (detail)
│  │
│  ├─ /streams
│  │  ├─ GET  / (list active)
│  │  └─ GET  /:id (detail + HLS URL)
│  │
│  └─ /users
│     ├─ GET  /:id (profile)
│     └─ POST / (create user)
│
└─ Error Handler (global catch-all)
   └─ (err, req, res, next) => 500 response
```

---

## Database Schema Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     MySQL Database                          │
│                    (fovwebdb)                               │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐      ┌──────────────────────┐
│      users           │      │    categories        │
├──────────────────────┤      ├──────────────────────┤
│ id (PK)              │      │ id (PK)              │
│ username (UNIQUE)    │      │ name (UNIQUE)        │
│ display_name         │      │ slug                 │
│ avatar_url           │      │ description          │
│ bio                  │      │ image_url            │
│ verified             │      │ viewers              │
│ created_at           │      │ created_at           │
│ updated_at           │      │ updated_at           │
└──────────┬───────────┘      └──────────┬───────────┘
           │ (1)                         │ (1)
           │ has many                    │ has many
           │                             │
           │                     ┌───────▼──────────────┐
           │                     │    streams           │
           │                     ├──────────────────────┤
           │                     │ id (VARCHAR 36, PK)  │
           │                     │ user_id (FK) ────────┼──┐
           │                     │ title                │  │
           │                     │ description          │  │
           │                     │ category_id (FK) ──┐│  │
           │                     │ status (enum)      ││  │
           │                     │ viewers             ││  │
           │                     │ started_at          ││  │
           │                     │ ended_at            ││  │
           │                     │ hls_playlist_url    ││  │
           │                     │ thumbnail_url       ││  │
           │                     │ created_at          ││  │
           │                     │ updated_at          ││  │
           │                     └───────┬─────────────┘│  │
           │                             │ (1:many)    │  │
           │                             │             │  │
           └─────────────────────────────┘             │  │
                                                       ▼  ▼
                                        ┌──────────────────────┐
                                        │   stream_tracks      │
                                        ├──────────────────────┤
                                        │ id (PK)              │
                                        │ stream_id (FK) ──────┼──┐
                                        │ track_number         │  │
                                        │ bitrate              │  │
                                        │ resolution           │  │
                                        │ codec                │  │
                                        │ created_at           │  │
                                        │                      │  │
                                        │ UNIQUE (stream_id,   │  │
                                        │         track_num)   │  │
                                        └──────────────────────┘  │
                                                       ▲           │
                                                       │           │
                                                       └───────────┘

Relationships:
├─ users.id (1:N) streams.user_id
├─ categories.id (1:N) streams.category_id
└─ streams.id (1:N) stream_tracks.stream_id
```

---

## Deployment Architecture

### Development Environment

```
Developer Machine
│
├─ Node.js Runtime (v18+)
├─ Express.js (Port 4000)
├─ Local MySQL (Port 3306)
├─ FFmpeg (CLI tool)
└─ Media Storage (./media/hls/)

Execution Flow:
.env (dev) → index.js → Express → Morgan → CORS → Routes → DB / FFmpeg
```

### Docker Compose (Local)

```
┌──────────────────────────────────────────────────────────────┐
│           Docker Compose (docker-compose.yml)                │
└──────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────┐
│     fov-backend Service             │
│  Image: fov-backend:latest          │
│  Ports: 4000:4000, 9999:9999        │
│  Volumes:                           │
│  ├─ ./backend/src → /app/src        │
│  ├─ ./media → /app/media            │
│  └─ .env → /app/.env                │
│  Env: NODE_ENV=development          │
│  Depends: mysql                     │
└─────────────────────────────────────┘
         │
         ├─ Port Mapping 4000:4000 (HTTP)
         ├─ Port Mapping 9999:9999 (SRT)
         └─ Volume Mount /app/media (persistent)

┌─────────────────────────────────────┐
│      MySQL Service                  │
│  Image: mysql:8.0                   │
│  Ports: 3306:3306                   │
│  Volumes:                           │
│  ├─ mysql-data → /var/lib/mysql    │
│  └─ init.sql → /docker-entrypoint- │
│              mysql.d/               │
│  Environment:                       │
│  ├─ MYSQL_ROOT_PASSWORD=password    │
│  ├─ MYSQL_DATABASE=fovwebdb        │
│  └─ MYSQL_USER=fov_user            │
└─────────────────────────────────────┘

Network: fov-network (bridge)
Volume: mysql-data (persistent)
```

### Production Deployment (Cloud)

```
┌────────────────────────────────────────────────────────────────┐
│              Cloud Infrastructure (AWS/GCP/Azure)              │
└────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │  DNS + CDN (Cloudflare) │
                    │  ■ api.fov.example.com  │
                    └───────────┬──────────────┘
                                │ HTTPS (TLS)
                    ┌───────────▼──────────────┐
                    │   Load Balancer         │
                    │   (Nginx / HAProxy)     │
                    │   Port 443              │
                    └───┬───────────────┬─────┘
                        │               │
        ┌───────────────┤               ├──────────────┐
        │               │               │              │
        ▼               ▼               ▼              ▼
    ┌────┐         ┌────┐         ┌────┐         ┌────┐
    │BE-1│         │BE-2│         │BE-3│  ...    │BE-N│
    └────┘         └────┘         └────┘         └────┘
      │              │              │              │
      └──────┬───────┴──────┬───────┴──────────────┘
             │               │
             ├─ Media Storage (S3 / GCS)
             │   ├─ ./media/hls/ (HLS segments)
             │   └─ Auto-scaling based on usage
             │
             └─ Shared MySQL Cluster
                 ├─ Primary (writes)
                 ├─ Replica 1 (read)
                 ├─ Replica 2 (read)
                 ├─ Automated backups
                 └─ Point-in-time recovery

Monitoring Stack:
  ├─ Prometheus (metrics collection)
  ├─ Grafana (visualization)
  ├─ ELK Stack (logging)
  │  ├─ Elasticsearch
  │  ├─ Logstash
  │  └─ Kibana
  └─ PagerDuty (alerting)
```

---

## Data Flow Sequence Diagram

### Stream Ingestion Sequence

```
Streamer (OBS)    Backend    MySQL    FFmpeg
    │                │          │         │
    │ HTTP POST      │          │         │
    ├─ /register ───>│          │         │
    │                │ INSERT   │         │
    │                ├─ stream ─>         │
    │                │<────────┤          │
    │                │ {streamId}         │
    │<─ {streamId} ──┤          │         │
    │                │          │         │
    │ SRT Connection │          │         │
    ├─ srt://... ───────────┐  │         │
    │                        │  │         │
    │ HTTP POST              │  │         │
    ├─ /start ──────────────>│  │         │
    │   {streamId, tracks:2} │  │         │
    │                        │  │         │
    │                        │ UPDATE    │
    │                        │ status='active'
    │                        │           │
    │                        │ spawn async
    │                        ├──────────>│
    │                        │           │
    │ SRT Raw Video Data     │ stdin     │
    ├─────────────────────────────────>│
    │                        │           │ HLS Segmentation
    │                        │           │ Generates:
    │                        │           │ - ./media/hls/
    │                        │           │   {streamId}/0/
    │                        │           │   seg*.ts
    │                        │           │ - playlist.m3u8
    │                        │           │
    │ HTTP GET               │           │
    │ /hls/streamId/.../pl.m3u8 │       │
    │<────────────────────────────       │
    │                        │           │
    │ HTTP GET seg00001.ts   │           │
    │<────────────────────────────       │
    │                        │           │
    │ HTTP GET seg00002.ts   │           │
    │<────────────────────────────       │
    │                        │           │
    │ (Connected for ~30 min │           │
    │  streaming live)       │           │
    │                        │           │
    │ HTTP POST              │           │
    ├─ /stop ───────────────>│           │
    │                        │           │
    │                        │ UPDATE    │
    │                        │ status='offline'
    │                        │           │
    │                        │ (kill)───>│
    │                        │           │ Clean up files
    │                        │           │ Release resources
    │                        │<──────────┤
    │                        │           │
    │                        │ DELETE    │
    │                        │ HLS files │
    │                        │           │
    │ disconnect             │           │
    └─────────────────────────────────────
```

---

## Module Dependencies

```
index.js
├─ express
├─ morgan (logging)
├─ cors
├─ dotenv (config)
│
├─ db.js
│  └─ mysql2/promise
│
├─ mediaServer.mjs
│  ├─ express (for router)
│  ├─ fs (file operations)
│  ├─ path (directory handling)
│  ├─ child_process (FFmpeg spawning)
│  └─ crypto (random stream IDs)
│
└─ routes/
   ├─ categories.js
   │  ├─ express
   │  └─ db.js
   │
   ├─ streams.js
   │  ├─ express
   │  ├─ db.js
   │  ├─ fs (playlist reading)
   │  └─ path
   │
   └─ users.js
      ├─ express
      └─ db.js
```

---

## Error Handling Flow

```
HTTP Request
  │
  ▼
Route Handler (try/catch)
  │
  ├─ Error Thrown
  │  │
  │  ▼
  │ catch (err)
  │  │
  │  ▼
  │ next(err)  ◄─── Pass to error handler
  │
  ├─ OR ─ Success
  │  │
  │  ▼
  │ res.json/status(200)
  │
  ▼
Global Error Handler
  │
  ├─ console.error(err)  ◄─── Log (stdout/file)
  │
  ├─ res.status(code)    ◄─── Determine HTTP code
  │
  └─ res.json({error})   ◄─── Send to client
```

---

**Diagram Version**: 0.1.0
**Last Updated**: 2025-03-14
