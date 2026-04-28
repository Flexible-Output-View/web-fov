# FOV Backend - Quick Reference Card

## Getting Started

```bash
cd backend
npm install
npm run dev              # Start server with hot-reload
```

Visit: http://localhost:4000

---

## Essential Commands

```bash
# Development
npm run dev              # Start with auto-restart (Ctrl+C to stop)

# Testing
npm test                 # Run all tests + coverage
npm run test:watch      # Auto-rerun on file changes

# Code Quality
npm run lint             # Check for violations
npm run lint:fix         # Auto-fix violations
npm start                # Production server

# Database
node test-db.js          # Test database connection
```

---

## Testing a Feature Quickly

```bash
# 1. Make your code change
# 2. Check linting
npm run lint:fix

# 3. Run tests
npm test

# 4. If tests pass, commit!
git add .
git commit -m "feat: description"
```

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Port 4000 in use | `npm run dev` and change PORT in `.env` |
| DB connection failed | Check `.env` credentials with `node test-db.js` |
| Tests failing | Run `npm test -- --verbose` to see details |
| Lint errors | Run `npm run lint:fix` then `npm test` |

---

## API Endpoints

```bash
# Health check
curl http://localhost:4000/

# Create user
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"john","display_name":"John"}'

# Get user
curl http://localhost:4000/api/users/1

# List categories
curl http://localhost:4000/api/categories
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/index.js` | App startup |
| `src/db.js` | Database connection |
| `src/routes/` | API endpoints |
| `.env` | Configuration (don't commit!) |
| `.eslintrc.json` | Code style rules |
| `jest.config.js` | Test configuration |
| `package.json` | Dependencies & scripts |

---

## File Structure

```
backend/
├── src/
│   ├── index.js              # Main app
│   ├── db.js                 # Database
│   ├── mediaServer.mjs       # Streaming
│   ├── routes/               # API routes
│   │   ├── users.js
│   │   ├── streams.js
│   │   ├── categories.js
│   │   └── index.js
│   └── __tests__/            # Tests
├── media/                    # HLS files
├── .env.example              # Env template
├── .eslintrc.json            # Lint rules
├── jest.config.js            # Test config
├── package.json              # Dependencies
├── README.md                 # Full guide
└── [DOCS]                    # Other docs
```

---

## Pre-Commit Checklist

```bash
# Before doing git commit:

[ ] npm run lint:fix
[ ] npm test
[ ] Check coverage didn't drop
[ ] Git commit with meaningful message
```

---

## Environment Setup

**Development Configuration** (`.env`):
```
NODE_ENV=development
PORT=4000
DB_HOST=localhost
DB_USER=admin
DB_PASSWORD=your_password
DB_NAME=fovwebdb
MEDIA_ROOT=./media
```

---

## Test Coverage

```
Run: npm test

View: open coverage/lcov-report/index.html

Current threshold: 50%
```

---

## Database

```bash
# Test connection
node test-db.js

# Create database (first time)
mysql -u admin -p
> CREATE DATABASE fovwebdb;
> CREATE USER 'admin'@'localhost' IDENTIFIED BY 'password';
> GRANT ALL ON fovwebdb.* TO 'admin'@'localhost';
```

---

## Documentation

| Doc | Content |
|-----|---------|
| [README.md](README.md) | Overview, setup, API docs |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Dev guide |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production setup |
| [SECURITY.md](SECURITY.md) | Security Guidelines |
| [API-TESTING.md](API-TESTING.md) | API examples |
| [QA-CHECKLIST.md](QA-CHECKLIST.md) | Testing process |

---

## GitHub Workflow

```bash
# 1. Feature branch
git checkout -b feature/my-feature

# 2. Make changes + test
npm run lint:fix
npm test

# 3. Commit & push
git add .
git commit -m "feat: add feature"
git push

# 4. Wait for GitHub Actions ✅
# 5. Create Pull Request
# 6. Get review approval
# 7. Merge
```

---

## Deployment

```bash
# Docker
docker build -t fov-backend:1.0 .
docker run -p 4000:4000 -e DB_HOST=host fov-backend:1.0

# Docker Compose
docker-compose up -d

# See: DEPLOYMENT.md for full guide
```

---

## Quick API Calls

**Create User:**
```bash
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser"}'
```

**Get User:**
```bash
curl http://localhost:4000/api/users/1
```

**List Categories:**
```bash
curl http://localhost:4000/api/categories
```

---

## Help & Support

**Can't remember a command?**
- Check this card
- Read [DEVELOPMENT.md](DEVELOPMENT.md)
- Run `npm run` to see all scripts

**Test won't run?**
- `npm test -- --verbose`
- Check `.env` database connection
- Run `npm audit` for dependency issues

**Deployment help?**
- See [DEPLOYMENT.md](DEPLOYMENT.md)
- Docker: [DEPLOYMENT.md#docker-deployment](DEPLOYMENT.md#docker-deployment)
- Cloud: [DEPLOYMENT.md#cloud-platforms](DEPLOYMENT.md#cloud-platforms)

---

## Performance Tips

```bash
# Find slow queries
npm test -- --logHeapUsage

# Monitor memory
docker stats fov-backend

# Check database performance
# Enable slow query log in MySQL
SET GLOBAL slow_query_log='ON';
SET GLOBAL long_query_time=1;
```

---

**Bookmark this page!**  
Last updated: April 2026
