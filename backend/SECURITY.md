# FOV Backend - Security Hardening Guide

## Table of Contents
1. [Current Security Status](#current-security-status)
2. [Threat Model](#threat-model)
3. [Security Best Practices](#security-best-practices)
4. [Authentication & Authorization](#authentication--authorization)
5. [Data Protection](#data-protection)
6. [Infrastructure Security](#infrastructure-security)
7. [Incident Response](#incident-response)
8. [Compliance Checklist](#compliance-checklist)
9. [Security Timeline](#security-timeline)

---

## Current Security Status

### ✅ Currently Implemented

| Control | Status | Details |
|---------|--------|---------|
| **HTTPS/TLS** | Via Proxy | Reverse proxy (Nginx) handles SSL/TLS |
| **CORS** | ✅ Configured | Restricts cross-origin requests to specified origin |
| **Secrets Management** | ✅ Enforced | dotenv for environment-based configuration |
| **Error Handling** | ✅ Implemented | Generic error messages to prevent information leakage |
| **Input Validation** | ⚠️ Partial | Basic type checking, SQL injection safe (parameterized queries) |
| **Database Abstraction** | ✅ Implemented | Parameterized queries prevent SQL injection |
| **Logging** | ✅ Basic | Morgan middleware for request logging |
| **Connection Pooling** | ✅ Implemented | Connection pool with max 5 connections |

### ⚠️ Recommended Enhancements

| Control | Priority | Impact | Effort |
|---------|----------|--------|--------|
| **Authentication (JWT)** | CRITICAL | Prevents unauthorized API access | Medium |
| **Input Validation** | CRITICAL | Prevents malicious payloads | Medium |
| **Rate Limiting** | HIGH | Prevents DoS/abuse | Low |
| **Audit Logging** | HIGH | Enables incident investigation | Medium |
| **Database Hardening** | HIGH | Least privilege access | Low |
| **Secrets Rotation** | MEDIUM | Reduces credential exposure | Low |
| **API Request Signing** | MEDIUM | Prevents tampering | High |
| **WAF Rules** | MEDIUM | Protects against common attacks | Low |

---

## Threat Model

### Threat Scenarios & Mitigations

#### 1. Unauthorized Stream Access 🔴 HIGH RISK

**Threat**: Attacker streams without authentication, consuming resources.

**Current Mitigations**:
- Stream registration endpoint exists (requires streamId)
- No built-in authentication

**Recommended Mitigations**:
```javascript
// Implement JWT-based authentication
import jwt from 'jsonwebtoken';

function authenticateStream(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// Protect stream endpoints
router.post('/start', authenticateStream, async (req, res) => {
    // Only authenticated users can start streams
});
```

#### 2. Database Credential Exposure 🔴 HIGH RISK

**Threat**: DB password leaked in logs, git history, or environment.

**Current Mitigations**:
- dotenv for configuration management
- .env in .gitignore

**Recommended Mitigations**:
```bash
# Use secrets management
# Option 1: HashiCorp Vault
vault kv get secret/fov-backend/db

# Option 2: AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id fov/db-password

# Option 3: Kubernetes Secrets
kubectl create secret generic db-credentials --from-literal=password=...

# Rotation script
npm run rotate:db-password  # Changes DB password + updates secret store
```

#### 3. SQL Injection 🟢 LOW RISK (Currently Safe)

**Threat**: Malicious SQL injected through user input.

**Current Mitigations**:
- ✅ Parameterized queries throughout
- Parameter binding: `db.query('... WHERE id = ?', [id])`

**Example Safe Code**:
```javascript
// ✅ SAFE: Parameterized query
router.get('/:id', async (req, res, next) => {
    const rows = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
});

// ❌ UNSAFE (DO NOT DO THIS)
// const rows = await db.query(`SELECT * FROM users WHERE id = ${req.params.id}`);
```

#### 4. Cross-Site Scripting (XSS) 🟡 MEDIUM RISK

**Threat**: Malicious JavaScript injected into responses.

**Current Mitigations**:
- API returns JSON (not HTML)
- Angular frontend sanitizes user input

**Recommended Mitigations**:
```javascript
// Input validation middleware
import validator from 'validator';

function validateInput(req, res, next) {
    // Sanitize string inputs
    if (req.body.username) {
        req.body.username = validator.trim(req.body.username);
        if (!validator.isLength(req.body.username, { min: 3, max: 100 })) {
            return res.status(400).json({ error: 'Invalid username' });
        }
    }
    next();
}

router.post('/users', validateInput, async (req, res) => {
    // Safe to use req.body
});
```

#### 5. Cross-Site Request Forgery (CSRF) 🟢 LOW RISK

**Threat**: Attacker tricks user into making unwanted API calls.

**Current Mitigations**:
- ✅ REST API (not form-based)
- ✅ CORS restricts foreign origins
- State-changing operations use POST

**Recommended Mitigations**:
```javascript
// CSRF token verification (if needed)
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: false });

app.post('/streams', csrfProtection, async (req, res) => {
    // Requires valid CSRF token
});
```

#### 6. Rate Limiting / DoS 🟡 MEDIUM RISK

**Threat**: Attacker floods API with requests, causing service degradation.

**Current Mitigations**: None

**Recommended Mitigations**:
```javascript
// Add rate limiting middleware
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,                   // Limit to 100 requests per windowMs
    message: 'Too many requests, please try again later',
    standardHeaders: true,      // Return rate limit info in headers
    legacyHeaders: false        // Disable X-RateLimit-* headers
});

const streamLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,  // Max 10 streams per 15 minutes (stricter)
    skip: (req) => req.user.isAdmin  // Don't rate-limit admins
});

app.use('/api/', apiLimiter);
app.post('/start', streamLimiter, async (req, res) => {
    // Protected from rate-based attacks
});
```

#### 7. Insecure Deserialization 🟢 LOW RISK

**Threat**: Malicious data injected via JSON payload.

**Current Mitigations**:
- ✅ express.json() with size limits
- ✅ Type checking via JavaScript

**Recommended Mitigations**:
```javascript
import z from 'zod';  // Schema validation

// Define schema
const StreamStartSchema = z.object({
    streamId: z.string().uuid(),
    tracks: z.number().min(1).max(4),
    srtUrl: z.string().url().optional()
});

// Validate before processing
app.post('/start', async (req, res, next) => {
    try {
        const validated = StreamStartSchema.parse(req.body);
        // Proceed with validated data
    } catch (err) {
        res.status(400).json({ error: 'Invalid request body' });
    }
});
```

#### 8. Insecure Cryptography 🟡 MEDIUM RISK

**Threat**: Weak encryption algorithms or poor key management.

**Current Mitigations**:
- SRT protocol has built-in encryption (AES)
- Secrets in environment variables

**Recommended Mitigations**:
```javascript
// For JWT (if implemented)
const jwt = require('jsonwebtoken');

// ✅ STRONG: Use HS256 or RS256
const token = jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '24h'
});

// For password hashing (if added)
const bcrypt = require('bcrypt');

async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);  // Strong salt (10 rounds)
    return bcrypt.hash(password, salt);
}
```

---

## Security Best Practices

### 1. Input Validation

**Principle**: Never trust user input.

```javascript
// ✅ GOOD: Validate and sanitize
import validator from 'validator';

function validateStreamStart(req, res, next) {
    const { streamId, tracks } = req.body;
    
    // Check existence
    if (!streamId) return res.status(400).json({ error: 'Missing streamId' });
    
    // Validate format
    if (!validator.isUUID(streamId)) {
        return res.status(400).json({ error: 'Invalid streamId format' });
    }
    
    // Validate type and range
    if (!Number.isInteger(tracks) || tracks < 1 || tracks > 4) {
        return res.status(400).json({ error: 'Tracks must be 1-4' });
    }
    
    next();
}

router.post('/start', validateStreamStart, async (req, res) => {
    // All inputs validated
});
```

### 2. Authentication & Authorization

**Principle**: Verify identity (authentication) and capabilities (authorization).

```javascript
// Token-based authentication
import jwt from 'jsonwebtoken';

function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

function authorize(requiredRole) {
    return (req, res, next) => {
        if (req.user.role !== requiredRole) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

// Usage
app.delete('/users/:id', authenticate, authorize('admin'), async (req, res) => {
    // Only authenticated admins can delete users
});
```

### 3. Secrets Management

**Principle**: Never hardcode secrets; rotate them regularly.

```bash
# ❌ WRONG: Hardcoded secrets
const DB_PASS = 'password123';

# ✅ CORRECT: Environment variables
const DB_PASS = process.env.DB_PASSWORD;

# ✅ BETTER: Secrets management system
# AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id fov/db-password

# HashiCorp Vault
vault kv get secret/data/fov/db

# Kubernetes Secrets
kubectl get secret db-credentials -o jsonpath='{.data.password}' | base64 -d
```

### 4. Secure Communication

**Principle**: Encrypt data in transit.

```nginx
# Nginx reverse proxy configuration
server {
    listen 443 ssl http2;
    server_name api.fov.example.com;
    
    # SSL/TLS Configuration
    ssl_certificate /etc/ssl/certs/fov.crt;
    ssl_certificate_key /etc/ssl/private/fov.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Enforce HTTPS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Proxy to backend
    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 5. Logging & Monitoring

**Principle**: Detect and respond to suspicious activity.

```javascript
// Enhanced logging with context
function auditLog(action, userId, details, status) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        action,        // 'stream_start', 'auth_fail', etc.
        userId,
        details,       // Context-specific data
        status,        // 'success', 'failure'
        severity: status === 'failure' ? 'warn' : 'info'
    }));
}

// Usage
router.post('/start', authenticate, async (req, res, next) => {
    try {
        // ... stream start logic
        auditLog('stream_start', req.user.id, { streamId }, 'success');
    } catch (err) {
        auditLog('stream_start', req.user.id, { error: err.message }, 'failure');
        next(err);
    }
});

// Alert on suspicious patterns
// Monitor: Failed auth attempts > 5 in 5 minutes
// Monitor: Unusual FFmpeg process count spike
// Monitor: Disk space exhaustion
// Monitor: Database query latency spike
```

---

## Authentication & Authorization

### JWT Implementation (Recommended)

```javascript
// Generate token on login
import jwt from 'jsonwebtoken';

function generateToken(userId, role = 'user') {
    return jwt.sign(
        {
            userId,
            role,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)  // 24h
        },
        process.env.JWT_SECRET,
        { algorithm: 'HS256' }
    );
}

// Verify token
function verifyToken(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256']
        });
    } catch (err) {
        return null;
    }
}

// Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];  // Extract from 'Bearer token'
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.user = decoded;
    next();
}

