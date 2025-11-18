# Phase 2 Test Suite

Automated tests for Phase 2 features: Email notifications and Socket.IO real-time events.

## Overview

Phase 2 introduces:
- **Email Notifications** - 4 types of automated emails
- **Socket.IO Events** - 6 types of real-time events
- **Real-time Collaboration** - Typing indicators, multi-agent support
- **Integration** - Email + Socket.IO working together

## Test Files

### 1. `phase2-email.test.js` - Email Notification Tests
Tests email sending for all support ticket operations:
- ✅ Ticket created email
- ✅ Ticket reply email
- ✅ Status changed email
- ✅ Assignment email
- ✅ Email service integration
- ✅ Email template validation

### 2. `phase2-socketio.test.js` - Socket.IO Event Tests
Tests real-time event emissions:
- ✅ Connection & authentication
- ✅ Room management (join/leave)
- ✅ Ticket created events
- ✅ Message events
- ✅ Status change events
- ✅ Assignment events
- ✅ Typing indicators
- ✅ Event payload structure

### 3. `phase2-integration.test.js` - Integration Tests
End-to-end tests combining email + Socket.IO:
- ✅ Complete ticket lifecycle (8 steps)
- ✅ Multi-agent collaboration
- ✅ Event/Email synchronization
- ✅ Non-blocking performance
- ✅ Error handling & resilience

## Prerequisites

### 1. Server Must Be Running
```bash
# Start server
npm start
# OR
pm2 start corporate-chat
```

### 2. Test User Account
Create a test user with these credentials (or set env vars):
- Email: `test@example.com`
- Password: `test123`
- Role: `employee` or higher

### 3. Admin/Agent Account (Optional)
For assignment and status change tests:
- Email: `admin@example.com`
- Password: `admin123`
- Role: `admin` or `assistant`

### 4. SMTP Configuration (Optional)
Set these environment variables to enable email sending:
```bash
export SMTP_HOST=smtp-relay.brevo.com
export SMTP_PORT=465
export SMTP_USER=your-smtp-user
export SMTP_PASS=your-smtp-password
export SMTP_FROM=your-from-email
```

**Note:** Tests will run without SMTP configured, but email sending will be skipped.

### 5. Dependencies
```bash
# Install socket.io-client for Socket.IO tests
npm install --save-dev socket.io-client
```

## Running Tests

### Run All Phase 2 Tests
```bash
npm run test:phase2
```

### Run Individual Test Suites
```bash
# Email tests only
npm run test:phase2:email

# Socket.IO tests only
npm run test:phase2:socketio

# Integration tests only
npm run test:phase2:integration
```

### Run All Support Tests (Phase 1 + Phase 2)
```bash
npm test
# OR
npm run test:support
```

## Environment Variables

Set these variables to customize test behavior:

```bash
# API Configuration
export API_URL=http://localhost:3000

# Test User Credentials
export TEST_USER_EMAIL=test@example.com
export TEST_USER_PASSWORD=test123

# Admin User Credentials (for assignment tests)
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD=admin123

# SMTP Configuration (optional)
export SMTP_HOST=smtp-relay.brevo.com
export SMTP_PORT=465
export SMTP_USER=your-smtp-user
export SMTP_PASS=your-smtp-password
export SMTP_FROM=your-from-email
```

## Test Output

### Successful Test Run
```
╔════════════════════════════════════════════════════════════╗
║       Phase 2: Email + Socket.IO Test Suite               ║
╚════════════════════════════════════════════════════════════╝

🔍 Checking if server is running...
✅ Server is running

📋 Test Configuration:
   API URL: http://localhost:3000
   Test User: test@example.com
   SMTP Configured: Yes

═══════════════════════════════════════════════════════════
🧪 Running Phase 2: Email Notification Tests
═══════════════════════════════════════════════════════════
✅ All email tests passed

═══════════════════════════════════════════════════════════
🧪 Running Phase 2: Socket.IO Event Tests
═══════════════════════════════════════════════════════════
✅ All Socket.IO tests passed

═══════════════════════════════════════════════════════════
🧪 Running Phase 2: Integration Tests
═══════════════════════════════════════════════════════════
✅ All integration tests passed

═══════════════════════════════════════════════════════════
📊 Phase 2 Test Summary
═══════════════════════════════════════════════════════════

✅ All Phase 2 Tests Passed!

🎉 Phase 2 Features Working:
   • Email notifications (4 types)
   • Socket.IO real-time events (6 types)
   • End-to-end integration
   • Typing indicators
   • Multi-agent collaboration
```

## What Gets Tested

