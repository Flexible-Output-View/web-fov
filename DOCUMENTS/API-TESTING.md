# FOV Backend - API Testing & Examples

Quick reference for testing the FOV Backend API endpoints.

---

## API Base URL

```
Development:  http://localhost:4000
Production:   https://api.yourdomain.com
```

---

## Health Check

### Check Server Status

**Request:**
```bash
curl http://localhost:4000/
```

**Response (200 OK):**
```json
{
  "ok": true,
  "message": "FOV backend running"
}
```

---

## Users & Auth Endpoints

### Get Public Profile by Username (GET)

**Request:**
```bash
curl http://localhost:4000/api/users/john_doe
```

**Response (200 OK):**
```json
{
  "id": 1,
  "username": "john_doe",
  "bio": "Streaming enthusiast",
  "avatarUrl": "data:image/png;base64,...",
  "bannerUrl": "",
  "followersCount": 12,
  "followingCount": 4,
  "isFollowing": false
}
```

`isFollowing` is `true` when the request carries a valid `Authorization: Bearer <token>` for a user who follows this profile. The `email` field is never returned on public profiles.

**Response (404 Not Found):**
```json
{
  "error": "User not found"
}
```

### Get Own Profile (GET, auth)

**Request:**
```bash
curl http://localhost:4000/api/users/me \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "id": 1,
  "username": "john_doe",
  "email": "john@example.com",
  "bio": "Streaming enthusiast",
  "avatarUrl": "",
  "bannerUrl": "",
  "followersCount": 12,
  "followingCount": 4,
  "isFollowing": false
}
```

### Update Own Profile (PUT, auth)

`avatarUrl` / `bannerUrl` accept a URL or a base64 data URL (max 5 MB each). `bio` is capped at 300 characters.

**Request:**
```bash
curl -X PUT http://localhost:4000/api/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bio":"Streaming enthusiast","avatarUrl":"","bannerUrl":""}'
```

**Response (200 OK):** the updated profile (same shape as `GET /api/users/me`).

### Change Password (PUT, auth)

**Request:**
```bash
curl -X PUT http://localhost:4000/api/users/me/password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"secret123","newPassword":"new-secret-123"}'
```

**Response (200 OK):**
```json
{ "ok": true }
```

**Error (401 Unauthorized):**
```json
{ "error": "Current password is incorrect" }
```

### List Followed Users (GET, auth)

Returns every user followed by the authenticated account, with the same public
profile shape and `isFollowing: true`.

**Request:**
```bash
curl http://localhost:4000/api/users/me/following \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
[
  {
    "id": 2,
    "username": "jane_smith",
    "bio": "",
    "avatarUrl": "",
    "bannerUrl": "",
    "followersCount": 12,
    "followingCount": 4,
    "isFollowing": true
  }
]
```

### Follow / Unfollow a User (POST / DELETE, auth)

**Request:**
```bash
curl -X POST http://localhost:4000/api/users/jane_smith/follow \
  -H "Authorization: Bearer $TOKEN"

curl -X DELETE http://localhost:4000/api/users/jane_smith/follow \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):** the updated follower count of the target profile.
```json
{ "following": true, "followersCount": 13 }
```

### Register (POST)

Creates a new user, hashes the password with bcrypt, and returns a JWT.

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "jane_smith",
    "email": "jane@example.com",
    "password": "secret123"
  }'
```

**Validation rules:**
- `username`: 3-30 characters, letters/numbers/underscores only
- `email`: valid email address (stored lowercase)
- `password`: at least 8 characters

**Response (201 Created):**
```json
{
  "token": "<jwt>",
  "user": {
    "id": 42,
    "username": "jane_smith",
    "email": "jane@example.com",
    "created_at": "2026-01-15T10:30:00Z"
  }
}
```

**Error (400 Bad Request):**
```json
{
  "errors": {
    "password": "Password must be at least 8 characters"
  }
}
```

**Error (409 Conflict):**
```json
{
  "error": "Username or email already exists"
}
```

### Login (POST)

Accepts a username **or** an email in the `login` field (email match is case-insensitive).

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "login": "jane_smith",
    "password": "secret123"
  }'