// Usage
app.post('/refresh-token', async (req, res) => {
    const { refreshToken } = req.body;
    const verified = verifyToken(refreshToken);
    if (!verified) return res.status(401).json({ error: 'Invalid refresh token' });
    
    const newToken = generateToken(verified.userId, verified.role);
    res.json({ token: newToken });
});
```

---

## Data Protection

### Sensitive Data Handling

```javascript
// DO NOT log sensitive data
// ❌ WRONG
console.log('DB Connection', { host, user, password: 'secret123' });

// ✅ CORRECT
console.log('DB Connection established to', process.env.DB_HOST);

// PII (Personally Identifiable Information) Protection
const PII_FIELDS = ['password', 'email', 'phone', 'ssn'];

function sanitizeForLog(obj) {
    const sanitized = { ...obj };
    PII_FIELDS.forEach(field => {
        if (field in sanitized) {
            sanitized[field] = '[REDACTED]';
        }
    });
    return sanitized;
}

// Data retention
// Delete old HLS segments: npm run clean:hls
// Archive old streams: npm run archive:streams --before=2025-01-01
```

### Database Security

```sql
-- Create restricted database user
CREATE USER 'fov_app'@'localhost' IDENTIFIED BY 'strong_password_here';

-- Grant minimal permissions (principle of least privilege)
GRANT SELECT, INSERT, UPDATE ON fovwebdb.* TO 'fov_app'@'localhost';