### Email Notifications
- ✅ Email sent when ticket is created
- ✅ Email sent when message is added (public messages only)
- ✅ Email sent when status changes
- ✅ Email sent when ticket is assigned
- ✅ Email templates contain correct data
- ✅ Professional HTML formatting
- ✅ Non-blocking async sending
- ✅ Graceful error handling

### Socket.IO Events
- ✅ `support:ticket_created` - Broadcast to support_queue
- ✅ `support:ticket_message` - Broadcast to ticket room
- ✅ `support:ticket_updated` - Broadcast to ticket room + queue
- ✅ `support:ticket_status_changed` - Broadcast to ticket room + queue
- ✅ `support:ticket_assigned` - Broadcast to ticket room + assigned agent
- ✅ `support:user_typing` - Broadcast to ticket room
- ✅ Room management (join/leave)
- ✅ JWT authentication
- ✅ Event payload structure

### Integration
- ✅ Complete ticket lifecycle (create → assign → message → status change → resolve)
- ✅ Both email AND Socket.IO triggered for each operation
- ✅ Multiple agents can collaborate on same ticket
- ✅ Typing indicators work across clients
- ✅ Real-time updates visible to all participants
- ✅ Non-blocking performance (API responds quickly)
- ✅ Graceful degradation if email fails
- ✅ System works without Socket.IO connection

## Troubleshooting

### Tests Fail with "Server not running"
**Solution:** Start the server first:
```bash
npm start
# OR
pm2 start corporate-chat
```

### Tests Fail with "Authentication failed"
**Solution:** Create test users or update environment variables:
```bash
# Create test user via API or database
# OR set correct credentials
export TEST_USER_EMAIL=your-test-user@example.com
export TEST_USER_PASSWORD=your-password
```

### Tests Timeout or Hang
**Solution:**
- Check server logs for errors
- Ensure database is running
- Check Socket.IO connection (port 3000 accessible)
- Try running individual test suites instead of all at once

### Email Tests Show "Email not sent"
**Solution:** This is normal if SMTP is not configured. Tests will pass but log warnings:
```
⚠️  SMTP not configured - emails will be skipped
💡 Set SMTP_PASS environment variable to enable emails
```

To actually send emails, configure SMTP variables.

### Socket.IO Connection Errors
**Solution:**
- Ensure server has Socket.IO initialized
- Check firewall/network settings
- Verify JWT token is valid
- Check server logs for Socket.IO errors

## Test Data Cleanup

Tests create tickets and messages in the database. To clean up:

```sql
-- View test tickets
SELECT * FROM support_tickets
WHERE subject LIKE '[%TEST%'
ORDER BY created_at DESC;

-- Delete test tickets (careful!)
DELETE FROM support_ticket_messages
WHERE ticket_id IN (
    SELECT id FROM support_tickets
    WHERE subject LIKE '[%TEST%'
);

DELETE FROM support_tickets
WHERE subject LIKE '[%TEST%';
```

Or use the API to delete tickets individually.

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Phase 2 Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_DB: corporate_chat
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Initialize database
        run: npm run db:init

      - name: Start server
        run: npm start &
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/corporate_chat

      - name: Wait for server
        run: sleep 5

      - name: Run Phase 2 tests
        run: npm run test:phase2
        env:
          TEST_USER_EMAIL: test@example.com
          TEST_USER_PASSWORD: test123
          ADMIN_EMAIL: admin@example.com
          ADMIN_PASSWORD: admin123
```

## Architecture

### Email Flow
```
API Endpoint (routes/support.js)
    ↓
sendTicketCreatedEmail() - async, non-blocking
    ↓
Nodemailer SMTP Transport
    ↓
Email Sent (or error logged)
```

### Socket.IO Flow
```
API Endpoint (routes/support.js)
    ↓
getIO() - get Socket.IO instance
    ↓
emitTicketCreated() - emit to rooms
    ↓
io.to('support_queue').emit()
    ↓
Connected clients receive event
```

### Room Structure
- `support_queue` - All agents (for new tickets)
- `ticket_{id}` - All participants of specific ticket
- `user_{id}` - Personal notifications for specific user

## Coverage

Phase 2 tests cover:
- ✅ 100% of email notification types
- ✅ 100% of Socket.IO event types
- ✅ Complete ticket lifecycle
- ✅ Multi-user scenarios
- ✅ Error handling paths
- ✅ Performance characteristics

## Next Steps

After Phase 2 tests pass:
- ✅ Phase 2 is complete and verified
- 🚀 Ready to proceed to Phase 3 (Auto-assignment + SLA monitoring)
- 📊 Consider load testing for Socket.IO scalability
- 🔒 Consider security testing for Socket.IO authentication

## Support

If tests fail or you encounter issues:
1. Check server logs: `pm2 logs corporate-chat`
2. Check database connection
3. Verify environment variables
4. Review this README
5. Check test output for specific error messages
