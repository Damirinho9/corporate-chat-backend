const { query } = require('../config/database');
const { pool } = require('../config/database');

// Get messages for chat
const getMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user.id;
        const { limit = 100, before, after } = req.query;

        // Check access
        const accessCheck = await query(
            'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );

        if (accessCheck.rows.length === 0 && req.user.role !== 'admin') {
            return res.status(403).json({ 
                error: 'Access denied to this chat',
                code: 'CHAT_ACCESS_DENIED'
            });
        }

        let queryText = `
            SELECT 
                m.id,
                m.content,
                m.created_at,
                m.updated_at,
                m.is_edited,
                m.reply_to_id,
                m.forwarded_from_id,
                m.user_id,
                u.name as user_name,
                u.username,
                (
                    SELECT json_build_object(
                        'id', f.id,
                        'filename', f.original_filename,
                        'size', f.size_bytes,
                        'mimeType', f.mime_type,
                        'type', f.mime_type,
                        'url', '/api/files/' || f.id,
                        'thumbnailUrl', CASE WHEN f.thumbnail_path IS NOT NULL 
                            THEN '/api/files/' || f.id || '/thumbnail' 
                            ELSE NULL END,
                        'width', f.width,
                        'height', f.height
                    )
                    FROM files f WHERE f.id = m.file_id
                ) as file,
                (
                    SELECT json_build_object(
                        'id', rm.id,
                        'content', rm.content,
                        'user_id', rm.user_id,
                        'user_name', ru.name
                    )
                    FROM messages rm
                    JOIN users ru ON rm.user_id = ru.id
                    WHERE rm.id = m.reply_to_id
                ) as reply_to,
                (
                    SELECT json_build_object(
                        'id', fm.id,
                        'content', fm.content,
                        'user_id', fm.user_id,
                        'user_name', fu.name,
                        'chat_id', fm.chat_id
                    )
                    FROM messages fm
                    JOIN users fu ON fm.user_id = fu.id
                    WHERE fm.id = m.forwarded_from_id
                ) as forwarded_from,
                (
                    SELECT json_agg(json_build_object(
                        'emoji', r.emoji,
                        'user_id', r.user_id,
                        'user_name', ru.name
                    ))
                    FROM reactions r
                    JOIN users ru ON r.user_id = ru.id
                    WHERE r.message_id = m.id
                ) as reactions,
                (
                    SELECT json_agg(json_build_object(
                        'user_id', mt.user_id,
                        'user_name', mu.name,
                        'username', mu.username
                    ))
                    FROM mentions mt
                    JOIN users mu ON mt.user_id = mu.id
                    WHERE mt.message_id = m.id
                ) as mentions
            FROM messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.chat_id = $1
        `;

        const params = [chatId];
        let paramCount = 2;

        if (before) {
            queryText += ` AND m.created_at < $${paramCount}`;
            params.push(before);
            paramCount++;
        }

        if (after) {
            queryText += ` AND m.created_at > $${paramCount}`;
            params.push(after);
            paramCount++;
        }

        queryText += ` ORDER BY m.created_at DESC LIMIT $${paramCount}`;
        params.push(limit);

        const result = await query(queryText, params);

        res.json({ 
            messages: result.rows.reverse(),
            count: result.rows.length 
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ 
            error: 'Failed to get messages',
            code: 'GET_MESSAGES_ERROR'
        });
    }
};

