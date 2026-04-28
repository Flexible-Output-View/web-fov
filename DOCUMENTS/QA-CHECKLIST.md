# FOV Backend - Quality Assurance Checklist

This checklist ensures backend quality before commits and deployments.

## Pre-Commit Checklist

Run these commands before committing code:

### Code Quality
- [ ] **Linting**: `npm run lint` passes with no errors
- [ ] **Auto-fix issues**: `npm run lint:fix` applied
- [ ] **Code Review**: Manual review of changes
- [ ] **Comments**: Added for complex logic

### Testing
- [ ] **Unit Tests**: `npm test` passes with no failures
- [ ] **Coverage**: Coverage report shows ≥ 50%
- [ ] **Edge Cases**: Tests cover error scenarios
- [ ] **Mocking**: External dependencies properly mocked

### Database
- [ ] **SQL Queries**: All use parameterized queries (no string interpolation)
- [ ] **Connection**: Properly released/returned to pool
- [ ] **Null Handling**: Edge cases handled
- [ ] **No N+1**: Queries optimized

### Security
- [ ] **No Secrets**: No API keys, passwords in code
- [ ] **Input Validation**: Basic validation present
- [ ] **Error Messages**: Don't expose system details
- [ ] **CORS**: Properly configured for environment

### Documentation
- [ ] **Function Comments**: Public functions documented
- [ ] **Parameter Types**: Function parameters described
- [ ] **Return Values**: Return values documented
- [ ] **Error Handling**: Exception behavior documented

---

## Pre-Deployment Checklist

Before deploying to production:

### Code Review
- [ ] **Peer Review**: At least one approval
- [ ] **No TODOs**: Remove debug comments
- [ ] **Console Logs**: Only for important events
- [ ] **Dead Code**: Remove unused functions

### Testing
- [ ] **Full Test Suite**: `npm test` passes
- [ ] **Coverage**: Maintained or improved (≥50%)
- [ ] **Integration Tests**: Tested with real database
- [ ] **Manual Testing**: Features tested manually

### Performance
- [ ] **No Memory Leaks**: Check with `--max-old-space-size=2048`
- [ ] **Database Queries**: Indexed and optimized
- [ ] **Response Times**: API responses < 1 second
- [ ] **Load Testing**: Tested with 100+ concurrent requests

### Security
- [ ] **Secrets Scanning**: No hardcoded credentials
- [ ] **Dependency Audit**: `npm audit` passes
- [ ] **Input Validation**: Comprehensive validation
- [ ] **Authentication**: Verified if required
- [ ] **HTTPS**: Configured in reverse proxy
- [ ] **Rate Limiting**: Implemented if needed

### Configuration
- [ ] **Environment Variables**: All required vars defined
- [ ] **Database**: Production database verified
- [ ] **Error Handling**: No stack traces in responses
- [ ] **Logging**: Structured and secure

### Deployment
- [ ] **Backup**: Database backup taken
- [ ] **Version Tag**: Git tag created
- [ ] **CHANGELOG**: Updated with version
- [ ] **Runbook**: Rollback procedure documented
- [ ] **Health Check**: Endpoint verified

---

## Continuous Integration (CI)

The GitHub Actions workflow automatically runs on push and PR:

### `.github/workflows/backend-tests.yml` triggers:

```yaml
on:
  push:
    paths:
      - "backend/**"
  pull_request:
    branches: [main]
```

**Steps:**
1. Checkout code
2. Setup Node.js v20
3. Install dependencies (`npm ci`)
4. Lint code (`npm run lint`)
5. Run tests with coverage (`npm test`)
6. Upload coverage report as artifact

### Checking CI Results

**GitHub:**
1. Go to Pull Request
2. Scroll to "Checks" section
3. Review "Backend Tests & Lint" workflow
4. Green checkmark = all tests passed

**Failed CI?**
```bash
# Reproduce locally
npm run lint:fix
npm test

# Commit and push again
git add .
git commit -m "fix: linting issues"
git push
```

---

## Test Coverage Analysis

### Current Coverage Targets

```javascript
// jest.config.js
coverageThreshold: {
    global: {
        branches: 50,      // 50% of decision points
        functions: 50,     // 50% of functions
        lines: 50,        // 50% of code lines
        statements: 50    // 50% of statements
    }
}
```

### View Coverage Report

```bash
npm test

# Open in browser
open coverage/lcov-report/index.html
```

### Improving Coverage

