# Running Phase 3 Tests

## ✅ Phase 3 Tests Are Ready!

Phase 3 implements AI & Automation features:
- **Auto-assignment engine** - Intelligent ticket routing to agents
- **SLA monitoring & alerts** - Real-time SLA tracking and breach notifications
- **AI chatbot** - Intent-based conversational support
- **Workflow automation** - Auto-actions and webhooks

## 🚀 How to Run the Tests

### Step 1: Make sure the server is running

The tests require the server to be running on port 3000.

```bash
# Using PM2 (recommended)
pm2 status
pm2 start ecosystem.config.js

# OR using npm start in a separate terminal
npm start
```

### Step 2: Set up test credentials

You need test user credentials:

**Option 1: Use default test user (test@example.com / test123)**
- If you have a user with these credentials, no setup needed!

**Option 2: Set custom test credentials via environment variables**
```bash
export TEST_USER_EMAIL=your-existing-user@example.com
export TEST_USER_PASSWORD=your-password
export ADMIN_EMAIL=your-admin@example.com
export ADMIN_PASSWORD=your-admin-password
```

### Step 3: Run the tests!

```bash
# Run all Phase 3 tests (recommended)
npm run test:phase3

# OR run automation tests directly
npm run test:phase3:automation

# OR run ALL support tests (Phase 1 + Phase 2 + Phase 3)
npm test
```

## 📊 Expected Output

When tests run successfully, you'll see:

```
╔════════════════════════════════════════════════════════════╗
║       Phase 3: AI & Automation Test Suite                ║
╚════════════════════════════════════════════════════════════╝

🔍 Checking if server is running...
✅ Server is running

📋 Test Configuration:
   API URL: http://localhost:3000
   Test User: test@example.com
   Admin User: admin@example.com

═══════════════════════════════════════════════════════════
🧪 Running Phase 3: Automation Tests
═══════════════════════════════════════════════════════════
[Test output...]

✅ All Phase 3 Tests Passed!

🎉 Phase 3 Features Working:
   • Auto-assignment engine
   • SLA monitoring & alerts
   • AI chatbot with intent detection
   • Workflow automation & webhooks
   • Complete automation lifecycle
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

### Auto-assignment not working
- Need to create support teams and team members in database
- See `database/migrations/016_create_support_system.sql` for schema
- Auto-assignment requires available agents with capacity

### SLA monitoring issues
- SLA monitor runs every 5 minutes by default
- Check server logs: `pm2 logs corporate-chat`
- SLA alerts are sent via Socket.IO and internal notes

## ✨ What Gets Tested

### Auto-Assignment Tests
- ✅ Automatic ticket assignment to agents
- ✅ Respect agent capacity limits
- ✅ Priority-based assignment
- ✅ Category-based team routing
- ✅ Balanced assignment strategy

### SLA Monitoring Tests
- ✅ SLA due dates calculated by priority
- ✅ First response time tracking
- ✅ Resolution time tracking
- ✅ SLA breach detection
- ✅ Warning alerts at 75%, 90%, 95%

### AI Chatbot Tests
- ✅ Greeting detection
- ✅ Password reset intent
- ✅ Bug report detection
- ✅ Human agent escalation
- ✅ Knowledge base article suggestions
- ✅ Confidence scoring

### Workflow Automation Tests
- ✅ Workflow triggers on ticket events
- ✅ Auto-actions based on conditions
- ✅ Auto-tagging for bug tickets
- ✅ Critical ticket auto-escalation
- ✅ Webhook notifications (Slack, Teams, custom)

### Integration Tests
- ✅ Complete automation lifecycle (chatbot → ticket → auto-assign → SLA → workflow)
- ✅ End-to-end automation flow

## 📝 Phase 3 Features

### 1. Auto-Assignment Engine

**Location:** `utils/autoAssignment.js`

**Features:**
- Multiple assignment strategies (round-robin, least-loaded, skill-based, balanced)
- Respect agent capacity limits
- Category-based team routing
- Priority-aware assignment
- Working hours enforcement
- Agent ticket count tracking

**Usage:**
```javascript
const autoAssignment = require('./utils/autoAssignment');

// Auto-assign ticket
await autoAssignment.assignTicket(ticketId);

// Bulk assign pending tickets
await autoAssignment.autoAssignPendingTickets();

// Get assignment stats
const stats = await autoAssignment.getStats(7); // Last 7 days
```

### 2. SLA Monitoring

**Location:** `utils/slaMonitor.js`

**Features:**
- Background monitoring every 5 minutes
- Alert thresholds at 75%, 90%, 95%
- SLA breach detection and marking
- Real-time alerts via Socket.IO
- Compliance statistics

**Usage:**
```javascript
const slaMonitor = require('./utils/slaMonitor');

// Start monitoring (runs automatically on server start)
slaMonitor.start();

// Get tickets at risk
const atRisk = await slaMonitor.getTicketsAtRisk(30); // Within 30 min

// Get compliance stats
const stats = await slaMonitor.getComplianceStats(7);
```

### 3. AI Chatbot

**Location:** `utils/supportChatbot.js`

**Features:**
- Intent detection (greeting, password reset, bug report, etc.)
- Confidence scoring
- Knowledge base integration
- Conversation escalation to tickets
- Session management
- Multi-language support (Russian/English)

**Intents:**
- `greeting` - Hello, hi, здравствуйте
- `password_reset` - Forgot password
- `login_problem` - Can't login
- `file_upload` - Upload errors
- `slow_performance` - Performance issues
- `bug_report` - Errors and bugs
- `feature_request` - Feature suggestions
- `billing` - Payment questions
- `request_human` - Escalate to agent
- `thanks` - Gratitude
- `goodbye` - Farewell

### 4. Workflow Automation

**Location:** `utils/workflowAutomation.js`

**Features:**
- Event-based workflow triggers
- Auto-actions based on conditions
- Webhook notifications (Slack, Teams, custom)
- Async non-blocking execution

**Triggers:**
- `ticket_created` - New ticket created
- `ticket_assigned` - Ticket assigned to agent
- `ticket_status_changed` - Status updated
- `ticket_resolved` - Ticket resolved
- `ticket_closed` - Ticket closed
- `sla_breached` - SLA deadline missed
- `sla_warning` - SLA approaching
- `message_added` - New message
- `customer_rating` - Customer feedback

**Auto-Actions:**
- Escalate critical priority tickets
- Auto-close well-rated resolved tickets
- Auto-tag bug tickets with "needs-investigation"

## 🎯 Quick Start (TL;DR)

```bash
# 1. Ensure server is running
pm2 status

# 2. Run Phase 3 tests
npm run test:phase3

# That's it!
```

## 🔗 Related Documentation

- `tests/support/README-PHASE2.md` - Phase 2 (Email + Socket.IO) documentation
- `SUPPORT_SYSTEM_GUIDE.md` - Complete support system guide
- `SUPPORT_IMPLEMENTATION_ROADMAP.md` - Implementation roadmap

## 💡 Next Steps

After Phase 3 tests pass:
- ✅ Phase 3 is complete and verified
- 🎊 **All 3 Phases Complete!**
- 📊 Consider performance testing under load
- 🔒 Security audit for chatbot and webhooks
- 🌐 Deploy to production