// Send message
const sendMessage = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { content, fileId, replyToId, forwardedFromId, mentions } = req.body;
        const userId = req.user.id;

        const trimmedContent = typeof content === 'string' ? content.trim() : '';
        const normalizedContent = trimmedContent.length > 0 ? trimmedContent : null;
        let normalizedFileId = null;

        if (fileId !== undefined && fileId !== null && fileId !== '') {
            const parsedFileId = Number(fileId);
            if (Number.isNaN(parsedFileId)) {
                return res.status(400).json({
                    error: 'Invalid file identifier',
                    code: 'INVALID_FILE_ID'
                });
            }
            normalizedFileId = parsedFileId;
        }

        // Check access
        const accessCheck = await query(
            'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );

        if (accessCheck.rows.length === 0 && req.user.role !== 'admin') {
            return res.status(403).json({ 
                error: 'Access denied to this chat',
                code: 'CHAT_ACCESS_DENIED'
            });
        }

        if (!normalizedContent && !normalizedFileId) {
            return res.status(400).json({
                error: 'Message content or file is required',
                code: 'EMPTY_MESSAGE'
            });
        }

        // Verify reply_to exists
        if (replyToId) {
            const replyCheck = await query(
                'SELECT id FROM messages WHERE id = $1 AND chat_id = $2',
                [replyToId, chatId]
            );
            if (replyCheck.rows.length === 0) {
                return res.status(404).json({ 
                    error: 'Reply message not found',
                    code: 'REPLY_NOT_FOUND'
                });
            }
        }

        // Verify forwarded_from exists
        if (forwardedFromId) {
            const forwardCheck = await query('SELECT id FROM messages WHERE id = $1', [forwardedFromId]);
            if (forwardCheck.rows.length === 0) {
                return res.status(404).json({ 
                    error: 'Forwarded message not found',
                    code: 'FORWARD_NOT_FOUND'
                });
            }
        }

        const client = await pool.connect();
        let result;
        try {
            await client.query('BEGIN');
            

            // Insert message
            const messageResult = await client.query(
                `INSERT INTO messages (chat_id, user_id, content, file_id, reply_to_id, forwarded_from_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [chatId, userId, normalizedContent, normalizedFileId, replyToId || null, forwardedFromId || null]
            );

            const message = messageResult.rows[0];

            // Insert mentions if provided
            if (mentions && mentions.length > 0) {
                const mentionValues = mentions.map((mentionUserId, i) => 
                    `($1, $${i + 2})`
                ).join(', ');
                
                await client.query(
                    `INSERT INTO mentions (message_id, user_id)
                     VALUES ${mentionValues}
                     ON CONFLICT DO NOTHING`,
                    [message.id, ...mentions]
                );
            }

            // Update file message_id
            if (normalizedFileId) {
                await client.query(
                    'UPDATE files SET message_id = $1 WHERE id = $2',
                    [message.id, normalizedFileId]
                );
            }

            // Update chat timestamp
            await client.query(
                'UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [chatId]
            );

            await client.query('COMMIT');
            result = message;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        // Fetch complete message with relations
        const completeMessage = await query(
            `SELECT 
                m.id,
                m.content,
                m.created_at,
                m.user_id,
                u.name as user_name,
                u.username,
                (
                    SELECT json_build_object(
                        'id', f.id,
                        'filename', f.original_filename,
                        'size', f.size_bytes,
                        'mimeType', f.mime_type,
                        'type', f.mime_type,
                        'url', '/api/files/' || f.id,
                        'thumbnailUrl', CASE WHEN f.thumbnail_path IS NOT NULL 
                            THEN '/api/files/' || f.id || '/thumbnail' 
                            ELSE NULL END
                    )
                    FROM files f WHERE f.id = m.file_id
                ) as file,
                (
                    SELECT json_build_object(
                        'id', rm.id,
                        'content', rm.content,
                        'user_id', rm.user_id,
                        'user_name', ru.name
                    )
                    FROM messages rm
                    JOIN users ru ON rm.user_id = ru.id
                    WHERE rm.id = m.reply_to_id
                ) as reply_to,
                (
                    SELECT json_agg(json_build_object(
                        'user_id', mt.user_id,
                        'user_name', mu.name,
                        'username', mu.username
                    ))
                    FROM mentions mt
                    JOIN users mu ON mt.user_id = mu.id
                    WHERE mt.message_id = m.id
                ) as mentions
            FROM messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.id = $1`,
            [result.id]
        );

        res.status(201).json({
            message: 'Message sent successfully',
            message: completeMessage.rows[0]
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ 
            error: 'Failed to send message',
            code: 'SEND_MESSAGE_ERROR'
        });
    }
};

// Edit message
const editMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        const userId = req.user.id;

        if (!content) {
            return res.status(400).json({ 
                error: 'Content is required',
                code: 'EMPTY_CONTENT'
            });
        }

        // Check ownership
        const messageCheck = await query(
            'SELECT user_id, chat_id FROM messages WHERE id = $1',
            [messageId]
        );

        if (messageCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Message not found',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        if (messageCheck.rows[0].user_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ 
                error: 'Cannot edit this message',
                code: 'EDIT_DENIED'
            });
        }

        // Update message
        await query(
            `UPDATE messages 
             SET content = $1, is_edited = true, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [content, messageId]
        );

        res.json({ message: 'Message edited successfully' });
    } catch (error) {
        console.error('Edit message error:', error);
        res.status(500).json({ 
            error: 'Failed to edit message',
            code: 'EDIT_MESSAGE_ERROR'
        });
    }
};

