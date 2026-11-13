# Stream Configuration API

Backend contract for the stream configuration page.

**Base URL:** `${environment.apiUrl}` — already includes `/api`.

---

## Contents

1. [Authentication](#authentication)
2. [Quick reference](#quick-reference)
3. [Get stream configuration](#1-get-stream-configuration)
4. [Update stream configuration](#2-update-stream-configuration)
5. [Retrieve stream key](#3-retrieve-stream-key)
6. [Rotate stream key](#4-rotate-stream-key)
7. [Categories](#5-categories)
8. [Live streams feed](#6-live-streams-feed)
9. [Direct-link live stream](#7-direct-link-live-stream)
10. [Errors](#errors)
11. [Encoder endpoints](#encoder-endpoints)
12. [TypeScript models](#typescript-models)

---

## Authentication

All `/api/streams/me*` endpoints require a JWT:

```http
Authorization: Bearer <JWT>
```

Without it:

```json
{ "error": "Authentication required" }
```

Status: `401`

---

## Quick reference

| Method | Endpoint | Auth | Purpose |
|---|---|:---:|---|
| `GET` | `/api/streams/me` | ✅ | Get (or create) the stream configuration and key |
| `PUT` | `/api/streams/me` | ✅ | Update title, description, visibility, thumbnail, category |
| `GET` | `/api/streams/me/stream-key` | ✅ | Retrieve the stream key |
| `POST` | `/api/streams/me/stream-key/rotate` | ✅ | Revoke and regenerate the stream key |
| `GET` | `/api/categories` | ❌ | List categories for the category selector |
| `GET` | `/api/streams/available` | optional | Public live-stream feed |
| `GET` | `/api/streams/:id/live` | optional | Direct-link live stream (unlisted/private) |

---

## 1. Get stream configuration

```http
GET /api/streams/me
```

Creates the configuration and key on first access. Safe to call on page load.

### 200 — Response

```json
{
  "streamId": "u12",
  "title": "Ranked grind",
  "description": "Climbing the ladder",
  "visibility": "public",
  "thumbnailUrl": "",
  "categoryId": 1,
  "category": "League of Legends",
  "streamKey": "fov_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "isLive": false,
  "createdAt": "2026-10-23T12:00:00.000Z",
  "updatedAt": "2026-10-23T12:00:00.000Z"
}
```

### Field notes

| Field | Notes |
|---|---|
| `streamId` | Public stream id — use it for `/stream/${streamId}` links |
| `title` | Defaults to the username on first creation |
| `visibility` | `public`, `unlisted` or `private` |
| `thumbnailUrl` | URL or data URL; `""` when none |
| `categoryId` / `category` | `null` / `""` when no category is selected |
| `streamKey` | Secret, only returned to the owner |
| `isLive` | Whether an ingest is currently registered for this user |

### How the key links a stream

1. The configuration page displays the key to the user.
2. The user configures the encoder with that key.
3. When the stream arrives, the encoder sends the key as its `streamId`.
4. The backend resolves the key to the owner and uses the public id `u<userId>`.

The key is therefore never a separate JSON field on the registration request.

---

## 2. Update stream configuration

```http
PUT /api/streams/me
Content-Type: application/json
```

**Partial update** — only the fields present in the body are changed.

### Request

```json
{
  "title": "Ranked grind",
  "description": "Climbing the ladder",
  "visibility": "unlisted",
  "thumbnailUrl": "data:image/png;base64,...",
  "categoryId": 1
}
```

### Validation

| Field | Type | Rules |
|---|---|---|
| `title` | `string` | 1–255 characters, trimmed |
| `description` | `string` | Max 2000 characters |
| `visibility` | `string` | `public` \| `unlisted` \| `private` |
| `thumbnailUrl` | `string` | URL or data URL, max 5 MB |
| `categoryId` | `integer \| null` | Must exist in `categories`; `null` clears it |

### 200 — Response

Same object as `GET /api/streams/me`.

### Important behaviors

- `streamKey` in the request body is **ignored** — clients cannot set or change it.
- Clear the thumbnail with `"thumbnailUrl": ""`.
- Clear the category with `"categoryId": null`.

### 400 — Validation error

```json
{
  "errors": {
    "title": "Title is required",
    "description": "Description must be a string of at most 2000 characters",
    "visibility": "Visibility must be one of: public, unlisted, private",
    "thumbnailUrl": "Thumbnail must be a string of at most 5 MB",
    "categoryId": "Category id must be a positive integer"
  }
}
```

Unknown category:

```json
{ "errors": { "categoryId": "Unknown category" } }
```

---

## 3. Retrieve stream key

```http
GET /api/streams/me/stream-key
```

### 200 — Response

```json
{
  "streamKey": "fov_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "streamId": "u12",
  "isLive": false,
  "updatedAt": "2026-10-23T12:00:00.000Z"
}
```

---

## 4. Rotate stream key

```http
POST /api/streams/me/stream-key/rotate
```

No request body.

### 200 — Response

```json
{
  "streamKey": "fov_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
  "streamId": "u12",
  "isLive": true,
  "updatedAt": "2026-10-23T12:05:00.000Z"
}
```

### Behavior

- The old key stops working immediately for new ingest registrations.
- The `streamId` does **not** change.
- A stream that is already running is **not** interrupted.
- Use this when a key is leaked or exposed.

---

## 5. Categories

```http
GET /api/categories
```

Public — no auth required.

### 200 — Response

```json
[
  {
    "id": 1,
    "name": "League of Legends",
    "viewers": 125000,
    "image_url": "assets/category/leagues-of-legends.png"
  },
  {
    "id": 2,
    "name": "Just Chatting",
    "viewers": 98000,
    "image_url": "assets/category/just-chatting.png"
  }
]
```

Use `id` as `categoryId` in `PUT /api/streams/me`.

---

## 6. Live streams feed

```http
GET /api/streams/available
```

Public. A bearer token is optional; when present, a `private` stream is visible to its owner.

### 200 — Response

```json
[
  {
    "streamId": "u12",
    "trackCount": 4,
    "tracks": [
      {
        "trackId": "v:0",
        "name": "Main Cam",
        "videoUrl": "http://localhost:4000/api/hls/u12/0/playlist.m3u8",
        "isVideo": true,
        "isAudio": false
      },
      {
        "trackId": "a:0",
        "name": "Mic",
        "videoUrl": "http://localhost:4000/api/hls/u12/0/playlist.m3u8",
        "isVideo": false,
        "isAudio": true
      }
    ],
    "title": "Ranked grind",
    "description": "Climbing the ladder",
    "visibility": "public",
    "category": "League of Legends",
    "viewers": 0,
    "streamer": "alice",
    "streamerUsername": "alice",
    "avatarUrl": "",
    "thumbnailUrl": "data:image/png;base64,..."
  }
]
```

### Visibility behavior

| Visibility | Appears in `/available` | Direct link |
|---|:---:|:---:|
| `public` | ✅ | ✅ |
| `unlisted` | ❌ | ✅ |
| `private` | Only for owner | Only for owner |

---

## 7. Direct-link live stream

```http
GET /api/streams/:id/live
```

`:id` can be:

- a public user stream id: `u12`
- a legacy numeric stream id: `1`

Token is optional, but required for `private` streams.

### 200 — Response

Same shape as one entry from `/api/streams/available`.

### 404 — Offline or forbidden

```json
{ "error": "Stream not found" }
```

> The current stream page uses `/api/streams/available`. To support unlisted and private streams, the stream page should call `/api/streams/:id/live` directly and send the bearer token.

---

## Errors

### 400 — Validation

```json
{
  "errors": {
    "title": "Title is required"
  }
}
```

### 401 — Authentication required

```json
{ "error": "Authentication required" }
```

### 404 — Not found

```json
{ "error": "Stream not found" }
```

### 500 — Server error

```json
{ "error": "Internal Server Error" }
```

---

## Encoder endpoints

These are used by the streaming client / encoder, **not** by the configuration page. They are documented here to show the full flow.

### Start ingest

The encoder uses the stream key shown on the configuration page as its
`streamId`. The backend links the stream to its owner when it arrives.

```http
POST /ffmpeg/register
Content-Type: application/json
```

> Note: this route is **not** under `/api`.

```json
{
  "streamId": "fov_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "tracks": 2,
  "audioTracks": 2
}
```

#### 200 — Response

```json
{
  "status": "registered",
  "streamId": "u12",
  "tracksV": 2,
  "tracksA": 2,
  "srtUrl": "srt://host:9999?mode=caller&latency=4000000...",
  "hlsUrl": "/api/hls/u12/0/playlist.m3u8"
}
```

#### Errors

| Status | Body |
|---|---|
| `401` | `{ "error": "Invalid stream key" }` |
| `409` | `{ "error": "StreamId already registered", "streamId": "u12" }` |

### Stop ingest

```http
POST /ffmpeg/stop
Content-Type: application/json
```

```json
{
  "streamId": "fov_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

Send the same key the stream arrived with; the backend resolves it to `u<userId>`
internally. Stopping with the public `u<userId>` id also works for compatibility.

---

## TypeScript models

```ts
export type StreamVisibility = 'public' | 'unlisted' | 'private';

export interface StreamSettings {
  streamId: string;
  title: string;
  description: string;
  visibility: StreamVisibility;
  thumbnailUrl: string;
  categoryId: number | null;
  category: string;
  streamKey: string;
  isLive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateStreamSettings {
  title?: string;
  description?: string;
  visibility?: StreamVisibility;
  thumbnailUrl?: string;
  categoryId?: number | null;
}

export interface StreamKeyResponse {
  streamKey: string;
  streamId: string;
  isLive: boolean;
  updatedAt: string;
}

export interface LiveStreamTrack {
  trackId: string;
  name: string;
  videoUrl: string;
  isVideo: boolean;
  isAudio: boolean;
}

export interface LiveStreamEntry {
  streamId: string;
  trackCount: number;
  tracks: LiveStreamTrack[];
  title: string;
  description: string;
  visibility: StreamVisibility;
  category: string;
  viewers: number;
  streamer: string;
  streamerUsername: string | null;
  avatarUrl: string;
  thumbnailUrl: string;
}

export interface ApiValidationError {
  errors: Record<string, string>;
}
```

---

## Front-end integration notes

- Call `GET /api/streams/me` when the configuration page opens. It creates the configuration and key if needed.
- Use `PUT /api/streams/me` on save. Send only changed fields, or the whole form; omitted fields are left untouched.
- Display `streamKey` from the response, but treat it as a secret: never put it in a URL, log, analytics event, or screenshot helper.
- Add a “Regenerate key” action calling `POST /api/streams/me/stream-key/rotate`.
- Use `categoryId` from `GET /api/categories`.
- Link to the public stream with `/stream/${settings.streamId}`.
- Poll or re-fetch `GET /api/streams/me` to refresh `isLive` if the page needs live status.
- For the public stream page, prefer `GET /api/streams/:id/live` over `/available` so unlisted streams work.
- Scope limitation: visibility is enforced on these API endpoints. Raw HLS segment URLs are still public; signed HLS URLs would be a separate follow-up.