-- Deny dangerous operations
REVOKE DROP, ALTER, CREATE ON fovwebdb.* FROM 'fov_app'@'localhost';

-- Enable query logging for auditing
SET GLOBAL general_log = 'ON';
SET GLOBAL log_output = 'TABLE';  -- Log to mysql.general_log table

-- Verify permissions
SHOW GRANTS FOR 'fov_app'@'localhost';
```

---

## Infrastructure Security

### Network Security

```yaml
# Firewall Rules (Recommended)
Inbound:
  - Port 80: HTTP (redirect to 443)
  - Port 443: HTTPS (Nginx reverse proxy)
  - Port 9999: SRT (restrict to authorized IPs)
  - Port 22: SSH (restrict to admin IPs)

Outbound:
  - Port 3306: MySQL (restrict to DB server IP)
  - Port 53: DNS (any)

# API Gateway
# Place Nginx in front of backend for:
# ✓ SSL/TLS termination
# ✓ Request filtering
# ✓ Rate limiting
# ✓ IP whitelisting
```

### Container Security

```dockerfile
# Dockerfile Security Best Practices
FROM node:18-alpine AS base

# Don't run as root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy dependency files first (layer caching)
COPY package*.json ./

# Install dependencies as root, then switch to nodejs user
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY --chown=nodejs:nodejs src/ src/

USER nodejs

# Use specific port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run application
CMD ["node", "src/index.js"]
```

### Kubernetes Security

```yaml
# StatefulSet with security context
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: fov-backend
spec:
  serviceName: fov-backend
  replicas: 3
  selector:
    matchLabels:
      app: fov-backend
  template:
    metadata:
      labels:
        app: fov-backend
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: backend
        image: fov-backend:0.1.0
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
```

---

## Incident Response

### Security Incident Checklist

#### 1. Data Breach (DB Credentials Exposed)

```bash
# IMMEDIATE (0-1 hour)
1. Revoke all database users
2. Create new DB user with new password
3. Check audit logs for unauthorized queries
4. Rotate JWT secret
5. Notify stakeholders