// Delete message
const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        // Check ownership
        const messageCheck = await query(
            `SELECT
                m.user_id,
                m.file_id,
                m.chat_id,
                m.created_at,
                c.type AS chat_type,
                c.department AS chat_department
             FROM messages m
             JOIN chats c ON m.chat_id = c.id
             WHERE m.id = $1`,
            [messageId]
        );

        if (messageCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Message not found',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        const messageRow = messageCheck.rows[0];
        const isOwner = messageRow.user_id === userId;
        const isAdmin = req.user.role === 'admin';
        let isDepartmentRop = false;

        if (req.user.role === 'rop' && req.user.department) {
            isDepartmentRop =
                messageRow.chat_type === 'department' &&
                messageRow.chat_department &&
                messageRow.chat_department === req.user.department;
        }

        const deletionWindowMs = 5 * 60 * 1000; // 5 minutes
        const createdAt = messageRow.created_at ? new Date(messageRow.created_at) : null;
        const createdAtTime = createdAt && !Number.isNaN(createdAt.getTime())
            ? createdAt.getTime()
            : null;

        if (isOwner && !isAdmin && !isDepartmentRop && createdAtTime) {
            const ageMs = Date.now() - createdAtTime;
            if (ageMs > deletionWindowMs) {
                return res.status(403).json({
                    error: 'Message can only be deleted within 5 minutes of sending',
                    code: 'DELETE_WINDOW_EXPIRED',
                    metadata: { windowMinutes: 5 }
                });
            }
        }

        if (!isOwner && !isAdmin && !isDepartmentRop) {
            return res.status(403).json({
                error: 'Cannot delete this message',
                code: 'DELETE_DENIED'
            });
        }

        // Delete message (cascade handles mentions, reactions)
        await query('DELETE FROM messages WHERE id = $1', [messageId]);

        res.json({ message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ 
            error: 'Failed to delete message',
            code: 'DELETE_MESSAGE_ERROR'
        });
    }
};

// Add reaction
const addReaction = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { emoji } = req.body;
        const userId = req.user.id;

        if (!emoji) {
            return res.status(400).json({ 
                error: 'Emoji is required',
                code: 'MISSING_EMOJI'
            });
        }

        // Check message exists and user has access
        const messageCheck = await query(
            `SELECT m.id, m.chat_id 
             FROM messages m
             JOIN chat_participants cp ON m.chat_id = cp.chat_id
             WHERE m.id = $1 AND cp.user_id = $2`,
            [messageId, userId]
        );

        if (messageCheck.rows.length === 0 && req.user.role !== 'admin') {
            return res.status(403).json({ 
                error: 'Access denied',
                code: 'REACTION_ACCESS_DENIED'
            });
        }

        // Add reaction (upsert)
        await query(
            `INSERT INTO reactions (message_id, user_id, emoji)
             VALUES ($1, $2, $3)
             ON CONFLICT (message_id, user_id) 
             DO UPDATE SET emoji = $3, created_at = CURRENT_TIMESTAMP`,
            [messageId, userId, emoji]
        );

        res.json({ message: 'Reaction added successfully' });
    } catch (error) {
        console.error('Add reaction error:', error);
        res.status(500).json({ 
            error: 'Failed to add reaction',
            code: 'ADD_REACTION_ERROR'
        });
    }
};

// Remove reaction
const removeReaction = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        await query(
            'DELETE FROM reactions WHERE message_id = $1 AND user_id = $2',
            [messageId, userId]
        );

        res.json({ message: 'Reaction removed successfully' });
    } catch (error) {
        console.error('Remove reaction error:', error);
        res.status(500).json({ 
            error: 'Failed to remove reaction',
            code: 'REMOVE_REACTION_ERROR'
        });
    }
};

