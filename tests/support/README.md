# Support System Automated Tests

Comprehensive test suite for the technical support system.

## 📋 Test Coverage

### API Tests (`api.test.js`)
Tests all support API endpoints:
- ✅ Health check
- ✅ Knowledge Base (categories, articles, search)
- ✅ Tickets (CRUD operations)
- ✅ Ticket messages
- ✅ Chatbot interactions
- ✅ Statistics and analytics
- ✅ Input validation
- ✅ Error handling

### Workflow Tests (`workflow.test.js`)
Tests complete user journeys:
- ✅ Complete ticket lifecycle (creation → resolution → rating)
- ✅ Chatbot to ticket escalation
- ✅ Knowledge base self-service flow
- ✅ Agent-customer interactions
- ✅ Multi-step workflows

## 🚀 Quick Start

### Prerequisites
1. Server must be running on `http://localhost:3000`
2. Test user must exist in database:
   - Email: `test@example.com` (or set `TEST_USER_EMAIL`)
   - Password: `test123` (or set `TEST_USER_PASSWORD`)

### Run All Tests
```bash
npm test
# or
npm run test:support
```

### Run Specific Test Suite
```bash
# API tests only
npm run test:api

# Workflow tests only
npm run test:workflow
```

### Using Shell Script (Linux/Mac)
```bash
./scripts/run-support-tests.sh
```

## ⚙️ Configuration

Set environment variables to customize test behavior:

```bash
# API endpoint
export API_URL="http://localhost:3000"

# Test user credentials
export TEST_USER_EMAIL="test@example.com"
export TEST_USER_PASSWORD="test123"

# Run tests
npm test
```

## 📊 Test Output

### Successful Run
```
╔════════════════════════════════════════════════════════════╗
║       Support System Automated Test Suite                 ║
╚════════════════════════════════════════════════════════════╝

🔍 Checking if server is running...
✅ Server is running

📋 Test Configuration:
   API URL: http://localhost:3000
   Test User: test@example.com

═══════════════════════════════════════════════════════════
🧪 Running API Tests
═══════════════════════════════════════════════════════════

✅ All Tests Passed!

🎉 Support system is working correctly
```

### Failed Test
```
❌ Some Tests Failed

Results:
  ✅ API Tests
  ❌ Workflow Tests
```

## 🔍 Detailed Test Descriptions

### API Tests

#### Health & Status
- Verifies API is responding
- Checks health endpoint

#### Knowledge Base
- Retrieves categories list
- Retrieves articles list
- Gets single article by slug
- Tests search functionality
- Validates article structure

#### Tickets
- Creates new ticket
- Lists all tickets
- Gets ticket details
- Adds messages to ticket
- Filters by status and priority
- Tests validation (missing fields, short description)
- Handles non-existent resources

#### Chatbot
- Processes chatbot messages
- Tests different intents (greetings, escalation, help)
- Verifies response structure

#### Statistics
- Retrieves support statistics
- Tests different time periods (7d, 30d)
- Validates metrics (tickets, SLA, CSAT)

### Workflow Tests

#### Complete Ticket Lifecycle
Simulates a customer creating and resolving a ticket:
1. Customer creates ticket
2. Ticket appears in queue
3. Agent views ticket details
4. Agent replies to ticket
5. Customer replies back
6. View conversation history
7. Agent marks as resolved
8. Customer rates resolution
9. Verify in statistics

#### Chatbot to Ticket Escalation
Tests chatbot handoff to human agent:
1. User starts chatbot conversation
2. User requests human agent
3. System suggests ticket creation
4. Verify conversation history saved

#### Knowledge Base Self-Service
Tests KB search and usage:
1. User searches knowledge base
2. User views article
3. User marks article as helpful

## 🐛 Debugging Failed Tests

### Common Issues

**Server Not Running**
```
❌ Server is not running!
```
**Solution:** Start the server first:
```bash
npm start
# or
pm2 start corporate-chat
```

**Authentication Failed**
```
⚠️  Authentication failed, some tests may be skipped
```
**Solution:** Create test user or set correct credentials:
```sql
INSERT INTO users (email, password_hash, name, role)
VALUES ('test@example.com', '$2b$10$...', 'Test User', 'employee');
```

**Tests Skipped**
```
⏭️  Skipping: not authenticated
```
**Reason:** Test requires authentication but login failed
**Solution:** Check `TEST_USER_EMAIL` and `TEST_USER_PASSWORD`

### View Detailed Logs

Tests save detailed logs to:
- `/tmp/api-test-output.log`
- `/tmp/workflow-test-output.log`

```bash
# View API test log
cat /tmp/api-test-output.log

# View workflow test log
cat /tmp/workflow-test-output.log
```

## 📝 Adding New Tests

### Create New Test File

```javascript
const { describe, it, before } = require('node:test');
const assert = require('node:assert');

describe('My New Test Suite', () => {
    before(async () => {
        // Setup code
    });

    it('should do something', async () => {
        // Test code
        assert.strictEqual(1 + 1, 2);
    });
});
```

### Run New Test

```bash
node --test tests/support/my-new-test.js
```

### Add to Test Runner

Edit `scripts/run-support-tests.js` and add:
```javascript
results.myTest = await runTest('tests/support/my-new-test.js', 'My New Tests');
```

## 🎯 Test Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Remove test data after tests complete
3. **Descriptive Names**: Use clear test descriptions
4. **Assertions**: Include meaningful assertion messages
5. **Documentation**: Comment complex test logic

## 📈 Continuous Integration

### GitHub Actions Example

```yaml
name: Support System Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: corporate_chat
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Setup database
        run: npm run db:init

      - name: Start server
        run: npm start &

      - name: Wait for server
        run: sleep 5

      - name: Run tests
        run: npm test
```

## 📚 Resources

- [Node.js Test Runner](https://nodejs.org/api/test.html)
- [Assert Module](https://nodejs.org/api/assert.html)
- [Support System API Docs](../../SUPPORT_SYSTEM_GUIDE.md)

## 🤝 Contributing

When adding new features to the support system:

1. Write tests first (TDD)
2. Run `npm test` before committing
3. Ensure all tests pass
4. Document new test cases

## 📞 Support

If tests are failing and you need help:
1. Check server logs: `pm2 logs corporate-chat`
2. Review test logs in `/tmp/`
3. Check database connectivity
4. Verify test user exists

---

**Last Updated:** 2025-01-18
**Version:** 1.0.0
