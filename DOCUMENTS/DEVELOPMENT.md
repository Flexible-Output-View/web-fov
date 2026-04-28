# FOV Backend - Development Guide

## Getting Started

### Prerequisites
- Node.js v20+
- npm v8+
- MySQL 8.0+ (for testing against real DB)
- Git
- A code editor (VS Code recommended)

### Initial Setup

```bash
# 1. Clone and enter backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env

# 4. Update .env with your local database
#    DB_HOST=localhost
#    DB_USER=root (or your user)
#    DB_PASSWORD=your_password
#    DB_NAME=fovwebdb

# 5. Verify database connection
node test-db.js
# Expected output: ✅ Connected! ✅ Query result: [...]

# 6. Start development server
npm run dev
# Expected output: 🚀 Server listening on http://localhost:4000
```

---

## Development Workflow

### Running the Server

**Development (with hot-reload):**
```bash
npm run dev
```
Uses `nodemon` to auto-restart on file changes. Server runs on http://localhost:4000

**Production Build:**
```bash
npm start
```
Single process, requires manual restart on code changes.

### Testing

**Run all tests:**
```bash
npm test
```

Generates coverage report in `coverage/` directory.

**Watch mode (recommended during development):**
```bash
npm run test:watch
```

Re-runs affected tests on file save.

**Example output:**
```
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
Coverage: 62% statements, 48% branches
```

### Code Quality

**Check linting:**
```bash
npm run lint
```

Detects code style violations.

**Auto-fix issues:**
```bash
npm run lint:fix
```

Automatically corrects most ESLint violations (indentation, quotes, semicolons, etc).

**Example violations:**
```
/backend/src/users.js
  5:4  error  Unexpected var, use const or let  no-var
  12:1 error  Missing semicolon                 semi
  18:5 warning Unexpected console statement     no-console
```

---

## Project Structure Guide

### Adding a New Route

Example: Add a new `/api/comments` endpoint

**1. Create route file:**
```bash
touch src/routes/comments.js
```

**2. Implement handler:**
```javascript
// src/routes/comments.js
import express from 'express';
const router = express.Router();
import db from '../db.js';

router.get('/:streamId', async (req, res, next) => {
    try {
        const rows = await db.query(
            'SELECT * FROM comments WHERE stream_id = ? ORDER BY created_at DESC',
            [req.params.streamId]
        );
        res.json({ data: rows });
    } catch (err) {
        next(err); // Pass to error handler
    }
});

export default router;
```

**3. Register in main routes file:**
```javascript
// src/routes/index.js
import comments from './comments.js';

router.use('/comments', comments); // This line
```

**4. Test your endpoint:**
```bash
curl http://localhost:4000/api/comments/1
```

**5. Add tests:**
```bash
# src/__tests__/comments.test.js
import request from 'supertest';
import app from '../index.js';
import db from '../db.js';

jest.mock('../db.js');

describe('Comments Routes', () => {
    // ... write tests
});
```

### Modifying Database Queries

**Current practice:**
```javascript
const rows = await db.query(
    'SELECT id, username FROM users WHERE id = ?',
    [id]
);
```

**Best practices:**
- Always use parameterized queries (prevent SQL injection)
- Use `?` placeholders, never string concatenation
- Handle `null` returns explicitly
- Release connections properly (handled by pool)

### Adding Environment Variables

**1. Define in `.env`:**
```
MY_NEW_VAR=value
```

**2. Use in code:**
```javascript
const myVar = process.env.MY_NEW_VAR || 'default_value';
```

**3. Document in `.env.example`:**
```
# My new configuration
MY_NEW_VAR=default_value
```

---

## Debugging

### Enable Verbose Logging

**Option 1: Add console statements**
```javascript
console.log('Debug:', variableName);
```

**Option 2: Use Node debugger**
```bash
node --inspect-brk src/index.js
# Then open DevTools in Chrome: chrome://inspect
```

### Common Issues

**"Cannot find module 'express'"**
```bash
npm install
```

**"Port 4000 is already in use"**
```bash
# Find process using port
lsof -i :4000
# Kill it
kill -9 <PID>
# Or change in .env: PORT=5000
```

**Database connection hangs**
- Check MySQL is running: `mysql -u admin -p`
- Verify credentials in `.env`
- Check MySQL version: `mysql --version`