```

**Response (200 OK):**
```json
{
  "token": "<jwt>",
  "user": {
    "id": 42,
    "username": "jane_smith",
    "email": "jane@example.com",
    "created_at": "2026-01-15T10:30:00Z"
  }
}
```

**Error (401 Unauthorized):**
```json
{
  "error": "Invalid credentials"
}
```

The token is a JWT signed with `JWT_SECRET` (expiry `JWT_EXPIRES_IN`, default `7d`). The Angular client stores it as `fov_auth_token` / `fov_auth_user`. Interactive reference: `http://localhost:4000/api-docs`.

---

## Categories Endpoints

### List All Categories (GET)

**Request:**
```bash
curl http://localhost:4000/api/categories
```

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "name": "Gaming",
    "viewers": 1250,
    "image_url": "http://localhost:4000/images/gaming.jpg"
  },
  {
    "id": 2,
    "name": "Music",
    "viewers": 890,
    "image_url": "http://localhost:4000/images/music.jpg"
  }
]
```

### Get Category by ID (GET)

**Request:**
```bash
curl http://localhost:4000/api/categories/1
```

**Response (200 OK):**
```json
{
  "id": 1,
  "name": "Gaming",
  "viewers": 1250,
  "image_url": "http://localhost:4000/images/gaming.jpg"
}
```

---

## Streams Endpoints

### List All Streams (GET)

**Request:**
```bash
curl http://localhost:4000/api/streams
```

**Response (200 OK):**
```json
{
  "data": [
[
  {
    "id": 1,
    "streamer": "john_doe",
    "title": "Epic Gaming Session",
    "category_id": 1,
    "viewers": 245,
    "thumbnail_url": "http://localhost:4000/images/stream1.jpg",
    "avatar_url": "http://localhost:4000/images/avatar1.jpg",
    "is_live": 1
  },
  {
    "id": 2,
    "streamer": "jane_smith",
    "title": "Music Production Stream",
    "category_id": 2,
    "viewers": 128,
    "thumbnail_url": "http://localhost:4000/images/stream2.jpg",
    "avatar_url": "http://localhost:4000/images/avatar2.jpg",
    "is_live": 1
  }
]
```

### Get Stream by ID (GET)

**Request:**
```bash
curl http://localhost:4000/api/streams/1
```

**Response (200 OK):**
```json
{
  "id": 1,
  "streamer": "john_doe",
  "title": "Epic Gaming Session",
  "category_id": 1,
  "viewers": 245,
  "thumbnail_url": "http://localhost:4000/images/stream1.jpg",
  "avatar_url": "http://localhost:4000/images/avatar1.jpg",
  "is_live": 1
}
```

### Get Available Streams with HLS Tracks (GET)

**Request:**
```bash
curl http://localhost:4000/api/streams/available
```

**Response (200 OK):**
```json
[
  {
    "streamId": "1",
    "trackCount": 2,
    "tracks": [
      {
        "trackId": "v:0",
        "videoUrl": "http://localhost:4000/hls/1/v:0/playlist.m3u8"
      },
      {
        "trackId": "v:1",
        "videoUrl": "http://localhost:4000/hls/1/v:1/playlist.m3u8"
      }
    ],
    "title": "Epic Gaming Session",
    "category": "Gaming",
    "viewers": 245,
    "avatarUrl": "http://localhost:4000/images/avatar1.jpg",
    "thumbnailUrl": "http://localhost:4000/images/stream1.jpg"
  }
]
```

### Get Stream HLS URL (GET)

**Request:**
```bash
curl http://localhost:4000/api/streams/1/hls
```

**Response (200 OK):**
```json
{
  "hls": "http://localhost:4000/hls/live/1/playlist.m3u8"
}
```

### Get HLS Playlist

**Request:**
```bash
curl http://localhost:4000/hls/1/v:0/playlist.m3u8
```

**Response (200 OK):**
```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXTINF:2.0,
seg00000.ts
#EXTINF:2.0,
seg

---

## Testing with cURL

### Using cURL Variables

**Save base URL:**
```bash
BASE_URL="http://localhost:4000"

# Register
curl -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"secret123"}'

# Login
curl -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"testuser","password":"secret123"}'

# Get public profile
curl $BASE_URL/api/users/testuser

# Get own profile (with a token)
TOKEN="<jwt>"
curl $BASE_URL/api/users/me -H "Authorization: Bearer $TOKEN"
```

### Debugging with Verbose Output

**Show request and response headers:**
```bash
curl -v http://localhost:4000/api/users/1
```

**Show only headers:**
```bash
curl -i http://localhost:4000/api/users/1
```

---

## Testing with JavaScript/Node.js

### Using Fetch API

```javascript
// Register
const response = await fetch('http://localhost:4000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'testuser',
    email: 'test@example.com',
    password: 'secret123'
  })
});

const data = await response.json();
console.log('Token:', data.token);

// Get user
const userResponse = await fetch('http://localhost:4000/api/users/1');
const user = await userResponse.json();
console.log('User:', user.data);
```

### Using axios

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:4000'
});

