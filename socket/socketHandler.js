const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Store connected users
const connectedUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // socketId -> userId
const typingUsers = new Map(); // chatId -> Set of userIds

// Initialize Socket.IO
const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

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

        // Handle new message
        socket.on('send_message', async (data) => {
            try {
                const { chatId, content } = data;

                if (!content || content.trim().length === 0) {
                    socket.emit('error', { message: 'Message content is required' });
                    return;
                }

                // Check if user can send to this chat
                const canSend = await checkSendPermission(userId, chatId, socket.user);

                if (!canSend) {
                    socket.emit('error', { message: 'You cannot send messages to this chat' });
                    return;
                }

                // Insert message to database
                const result = await query(
                    `INSERT INTO messages (chat_id, user_id, content)
                     VALUES ($1, $2, $3)
                     RETURNING id, content, created_at, is_edited`,
                    [chatId, userId, content.trim()]
                );

                const message = {
                    ...result.rows[0],
                    user_id: userId,
                    username: socket.user.username,
                    user_name: socket.user.name,
                    user_role: socket.user.role
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
                const { chatId } = data;

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
                    userName: socket.user.name
                });
            } catch (error) {
                console.error('Typing start error:', error);
            }
        });

        socket.on('typing_stop', (data) => {
            const { chatId } = data;
            stopTyping(chatId, userId);
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

                // Notify sender about read status
                socket.to(`chat_${chatId}`).emit('message_read', {
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
            
            io.to(`chat_${chatId}`).emit('user_stopped_typing', {
                chatId,
                userId
            });
        }
    };

    // Helper function to check chat access
    const checkChatAccess = async (userId, chatId) => {
        try {
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

            // For department chats, only heads can send
            if (chat.type === 'department') {
                return user.role === 'head' && user.department === chat.department;
            }

            return false;
        } catch (error) {
            console.error('Check send permission error:', error);
            return false;
        }
    };

    return io;
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
    getOnlineUsersCount,
    getOnlineUsers,
    isUserOnline
};
