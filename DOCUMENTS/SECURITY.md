# FOV Backend - Security Policy

## Overview

This document outlines security practices, vulnerabilities, and the roadmap for securing the FOV Backend. **Current Status: Beta - Security hardening in progress.**

---

## Current Status

### ✅ Implemented
- CORS middleware (configurable origin)
- HTTP request logging (Morgan)
- Environment variable separation (no hardcoded secrets)
- Connection pooling (prevents connection exhaustion)
- Basic error handling (avoids stack trace leaks)

### ⚠️ Partially Implemented
- Input validation (basic, not comprehensive)
- Error messages (may expose internals in some cases)

### ❌ NOT Implemented (High Priority)
- Authentication (JWT, OAuth2)
- Input sanitization (SQL injection prevention)
- Rate limiting
- Password hashing
- HTTPS enforcement
- CORS proper configuration
- Security headers (HSTS, CSP, etc.)

---

## Vulnerability Assessment

### High Risk 🔴

#### 1. No Authentication
**Impact**: Anyone can access all endpoints
**Current Mitigation**: VPC/firewall in production
**Fix**: Implement JWT authentication
```javascript
// Planned in v0.2.0
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization;
    // Validate JWT
};
```

#### 2. SQL Injection Risk (Low due to parameterized queries)
**Current Status**: Using parameterized queries `?`
**Review Needed**: Audit all queries for string concatenation

```javascript
// ✅ Safe
db.query('SELECT * FROM users WHERE id = ?', [userId])

// ❌ Unsafe (don't do this)
db.query(`SELECT * FROM users WHERE id = ${userId}`)
```

#### 3. No Rate Limiting
**Impact**: Vulnerable to brute force and DoS
**Fix**: Implement rate limiting middleware
```javascript
// Planned
import rateLimit from 'express-limit';
app.use(rateLimit({windowMs: 15*60*1000, max: 100}));
```

### Medium Risk 🟡

#### 1. Basic Input Validation
**Current**: Only checks for required fields
**Needed**: Type validation, length limits, sanitization
```javascript
// Planned
import joi from 'joi';
const userSchema = joi.object({
    username: joi.string().alphanum().min(3).max(30).required(),
    email: joi.string().email().required(),
    password: joi.string().min(8).required()
});
```

#### 2. No Password Hashing
**Current**: Passwords stored in database (if implemented)
**Fix**: Use bcrypt
```javascript
import bcrypt from 'bcrypt';
const hashedPassword = await bcrypt.hash(password, 10);
```

#### 3. Error Messages Expose System Details
**Example**: Current error responses may reveal database/table names
**Fix**: Generic error messages in production
```javascript
// Production error response
res.status(500).json({ error: 'Internal server error' });
// Log detailed error for admins only
logger.error('Detailed error:', err);
```

### Low Risk 🟢

#### 1. No HTTPS Enforcement
**Note**: Application code is HTTP, rely on reverse proxy for TLS
**Implementation**: Use `hsts` middleware or Nginx config
```javascript
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
```

#### 2. CORS Not Strictly Configured
**Current**: `CORS_ORIGIN=*` in development
**Fix**: Whitelist specific origins in production
```javascript
app.use(cors({
    origin: process.env.CORS_ORIGIN || ['https://yourdomain.com'],
    credentials: true
}));
```

---

## Security Best Practices

### 1. Database Credentials

**✅ DO:**
- Store in environment variables
- Use different credentials for dev/prod
- Rotate passwords quarterly
- Use managed database (AWS RDS) when possible

**❌ DON'T:**
- Hardcode credentials in code
- Commit `.env` files
- Use default MySQL root password
- Share database password in Slack/email

### 2. API Authentication

**Current**: None (TO DO)
**Recommended**: JWT + Refresh Tokens

```javascript
// Planned implementation
const jwt = require('jsonwebtoken');

function createToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
}
```

### 3. Input Validation

**Example Attack:**
```
POST /api/users
{"username": "'; DROP TABLE users; --"}
```

**Prevention:**
```javascript
// Validate before use
if (!username || username.length > 30 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Invalid username' });
}

// And use parameterized queries
db.query('INSERT INTO users (username) VALUES (?)', [username])
```