// Forward message
const forwardMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { targetChatIds } = req.body;
        const userId = req.user.id;

        if (!targetChatIds || targetChatIds.length === 0) {
            return res.status(400).json({ 
                error: 'Target chat IDs are required',
                code: 'MISSING_TARGET_CHATS'
            });
        }

        // Get original message
        const originalMessage = await query(
            'SELECT content, file_id, user_id FROM messages WHERE id = $1',
            [messageId]
        );

        if (originalMessage.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Message not found',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        const original = originalMessage.rows[0];

        // Forward to each target chat
        const forwardedMessages = [];
        for (const targetChatId of targetChatIds) {
            // Check access to target chat
            const accessCheck = await query(
                'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
                [targetChatId, userId]
            );

            if (accessCheck.rows.length === 0 && req.user.role !== 'admin') {
                continue;
            }

            const result = await query(
                `INSERT INTO messages (chat_id, user_id, content, file_id, forwarded_from_id)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [targetChatId, userId, original.content, original.file_id, messageId]
            );

            forwardedMessages.push({
                chatId: targetChatId,
                messageId: result.rows[0].id
            });
        }

        res.json({
            message: 'Message forwarded successfully',
            forwardedTo: forwardedMessages
        });
    } catch (error) {
        console.error('Forward message error:', error);
        res.status(500).json({ 
            error: 'Failed to forward message',
            code: 'FORWARD_MESSAGE_ERROR'
        });
    }
};

// Search messages
const searchMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { query: searchQuery, limit = 50 } = req.query;
        const userId = req.user.id;

        if (!searchQuery) {
            return res.status(400).json({ 
                error: 'Search query is required',
                code: 'MISSING_QUERY'
            });
        }

        // Check access
        const accessCheck = await query(
            'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );

        if (accessCheck.rows.length === 0 && req.user.role !== 'admin') {
            return res.status(403).json({ 
                error: 'Access denied',
                code: 'SEARCH_ACCESS_DENIED'
            });
        }

        const result = await query(
            `SELECT 
                m.id,
                m.content,
                m.created_at,
                m.user_id,
                u.name as user_name
             FROM messages m
             JOIN users u ON m.user_id = u.id
             WHERE m.chat_id = $1 AND m.content ILIKE $2
             ORDER BY m.created_at DESC
             LIMIT $3`,
            [chatId, `%${searchQuery}%`, limit]
        );

        res.json({ 
            messages: result.rows,
            count: result.rows.length 
        });
    } catch (error) {
        console.error('Search messages error:', error);
        res.status(500).json({ 
            error: 'Failed to search messages',
            code: 'SEARCH_MESSAGES_ERROR'
        });
    }
};

// Get all messages (admin only)
const getAllMessages = async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;

        const result = await query(
            `SELECT 
                m.id,
                m.content,
                m.created_at,
                m.user_id,
                u.name as user_name,
                u.username,
                m.chat_id,
                c.name as chat_name
            FROM messages m
            JOIN users u ON m.user_id = u.id
            JOIN chats c ON m.chat_id = c.id
            ORDER BY m.created_at DESC
            LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json({ 
            messages: result.rows,
            count: result.rows.length 
        });
    } catch (error) {
        console.error('Get all messages error:', error);
        res.status(500).json({ 
            error: 'Failed to get messages',
            code: 'GET_ALL_MESSAGES_ERROR'
        });
    }
};

// Get message statistics (admin only)
const getMessageStats = async (req, res) => {
    try {
        const stats = await query(`
            SELECT 
                (COUNT(*))::integer as total_messages,
                (COUNT(DISTINCT user_id))::integer as unique_senders,
                (COUNT(DISTINCT chat_id))::integer as active_chats,
                (COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'))::integer as messages_24h,
                (COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'))::integer as messages_7d,
                (COUNT(*) FILTER (WHERE file_id IS NOT NULL))::integer as messages_with_files
            FROM messages
        `);

        const topUsers = await query(`
            SELECT 
                u.id,
                u.name,
                u.username,
                COUNT(m.id)::integer as message_count
            FROM users u
            JOIN messages m ON u.id = m.user_id
            GROUP BY u.id, u.name, u.username
            ORDER BY message_count DESC
            LIMIT 10
        `);

        res.json({
            overall: stats.rows[0],
            topUsers: topUsers.rows
        });
    } catch (error) {
        console.error('Get message stats error:', error);
        res.status(500).json({ 
            error: 'Failed to get message statistics',
            code: 'GET_MESSAGE_STATS_ERROR'
        });
    }
};

module.exports = {
    getMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    forwardMessage,
    searchMessages,
    getAllMessages,
    getMessageStats
};