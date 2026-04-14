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

## Users Endpoints

### List Users (GET)

**Request:**
```bash
curl http://localhost:4000/api/users/1
```

**Response (200 OK):**
```json
{
  "data": {
    "id": 1,
    "username": "john_doe",
    "display_name": "John Doe",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

**Response (404 Not Found):**
```json
{
  "error": "User not found"
}
```

### Create User (POST)

**Request:**
```bash
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "jane_smith",
    "display_name": "Jane Smith"
  }'
```

**Response (201 Created):**
```json
{
  "id": 42
}
```

**Error (400 Bad Request):**
```bash
# Missing username
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"display_name": "No Username"}'
```

**Response:**
```json
{
  "error": "username required"
}
```

---

## Categories Endpoints

### List All Categories (GET)

**Request:**
```bash
curl http://localhost:4000/api/categories
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Gaming",
      "description": "Gaming streams"
    },
    {
      "id": 2,
      "name": "Music",
      "description": "Music streams"
    }
  ]
}
```

### Create Category (POST)

**Request:**
```bash
curl -X POST http://localhost:4000/api/categories \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sports",
    "description": "Sports streaming"
  }'
```

**Response (201 Created):**
```json
{
  "id": 3
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
    {
      "id": 1,
      "title": "Epic Gaming Session",
      "description": "Live gameplay",
      "stream_url": "rtmp://localhost:1935/live/stream1",
      "hls_url": "http://localhost:4000/hls/stream1/playlist.m3u8",
      "status": "active"
    }
  ]
}
```

### Get HLS Playlist

**Request:**
```bash
curl http://localhost:4000/hls/stream1/playlist.m3u8
```

**Response (200 OK):**
```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment00000.ts
#EXTINF:10.0,
segment00001.ts
#EXT-X-ENDLIST
```

---

## Testing with cURL

### Using cURL Variables

**Save base URL:**
```bash
BASE_URL="http://localhost:4000"

# Create user
curl -X POST $BASE_URL/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser"}'

# Get user
curl $BASE_URL/api/users/1
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
// Create user
const response = await fetch('http://localhost:4000/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'testuser',
    display_name: 'Test User'
  })
});

const data = await response.json();
console.log('Created user ID:', data.id);

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

// Create user
const createResponse = await api.post('/api/users', {
  username: 'testuser',
  display_name: 'Test User'
});
console.log('User ID:', createResponse.data.id);

// Get user
const getUserResponse = await api.get('/api/users/1');
console.log('User:', getUserResponse.data);
```

---

## Testing with Postman

### Import Collection

1. Open Postman
2. Click "Import"
3. Paste this as raw JSON:

```json
{
  "info": {
    "name": "FOV Backend API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Users",
      "item": [
        {
          "name": "Get User",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/api/users/1"
          }
        },
        {
          "name": "Create User",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/api/users",
            "body": {
              "mode": "raw",
              "raw": "{\"username\":\"newuser\",\"display_name\":\"New User\"}"
            }
          }
        }
      ]
    },
    {
      "name": "Categories",
      "item": [
        {
          "name": "List Categories",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/api/categories"
          }
        }
      ]
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:4000"
    }
  ]
}
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
    POST /
      ✓ should create a new user (38ms)
      ✓ should return 400 when username is missing (5ms)
      ✓ should handle database errors on create (6ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Time:        2.345s

Coverage summary:
  Statements   : 62% ( 123/198 )
  Branches     : 48% ( 72/150 )
  Functions    : 70% ( 35/50 )
  Lines        : 65% ( 128/197 )
```

---

## Stress Testing

### Using Apache Bench

**Install:**
```bash
# macOS
brew install httpd

# Linux
apt-get install apache2-utils
```

**Run test:**
```bash
# 1000 requests, 10 concurrent
ab -n 1000 -c 10 http://localhost:4000/api/users/1

# Results:
# Requests per second: 250 [#/sec] (mean)
# Time per request: 40ms [ms] (mean)
# Failed requests: 0
```

### Using wrk

**Install:**
```bash
brew install wrk
```

**Run test:**
```bash
# 4 threads, 100 connections, 30 seconds
wrk -t4 -c100 -d30s http://localhost:4000/api/users/1

# Results show throughput and latency
```

---

## Error Testing

### Test Error Scenarios

```bash
# Missing required field
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{}'

# Response (400)
# {"error":"username required"}

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

Enable MySQL slow query log:
```sql
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 0.5;  -- 500ms threshold

-- Tail the log
TAIL /var/log/mysql/slow.log
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

## Testing Checklist

Before considering API ready:

- [ ] **Health Check**: `GET /` returns 200
- [ ] **Create User**: `POST /api/users` returns 201 with ID
- [ ] **Get User**: `GET /api/users/:id` returns 200
- [ ] **Not Found**: `GET /api/users/999` returns 404
- [ ] **Validation**: Missing fields return 400
- [ ] **Errors**: Database errors return 500 (not stacktrace)
- [ ] **Categories**: CRUD operations work
- [ ] **Streams**: All endpoints respond
- [ ] **Performance**: Responses < 500ms
- [ ] **Tests Pass**: `npm test` shows all green
- [ ] **Linting Passes**: `npm run lint` shows no errors

---

**Last Updated**: April 2024
