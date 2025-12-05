const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { sendNewMessageNotification } = require('../controllers/pushController');

// Store connected users
const connectedUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // socketId -> userId
const typingUsers = new Map(); // chatId -> Set of userIds

// Initialize Socket.IO
let ioInstance = null;

const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
            credentials: true
        },
        // 🔥 VPN/RUSSIA FIX: Aggressive settings for VPN, DPI, Russian restrictions
        pingTimeout: 45000,        // ⚡ Match client pingTimeout
        pingInterval: 15000,       // ⚡ More frequent pings to detect dead connections

        // ⚡ Support both transports for DPI bypass
        transports: ['polling', 'websocket'],
        allowUpgrades: true,

        // ⚡ Increase limits for slow VPN connections
        maxHttpBufferSize: 1e7,    // 10MB buffer for slow connections
        httpCompression: true,      // Compress to save bandwidth on VPN

        // ⚡ Connection timeout
        connectTimeout: 30000,      // 30s to establish connection

        // ⚡ Allow more connections per client for reconnects
        perMessageDeflate: {
            threshold: 1024
        }
    });

    ioInstance = io;

    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;

            if (!token) {
                return next(new Error('Authentication token required'));
            }

            // Verify JWT
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from database
            const result = await query(
                'SELECT id, username, name, role, department, is_active FROM users WHERE id = $1',
                [decoded.userId]
            );

            if (result.rows.length === 0 || !result.rows[0].is_active) {
                return next(new Error('User not found or inactive'));
            }

            socket.user = result.rows[0];
            next();
        } catch (error) {
            console.error('Socket authentication error:', error);
            next(new Error('Authentication failed'));
        }
    });

    io.on('connection', async (socket) => {
        console.log(`✅ User connected: ${socket.user.name} (${socket.user.id})`);

        const userId = socket.user.id;

        // Store connection
        connectedUsers.set(userId, socket.id);
        userSockets.set(socket.id, userId);

        // Update user status to online
        await query(
            'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
            [userId]
        );

        // Get user's chats and join rooms
        try {
            const chatsResult = await query(
                `SELECT DISTINCT c.id 
                 FROM chats c
                 JOIN chat_participants cp ON c.id = cp.chat_id
                 WHERE cp.user_id = $1`,
                [userId]
            );

            chatsResult.rows.forEach(chat => {
                socket.join(`chat_${chat.id}`);
            });

            // Notify others that user is online
            socket.broadcast.emit('user_online', {
                userId: userId,
                name: socket.user.name
            });
        } catch (error) {
            console.error('Error joining chat rooms:', error);
        }

        // ==================== UPDATED: Handle new message with file support ====================
        socket.on('send_message', async (data) => {
            try {
                const { chatId, content, fileId } = data;

                // At least content OR fileId must be provided
                if ((!content || content.trim().length === 0) && !fileId) {
                    socket.emit('error', { message: 'Message content or file is required' });
                    return;
                }

                // Check if user can send to this chat
                const canSend = await checkSendPermission(userId, chatId, socket.user);

                if (!canSend) {
                    socket.emit('error', { message: 'You cannot send messages to this chat' });
                    return;
                }

                // If fileId provided, verify it exists and belongs to user
                if (fileId) {
                    const fileCheck = await query(
                        'SELECT id FROM files WHERE id = $1 AND uploaded_by = $2',
                        [fileId, userId]
                    );

                    if (fileCheck.rows.length === 0) {
                        socket.emit('error', { message: 'File not found or access denied' });
                        return;
                    }
                }

                // Insert message to database
                const result = await query(
                    `INSERT INTO messages (chat_id, user_id, content, file_id)
                     VALUES ($1, $2, $3, $4)
                     RETURNING id, content, file_id, created_at, is_edited`,
                    [chatId, userId, content ? content.trim() : null, fileId || null]
                );

                const messageData = result.rows[0];

                // Get file info if attached
                let fileInfo = null;
                if (messageData.file_id) {
                    const fileResult = await query(
                        `SELECT id, original_filename, mime_type, size_bytes, 
                                file_type, thumbnail_path, width, height
                         FROM files WHERE id = $1`,
                        [messageData.file_id]
                    );

                    if (fileResult.rows.length > 0) {
                        const file = fileResult.rows[0];
                        fileInfo = {
                            id: file.id,
                            filename: file.original_filename,
                            mimeType: file.mime_type,
                            size: file.size_bytes,
                            type: file.file_type,
                            url: `/api/files/${file.id}`,
                            thumbnailUrl: file.thumbnail_path ? `/api/files/${file.id}/thumbnail` : null,
                            width: file.width,
                            height: file.height
                        };

                        // Update file's message_id
                        await query(
                            'UPDATE files SET message_id = $1 WHERE id = $2',
                            [messageData.id, file.id]
                        );
                    }
                }

                const message = {
                    ...messageData,
                    user_id: userId,
                    username: socket.user.username,
                    user_name: socket.user.name,
                    user_role: socket.user.role,
                    file: fileInfo
                };

                // Update chat timestamp
                await query(
                    'UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [chatId]
                );

                // Emit to all users in the chat room
                io.to(`chat_${chatId}`).emit('new_message', {
                    chatId,
                    message
                });

                // Send push notifications to offline users
                try {
                    const participantsResult = await query(
                        `SELECT cp.user_id, c.name as chat_name, c.type as chat_type
                         FROM chat_participants cp
                         JOIN chats c ON c.id = cp.chat_id
                         WHERE cp.chat_id = $1 AND cp.user_id != $2`,
                        [chatId, userId]
                    );

                    for (const participant of participantsResult.rows) {
                        // Check if user is offline (not in connectedUsers)
                        if (!connectedUsers.has(participant.user_id)) {
                            const chatName = participant.chat_type === 'direct'
                                ? socket.user.name
                                : participant.chat_name;

                            sendNewMessageNotification(
                                participant.user_id,
                                socket.user.name,
                                content || 'Файл',
                                chatId,
                                chatName
                            ).catch(err => console.error('Push notification error:', err));
                        }
                    }
                } catch (pushError) {
                    console.error('Error sending push notifications:', pushError);
                }

                // Stop typing indicator
                stopTyping(chatId, userId);

            } catch (error) {
                console.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Handle typing indicator
        socket.on('typing_start', async (data) => {
            try {
                const { chatId, isVoice } = data;

                // Check if user has access to chat
                const hasAccess = await checkChatAccess(userId, chatId);

                if (!hasAccess) {
                    return;
                }

                // Add to typing users
                if (!typingUsers.has(chatId)) {
                    typingUsers.set(chatId, new Set());
                }
                typingUsers.get(chatId).add(userId);

                // Notify others in the chat
                socket.to(`chat_${chatId}`).emit('user_typing', {
                    chatId,
                    userId,
                    userName: socket.user.name,
                    isVoice: isVoice || false
                });
            } catch (error) {
                console.error('Typing start error:', error);
            }
        });

        socket.on('typing_stop', (data) => {
            const { chatId } = data;

            // Remove from typing users
            if (typingUsers.has(chatId)) {
                typingUsers.get(chatId).delete(userId);
            }

            // Notify others in the chat
            socket.to(`chat_${chatId}`).emit('user_stop_typing', {
                chatId,
                userId,
                userName: socket.user.name
            });
        });

        // Handle message read
        socket.on('mark_as_read', async (data) => {
            try {
                const { chatId } = data;

                await query(
                    `UPDATE chat_participants
                     SET last_read_at = CURRENT_TIMESTAMP
                     WHERE chat_id = $1 AND user_id = $2`,
                    [chatId, userId]
                );

                // 🔥 FIX: Notify ALL devices in chat room (including sender) for cross-device sync
                io.to(`chat_${chatId}`).emit('message_read', {
                    chatId,
                    userId,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Mark as read error:', error);
            }
        });

        // Handle message edit
        socket.on('edit_message', async (data) => {
            try {
                const { messageId, content, chatId } = data;

                // Check ownership
                const messageCheck = await query(
                    'SELECT user_id FROM messages WHERE id = $1',
                    [messageId]
                );

                if (messageCheck.rows.length === 0) {
                    socket.emit('error', { message: 'Message not found' });
                    return;
                }

                if (messageCheck.rows[0].user_id !== userId && socket.user.role !== 'admin') {
                    socket.emit('error', { message: 'You can only edit your own messages' });
                    return;
                }

                // Update message
                const result = await query(
                    `UPDATE messages 
                     SET content = $1, is_edited = true, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $2
                     RETURNING id, content, is_edited, updated_at`,
                    [content.trim(), messageId]
                );

                // Notify all users in the chat
                io.to(`chat_${chatId}`).emit('message_edited', {
                    chatId,
                    message: result.rows[0]
                });
            } catch (error) {
                console.error('Edit message error:', error);
                socket.emit('error', { message: 'Failed to edit message' });
            }
        });

        // Handle message delete
        socket.on('delete_message', async (data) => {
            try {
                const { messageId, chatId } = data;

                // Check ownership
                const messageCheck = await query(
                    'SELECT user_id FROM messages WHERE id = $1',
                    [messageId]
                );

                if (messageCheck.rows.length === 0) {
                    socket.emit('error', { message: 'Message not found' });
                    return;
                }

                if (messageCheck.rows[0].user_id !== userId && socket.user.role !== 'admin') {
                    socket.emit('error', { message: 'You can only delete your own messages' });
                    return;
                }

                // Soft delete
                await query(
                    `UPDATE messages 
                     SET is_deleted = true, content = '[Deleted]', updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [messageId]
                );

                // Notify all users in the chat
                io.to(`chat_${chatId}`).emit('message_deleted', {
                    chatId,
                    messageId
                });
            } catch (error) {
                console.error('Delete message error:', error);
                socket.emit('error', { message: 'Failed to delete message' });
            }
        });

        // Handle joining a chat
        socket.on('join_chat', async (data) => {
            try {
                const { chatId } = data;

                const hasAccess = await checkChatAccess(userId, chatId);

                if (hasAccess) {
                    socket.join(`chat_${chatId}`);
                    socket.emit('joined_chat', { chatId });
                } else {
                    socket.emit('error', { message: 'Access denied to this chat' });
                }
            } catch (error) {
                console.error('Join chat error:', error);
            }
        });

        // Handle leaving a chat
        socket.on('leave_chat', (data) => {
            const { chatId } = data;
            socket.leave(`chat_${chatId}`);
            stopTyping(chatId, userId);
        });

        // ==================== CALLS SYSTEM ====================

        // Handle start_call - initiate audio/video call
        socket.on('start_call', async (data) => {
            try {
                const { chatId, type } = data;

                // 1. Check if user has access to chat
                const hasAccess = await checkChatAccess(userId, chatId);
                if (!hasAccess) {
                    return socket.emit('error', { message: 'No access to this chat' });
                }

                // 2. Check if there's already an active call
                const activeCall = await query(`
                    SELECT id FROM calls
                    WHERE chat_id = $1 AND status IN ('ringing', 'ongoing')
                `, [chatId]);

                if (activeCall.rows.length > 0) {
                    return socket.emit('error', { message: 'Call already in progress in this chat' });
                }

                // 3. Create call in database
                const roomName = `corporate-chat-${chatId}-${Date.now()}`;
                const callResult = await query(`
                    INSERT INTO calls (chat_id, room_name, type, initiated_by, status, started_at)
                    VALUES ($1, $2, $3, $4, 'ringing', NOW())
                    RETURNING *
                `, [chatId, roomName, type || 'video', userId]);

                const callId = callResult.rows[0].id;

                // 4. Add initiator as participant
                await query(`
                    INSERT INTO call_participants (call_id, user_id, status, joined_at)
                    VALUES ($1, $2, 'joined', NOW())
                `, [callId, userId]);

                // 5. Get chat participants (exclude initiator)
                const participantsResult = await query(`
                    SELECT user_id FROM chat_participants
                    WHERE chat_id = $1 AND user_id != $2
                `, [chatId, userId]);

                const participantIds = participantsResult.rows.map(r => r.user_id);

                // 6. Notify initiator with call details
                socket.emit('call_created', {
                    callId,
                    roomName,
                    type: type || 'video',
                    chatId
                });

                // 7. Notify all other participants about incoming call
                participantIds.forEach(participantId => {
                    const participantSocketId = connectedUsers.get(participantId);
                    if (participantSocketId) {
                        io.to(participantSocketId).emit('incoming_call', {
                            callId,
                            chatId,
                            roomName,
                            type: type || 'video',
                            initiator: {
                                id: userId,
                                name: socket.user.name,
                                avatar: null
                            }
                        });
                    }
                });

                // 8. Log event
                await query(`
                    INSERT INTO call_events (call_id, event_type, user_id, metadata)
                    VALUES ($1, 'call_initiated', $2, $3)
                `, [callId, userId, JSON.stringify({ type: type || 'video', participantCount: participantIds.length })]);

                console.log(`📞 Call started: ${socket.user.name} → Chat ${chatId} (${type || 'video'})`);

            } catch (error) {
                console.error('Start call error:', error);
                socket.emit('error', { message: 'Failed to start call', detail: error.message });
            }
        });

        // Handle accept_call - user accepts incoming call
        socket.on('accept_call', async (data) => {
            try {
                const { callId } = data;

                if (!callId) {
                    return socket.emit('error', { message: 'callId is required' });
                }

                // 1. Get call details
                const callResult = await query(`
                    SELECT chat_id, room_name, type, status FROM calls WHERE id = $1
                `, [callId]);

                if (callResult.rows.length === 0) {
                    return socket.emit('error', { message: 'Call not found' });
                }

                const { chat_id: chatId, room_name: roomName, type, status } = callResult.rows[0];

                if (status === 'ended' || status === 'rejected') {
                    return socket.emit('error', { message: 'Call has already ended' });
                }

                // 2. Add user as participant
                await query(`
                    INSERT INTO call_participants (call_id, user_id, status, joined_at)
                    VALUES ($1, $2, 'joined', NOW())
                    ON CONFLICT DO NOTHING
                `, [callId, userId]);

                // 3. Update call status to 'ongoing' if still 'ringing'
                await query(`
                    UPDATE calls SET status = 'ongoing'
                    WHERE id = $1 AND status = 'ringing'
                `, [callId]);

                // 4. Confirm to user with room details
                socket.emit('call_accepted_confirmed', {
                    callId,
                    roomName,
                    type,
                    chatId
                });

                // 5. Notify all participants in chat about acceptance
                io.to(`chat_${chatId}`).emit('call_accepted', {
                    callId,
                    userId,
                    userName: socket.user.name
                });

                // 6. Log event
                await query(`
                    INSERT INTO call_events (call_id, event_type, user_id)
                    VALUES ($1, 'call_accepted', $2)
                `, [callId, userId]);

                console.log(`✅ Call accepted: ${socket.user.name} → Call ${callId}`);

            } catch (error) {
                console.error('Accept call error:', error);
                socket.emit('error', { message: 'Failed to accept call', detail: error.message });
            }
        });

        // Handle reject_call - user rejects incoming call
        socket.on('reject_call', async (data) => {
            try {
                const { callId, reason } = data;

                if (!callId) {
                    return socket.emit('error', { message: 'callId is required' });
                }

                // 1. Get call details
                const callResult = await query(`
                    SELECT chat_id, initiated_by, status FROM calls WHERE id = $1
                `, [callId]);

                if (callResult.rows.length === 0) {
                    return socket.emit('error', { message: 'Call not found' });
                }

                const { chat_id: chatId, initiated_by: initiatorId, status } = callResult.rows[0];

                if (status === 'ended' || status === 'rejected') {
                    return; // Already ended, silently ignore
                }

                // 2. Notify initiator about rejection
                const initiatorSocketId = connectedUsers.get(initiatorId);
                if (initiatorSocketId) {
                    io.to(initiatorSocketId).emit('call_rejected', {
                        callId,
                        userId,
                        userName: socket.user.name,
                        reason: reason || 'declined'
                    });
                }

                // 3. Check total participants in chat
                const participantsResult = await query(`
                    SELECT COUNT(*) as total FROM chat_participants
                    WHERE chat_id = $1
                `, [chatId]);

                const totalParticipants = parseInt(participantsResult.rows[0].total);

                // 4. If direct chat (2 participants) and rejected, end call
                if (totalParticipants === 2) {
                    await query(`
                        UPDATE calls SET status = 'rejected', ended_at = NOW()
                        WHERE id = $1
                    `, [callId]);
                }

                // 5. Log event
                await query(`
                    INSERT INTO call_events (call_id, event_type, user_id, metadata)
                    VALUES ($1, 'call_rejected', $2, $3)
                `, [callId, userId, JSON.stringify({ reason: reason || 'declined' })]);

                console.log(`❌ Call rejected: ${socket.user.name} → Call ${callId} (${reason || 'declined'})`);

            } catch (error) {
                console.error('Reject call error:', error);
            }
        });

        // Handle end_call - user ends active call
        socket.on('end_call', async (data) => {
            try {
                const { callId } = data;

                if (!callId) {
                    return socket.emit('error', { message: 'callId is required' });
                }

                // 1. Get call details
                const callResult = await query(`
                    SELECT chat_id, started_at, status FROM calls WHERE id = $1
                `, [callId]);

                if (callResult.rows.length === 0) {
                    return socket.emit('error', { message: 'Call not found' });
                }

                const { chat_id: chatId, started_at, status } = callResult.rows[0];

                if (status === 'ended') {
                    return; // Already ended
                }

                // 2. Calculate duration
                const duration = Math.floor((Date.now() - new Date(started_at)) / 1000);

                // 3. Update call status
                await query(`
                    UPDATE calls
                    SET status = 'ended', ended_at = NOW()
                    WHERE id = $1
                `, [callId]);

                // 4. Update all participants left_at and duration
                await query(`
                    UPDATE call_participants
                    SET left_at = NOW(),
                        duration = EXTRACT(EPOCH FROM (NOW() - joined_at))::INTEGER
                    WHERE call_id = $1 AND left_at IS NULL
                `, [callId]);

                // 5. Notify all participants in chat about call end
                io.to(`chat_${chatId}`).emit('call_ended', {
                    callId,
                    endedBy: userId,
                    userName: socket.user.name,
                    duration
                });

                // 6. Log event
                await query(`
                    INSERT INTO call_events (call_id, event_type, user_id, metadata)
                    VALUES ($1, 'call_ended', $2, $3)
                `, [callId, userId, JSON.stringify({ duration })]);

                console.log(`🔚 Call ended: ${socket.user.name} → Call ${callId} (${duration}s)`);

            } catch (error) {
                console.error('End call error:', error);
                socket.emit('error', { message: 'Failed to end call', detail: error.message });
            }
        });

        // ==================== END CALLS SYSTEM ====================

        // Handle disconnect
        socket.on('disconnect', async () => {
            console.log(`❌ User disconnected: ${socket.user.name} (${socket.user.id})`);

            // Update last seen
            await query(
                'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
                [userId]
            );

            // Clean up typing indicators
            typingUsers.forEach((users, chatId) => {
                if (users.has(userId)) {
                    users.delete(userId);
                    stopTyping(chatId, userId);
                }
            });

            // Remove from connected users
            connectedUsers.delete(userId);
            userSockets.delete(socket.id);

            // Notify others that user is offline
            socket.broadcast.emit('user_offline', {
                userId: userId,
                lastSeen: new Date().toISOString()
            });
        });
    });

    // Helper function to stop typing
    const stopTyping = (chatId, userId) => {
        if (typingUsers.has(chatId)) {
            typingUsers.get(chatId).delete(userId);

            // Get user info to send with event
            const socketId = connectedUsers.get(userId);
            const socket = socketId ? io.sockets.sockets.get(socketId) : null;

            io.to(`chat_${chatId}`).emit('user_stop_typing', {
                chatId,
                userId,
                userName: socket?.user?.name || 'User'
            });
        }
    };

    // Helper function to check chat access
    const checkChatAccess = async (userId, chatId) => {
        try {
            // First, check if user is admin - admins have access to all chats
            const userResult = await query(
                `SELECT role FROM users WHERE id = $1`,
                [userId]
            );

            if (userResult.rows.length > 0 && userResult.rows[0].role === 'admin') {
                return true; // Admins can access all chats
            }

            // For non-admins, check if they are participants
            const result = await query(
                `SELECT 1 FROM chat_participants
                 WHERE chat_id = $1 AND user_id = $2`,
                [chatId, userId]
            );

            return result.rows.length > 0;
        } catch (error) {
            console.error('Check chat access error:', error);
            return false;
        }
    };

    // Helper function to check send permission
    const checkSendPermission = async (userId, chatId, user) => {
        try {
            // Admins can send to all chats
            if (user.role === 'admin') {
                return true;
            }

            // Check if user is participant
            const hasAccess = await checkChatAccess(userId, chatId);
            if (!hasAccess) {
                return false;
            }

            // Get chat info
            const chatResult = await query(
                'SELECT type, department FROM chats WHERE id = $1',
                [chatId]
            );

            if (chatResult.rows.length === 0) {
                return false;
            }

            const chat = chatResult.rows[0];

            // For direct and group chats, being a participant is enough
            if (chat.type === 'direct' || chat.type === 'group') {
                return true;
            }

            // For department chats, allow admins or department heads/operators of same department
            if (chat.type === 'department') {
                if (user.role === 'admin') {
                    return true;
                }

                if ((['rop', 'head', 'operator'].includes(user.role)) && user.department === chat.department) {
                    return true;
                }

                return false;
            }

            return false;
        } catch (error) {
            console.error('Check send permission error:', error);
            return false;
        }
    };

    return io;
};

const emitToChat = (chatId, event, payload) => {
    if (!ioInstance) return;
    ioInstance.to(`chat_${chatId}`).emit(event, payload);
};

// Get online users count
const getOnlineUsersCount = () => {
    return connectedUsers.size;
};

// Get online users list
const getOnlineUsers = () => {
    return Array.from(connectedUsers.keys());
};

// Check if user is online
const isUserOnline = (userId) => {
    return connectedUsers.has(userId);
};

module.exports = {
    initializeSocket,
    emitToChat,
    getOnlineUsersCount,
    getOnlineUsers,
    isUserOnline
};