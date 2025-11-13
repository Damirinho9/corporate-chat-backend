# Group Calls Testing Guide

## Overview
This document outlines how to test the group/department call functionality with invite links that was just implemented.

## Features Implemented

### 1. Permission-Based Call Initiation
- ✅ Admin and ROP users can initiate calls in group and department chats
- ✅ ROP users can only initiate calls in their own department
- ✅ Regular users can only see call buttons in direct chats

### 2. Invite Link System
- ✅ Each call generates a unique invite token (64-character hex string)
- ✅ Invite links allow external users to join without being in original participants list
- ✅ Invite links format: `http://yourdomain.com/call.html?invite=<token>`

### 3. Call Features (via Jitsi)
- ✅ Screen sharing (desktop button in toolbar)
- ✅ Recording (for moderators only)
- ✅ Livestreaming (for moderators only)
- ✅ Reactions and hand raising
- ✅ Chat functionality
- ✅ Video quality settings
- ✅ Background blur
- ✅ Mute controls

## Database Changes

**Migration Applied:** `009_add_invite_token_to_calls.sql`
- Added `invite_token` column to `calls` table (VARCHAR(64) UNIQUE)
- Added index `idx_calls_invite_token` for fast lookups

## API Endpoints

### POST `/api/calls/initiate`
**Request:**
```json
{
  "callType": "video",  // or "audio"
  "chatId": 123         // For group/department chats
}
```

**Response:**
```json
{
  "call": {
    "id": 456,
    "roomName": "call-1-1699999999999-abc123def456",
    "callType": "video",
    "callMode": "group",
    "status": "pending",
    "inviteLink": "http://localhost:3000/call.html?invite=abcd1234...",
    "inviteToken": "abcd1234...",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "jitsi": { ... }
}
```

### POST `/api/calls/join-by-invite`
**Request:**
```json
{
  "inviteToken": "abcd1234..."
}
```

**Response:**
```json
{
  "call": { ... },
  "jitsi": { ... }
}
```

## Testing Scenarios

### Scenario 1: Admin Creates Group Video Call

1. **Login as admin user**
2. **Open a group chat or department chat**
3. **Verify call buttons are visible** (📞 and 📹 buttons in chat header)
4. **Click the video call button (📹)**
5. **Verify:**
   - Call window opens in new tab
   - Invite link modal appears with the link
   - Call type shows "Видеозвонок - Corporate Chat" in window title

### Scenario 2: Copy and Share Invite Link

1. **After creating group call, modal appears with invite link**
2. **Click "Копировать" button**
3. **Verify:** Toast notification shows "Ссылка скопирована в буфер обмена"
4. **Open invite link in new browser tab/incognito window**
5. **Verify:**
   - User joins the same call
   - Both participants can see each other (for video calls)
   - Both participants can hear each other

### Scenario 3: ROP Department Call

1. **Login as ROP user**
2. **Open your department chat**
3. **Verify:** Call buttons are visible
4. **Create audio call (📞)**
5. **Verify:**
   - Call window opens with "Аудиозвонок - Corporate Chat" title
   - Video is OFF by default
   - Invite link modal appears

### Scenario 4: ROP Cannot Call Other Departments

1. **Login as ROP user**
2. **Try to open a different department chat (not your department)**
3. **Verify:** Call buttons are NOT visible

### Scenario 5: Regular User in Group Chat

1. **Login as regular user (role: 'user')**
2. **Open a group chat**
3. **Verify:** Call buttons are NOT visible (no permissions)
4. **BUT:** User can still join via invite link if shared

### Scenario 6: Screen Sharing

1. **Join a video call (any type)**
2. **Look for the "desktop" button in Jitsi toolbar** (monitor icon)
3. **Click to share screen**
4. **Select window/screen to share**
5. **Verify:** Other participants can see your screen

### Scenario 7: Recording (Admin/Moderator Only)

1. **Create call as admin**
2. **Look for "recording" button in Jitsi toolbar**
3. **Start recording**
4. **Verify:** Recording indicator appears for all participants
5. **Regular users (non-moderators) should NOT see recording button**

## Automated Test Script

A test script is provided: `test_group_call.js`

**Requirements:**
- Server must be running (port 3000)
- node-fetch@2 must be installed: `npm install node-fetch@2`
- Valid admin token in the script

**Run:**
```bash
node test_group_call.js
```

**What it tests:**
1. Fetches list of chats
2. Finds a group or department chat
3. Creates a video call in that chat
4. Verifies invite token is generated
5. Tests joining via invite token endpoint

## Troubleshooting

### Call buttons not visible
- Check user role: only admin/rop for group/department chats
- Check chat type: all users for direct chats
- Verify frontend code is loaded (check browser console)

### Invite link not working
- Verify invite_token column exists in database
- Check that migration `009_add_invite_token_to_calls.sql` was applied
- Verify token is being generated in `/api/calls/initiate` response

### Audio calls starting with video
- This was fixed with `startAudioOnly: true` in jitsiHelper.js
- Check call.html logs: should show "Audio call detected"
- Verify callType is passed correctly to generateJitsiConfig()

### Screen sharing not working
- Screen sharing requires HTTPS in production
- Check browser permissions for screen sharing
- Verify 'desktop' button is in TOOLBAR_BUTTONS array

### Permission errors
- For department calls: verify ROP user's department matches chat's department
- For group calls: verify user has admin or rop role
- Check auth token is valid and not expired

## Files Modified

### Backend
- `routes/calls.js` - Added permission checks, invite token generation, join-by-invite endpoint
- `utils/jitsiHelper.js` - Added screen sharing to toolbar, callType parameter support
- `database/migrations/009_add_invite_token_to_calls.sql` - Database schema update

### Frontend
- `public/index.html` - Updated button visibility logic, added invite link modal
- `public/call.html` - Added invite token support, dynamic title based on call type

### Testing
- `test_group_call.js` - Automated test script for group calls

## Success Criteria

✅ All scenarios above pass successfully
✅ No errors in browser console or server logs
✅ Invite links work for users not in original participants list
✅ Permissions properly restrict who can initiate group calls
✅ Audio calls start without video
✅ Video calls start with video
✅ Screen sharing works
✅ Recording/livestreaming available for moderators only

## Notes

- Default Jitsi server: meet.jit.si (can be changed via JITSI_DOMAIN env var)
- JWT authentication optional (controlled by JITSI_USE_JWT env var)
- Call tokens valid for 24 hours
- Invite tokens never expire (until call ends)
- Screen sharing requires appropriate browser permissions
