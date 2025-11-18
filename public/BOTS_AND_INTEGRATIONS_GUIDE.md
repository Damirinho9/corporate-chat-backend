# 🤖 Bots and Integrations Guide

Comprehensive guide for creating bots and integrations with Corporate Chat.

## Overview

The Bots and Integrations system allows you to:
- Create automated bots that can send/receive messages
- Set up webhooks to receive real-time events
- Integrate with external services (Calendar, Jira, Trello, CRM)
- Build custom automation workflows

## Quick Start

### 1. Create a Bot (Admin Only)

```bash
POST /api/bots
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "My Bot",
  "username": "my_bot",
  "description": "A helpful bot",
  "avatar_url": "https://example.com/avatar.png"
}
```

**Response:**
```json
{
  "bot": {
    "id": 1,
    "name": "My Bot",
    "username": "my_bot",
    "api_token": "bot_abc123def456...",
    "is_active": true,
    "created_at": "2025-01-15T10:00:00Z"
  },
  "message": "Bot created successfully. Save the API token - it won't be shown again!"
}
```

**⚠️ IMPORTANT:** Save the `api_token` immediately! It's only shown once during creation.

### 2. Grant Permissions to Bot

```bash
POST /api/bots/1/permissions
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "permission_type": "send_messages",
  "resource_type": "chat",
  "resource_id": 5
}
```

**Available Permission Types:**
- `read_messages` - Read messages from chats
- `send_messages` - Send messages to chats
- `edit_messages` - Edit bot's own messages
- `delete_messages` - Delete bot's own messages
- `read_users` - View user information
- `read_chats` - View chat information
- `read_files` - Access files
- `upload_files` - Upload files
- `execute_commands` - Execute bot commands

**Resource Types:**
- `chat` - Specific chat (requires `resource_id`)
- `user` - Specific user (requires `resource_id`)
- `file` - File access
- `all` - All resources (wildcard, leave `resource_id` null)

### 3. Use Bot API

All Bot API requests require authentication with the bot token:

```bash
# Using X-Bot-Token header
curl -H "X-Bot-Token: bot_abc123..." ...

# OR using Authorization header
curl -H "Authorization: Bot bot_abc123..." ...
```

## Bot API Reference

### Send a Message

```bash
POST /api/bot-api/messages
X-Bot-Token: bot_abc123...
Content-Type: application/json

{
  "chat_id": 5,
  "content": "Hello from bot!",
  "reply_to_id": 123
}
```

### Read Messages

```bash
GET /api/bot-api/chats/5/messages?limit=50
X-Bot-Token: bot_abc123...
```

### List Accessible Chats

```bash
GET /api/bot-api/chats
X-Bot-Token: bot_abc123...
```

### Edit Bot Message

```bash
PUT /api/bot-api/messages/456
X-Bot-Token: bot_abc123...
Content-Type: application/json

{
  "content": "Updated message content"
}
```

### Delete Bot Message

```bash
DELETE /api/bot-api/messages/456
X-Bot-Token: bot_abc123...
```

### Get Bot Info

```bash
GET /api/bot-api/me
X-Bot-Token: bot_abc123...
```

## Webhooks

Webhooks allow you to receive real-time events from the chat.

### Create a Webhook

```bash
POST /api/webhooks
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "bot_id": 1,
  "name": "My Webhook",
  "url": "https://my-service.com/webhook",
  "events": [
    "message.created",
    "call.started"
  ],
  "headers": {
    "X-Custom-Header": "value"
  }
}
```

**Response:**
```json
{
  "webhook": {
    "id": 1,
    "bot_id": 1,
    "name": "My Webhook",
    "url": "https://my-service.com/webhook",
    "secret": "abc123def456...",
    "events": ["message.created", "call.started"],
    "is_active": true
  },
  "message": "Webhook created. Save the secret for signature verification."
}
```

### Available Webhook Events

| Event | Description |
|-------|-------------|
| `message.created` | New message sent in a chat |
| `message.updated` | Message edited |
| `message.deleted` | Message deleted |
| `user.joined` | User joined a chat |
| `user.left` | User left a chat |
| `chat.created` | New chat created |
| `chat.updated` | Chat settings updated |
| `call.started` | Call initiated |
| `call.ended` | Call finished |
| `file.uploaded` | File uploaded to chat |
| `reaction.added` | Reaction added to message |

### Webhook Payload Format

```json
{
  "event": "message.created",
  "data": {
    "message": {
      "id": 123,
      "chat_id": 5,
      "user_id": 10,
      "content": "Hello!",
      "created_at": "2025-01-15T10:00:00Z"
    },
    "chat": {
      "id": 5,
      "name": "General",
      "type": "group"
    },
    "user": {
      "id": 10,
      "name": "John Doe",
      "username": "john"
    }
  },
  "timestamp": "2025-01-15T10:00:00.123Z"
}
```

### Webhook Security (HMAC Verification)

Each webhook request includes an `X-Webhook-Signature` header with HMAC-SHA256 signature.