// Register
const createResponse = await api.post('/api/auth/register', {
  username: 'testuser',
  email: 'test@example.com',
  password: 'secret123'
});
console.log('Token:', createResponse.data.token);

// Get user
const getUserResponse = await api.get('/api/users/1');
console.log('User:', getUserResponse.data);
```

---

## Automated Testing

### Run Test Suite

```bash
# Run all tests
npm test

# Run specific test file
npm test -- users.test.js

# Watch mode
npm run test:watch

# With coverage
npm test -- --coverage
```

### Example Test Run

```bash
$ npm test

 PASS  src/__tests__/users.test.js
  Users Routes
    GET /:id
      ✓ should return user by id (45ms)
      ✓ should return 404 when user not found (12ms)
      ✓ should handle database errors (8ms)

 PASS  src/__tests__/auth.test.js
  Auth Routes
    POST /register
      ✓ should register a new user and return a token
      ✓ should return 400 for invalid registration input
      ✓ should return 409 when username or email already exists
    POST /login
      ✓ should login with username and return a token
      ✓ should return 401 for unknown user
      ✓ should return 401 for wrong password

Test Suites: 2 passed, 2 total
```


---

## Error Testing

### Test Error Scenarios

```bash
# Missing required field
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{}'

# Response (400)
# {"errors":{"username":"...","email":"...","password":"..."}}

# Wrong credentials
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"testuser","password":"wrong"}'

# Response (401)
# {"error":"Invalid credentials"}

# Non-existent resource
curl http://localhost:4000/api/users/99999

# Response (404)
# {"error":"User not found"}

# Invalid method
curl -X DELETE http://localhost:4000/api/users/1

# Response (405)
# Method not allowed

# Server error simulation
# (Manually stop database)
curl http://localhost:4000/api/users/1

# Response (500)
# {"error":"Unable to connect to DB..."}
```

---

## Performance Testing

### Response Time Measurement

```bash
# Measure response time
time curl -s http://localhost:4000/api/users/1 > /dev/null

# Example output:
# real    0m0.125s
# user    0m0.032s
# sys     0m0.024s

# Should be < 500ms for good performance
```

### Database Query Performance

Enable Postgres slow query logging:
```sql
ALTER SYSTEM SET log_min_duration_statement = 500;
SELECT pg_reload_conf();
-- Then tail the Postgres log
```

---

## Debugging

### Enable Verbose Logging

**In development:**
```bash
NODE_ENV=development npm run dev
```

**In code:**
```javascript
console.log('Debug info:', variable);
```

### View Server Logs

```bash
# Docker
docker logs -f fov-backend

# Local process
tail -f ~/.pm2/logs/backend-out.log

# Check specific endpoint
curl -v http://localhost:4000/api/users/1
```

---

## Stream Configuration Endpoints

All endpoints below require `Authorization: Bearer <token>`. The stream key is
generated by the backend on first access and is only ever returned to its owner.

### Get the stream configuration (GET)

```bash
curl http://localhost:4000/api/streams/me \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "streamId": "u12",
  "title": "Ranked grind",
  "description": "Climbing the ladder",
  "visibility": "public",
  "thumbnailUrl": "",
  "categoryId": 1,
  "category": "League of Legends",
  "streamKey": "fov_...",
  "isLive": false,
  "createdAt": "2026-10-23T12:00:00.000Z",
  "updatedAt": "2026-10-23T12:00:00.000Z"
}
```

### Update the stream configuration (PUT)

Partial update. Only the provided fields are changed.

```bash
curl -X PUT http://localhost:4000/api/streams/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Ranked grind",
    "description": "Climbing the ladder",
    "visibility": "unlisted",
    "thumbnailUrl": "data:image/png;base64,...",
    "categoryId": 1
  }'