### 4. Logging & Monitoring

**DO log:**
- Authentication attempts (success/failure)
- Failed validation attempts
- Database errors (generic)
- Security-sensitive operations

**DON'T log:**
- Passwords
- API keys
- Personal data
- Sensitive database content

### 5. Secrets Management

**Development:**
- `.env` file locally (never commit)
- `.env.example` as template

**Production:**
- AWS Secrets Manager
- Docker Secrets (if using Swarm)
- Environment variables from CI/CD

**Example:**
```bash
# AWS Secrets Manager
aws secretsmanager create-secret \
  --name fov/db/password \
  --secret-string "securepassword123"

# Retrieve in app
const secret = aws.secretsmanager.getSecretValue({SecretId: 'fov/db/password'});
```

### 6. HTTPS/TLS

**Ensure in production:**
```nginx
# Nginx reverse proxy
server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    
    location / {
        proxy_pass http://backend:4000;
    }
}
```

### 7. File Upload Security (Future)

If implementing file uploads (media):
```javascript
// Validate file type
const ALLOWED_TYPES = ['video/mp4', 'video/x-msvideo'];
if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return res.status(400).json({ error: 'Invalid file type' });
}

// Scan for malware (future)
// Use virus scanning service (ClamAV, etc.)
```

---

## Incident Response

### Data Breach Protocol

1. **Detect**: Monitor logs, alerts for suspicious activity
2. **Contain**: Disable affected accounts, revoke tokens
3. **Investigate**: Review logs, identify scope
4. **Remediate**: Patch vulnerability, force password resets
5. **Communicate**: Notify users, regulatory bodies (if required)
6. **Document**: Post-mortem, process improvements

### Example Response:

```
Breach Detected: Unauthorized database access on 2024-04-15 10:30 UTC
├─ Impact: All user data exposed (names, usernames, created_at only - no passwords)
├─ Scope: ~500 user records
├─ Response:
│  ├─ Disabled public API endpoints (2 hours)
│  ├─ Rotated database credentials
│  ├─ Reviewed container logs for other access
│  ├─ Deployed security patch
│  └─ Notified users via email
└─ Root Cause: Unsecured admin debugging endpoint
   Future: Remove debug endpoints in production
```

---

## Security Headers

**Recommended headers to add (via middleware):**

```javascript
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    next();
});
```

Or use helmet middleware:
```javascript
import helmet from 'helmet';
app.use(helmet());
```

---

## Penetration Testing Checklist

### To Do Before v1.0.0

- [ ] OWASP Top 10 review
- [ ] SQL injection testing
- [ ] XSS testing (if web interface)
- [ ] Authentication bypass attempts
- [ ] Rate limiting testing
- [ ] CORS misconfiguration review
- [ ] API parameter fuzzing
- [ ] Secrets exposure scan (git history)
- [ ] Dependencies vulnerability scan
- [ ] Load testing (DoS resistance)

### Tools

```bash
# Dependency scanning
npm audit

# OWASP ZAP
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:4000

# Burp Suite (manual testing)
# - Download: https://portswigger.net/burp

# git-secrets (prevent credentials in commits)
brew install git-secrets
git secrets --install
```

---

## Compliance & Standards

### GDPR (if European users)
- ✅ Environment variable protection
- ❌ Data export endpoint (TODO)
- ❌ Data deletion / right to be forgotten (TODO)
- ❌ Consent management (TODO)

### PCI DSS (if handling payments - future)
- Encryption at rest and in transit
- Access controls with authentication
- Regular security testing
- Vulnerability management

### SOC 2 Type II (if enterprise)
- Audit logging
- Access controls
- Change management
- Incident response

---

## Roadmap


---

## Reporting Security Issues

**Please DO NOT file public GitHub issues for security vulnerabilities.**

Instead, email security issues to: **security@fov-project.io** (placeholder)

Include:
- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**Response time**: Within 48 hours

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [bcrypt Documentation](https://www.npmjs.com/package/bcrypt)
- [JWT Introduction](https://jwt.io/introduction)

---

**Document Version**: 1.0  
**Last Updated**: April 2026 
**Status**: Active Review Required Before Production