**Tests fail with "Cannot find module"**
```bash
# Make sure jest.config.js exists and is correct
npm test -- --detectOpenHandles
```

---

## Code Standards

### Style Guide

**Variables:**
```javascript
const USER_LIMIT = 100;           // Constants: UPPER_SNAKE_CASE
const userName = 'John';          // Variables: camelCase
const getUserById = () => {};     // Functions: camelCase
class UserManager {}              // Classes: PascalCase
```

**Async/Await:**
```javascript
// ✅ Good
async function fetchUser(id) {
    try {
        const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
        return user[0];
    } catch (err) {
        console.error('Failed to fetch user:', err);
        throw err;
    }
}

// ❌ Bad (uses callback)
function fetchUser(id, callback) {
    db.query('...', [id], (err, result) => {
        // Harder to read, easy to forget error handling
    });
}
```

**Error Handling:**
```javascript
// ✅ Good
try {
    const result = await db.query(sql, params);
} catch (err) {
    next(err); // Route handlers
    // or
    res.status(500).json({ error: err.message }); // Direct response
}

// ❌ Bad
db.query(sql, params); // Ignores errors silently
```

### Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Variable | camelCase | `userName`, `streamCount` |
| Constant | UPPER_SNAKE_CASE | `DB_LIMIT`, `HLS_PORT` |
| Function | camelCase | `getUserById()`, `validateEmail()` |
| Class | PascalCase | `UserService`, `StreamManager` |
| File | kebab-case or camelCase | `user-routes.js` or `userRoutes.js` |
| Database | snake_case | `user_id`, `created_at` |

---

## Testing Guidelines

### Writing Tests

**Structure:**
```javascript
describe('Feature to test', () => {
    beforeEach(() => {
        // Setup before each test
    });

    test('should do something', async () => {
        // Arrange
        const input = 'test';
        
        // Act
        const result = await functionToTest(input);
        
        // Assert
        expect(result).toBe('expected');
    });

    afterEach(() => {
        // Cleanup after each test
        jest.clearAllMocks();
    });
});
```

**Mocking Database:**
```javascript
jest.mock('../db.js');

db.query.mockResolvedValue([{id: 1, name: 'Test'}]);
// OR
db.query.mockRejectedValue(new Error('DB Error'));
```

### Coverage Goals

Current threshold (in `jest.config.js`):
```javascript
coverageThreshold: {
    global: {
        branches: 50,        // 50% of branch paths
        functions: 50,       // 50% of functions
        lines: 50,          // 50% of lines
        statements: 50      // 50% of statements
    }
}
```

To view coverage report:
```bash
npm test
open coverage/lcov-report/index.html
```

---

## Contributing

### Before Committing

1. **Run linter:**
   ```bash
   npm run lint:fix
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Check coverage hasn't dropped:**
   ```bash
   npm test
   # View coverage/lcov-report/index.html
   ```

4. **Commit with meaningful message:**
   ```bash
   git commit -m "feat: add user authentication routes"
   ```

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Code style (lint, formatting)
- `test:` Tests
- `chore:` Dependencies, config

**Examples:**
```
feat(users): add password hashing
fix(streams): handle missing HLS segments
docs(readme): clarify installation steps
test(db): increase coverage to 75%
```

---

## Performance Optimization

### Database Query Optimization

**Use indexes:**
```sql
CREATE INDEX idx_user_id ON streams(user_id);
CREATE INDEX idx_created_at ON comments(created_at DESC);
```

**Monitor slow queries:**
```bash
# In MySQL
SET GLOBAL slow_query_log='ON';
SET GLOBAL long_query_time=2;
```

### Connection Pooling Tuning

Adjust in `src/db.js`:
```javascript
const pool = mysql.createPool({
    connectionLimit: 10,  // Increase if hitting limits
    enableKeepAlive: true,
    keepAliveInitialDelayMs: 0,
});
```

---

## Useful Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with hot-reload |
| `npm test` | Run tests with coverage |
| `npm run test:watch` | Watch mode for tests |
| `npm run lint` | Check code style |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm start` | Production start |
| `node test-db.js` | Test database connection |

---

## Resources

- [Express.js Docs](https://expressjs.com/)
- [MySQL 2 Documentation](https://github.com/sidorares/node-mysql2)
- [Jest Testing Framework](https://jestjs.io/)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [RESTful API Best Practices](https://restfulapi.net/)

---

**Last Updated:** April 2026