```

`visibility` is one of `public`, `unlisted`, or `private`:

- `public` — listed in discovery.
- `unlisted` — hidden from discovery, reachable via `/api/streams/u<userId>/live`.
- `private` — only readable by the authenticated owner.

A `streamKey` sent in this body is ignored: clients cannot choose their key.

### Retrieve the stream key (GET)

```bash
curl http://localhost:4000/api/streams/me/stream-key \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "streamKey": "fov_...",
  "streamId": "u12",
  "isLive": false,
  "updatedAt": "2026-10-23T12:00:00.000Z"
}
```

### Rotate the stream key (POST)

```bash
curl -X POST http://localhost:4000/api/streams/me/stream-key/rotate \
  -H "Authorization: Bearer $TOKEN"
```

The previous key is revoked immediately. The returned `streamId` (`u<userId>`)
does not change. A stream that is already running keeps running; rotate only
prevents new ingest registrations with the old key.

### Register an ingest with the key

```bash
curl -X POST http://localhost:4000/ffmpeg/register \
  -H "Content-Type: application/json" \
  -d '{"streamKey": "fov_...", "tracks": 2, "audioTracks": 2}'
```

The response contains `streamId: "u12"` and the SRT URL. The stream key never
appears in HLS paths or public stream URLs. To stop an owned stream, send the
same key:

```bash
curl -X POST http://localhost:4000/ffmpeg/stop \
  -H "Content-Type: application/json" \
  -d '{"streamId": "u12", "streamKey": "fov_..."}'
```

### Direct-link live stream (GET)

```bash
curl http://localhost:4000/api/streams/u12/live \
  -H "Authorization: Bearer $TOKEN" # required for private streams only
```

Returns the live stream and its HLS tracks, enforcing the visibility rules.

> **Note:** HLS segments are still served by the existing public media server
> (`/api/hls/<streamId>/...`). Visibility is enforced on the API discovery and
> detail endpoints; segment-level access control (signed HLS URLs) would be a
> separate follow-up.

---

## Testing Checklist

Before considering API ready:

- [ ] **Health Check**: `GET /` returns 200
- [ ] **Register**: `POST /api/auth/register` returns 201 with token + user
- [ ] **Login**: `POST /api/auth/login` returns 200 with token + user
- [ ] **Duplicate register**: returns 409
- [ ] **Wrong credentials**: returns 401
- [ ] **Get User**: `GET /api/users/:username` returns 200
- [ ] **My Profile**: `GET /api/users/me` returns 200 with a valid token
- [ ] **Update Profile**: `PUT /api/users/me` updates bio/avatar/banner
- [ ] **Change Password**: `PUT /api/users/me/password` updates the password
- [ ] **Follow**: `POST /api/users/:username/follow` sets `following: true` and returns `followersCount`
- [ ] **Following list**: `GET /api/users/me/following` returns the followed accounts
- [ ] **Not Found**: `GET /api/users/unknown_user` returns 404
- [ ] **Validation**: Missing fields return 400
- [ ] **Errors**: Database errors return 500 (not stacktrace)
- [ ] **Categories**: CRUD operations work
- [ ] **Streams**: All endpoints respond
- [ ] **Stream settings**: `GET /api/streams/me` creates a config and a `fov_` key
- [ ] **Stream settings auth**: all `/api/streams/me` endpoints return 401 without a token
- [ ] **Stream settings update**: title, description, visibility, thumbnail, and category are validated
- [ ] **Stream key rotation**: `POST /api/streams/me/stream-key/rotate` returns a different key
- [ ] **Direct link**: unlisted streams work through `/api/streams/:id/live`, private ones only for the owner
- [ ] **Performance**: Responses < 500ms
- [ ] **Tests Pass**: `npm test` shows all green
- [ ] **Linting Passes**: `npm run lint` shows no errors

---

**Last Updated**: September 2026
