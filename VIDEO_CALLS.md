# Video/Audio Calls - Corporate Chat

Comprehensive guide for implementing and using video/audio calling functionality in Corporate Chat application.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Socket.IO Events](#socketio-events)
9. [Client Integration](#client-integration)
10. [Jitsi Meet Integration](#jitsi-meet-integration)
11. [Self-Hosting Jitsi](#self-hosting-jitsi)
12. [Security](#security)
13. [Troubleshooting](#troubleshooting)

## Overview

The video/audio calling system provides enterprise-grade communication capabilities comparable to Google Meet, Microsoft Teams, and Zoom. Built on Jitsi Meet, it offers:

- **1-on-1 Calls**: Direct audio/video calls between two users
- **Group Calls**: Multi-party conferencing with unlimited participants
- **Screen Sharing**: Share your screen during calls
- **Recording**: Record calls for later review (moderator only)
- **Real-time Signaling**: Instant call notifications via Socket.IO
- **Call History**: Complete audit trail of all calls
- **Moderator Controls**: Host can manage participants and end calls

## Architecture

```
┌─────────────────┐
│   Client App    │
│  (Web Browser)  │
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌──────────────────┐
│   REST API      │  │   Socket.IO      │
│  /api/calls/*   │  │  Real-time       │
└────────┬────────┘  │  Signaling       │
         │           └──────────┬───────┘
         ▼                      │
┌─────────────────────────────┐│
│      PostgreSQL              ││
│  - calls                     ││
│  - call_participants         ││
│  - call_events               ││
└──────────────────────────────┘│
                                │
         ┌──────────────────────┘
         ▼
┌─────────────────────────────┐
│      Jitsi Meet             │
│   Video Conferencing        │
│   (meet.jit.si or           │
│    self-hosted)             │
└─────────────────────────────┘
```

### Component Responsibilities

1. **REST API** (`routes/calls.js`):
   - Call lifecycle management (initiate, join, leave, end)
   - Participant management
   - Call history and statistics
   - JWT token generation for Jitsi

2. **Socket.IO** (`socket/callSignaling.js`):
   - Real-time call notifications
   - Participant status updates
   - Call state synchronization
   - Immediate feedback for user actions

3. **Jitsi Helper** (`utils/jitsiHelper.js`):
   - JWT token generation for secure access
   - Jitsi configuration management
   - Room name generation
   - URL generation for meetings

4. **UI Component** (`public/call.html`):
   - Full-page Jitsi Meet embed
   - Event handling and user feedback
   - Integration with backend via Socket.IO

## Features

### Call Types

1. **Audio Calls**: Voice-only communication
2. **Video Calls**: Full video + audio communication
3. **Screen Sharing**: Share your screen with participants

### Call Modes

1. **Direct**: 1-on-1 calls between two users
2. **Group**: Multi-party conferencing with multiple participants

### Participant States

- **invited**: User has been invited but hasn't responded
- **joined**: User is actively in the call
- **left**: User has left the call
- **declined**: User declined the invitation

### Call States

- **pending**: Call initiated, waiting for participants
- **ongoing**: Call is active with participants
- **ended**: Call has been terminated

## Installation

The video calling system is already integrated into the application. Required dependencies:

```bash
npm install jsonwebtoken
```

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# Jitsi Meet Configuration
JITSI_DOMAIN=meet.jit.si
JITSI_APP_ID=corporate_chat
JITSI_APP_SECRET=your_jitsi_secret_change_in_production_min_32_chars
JITSI_USE_JWT=false
```

### Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `JITSI_DOMAIN` | Jitsi server domain | `meet.jit.si` |
| `JITSI_APP_ID` | Application identifier for JWT | `corporate_chat` |
| `JITSI_APP_SECRET` | Secret key for JWT signing | Required if using JWT |
| `JITSI_USE_JWT` | Enable JWT authentication | `false` |

### Using Public Jitsi Server

By default, the system uses the free public Jitsi server (`meet.jit.si`):

- ✅ No setup required
- ✅ Free and unlimited
- ❌ No JWT authentication
- ❌ Anyone with room name can join
- ❌ Dependent on public service availability

### Using Self-Hosted Jitsi

For production deployments, self-hosting is recommended:

```env
JITSI_DOMAIN=meet.yourcompany.com
JITSI_APP_ID=corporate_chat
JITSI_APP_SECRET=your_secret_min_32_chars
JITSI_USE_JWT=true
```

Benefits:
- ✅ Full control and customization
- ✅ JWT authentication for security
- ✅ Better privacy and compliance
- ✅ Custom branding
- ✅ No dependency on external services

## Database Schema

### Table: `calls`

Stores information about each call.

```sql
CREATE TABLE calls (
  id SERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL UNIQUE,
  call_type VARCHAR(20) NOT NULL CHECK (call_type IN ('audio', 'video', 'screen')),
  call_mode VARCHAR(20) NOT NULL CHECK (call_mode IN ('direct', 'group')),
  initiated_by INTEGER NOT NULL REFERENCES users(id),
  chat_id INTEGER REFERENCES chats(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration INTEGER,
  recording_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table: `call_participants`

Tracks participants in each call.

```sql
CREATE TABLE call_participants (
  id SERIAL PRIMARY KEY,
  call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'invited',
  is_moderator BOOLEAN DEFAULT false,
  joined_at TIMESTAMP,
  left_at TIMESTAMP,
  duration INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(call_id, user_id)
);
```

### Table: `call_events`

Audit log for all call events.

```sql
CREATE TABLE call_events (
  id SERIAL PRIMARY KEY,
  call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Event Types

- `initiated`: Call was created
- `joined`: User joined the call
- `left`: User left the call
- `declined`: User declined the invitation
- `ended`: Call was ended

## API Endpoints

All endpoints require authentication via JWT token in the `Authorization` header.

### Check Jitsi Configuration

```http
GET /api/calls/config/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "configured": true,
  "useJWT": false,
  "domain": "meet.jit.si",
  "warnings": []
}
```

### Initiate a Call

Create a new call and invite participants.

```http
POST /api/calls/initiate
Authorization: Bearer <token>
Content-Type: application/json

{
  "callType": "video",
  "participants": [2, 3, 4],
  "chatId": 1
}
```

**Parameters:**
- `callType` (required): `"audio"`, `"video"`, or `"screen"`
- `participants` (required): Array of user IDs to invite
- `chatId` (optional): Associated chat ID

**Response:**
```json
{
  "call": {
    "id": 42,
    "roomName": "call-1-abc123def456",
    "callType": "video",
    "callMode": "group",
    "status": "pending",
    "createdAt": "2025-01-13T10:30:00Z"
  },
  "jitsi": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "meetingUrl": "https://meet.jit.si/call-1-abc123def456#jwt=eyJ...",
    "config": {
      "roomName": "call-1-abc123def456",
      "userInfo": {
        "name": "John Doe",
        "email": "john@corporate-chat.local"
      },
      "configOverwrite": { /* Jitsi config */ },
      "interfaceConfigOverwrite": { /* UI config */ }
    }
  }
}
```

### Join a Call

Join an existing call you've been invited to.

```http
POST /api/calls/:callId/join
Authorization: Bearer <token>
```

**Response:**
```json
{
  "call": {
    "id": 42,
    "roomName": "call-1-abc123def456",
    "callType": "video",
    "callMode": "group",
    "status": "ongoing",
    "startedAt": "2025-01-13T10:31:00Z"
  },
  "jitsi": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "meetingUrl": "https://meet.jit.si/call-1-abc123def456#jwt=eyJ...",
    "config": { /* Jitsi configuration */ }
  }
}
```

### Leave a Call

Leave the call gracefully.

```http
POST /api/calls/:callId/leave
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully left the call"
}
```

### End a Call (Moderator Only)

Terminate the call for all participants.

```http
POST /api/calls/:callId/end
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Call ended successfully"
}
```

### Decline a Call

Decline an invitation to join.

```http
POST /api/calls/:callId/decline
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Call declined"
}
```

### Get Call Details

Get information about a specific call.

```http
GET /api/calls/:callId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "call": {
    "id": 42,
    "roomName": "call-1-abc123def456",
    "callType": "video",
    "callMode": "group",
    "status": "ended",
    "initiatedBy": {
      "id": 1,
      "name": "John Doe",
      "username": "john"
    },
    "chatId": 1,
    "startedAt": "2025-01-13T10:31:00Z",
    "endedAt": "2025-01-13T11:00:00Z",
    "duration": 1740,
    "createdAt": "2025-01-13T10:30:00Z"
  },
  "participants": [
    {
      "id": 1,
      "userId": 1,
      "name": "John Doe",
      "username": "john",
      "role": "admin",
      "status": "left",
      "isModerator": true,
      "joinedAt": "2025-01-13T10:31:00Z",
      "leftAt": "2025-01-13T11:00:00Z",
      "duration": 1740
    },
    {
      "id": 2,
      "userId": 2,
      "name": "Jane Smith",
      "username": "jane",
      "role": "user",
      "status": "left",
      "isModerator": false,
      "joinedAt": "2025-01-13T10:32:00Z",
      "leftAt": "2025-01-13T11:00:00Z",
      "duration": 1680
    }
  ]
}
```

### Get Call History

Retrieve user's call history with pagination.

```http
GET /api/calls/history/all?limit=50&offset=0
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (optional): Number of calls to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "calls": [
    {
      "id": 42,
      "room_name": "call-1-abc123def456",
      "call_type": "video",
      "call_mode": "group",
      "status": "ended",
      "initiator_name": "John Doe",
      "participants_count": "3",
      "started_at": "2025-01-13T10:31:00Z",
      "ended_at": "2025-01-13T11:00:00Z",
      "duration": 1740,
      "created_at": "2025-01-13T10:30:00Z"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

### Get Active Calls

Get all currently active calls for the user.

```http
GET /api/calls/active/all
Authorization: Bearer <token>
```

**Response:**
```json
{
  "activeCalls": [
    {
      "id": 43,
      "room_name": "call-1-xyz789abc123",
      "call_type": "video",
      "call_mode": "direct",
      "status": "ongoing",
      "initiator_name": "Jane Smith",
      "participants_count": "2",
      "created_at": "2025-01-13T12:00:00Z"
    }
  ]
}
```

## Socket.IO Events

### Client → Server Events

#### `call_incoming`

Notify a user about an incoming call (sent by initiator after API call).

```javascript
socket.emit('call_incoming', {
  callId: 42,
  participants: [2, 3]
});
```

#### `call_accept`

Accept an incoming call.

```javascript
socket.emit('call_accept', {
  callId: 42
});
```

#### `call_decline`

Decline an incoming call.

```javascript
socket.emit('call_decline', {
  callId: 42
});
```

#### `call_join`

Join a call room (emitted after successful `/join` API call).

```javascript
socket.emit('call_join', {
  callId: 42
});
```

#### `call_leave`

Leave a call room.

```javascript
socket.emit('call_leave', {
  callId: 42
});
```

#### `call_end`

End a call (moderator only).

```javascript
socket.emit('call_end', {
  callId: 42
});
```

#### `call_status_update`

Update participant status (audio/video mute, screen sharing).

```javascript
socket.emit('call_status_update', {
  callId: 42,
  status: {
    audio_muted: false,
    video_off: false,
    screen_sharing: true
  }
});
```

#### `call_recording_started` / `call_recording_stopped`

Notify about recording state changes.

```javascript
socket.emit('call_recording_started', { callId: 42 });
socket.emit('call_recording_stopped', { callId: 42 });
```

### Server → Client Events

#### `call_incoming`

Receive notification about an incoming call.

```javascript
socket.on('call_incoming', (data) => {
  // data: { callId, roomName, callType, initiatedBy }
  // Show incoming call UI
});
```

#### `call_accepted`

Another participant accepted the call.

```javascript
socket.on('call_accepted', (data) => {
  // data: { callId, userId, userName }
});
```

#### `call_declined`

A participant declined the call.

```javascript
socket.on('call_declined', (data) => {
  // data: { callId, userId, userName }
});
```

#### `call_participant_joined`

A participant joined the call.

```javascript
socket.on('call_participant_joined', (data) => {
  // data: { callId, userId, userName, participants }
});
```

#### `call_participant_left`

A participant left the call.

```javascript
socket.on('call_participant_left', (data) => {
  // data: { callId, userId, userName, participants }
});
```

#### `call_ended`

The call has been ended.

```javascript
socket.on('call_ended', (data) => {
  // data: { callId, endedBy }
  // Close the call UI
});
```

#### `call_participant_status`

Participant status changed (mute/unmute, camera on/off).

```javascript
socket.on('call_participant_status', (data) => {
  // data: { callId, userId, status }
});
```

#### `call_recording_started` / `call_recording_stopped`

Recording state changed.

```javascript
socket.on('call_recording_started', (data) => {
  // data: { callId }
  // Show recording indicator
});
```

## Client Integration

### Basic Implementation

```javascript
// 1. Initiate a call
async function startCall(participants, callType = 'video') {
  try {
    const response = await fetch('/api/calls/initiate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        callType,
        participants,
        chatId: currentChatId
      })
    });

    const data = await response.json();

    // Notify participants via Socket.IO
    socket.emit('call_incoming', {
      callId: data.call.id,
      participants
    });

    // Open call window
    window.open(`/call.html?callId=${data.call.id}&token=${authToken}`, '_blank');

    return data;
  } catch (error) {
    console.error('Failed to start call:', error);
  }
}

// 2. Listen for incoming calls
socket.on('call_incoming', (data) => {
  showIncomingCallUI(data);
});

// 3. Accept a call
async function acceptCall(callId) {
  try {
    // Join via API
    const response = await fetch(`/api/calls/${callId}/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const data = await response.json();

    // Notify others
    socket.emit('call_accept', { callId });

    // Open call window
    window.open(`/call.html?callId=${callId}&token=${authToken}`, '_blank');
  } catch (error) {
    console.error('Failed to join call:', error);
  }
}

// 4. Decline a call
async function declineCall(callId) {
  try {
    await fetch(`/api/calls/${callId}/decline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    socket.emit('call_decline', { callId });
  } catch (error) {
    console.error('Failed to decline call:', error);
  }
}
```

### React Component Example

```jsx
import React, { useState, useEffect } from 'react';
import { useSocket } from './SocketContext';

function CallButton({ participants, chatId }) {
  const socket = useSocket();
  const [incomingCall, setIncomingCall] = useState(null);

  useEffect(() => {
    socket.on('call_incoming', (data) => {
      setIncomingCall(data);
    });

    return () => {
      socket.off('call_incoming');
    };
  }, [socket]);

  const startCall = async (callType) => {
    const response = await fetch('/api/calls/initiate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        callType,
        participants,
        chatId
      })
    });

    const data = await response.json();

    socket.emit('call_incoming', {
      callId: data.call.id,
      participants
    });

    window.open(`/call.html?callId=${data.call.id}`, '_blank');
  };

  return (
    <div>
      <button onClick={() => startCall('audio')}>
        Audio Call
      </button>
      <button onClick={() => startCall('video')}>
        Video Call
      </button>

      {incomingCall && (
        <IncomingCallModal
          call={incomingCall}
          onAccept={() => acceptCall(incomingCall.callId)}
          onDecline={() => declineCall(incomingCall.callId)}
        />
      )}
    </div>
  );
}
```

## Jitsi Meet Integration

### Jitsi External API

The system uses Jitsi Meet External API for embedding video conferencing:

```html
<!-- Include Jitsi External API -->
<script src="https://meet.jit.si/external_api.js"></script>

<script>
const domain = 'meet.jit.si';
const options = {
  roomName: 'call-1-abc123def456',
  width: '100%',
  height: '100%',
  parentNode: document.querySelector('#jitsi-container'),
  userInfo: {
    displayName: 'John Doe',
    email: 'john@corporate-chat.local'
  },
  configOverwrite: {
    startWithAudioMuted: false,
    startWithVideoMuted: false,
    enableWelcomePage: false,
    prejoinPageEnabled: false
  },
  interfaceConfigOverwrite: {
    SHOW_JITSI_WATERMARK: false,
    DEFAULT_REMOTE_DISPLAY_NAME: 'Participant'
  },
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // If using JWT
};

const api = new JitsiMeetExternalAPI(domain, options);
</script>
```

### Jitsi Events

```javascript
// Conference joined
api.addEventListener('videoConferenceJoined', () => {
  console.log('Joined the call');
});

// Conference left
api.addEventListener('videoConferenceLeft', () => {
  console.log('Left the call');
  window.close();
});

// Participant joined
api.addEventListener('participantJoined', (participant) => {
  console.log('Participant joined:', participant);
});

// Participant left
api.addEventListener('participantLeft', (participant) => {
  console.log('Participant left:', participant);
});

// Audio mute status changed
api.addEventListener('audioMuteStatusChanged', (status) => {
  console.log('Audio muted:', status.muted);
});

// Video mute status changed
api.addEventListener('videoMuteStatusChanged', (status) => {
  console.log('Video muted:', status.muted);
});

// Screen sharing status changed
api.addEventListener('screenSharingStatusChanged', (status) => {
  console.log('Screen sharing:', status.on);
});

// Recording status changed
api.addEventListener('recordingStatusChanged', (status) => {
  console.log('Recording:', status.on);
});
```

### Jitsi Commands

```javascript
// Mute/unmute audio
api.executeCommand('toggleAudio');

// Mute/unmute video
api.executeCommand('toggleVideo');

// Start/stop screen sharing
api.executeCommand('toggleShareScreen');

// Hang up
api.executeCommand('hangup');

// Toggle chat
api.executeCommand('toggleChat');

// Toggle raise hand
api.executeCommand('toggleRaiseHand');
```

## Self-Hosting Jitsi

### Installation on Ubuntu 22.04

```bash
# 1. Install Jitsi Meet
echo 'deb https://download.jitsi.org stable/' | sudo tee /etc/apt/sources.list.d/jitsi-stable.list
wget -qO - https://download.jitsi.org/jitsi-key.gpg.key | sudo apt-key add -
sudo apt update
sudo apt install jitsi-meet

# 2. Configure SSL (Let's Encrypt)
sudo /usr/share/jitsi-meet/scripts/install-letsencrypt-cert.sh

# 3. Enable JWT authentication
sudo apt install jitsi-meet-tokens
```

### JWT Configuration for Self-Hosted Jitsi

Edit `/etc/jitsi/meet/meet.yourcompany.com-config.js`:

```javascript
var config = {
    hosts: {
        domain: 'meet.yourcompany.com',
        muc: 'conference.meet.yourcompany.com'
    },
    bosh: '//meet.yourcompany.com/http-bind',

    // Enable JWT
    enableUserRolesBasedOnToken: true,

    // Other configuration...
};
```

Edit `/etc/jitsi/jicofo/sip-communicator.properties`:

```properties
org.jitsi.jicofo.auth.URL=XMPP:meet.yourcompany.com
org.jitsi.jicofo.auth.DISABLE_AUTOLOGIN=true
```

Edit `/etc/prosody/conf.avail/meet.yourcompany.com.cfg.lua`:

```lua
VirtualHost "meet.yourcompany.com"
    authentication = "token"
    app_id = "corporate_chat"
    app_secret = "your_jitsi_secret_min_32_chars"
    allow_empty_token = false
```

Restart services:

```bash
sudo systemctl restart prosody jicofy jitsi-videobridge2
```

### Update Application Configuration

```env
JITSI_DOMAIN=meet.yourcompany.com
JITSI_APP_ID=corporate_chat
JITSI_APP_SECRET=your_jitsi_secret_min_32_chars
JITSI_USE_JWT=true
```

## Security

### JWT Authentication

When using JWT authentication:

1. **Tokens are short-lived**: Valid only for the specific call
2. **User identification**: Tokens include user ID, name, and email
3. **Moderator control**: Only designated moderators can record/livestream
4. **Room isolation**: Each call has a unique room name

### JWT Token Structure

```json
{
  "iss": "corporate_chat",
  "sub": "meet.yourcompany.com",
  "aud": "jitsi",
  "exp": 1705147200,
  "nbf": 1705143600,
  "context": {
    "user": {
      "id": "123",
      "name": "John Doe",
      "email": "john@corporate-chat.local",
      "moderator": "true"
    },
    "features": {
      "livestreaming": "true",
      "recording": "true"
    }
  },
  "room": "call-1-abc123def456",
  "moderator": true
}
```

### Room Name Security

Room names are generated with:
- User ID prefix
- Timestamp component
- Random string
- Unique across all calls

Format: `call-{userId}-{timestamp}{random}`

Example: `call-1-abc123def456`

### Database Security

- All foreign keys with `ON DELETE CASCADE` or `ON DELETE SET NULL`
- Participant access checks before joining calls
- Moderator-only operations (end call, recording)
- Audit trail in `call_events` table

## Troubleshooting

### Issue: Jitsi Meet not loading

**Symptoms**: Blank screen or loading spinner

**Solutions**:
1. Check browser console for errors
2. Verify `JITSI_DOMAIN` is accessible
3. Check if JWT token is valid (if using JWT)
4. Ensure Jitsi External API script is loaded:
   ```html
   <script src="https://meet.jit.si/external_api.js"></script>
   ```

### Issue: "Call not found" error

**Symptoms**: 404 error when joining call

**Solutions**:
1. Verify call ID exists in database
2. Check if user is a participant
3. Ensure call status is not 'ended'

### Issue: "You are not a participant" error

**Symptoms**: 403 error when trying to join

**Solutions**:
1. Verify user was invited to the call
2. Check `call_participants` table for user entry
3. Ensure invitation was sent via API

### Issue: JWT token errors

**Symptoms**: "Invalid token" or authentication failures

**Solutions**:
1. Verify `JITSI_APP_SECRET` matches Jitsi server configuration
2. Check `JITSI_APP_ID` is correct
3. Ensure system clock is synchronized (JWT uses timestamps)
4. Verify Jitsi server is configured for JWT authentication

### Issue: Camera/microphone not working

**Symptoms**: No video or audio in call

**Solutions**:
1. Check browser permissions for camera/microphone
2. Ensure HTTPS is used (required for WebRTC)
3. Test on different browsers
4. Check if media devices are available:
   ```javascript
   navigator.mediaDevices.enumerateDevices()
   ```

### Issue: Participants can't see each other

**Symptoms**: Joined call but no video streams

**Solutions**:
1. Check firewall settings (UDP ports 10000-20000)
2. Verify TURN/STUN server configuration
3. Test network connectivity
4. Check Jitsi server logs

### Issue: Recording not working

**Symptoms**: Recording button disabled or not saving

**Solutions**:
1. Verify user is a moderator
2. Check Jitsi server has Jibri configured (for self-hosted)
3. Ensure recording permissions in JWT token
4. Check server storage capacity

### Debug Mode

Enable debug logging:

```javascript
// In call.html, add before Jitsi initialization
window.JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.TRACE);
```

### Database Queries for Debugging

```sql
-- Check active calls
SELECT * FROM calls WHERE status IN ('pending', 'ongoing');

-- Check call participants
SELECT c.room_name, u.name, cp.status, cp.joined_at
FROM call_participants cp
JOIN calls c ON cp.call_id = c.id
JOIN users u ON cp.user_id = u.id
WHERE c.id = <call_id>;

-- Check call events
SELECT ce.*, u.name
FROM call_events ce
LEFT JOIN users u ON ce.user_id = u.id
WHERE ce.call_id = <call_id>
ORDER BY ce.created_at;

-- Find calls without participants
SELECT c.* FROM calls c
LEFT JOIN call_participants cp ON c.id = cp.call_id
WHERE cp.id IS NULL;
```

## Support

For issues and questions:
- Check the [Jitsi Meet documentation](https://jitsi.github.io/handbook/)
- Review server logs
- Check browser console for errors
- Verify database tables and data integrity

## Future Enhancements

Potential improvements:
- [ ] Breakout rooms for group calls
- [ ] Virtual backgrounds
- [ ] Noise suppression
- [ ] Live captions/transcription
- [ ] Call scheduling
- [ ] Waiting room
- [ ] Hand raise notifications
- [ ] Call analytics dashboard
- [ ] Mobile app integration
- [ ] SIP integration for phone calls
