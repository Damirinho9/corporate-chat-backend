# Running Phase 2 Tests

## ✅ Phase 2 Tests Are Ready!

All Phase 2 test files have been created and committed:
- tests/support/phase2-email.test.js (Email notifications)
- tests/support/phase2-socketio.test.js (Socket.IO events)
- tests/support/phase2-integration.test.js (End-to-end integration)
- scripts/run-phase2-tests.js (Test runner)

## 🚀 How to Run the Tests

### Step 1: Make sure the server is running

The tests require the server to be running on port 3000.

**Option A: Using your existing PM2 setup (recommended)**
```bash
# Check PM2 status
pm2 status

# If corporate-chat is showing errors or port conflicts:
pm2 delete corporate-chat
pm2 start ecosystem.config.js

# Check logs to ensure it's running
pm2 logs corporate-chat --lines 20
```

**Option B: Using npm start in a separate terminal**
```bash
# In one terminal:
npm start

# Then in another terminal, run the tests
```

### Step 2: Set up test user credentials

You need either:

**Option 1: Use default test user (test@example.com / test123)**
- If you have a user with these credentials, no setup needed!

**Option 2: Set custom test credentials via environment variables**
```bash
export TEST_USER_EMAIL=your-existing-user@example.com
export TEST_USER_PASSWORD=your-password
export ADMIN_EMAIL=your-admin@example.com
export ADMIN_PASSWORD=your-admin-password
```

**Option 3: Create the test user via the database**
```sql
-- Create test user
INSERT INTO users (name, email, password, role, department, is_active)
VALUES (
    'Test User',
    'test@example.com',
    '$2a$10$YourHashedPasswordHere',  -- bcrypt hash of 'test123'
    'employee',
    'IT',
    true
);

-- Create admin user for full tests
INSERT INTO users (name, email, password, role, department, is_active)
VALUES (
    'Admin User',
    'admin@example.com',
    '$2a$10$YourHashedPasswordHere',  -- bcrypt hash of 'admin123'
    'admin',
    'IT',
    true
);
```

### Step 3: Run the tests!

```bash
# Run all Phase 2 tests (recommended)
npm run test:phase2

# OR run individual test suites
npm run test:phase2:email          # Email notifications only
npm run test:phase2:socketio       # Socket.IO events only
npm run test:phase2:integration    # Integration tests only

# OR run ALL support tests (Phase 1 + Phase 2)
npm test
```

## 📊 Expected Output

When tests run successfully, you'll see:

```
╔════════════════════════════════════════════════════════════╗
║       Phase 2: Email + Socket.IO Test Suite               ║
╚════════════════════════════════════════════════════════════╝

🔍 Checking if server is running...
✅ Server is running

📋 Test Configuration:
   API URL: http://localhost:3000
   Test User: test@example.com
   SMTP Configured: Yes/No

═══════════════════════════════════════════════════════════
🧪 Running Phase 2: Email Notification Tests
═══════════════════════════════════════════════════════════
[Test output...]
✅ Phase 2 Email Tests Passed

[... more tests ...]

✅ All Phase 2 Tests Passed!
```

## 🔧 Troubleshooting

### "Server is not running"
- Verify: `curl http://localhost:3000/api/health`
- Should return: `{"status":"healthy"}`
- Fix: Start server with `npm start` or PM2

### "Authentication failed"
- Tests are skipping authenticated endpoints
- Fix: Set TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables
- Or create the test user in the database

### "Missing script: test:phase2"
- The package.json wasn't reloaded by npm
- Fix: The scripts ARE there, npm should recognize them now
- Verify: `npm run` (shows all available scripts)

### Port 3000 already in use
```bash
# Find process using port 3000
lsof -i :3000
# OR
ps aux | grep node

# Kill the process
kill -9 <PID>

# Then restart server
```

## 📧 SMTP Configuration (Optional)

To test actual email sending (not required for tests to pass):

```bash
export SMTP_HOST=smtp-relay.brevo.com
export SMTP_PORT=465
export SMTP_USER=your-smtp-user
export SMTP_PASS=your-smtp-password
export SMTP_FROM=your-from-email
```

Without SMTP configured, tests will still run but email sending will be skipped.

## ✨ What Gets Tested

### Email Notification Tests
- ✅ Ticket created email
- ✅ Ticket reply email
- ✅ Status changed email
- ✅ Assignment email
- ✅ Email template validation
- ✅ Non-blocking async behavior
- ✅ Error handling

### Socket.IO Event Tests
- ✅ Connection & JWT authentication
- ✅ Room management (join/leave)
- ✅ support:ticket_created event
- ✅ support:ticket_message event
- ✅ support:ticket_status_changed event
- ✅ support:ticket_assigned event
- ✅ support:user_typing event
- ✅ Event payload structure

### Integration Tests
- ✅ Complete ticket lifecycle (8 steps)
- ✅ Multi-agent collaboration
- ✅ Event/Email synchronization
- ✅ Non-blocking performance
- ✅ Error handling & resilience

## 📝 Notes

- Tests create tickets in the database (with [TEST] prefix in subject)
- You can clean them up later if needed
- Tests are designed to work with or without SMTP configured
- Some tests require both regular user AND admin user credentials
- Full test suite takes ~30-60 seconds to complete

## 🎯 Quick Start (TL;DR)

```bash
# 1. Ensure server is running
pm2 status  # or npm start in another terminal

# 2. Run tests
npm run test:phase2

# That's it!
```
