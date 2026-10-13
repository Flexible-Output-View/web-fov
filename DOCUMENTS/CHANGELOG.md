# FOV Backend - Changelog

All notable changes to the FOV Backend project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- User registration and login: `POST /api/auth/register`, `POST /api/auth/login` (JWT issuance, bcrypt hashing, validation, `409` on duplicates, `401` on bad credentials)
- Swagger documentation for auth endpoints (`/api-docs`)
- Angular `AuthService` with `/login` and `/register` pages (token persisted as `fov_auth_token` / `fov_auth_user`)
- Postgres 18 as the documented and deployed database (`pg` Pool, `fovwebdb.sql` Postgres schema)

### Planned Features
- Global JWT guard for protected endpoints
- Input validation & sanitization middleware (beyond auth)
- Rate limiting per IP
- Comprehensive API documentation (Swagger/OpenAPI)
- Database migration system
- Structured logging (Winston)
- WebSocket support for real-time notifications
- Stream quality analytics
- User subscription tiers

### Security Improvements Needed
- Global auth guard for protected routes (tokens already issued)
- Add HTTPS enforcement
- SQL injection prevention review (parameterized, `?` → `$n`)
- CORS configuration hardening
- Refresh-token / session revocation strategy

---

## [0.1.0] - 2026-04-14

### Added

#### Core Features
- **Express.js REST API** with modular route structure
  - Auth endpoints: `POST /api/auth/register`, `POST /api/auth/login`
  - User lookup: `GET /api/users/:id`
  - Stream management endpoints: `GET /api/streams`, `POST /api/streams`
  - Category endpoints: `GET /api/categories`, `POST /api/categories`
  - Health check: `GET /`

#### Database
- Postgres connection pooling via `pg` Pool
- Connection pool with configurable limits (default: 5 connections)
- Auto-reconnection on failure
- Database module with singleton pattern
- Note: early 0.1.0 drafts referenced MySQL/`mysql2`; the implementation and schema (`fovwebdb.sql`) are Postgres

#### Media Streaming
- **SRT server** for secure, low-latency encoder ingest (port 9999)
- **FFmpeg-based transcoding** for HLS segmentation and delivery
- Stream playlist validation (`isPlaylistReady`, `getSegmentCount`)
- Media server integration with process lifecycle management

#### Development Tools
- **ESLint** configuration for code quality
  - 4-space indentation enforcement
  - Single quote requirement
  - Strict equality enforcement
  - No `var` declarations
  - Unused variable detection

- **Jest** testing framework
  - Unit tests for database module
  - User route API tests with mocking
  - Coverage reporting (50% threshold)
  - Watch mode for development

- **Nodemon** for automatic restart on file changes

#### Documentation
- Comprehensive README.md with installation, configuration, and API documentation
- ARCHITECTURE.md explaining system design and technology justification
- DEVELOPMENT.md with setup, workflow, and contribution guidelines
- DEPLOYMENT.md covering Docker, Docker Compose, and cloud platforms
- SECURITY.md with security policies and roadmap
- CHANGELOG.md (this file)

#### Configuration Files
- `.eslintrc.json` - Code style rules
- `jest.config.js` - Test configuration with coverage thresholds
- `.env.example` - Environment template
- `.env.production.example` - Production environment template
- `Dockerfile` - Container image definition

#### Package Management
- Updated `package.json` with:
  - Core dependencies: express, cors, morgan, pg, dotenv, bcryptjs, jsonwebtoken
  - Dev dependencies: eslint, jest, supertest, nodemon
  - Scripts: `dev`, `start`, `test`, `test:watch`, `lint`, `lint:fix`

#### CI/CD
- GitHub Actions workflow (`.github/workflows/backend-tests.yml`)
  - Automated linting on push/PR
  - Automated testing on push/PR
  - Coverage reporting

### Changed
- Enhanced error handling with centralized error handler middleware
- Improved environment variable structure and documentation

### Fixed
- (N/A - Initial release)

### Security
- ⚠️ **NOT YET IMPLEMENTED (at 0.1.0 time):**
  - Global JWT guard
  - Broader input validation & sanitization
  - Rate limiting
  - Password hashing (now implemented, see Unreleased)
  - HTTPS enforcement

---

## Roadmap

---

## Know Issues

### Current Limitations
1. **No Global Auth Guard**: Tokens are issued by `/api/auth/*` but not enforced on all endpoints yet
2. **Partial Input Validation**: Comprehensive for auth, basic elsewhere
3. **Local Media Storage**: No CDN or object storage integration
4. **Single Database Connection Pool**: Limited across instances
5. **No Rate Limiting**: Vulnerable to DDoS/abuse
6. **No Error Tracking**: Errors logged to console only

### Workarounds
- Implement VPC/firewall rules for production
- Use reverse proxy (Nginx) for rate limiting until implemented
- Deploy behind API Gateway with authentication
- Use S3 + CloudFront for media delivery

---

## Dependencies

### Production
| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.22.1 | Web framework |
| cors | ^2.8.5 | CORS middleware |
| morgan | ^1.10.0 | HTTP request logging |
| pg | ^8.23.0 | Postgres driver |
| bcryptjs | ^3.0.3 | Password hashing |
| jsonwebtoken | ^9.0.3 | JWT issuance |
| dotenv | ^16.0.0 | Environment variables |
| node-media-server | 2.2.0 | Media server foundation (SRT ingest capability) |
| srt | ^0.0.3 | SRT protocol support |

### Development
| Package | Version | Purpose |
|---------|---------|---------|
| eslint | ^8.56.0 | Code linting |
| jest | ^29.7.0 | Testing framework |
| supertest | ^6.3.3 | HTTP testing |
| nodemon | ^3.1.11 | Auto-restart on changes |

---

## Breaking Changes

None in current version (0.1.0).

---

## Migration Guide

### From 0.0.0 to 0.1.0

This is the initial release. No migration needed.

**For existing deployments:**
1. Back up database and media files
2. Update `.env` with new variables if needed
3. Run `npm install` to get new dependencies
4. Redeploy or restart container

---

## Contributors

- FOV Development Team

---

## License

See [LICENSE](../LICENSE) file.

---

**Format Version**: 1.0  
**Last Updated**: September 2026  
**Document Version**: 1.1
