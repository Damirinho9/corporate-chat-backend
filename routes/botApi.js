const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateBot, requireBotPermission, checkBotResourceAccess } = require('../middleware/botAuth');
const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// ==================== BOT API ENDPOINTS ====================
// These are used BY bots to interact with the chat

/**
 * GET /api/bot-api/me
 * Get current bot information
 */
router.get('/me', authenticateBot, async (req, res) => {
    try {
        const result = await query(
            `SELECT b.*,
                    json_agg(
                        jsonb_build_object(
                            'permission_type', bp.permission_type,
                            'resource_type', bp.resource_type,
                            'resource_id', bp.resource_id
                        )
                    ) FILTER (WHERE bp.id IS NOT NULL) as permissions
             FROM bots b
             LEFT JOIN bot_permissions bp ON b.id = bp.bot_id
             WHERE b.id = $1
             GROUP BY b.id`,
            [req.bot.id]
        );

        res.json({ bot: result.rows[0] });
    } catch (error) {
        console.error('Get bot info error:', error);
        res.status(500).json({ error: 'Failed to get bot info' });
    }
});

/**
 * POST /api/bot-api/messages
 * Send a message as bot
 */
router.post('/messages',
    authenticateBot,
    requireBotPermission('send_messages'),
    [
        body('chat_id').isInt().withMessage('Valid chat_id required'),
        body('content').trim().isLength({ min: 1 }).withMessage('Message content required'),
        body('reply_to_id').optional().isInt()
    ],
    validate,
    async (req, res) => {
        try {
            const { chat_id, content, reply_to_id } = req.body;

            // Check if bot has access to this chat
            const hasAccess = await checkBotResourceAccess(req.bot, 'send_messages', 'chat', chat_id);

            if (!hasAccess) {
                return res.status(403).json({ error: 'Bot does not have access to this chat' });
            }

            // Create a virtual user ID for the bot (negative IDs to distinguish from real users)
            // Or we can insert message with a special bot_id field

            // Insert message (we'll need to modify messages table to support bot_id)
            const result = await query(
                `INSERT INTO messages (chat_id, user_id, content, reply_to_id, is_bot_message, bot_id)
                 VALUES ($1, NULL, $2, $3, true, $4)
                 RETURNING *`,
                [chat_id, content, reply_to_id || null, req.bot.id]
            );

            const message = result.rows[0];

            // Log bot message
            await query(
                `INSERT INTO bot_messages (bot_id, chat_id, message_id, metadata)
                 VALUES ($1, $2, $3, $4)`,
                [req.bot.id, chat_id, message.id, JSON.stringify({ content })]
            );

            // Update chat's updated_at
            await query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chat_id]);

            // Emit socket event for real-time delivery
            if (req.app.get('io')) {
                const io = req.app.get('io');
                io.to(`chat_${chat_id}`).emit('new_message', {
                    chatId: chat_id,
                    message: {
                        ...message,
                        user_name: req.bot.name,
                        username: req.bot.username,
                        is_bot: true
                    }
                });
            }

            res.status(201).json({
                message: {
                    ...message,
                    bot_name: req.bot.name,
                    bot_username: req.bot.username
                }
            });
        } catch (error) {
            console.error('Bot send message error:', error);
            res.status(500).json({ error: 'Failed to send message' });
        }
    }
);

/**
 * GET /api/bot-api/chats
 * Get list of chats bot has access to
 */
router.get('/chats',
    authenticateBot,
    requireBotPermission('read_chats'),
    async (req, res) => {
        try {
            const { limit = 50, offset = 0 } = req.query;

            // Get chats where bot has permissions
            const chatPermissions = req.bot.permissions.filter(p =>
                p.permission_type === 'read_chats' || p.permission_type === 'send_messages'
            );

            let chatsQuery;
            let params;

            if (chatPermissions.some(p => p.resource_id === null)) {
                // Bot has access to all chats
                chatsQuery = 'SELECT * FROM chats ORDER BY updated_at DESC LIMIT $1 OFFSET $2';
                params = [limit, offset];
            } else {
                // Bot has access to specific chats
                const chatIds = chatPermissions
                    .filter(p => p.resource_id !== null)
                    .map(p => p.resource_id);

                if (chatIds.length === 0) {
                    return res.json({ chats: [] });
                }

                chatsQuery = 'SELECT * FROM chats WHERE id = ANY($1) ORDER BY updated_at DESC LIMIT $2 OFFSET $3';
                params = [chatIds, limit, offset];
            }

            const result = await query(chatsQuery, params);

            res.json({ chats: result.rows });
        } catch (error) {
            console.error('Bot get chats error:', error);
            res.status(500).json({ error: 'Failed to get chats' });
        }
    }
);

/**
 * GET /api/bot-api/chats/:chatId/messages
 * Get messages from a chat
 */