# SHORT TERM (1-24 hours)
6. Full password rotation for all users
7. Security audit of access patterns
8. Update all deployment environments
9. Implement additional monitoring

# LONG TERM (1-7 days)
10. Post-mortem analysis
11. Update security procedures
12. Implement secrets manager
13. Add automated secret rotation
```

#### 2. Unauthorized Streaming Access

```bash
# IMMEDIATE
1. Identify attacker's streamId(s)
2. Stop malicious streams: npm run stop:stream <streamId>
3. Block attacker's IP (firewall rule)
4. Review stream logs for other attacks
5. Increase monitoring sensitivity

# SHORT TERM
6. Implement authentication if not present
7. Add rate limiting
8. Implement IP whitelisting

# LONG TERM
9. Analyze attack patterns
10. Update firewall rules
11. Implement DDoS protection
```

#### 3. DoS Attack (Service Degradation)

```bash
# IMMEDIATE
1. Enable rate limiting
2. Activate IP-based blocking
3. Scale up infrastructure
4. Enable CDN/WAF protection
5. Notify CDN/hosting provider

# SHORT TERM
6. Analyze traffic patterns
7. Identify attack source
8. Implement geo-blocking if applicable

# LONG TERM
9. Implement adaptive rate limiting
10. Add more resources to infrastructure
11. Deploy DDoS mitigation service
```

### Contact List

```
Security Team Lead: security@fov.example.com
Database Administrator: dba@fov.example.com
DevOps Lead: devops@fov.example.com
CISO (if applicable): ciso@fov.example.com
Incident Response: incident@fov.example.com
```

---

## Compliance Checklist

### OWASP Top 10 (2021)

- [ ] **A01:2021 - Broken Access Control**
  - Implement authentication middleware
  - Add authorization checks
  - Use principle of least privilege

- [ ] **A02:2021 - Cryptographic Failures**
  - Enforce HTTPS/TLS
  - Use strong encryption algorithms
  - Rotate encryption keys regularly

- [ ] **A03:2021 - Injection**
  - ✅ Use parameterized queries
  - Add input validation
  - Implement input sanitization

- [ ] **A04:2021 - Insecure Design**
  - Implement threat modeling
  - Add security requirements to design
  - Conduct security review before release

- [ ] **A05:2021 - Security Misconfiguration**
  - Use secure defaults
  - Remove unnecessary components
  - Component security updates

- [ ] **A06:2021 - Vulnerable Components**
  - Regular dependency updates: `npm audit fix`
  - Use compatible, maintained versions
  - Remove unused dependencies

- [ ] **A07:2021 - Authentication Failures**
  - Implement strong authentication
  - Use secure session management
  - Implement account lockout

- [ ] **A08:2021 - Data Integrity Failures**
  - Implement data validation
  - Use digital signatures
  - Implement data integrity checks

- [ ] **A09:2021 - Logging & Monitoring Failures**
  - Log security events
  - Monitor for suspicious activity
  - Alert on anomalies

- [ ] **A10:2021 - SSRF**
  - Validate URLs in requests
  - Restrict outbound connections
  - Use allowlists for destinations

### GDPR Compliance (if applicable)

- [ ] **Data Minimization**: Only collect necessary data
- [ ] **Purpose Limitation**: Use data only for stated purpose
- [ ] **Storage Limitation**: Delete data after retention period
- [ ] **Transparency**: Clear privacy policy
- [ ] **User Rights**: Allow users to access/delete their data
- [ ] **Breach Notification**: Notify users within 72 hours of breach

---

## Security Timeline

### Month 1 (March 2025)
- [ ] Implement JWT authentication
- [ ] Add input validation middleware
- [ ] Enable request/activity logging

### Month 2 (April 2025)
- [ ] Implement rate limiting
- [ ] Database hardening (least privilege users)
- [ ] Security audit of existing code

### Month 3 (May 2025)
- [ ] Secrets rotation implementation
- [ ] WAF/DDoS protection setup
- [ ] Security penetration test

### Month 6 (June 2025)
- [ ] ISO 27001 audit (if targeting enterprise)
- [ ] Regular security training
- [ ] Automated security scanning (CI/CD)

---

## References

- [OWASP Top 10](https://owasp.org/Top10/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express.js Security](https://expressjs.com/en/advanced/best-practice-security.html)
- [SRT Protocol Security](https://github.com/Haivision/srt)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

**Document Version**: 0.1.0
**Last Updated**: 2025-03-14
**Next Review**: 2025-06-14