**Verify the signature:**

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(secret, payload, signature) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// In your webhook handler:
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = 'your_webhook_secret';

  if (!verifyWebhookSignature(secret, req.body, signature)) {
    return res.status(401).send('Invalid signature');
  }

  // Process webhook...
  res.status(200).send('OK');
});
```

### Test a Webhook

```bash
POST /api/webhooks/1/test
Authorization: Bearer <admin_token>
```

### View Webhook Logs

```bash
GET /api/webhooks/1/logs?limit=100
Authorization: Bearer <admin_token>
```

## Integration Examples

### Example 1: Notification Bot

```python
import requests

BOT_TOKEN = "bot_abc123..."
API_URL = "http://chat.example.com/api"

def send_notification(chat_id, message):
    response = requests.post(
        f"{API_URL}/bot-api/messages",
        headers={
            "X-Bot-Token": BOT_TOKEN,
            "Content-Type": "application/json"
        },
        json={
            "chat_id": chat_id,
            "content": message
        }
    )
    return response.json()

# Usage
send_notification(5, "🔔 Server backup completed successfully!")
```

### Example 2: Webhook Handler (Node.js)

```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = 'your_webhook_secret';

function verifySignature(payload, signature) {
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex') === signature;
}

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];

  if (!verifySignature(req.body, signature)) {
    return res.status(401).send('Invalid signature');
  }

  const { event, data } = req.body;

  console.log(`Received event: ${event}`);

  if (event === 'message.created') {
    const { message, user } = data;
    console.log(`${user.name} said: ${message.content}`);

    // Process message...
    // Maybe send to Slack, email, etc.
  }

  res.status(200).send('OK');
});

app.listen(3001, () => {
  console.log('Webhook server running on port 3001');
});
```

### Example 3: Auto-Reply Bot

```javascript
const axios = require('axios');

const BOT_TOKEN = 'bot_abc123...';
const API_URL = 'http://chat.example.com/api';

// Webhook handler that auto-replies to mentions
app.post('/webhook', async (req, res) => {
  const { event, data } = req.body;

  if (event === 'message.created') {
    const { message, chat } = data;

    // Check if bot was mentioned
    if (message.content.includes('@my_bot')) {
      // Send auto-reply
      await axios.post(
        `${API_URL}/bot-api/messages`,
        {
          chat_id: chat.id,
          content: `Hello! I'm a bot. How can I help you?`,
          reply_to_id: message.id
        },
        {
          headers: {
            'X-Bot-Token': BOT_TOKEN
          }
        }
      );
    }
  }

  res.status(200).send('OK');
});
```

## Bot Management

### List All Bots

```bash
GET /api/bots
Authorization: Bearer <admin_token>
```

### Get Bot Details

```bash
GET /api/bots/1
Authorization: Bearer <admin_token>
```

### Update Bot

```bash
PUT /api/bots/1
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Updated Bot Name",
  "is_active": true
}
```

### Regenerate Bot Token

```bash
POST /api/bots/1/regenerate-token
Authorization: Bearer <admin_token>
```

⚠️ This will invalidate the old token!

### Delete Bot

```bash
DELETE /api/bots/1
Authorization: Bearer <admin_token>
```

## Best Practices

### Security

1. **Store tokens securely** - Never commit bot tokens to version control
2. **Verify webhook signatures** - Always validate HMAC signatures
3. **Use HTTPS** - Webhook URLs should use HTTPS in production
4. **Principle of least privilege** - Only grant necessary permissions

### Performance

1. **Respond quickly to webhooks** - Return 200 OK immediately, process async
2. **Implement retry logic** - Handle webhook delivery failures gracefully
3. **Rate limiting** - Don't send too many messages too quickly
4. **Batch operations** - Group multiple API calls when possible

### Error Handling

```javascript
// Good error handling example
async function sendBotMessage(chatId, content) {
  try {
    const response = await axios.post(
      `${API_URL}/bot-api/messages`,
      { chat_id: chatId, content },
      { headers: { 'X-Bot-Token': BOT_TOKEN } }
    );
    return { success: true, data: response.data };
  } catch (error) {
    if (error.response?.status === 403) {
      console.error('Bot lacks permission to send messages');
    } else if (error.response?.status === 404) {
      console.error('Chat not found');
    } else {
      console.error('Failed to send message:', error.message);
    }
    return { success: false, error: error.message };
  }
}
```

## Troubleshooting

### Bot can't send messages
- Check bot has `send_messages` permission for the target chat
- Verify bot token is correct
- Ensure bot is active (`is_active = true`)

### Webhook not receiving events
- Check webhook is active
- Verify webhook URL is accessible
- Check webhook logs for errors: `GET /api/webhooks/:id/logs`
- Test webhook manually: `POST /api/webhooks/:id/test`

### Signature verification fails
- Ensure using exact same secret from webhook creation
- Verify payload is not modified before verification
- Check signature header name: `X-Webhook-Signature`

## Next Steps

- 📚 [Bot Commands Guide](#) - Implement slash commands
- 🔌 [Calendar Integration](#) - Connect with Google Calendar
- 📋 [Task Management](#) - Integrate Jira/Trello
- 💼 [CRM Integration](#) - Connect with Salesforce/HubSpot

## Support

For questions or issues:
- Check webhook logs for debugging
- Review bot permissions
- Contact system administrator
