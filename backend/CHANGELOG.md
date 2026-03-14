# Changelog

All notable changes to FOV Backend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- ESLint configuration for code quality standards
- Comprehensive unit test suite for critical modules
- Complete technical documentation (TECHNICAL.md)
- Architecture diagrams and deployment guides (ARCHITECTURE.md)
- Security hardening guide (SECURITY.md)
- Database migration framework (planned)
- Stream analytics endpoint (planned)
- JWT authentication middleware (planned)

### Changed
- Enhanced README.md with installation, deployment, and troubleshooting guides
- Improved error messages with context-specific information
- Updated package.json scripts with lint and test commands

### Deprecated
- RTMP protocol support (use SRT instead)

### Fixed
- Connection pool timeout handling
- FFmpeg process zombie cleanup
- HLS segment generation race conditions

### Security
- Added input validation guidelines
- Documented password rotation procedures
- Enhanced CORS configuration examples

---

## [0.1.0] - 2025-03-14

### Added

#### Core Features
- Express.js HTTP API server on port 4000
- RESTful endpoints for:
  - User management (/api/users)
  - Category discovery (/api/categories)
  - Stream listing and metadata (/api/streams)
  - HLS playlist delivery (/hls)
- SRT (Secure Reliable Transport) streaming ingestion on port 9999
- FFmpeg-based live media processing with multi-track support
- HTTP Live Streaming (HLS) generation with adaptive bitrate
- MySQL database integration with connection pooling
- Morgan request logging middleware
- CORS support for cross-origin requests
- Comprehensive error handling with global middleware

#### Architecture & Documentation
- Complete README.md with installation and usage instructions
- Technical architecture document (TECHNICAL.md)
- Architecture diagrams (ARCHITECTURE.md)
- Database schema documentation
- Environment variable configuration examples (.env.example)
- Docker containerization support
- Docker Compose orchestration

#### Code Quality
- ESLint configuration with strict coding standards
- Code organization: modular route structure
- Error handling patterns: try/catch with centralized error handler
- Database abstraction layer (db.js)
- Media server abstraction (mediaServer.mjs)

#### Infrastructure & Operations
- Docker support with Dockerfile
- Docker Compose for local development (docker-compose.yml)
- Database setup instructions
- Troubleshooting guide with common issues

### Technical Stack
- **Runtime**: Node.js 18+ (ES Modules)
- **Framework**: Express.js 4.22.1
- **Database**: MySQL 8.x with promisified driver (mysql2)
- **Media**: FFmpeg for streaming
- **Protocols**: SRT (ingestion), HLS (delivery), HTTP (API)
- **Development**: Nodemon for hot-reload

### Known Limitations
- Single-server deployment (no clustering)
- In-memory process tracking (lost on restart)
- No persistent stream recording
- Manual database schema creation required
- No built-in authentication/authorization
- No rate limiting or DDoS protection
- Limited monitoring and metrics

### Future Roadmap

#### Phase 2: Security & Authentication (Q2)
- JWT-based API authentication
- Stream encryption (optional)
- API key management
- Database user privilege separation

#### Phase 3: Advanced Features (Q3)
- Multiple quality tiers (1080p, 720p, 480p)
- Stream recording and VOD support
- Comprehensive analytics dashboard
- User follow/subscription system

#### Phase 4: Scalability (Q4)
- Horizontal scaling with load balancing
- Distributed media storage (S3/GCS)
- Database replication and clustering
- Microservices architecture (optional)

---

## [Planned] - 0.2.0

### Target Date
Q2 2025

### Features
- JWT token-based authentication
- Input validation on all endpoints
- Rate limiting (per-IP, per-user)
- Database query result caching
- Stream recording to persistent storage
- Webhook support for stream events
- Admin panel endpoints
- Comprehensive logging and monitoring

### Performance
- Response time optimization
- Database query optimization
- CDN integration for HLS delivery
- Connection pooling improvements

### Testing
- Integration test suite
- Load testing framework
- Database consistency tests

---

## Version History Summary

| Version | Release Date | Status | Focus |
|---------|---|---|---|
| 0.1.0 | 2025-03-14 | ✅ Current | MVP: Core streaming functionality |
| 0.2.0 | 2025-Q2 | 📋 Planned | Security & Authentication |
| 0.3.0 | 2025-Q3 | 📋 Planned | Advanced streaming features |
| 1.0.0 | 2025-Q4 | 📋 Planned | Production-ready, scalable |

---

## Migration Guide

### From 0.1.0 to 0.2.0 (When Released)

1. **Environment**
   ```bash
   # Add new variables to .env
   JWT_SECRET=your-secret-key
   ```

2. **Database**
   ```sql
   -- New tables/columns will be added via migration
   npm run migrate
   ```

3. **Breaking Changes**
   - API endpoints will require authentication headers
   - Stream registration will validate API key

---

## Contributing

When contributing changes:

1. Update CHANGELOG.md in the [Unreleased] section
2. Follow semantic versioning for version numbers
3. Document breaking changes clearly
4. Include migration instructions if needed
5. Update README.md if behavior changes

### Commit Message Format
```
type(scope): description

[optional body]
[optional footer]
```

Types: feat, fix, docs, style, refactor, test, chore

---

## Release Process

### Before Release
1. Update version in package.json
2. Update CHANGELOG.md with final version number and release date
3. Update README.md if needed
4. Run full test suite: `npm test`
5. Run linter: `npm run lint`
6. Tag release: `git tag v0.x.x`

### Release
1. Push tag: `git push origin v0.x.x`
2. Generate release notes from CHANGELOG.md
3. Publish Docker image: `docker build -t fov-backend:0.x.x .`

### After Release
1. Update project status/version in README
2. Plan next version in CHANGELOG [Unreleased]
3. Notify users of updates

---

## Support

For issues or feature requests, refer to:
- README.md for setup and deployment issues
- SECURITY.md for security concerns
- TECHNICAL.md for architecture questions
- GitHub Issues for bug reports

---

**Current Version**: 0.1.0
**Last Updated**: 2025-03-14
**Maintainer**: FOV Development Team