router.get('/chats/:chatId/messages',
    authenticateBot,
    requireBotPermission('read_messages'),
    [
        param('chatId').isInt()
    ],
    validate,
    async (req, res) => {
        try {
            const { chatId } = req.params;
            const { limit = 50, offset = 0, before_id } = req.query;

            // Check access
            const hasAccess = await checkBotResourceAccess(req.bot, 'read_messages', 'chat', parseInt(chatId));

            if (!hasAccess) {
                return res.status(403).json({ error: 'Bot does not have access to this chat' });
            }

            let messagesQuery;
            let params;

            if (before_id) {
                messagesQuery = `
                    SELECT m.*, u.name as user_name, u.username,
                           b.name as bot_name, b.username as bot_username
                    FROM messages m
                    LEFT JOIN users u ON m.user_id = u.id
                    LEFT JOIN bots b ON m.bot_id = b.id
                    WHERE m.chat_id = $1 AND m.id < $2
                    ORDER BY m.id DESC
                    LIMIT $3 OFFSET $4
                `;
                params = [chatId, before_id, limit, offset];
            } else {
                messagesQuery = `
                    SELECT m.*, u.name as user_name, u.username,
                           b.name as bot_name, b.username as bot_username
                    FROM messages m
                    LEFT JOIN users u ON m.user_id = u.id
                    LEFT JOIN bots b ON m.bot_id = b.id
                    WHERE m.chat_id = $1
                    ORDER BY m.id DESC
                    LIMIT $2 OFFSET $3
                `;
                params = [chatId, limit, offset];
            }

            const result = await query(messagesQuery, params);

            res.json({
                messages: result.rows.reverse()
            });
        } catch (error) {
            console.error('Bot get messages error:', error);
            res.status(500).json({ error: 'Failed to get messages' });
        }
    }
);

/**
 * GET /api/bot-api/users
 * Get list of users (if bot has permission)
 */
router.get('/users',
    authenticateBot,
    requireBotPermission('read_users'),
    async (req, res) => {
        try {
            const { limit = 100, offset = 0, department } = req.query;

            let usersQuery = `
                SELECT id, username, name, role, department, last_seen, is_active
                FROM users
                WHERE is_active = true
            `;
            const params = [];
            let paramCount = 1;

            if (department) {
                usersQuery += ` AND department = $${paramCount++}`;
                params.push(department);
            }

            usersQuery += ` ORDER BY name LIMIT $${paramCount++} OFFSET $${paramCount}`;
            params.push(limit, offset);

            const result = await query(usersQuery, params);

            res.json({ users: result.rows });
        } catch (error) {
            console.error('Bot get users error:', error);
            res.status(500).json({ error: 'Failed to get users' });
        }
    }
);

/**
 * PUT /api/bot-api/messages/:messageId
 * Edit a message sent by bot
 */
router.put('/messages/:messageId',
    authenticateBot,
    requireBotPermission('edit_messages'),
    [
        param('messageId').isInt(),
        body('content').trim().isLength({ min: 1 })
    ],
    validate,
    async (req, res) => {
        try {
            const { messageId } = req.params;
            const { content } = req.body;

            // Verify message belongs to this bot
            const checkResult = await query(
                'SELECT * FROM messages WHERE id = $1 AND bot_id = $2',
                [messageId, req.bot.id]
            );

            if (checkResult.rows.length === 0) {
                return res.status(404).json({ error: 'Message not found or not owned by this bot' });
            }

            // Update message
            const result = await query(
                `UPDATE messages
                 SET content = $1, is_edited = true, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2 AND bot_id = $3
                 RETURNING *`,
                [content, messageId, req.bot.id]
            );

            // Emit socket event
            if (req.app.get('io')) {
                const io = req.app.get('io');
                const message = result.rows[0];
                io.to(`chat_${message.chat_id}`).emit('message_edited', {
                    messageId: message.id,
                    content: message.content,
                    is_edited: true
                });
            }

            res.json({ message: result.rows[0] });
        } catch (error) {
            console.error('Bot edit message error:', error);
            res.status(500).json({ error: 'Failed to edit message' });
        }
    }
);

/**
 * DELETE /api/bot-api/messages/:messageId
 * Delete a message sent by bot
 */
router.delete('/messages/:messageId',
    authenticateBot,
    requireBotPermission('delete_messages'),
    [param('messageId').isInt()],
    validate,
    async (req, res) => {
        try {
            const { messageId } = req.params;

            // Verify message belongs to this bot
            const checkResult = await query(
                'SELECT * FROM messages WHERE id = $1 AND bot_id = $2',
                [messageId, req.bot.id]
            );

            if (checkResult.rows.length === 0) {
                return res.status(404).json({ error: 'Message not found or not owned by this bot' });
            }

            const message = checkResult.rows[0];

            // Delete message
            await query('DELETE FROM messages WHERE id = $1', [messageId]);

            // Emit socket event
            if (req.app.get('io')) {
                const io = req.app.get('io');
                io.to(`chat_${message.chat_id}`).emit('message_deleted', {
                    messageId: message.id,
                    chatId: message.chat_id
                });
            }

            res.json({ message: 'Message deleted' });
        } catch (error) {
            console.error('Bot delete message error:', error);
            res.status(500).json({ error: 'Failed to delete message' });
        }
    }
);

module.exports = router;