**Add missing tests:**
```bash
# Identify uncovered lines
npm test -- --coverage --verbose

# Find files with lowest coverage
# Edit coverage/lcov-report/index.html

# Add tests for that module
touch src/__tests__/module.test.js
```

**Example:**
```javascript
// If `getSegmentCount()` shows only 60% coverage
describe('getSegmentCount', () => {
    test('should handle file system errors', () => {
        // Test error case
    });
    test('should return 0 for invalid content', () => {
        // Test edge case
    });
});
```

---

## Common QA Tasks

### Test Everything Before Commit

```bash
#!/bin/bash
# save as scripts/pre-commit.sh

echo "🧹 Fixing lint issues..."
npm run lint:fix || exit 1

echo "🧪 Running tests..."
npm test || exit 1

echo "✅ All checks passed!"
echo "Ready to commit: git add . && git commit"
```

Make executable:
```bash
chmod +x scripts/pre-commit.sh
./scripts/pre-commit.sh
```

### Generate Coverage Report

```bash
npm test

# Create summary
coverage_percentage=$(cat coverage/coverage-summary.json | grep -o '"lines":[^}]*' | grep -o '[0-9.]*')

echo "Coverage: ${coverage_percentage}%"
if (( $(echo "$coverage_percentage < 50" | bc -l) )); then
    echo "⚠️ Coverage below 50% threshold"
    exit 1
fi
```

### Profile Performance

```bash
# With profiling
node --prof src/index.js

# Generate analysis
# Hit endpoints, then Ctrl+C
node --prof-process isolate-*.log > profiling-result.txt

# View results
cat profiling-result.txt
```

---

## Automated Quality Checks

### GitHub Branch Protection

Set up in GitHub repo settings:

**Settings → Branches → Add rule for `main`:**
- ✅ Require status checks to pass
  - `Backend Tests & Lint`
- ✅ Require branches to be up to date
- ✅ Require code review approval (1 person)
- ✅ Dismiss stale reviews
- ✅ Delete head branches

This prevents merging without passing tests and review.

### Pre-commit Hook (Local)

**Install Husky:**
```bash
npm install husky --save-dev
npx husky install
```

**Add pre-commit hook:**
```bash
npx husky add .husky/pre-commit "npm run lint && npm test"
```

Now tests run automatically before each commit.

---

## Monitoring Post-Deployment

### Health Checks

```bash
# Check API is responding
curl http://localhost:4000/
# Expected: {"ok":true,"message":"FOV backend running"}

# Check specific endpoints
curl http://localhost:4000/api/
# Expected: {"ok":true,"api":true}
```

### Error Monitoring

**Watch logs:**
```bash
docker logs -f fov-backend

# Or if not containerized
tail -f ~/.pm2/logs/backend-out.log
```

**Look for:**
- ❌ Errors or exceptions
- ⚠️ Warnings about connection issues
- 🔴 Database connection failures

### Performance Monitoring

**Response time:**
```bash
# Simple request timer
time curl http://localhost:4000/api/

# Should complete in < 1 second
```

**Memory leak detection:**
```bash
# Monitor memory usage over time
watch -n 5 'ps aux | grep "node src/index"'

# Memory should remain stable, not growing infinitely
```

---

## Incident Response

### If Tests Are Failing

1. **Reproduce locally:**
   ```bash
   npm test
   ```

2. **Check recent changes:**
   ```bash
   git log -1 --stat
   git diff HEAD~1
   ```

3. **Run specific test for debugging:**
   ```bash
   npm test -- users.test.js
   npm test -- --verbose
   ```

4. **Check dependencies:**
   ```bash
   npm audit
   npm list --depth=0
   ```

5. **Revert if critical:**
   ```bash
   git revert HEAD
   git push
   ```

### If Linting Fails

```bash
npm run lint       # See issues
npm run lint:fix   # Auto-fix most
npm run lint       # Verify fixed
```

### If Coverage Drops

1. Run coverage report:
   ```bash
   npm test -- --coverage
   open coverage/lcov-report/index.html
   ```

2. Identify new uncovered code
3. Write tests for those lines
4. Commit with message: `test: improve coverage for module-name`

---

## Resources

- [Jest Testing Guide](https://jestjs.io/docs/getting-started)
- [ESLint Rules Reference](https://eslint.org/docs/rules/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Code Coverage Best Practices](https://martinfowler.com/bliki/TestCoverage.html)

---

**Checklist Version**: 1.0  
**Last Updated**: April 2026
