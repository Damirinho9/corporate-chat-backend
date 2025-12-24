const { query } = require('../config/database');
const { pool } = require('../config/database');
const { emitToChat } = require('../socket/socketHandler');
const { sendNewMessageNotification } = require('./pushController');

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
                        'fileType', f.file_type,
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
        const { content, fileId, file_id, replyToId, forwardedFromId, mentions } = req.body;
        const userId = req.user.id;

        const trimmedContent = typeof content === 'string' ? content.trim() : '';
        const normalizedContent = trimmedContent.length > 0 ? trimmedContent : null;
        let normalizedFileId = null;

        const incomingFileId = fileId ?? file_id;

        if (incomingFileId !== undefined && incomingFileId !== null && incomingFileId !== '') {
            const parsedFileId = Number(incomingFileId);
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
                code: 'EMPTY_MESSAGE',
                debug: {
                    receivedContent: content,
                    receivedFileId: fileId,
                    bodyKeys: Object.keys(req.body)
                }
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
                        'fileType', f.file_type,
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

        const payload = completeMessage.rows[0];

        // 🔥 DEBUG: Log before emitting WebSocket event
        console.log(`[WebSocket] 📤 Emitting new_message to chat_${chatId}:`, {
            chatId: Number(chatId),
            messageId: payload.id,
            sender: payload.user_name,
            content: payload.content?.substring(0, 50)
        });

        emitToChat(chatId, 'new_message', {
            chatId: Number(chatId),
            message: payload
        });

        console.log(`[WebSocket] ✅ new_message emitted to chat_${chatId}`);

        // 🔥 NEW: Send Push notifications to all chat participants except sender
        try {
            const participants = await query(
                `SELECT cp.user_id, u.name as user_name
                 FROM chat_participants cp
                 JOIN users u ON cp.user_id = u.id
                 WHERE cp.chat_id = $1 AND cp.user_id != $2`,
                [chatId, userId]
            );

            const chatName = await query(
                `SELECT name, type FROM chats WHERE id = $1`,
                [chatId]
            );

            const senderName = payload.user_name || 'Пользователь';
            const messagePreview = payload.content
                ? (payload.content.length > 50 ? payload.content.substring(0, 50) + '...' : payload.content)
                : (payload.file ? '📎 Файл' : 'Новое сообщение');

            for (const participant of participants.rows) {
                await sendNewMessageNotification(
                    participant.user_id,
                    senderName,
                    messagePreview,
                    Number(chatId),
                    chatName.rows[0]?.name || 'Новое сообщение'
                );
            }

            console.log(`[Push] 📤 Sent notifications to ${participants.rows.length} users in chat ${chatId}`);
        } catch (pushError) {
            // Don't fail the request if push notifications fail
            console.error('[Push] Failed to send notifications:', pushError);
        }

        res.status(201).json({
            message: 'Message sent successfully',
            message: payload
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

        const trimmedContent = typeof content === 'string' ? content.trim() : '';

        if (!trimmedContent) {
            return res.status(400).json({
                error: 'Content is required',
                code: 'EMPTY_CONTENT'
            });
        }

        // Check ownership
        const messageCheck = await query(
            'SELECT user_id, chat_id, created_at FROM messages WHERE id = $1',
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

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                error: 'Cannot edit this message',
                code: 'EDIT_DENIED'
            });
        }

        if (isOwner && !isAdmin) {
            const createdAt = messageRow.created_at ? new Date(messageRow.created_at) : null;
            const createdAtTime = createdAt && !Number.isNaN(createdAt.getTime())
                ? createdAt.getTime()
                : null;

            const editWindowMs = 5 * 60 * 1000;

            if (!createdAtTime || (Date.now() - createdAtTime) > editWindowMs) {
                return res.status(403).json({
                    error: 'Message can only be edited within 5 minutes of sending',
                    code: 'EDIT_WINDOW_EXPIRED',
                    metadata: { windowMinutes: 5 }
                });
            }
        }

        // Update message
        await query(
            `UPDATE messages
             SET content = $1, is_edited = true, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [trimmedContent, messageId]
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
                m.content,
                m.created_at,
                c.name AS chat_name,
                c.type AS chat_type,
                c.department AS chat_department,
                u.name AS author_name
             FROM messages m
             JOIN chats c ON m.chat_id = c.id
             JOIN users u ON m.user_id = u.id
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

        const deletionScope = isOwner ? 'self' : 'moderator';

        await query(
            `INSERT INTO message_deletion_history (
                message_id,
                chat_id,
                chat_name,
                chat_type,
                chat_department,
                deleted_message_user_id,
                deleted_message_user_name,
                deleted_by_user_id,
                deleted_by_user_name,
                deleted_by_role,
                deletion_scope,
                original_content,
                file_id,
                deleted_message_created_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13, $14
            )`,
            [
                messageId,
                messageRow.chat_id,
                messageRow.chat_name || null,
                messageRow.chat_type || null,
                messageRow.chat_department || null,
                messageRow.user_id,
                messageRow.author_name || null,
                req.user.id,
                req.user.name || null,
                req.user.role,
                deletionScope,
                messageRow.content || null,
                messageRow.file_id || null,
                messageRow.created_at || null
            ]
        );

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

        // 🔥 FIX: Emit WebSocket event for real-time reaction updates
        const chatId = messageCheck.rows[0]?.chat_id;
        if (chatId) {
            emitToChat(chatId, 'reaction_added', {
                messageId: Number(messageId),
                userId: userId,
                userName: req.user.name || req.user.username,
                emoji: emoji
            });
            console.log(`[Reaction] Added ${emoji} to message ${messageId} in chat ${chatId}`);
        }

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

        // Get chat_id before deleting reaction
        const messageCheck = await query(
            `SELECT m.chat_id FROM messages m WHERE m.id = $1`,
            [messageId]
        );

        await query(
            'DELETE FROM reactions WHERE message_id = $1 AND user_id = $2',
            [messageId, userId]
        );

        // 🔥 FIX: Emit WebSocket event for real-time reaction updates
        const chatId = messageCheck.rows[0]?.chat_id;
        if (chatId) {
            emitToChat(chatId, 'reaction_removed', {
                messageId: Number(messageId),
                userId: userId
            });
            console.log(`[Reaction] Removed from message ${messageId} in chat ${chatId}`);
        }

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

const getDeletionHistory = async (req, res) => {
    try {
        const { limit = 50, offset = 0, chatId } = req.query;
        const parsedLimitRaw = parseInt(limit, 10);
        const parsedOffsetRaw = parseInt(offset, 10);
        const parsedLimit = Number.isNaN(parsedLimitRaw) ? 50 : Math.min(Math.max(parsedLimitRaw, 1), 500);
        const parsedOffset = Number.isNaN(parsedOffsetRaw) ? 0 : Math.max(parsedOffsetRaw, 0);
        const parsedChatId = chatId ? Number(chatId) : null;

        if (parsedChatId && Number.isNaN(parsedChatId)) {
            return res.status(400).json({
                error: 'Invalid chat identifier',
                code: 'INVALID_CHAT_ID'
            });
        }

        const params = [];
        const conditions = [];
        let pendingDepartmentFilter = null;

        const addCondition = (clause, value) => {
            params.push(value);
            conditions.push(`${clause} $${params.length}`);
        };

        if (parsedChatId) {
            addCondition('h.chat_id =', parsedChatId);
        }

        if (req.user.role === 'rop') {
            if (!req.user.department) {
                return res.status(403).json({
                    error: 'Department context required for ROP history',
                    code: 'ROP_DEPARTMENT_REQUIRED'
                });
            }

            pendingDepartmentFilter = req.user.department;

            if (parsedChatId) {
                const chatCheck = await query(
                    'SELECT department, type FROM chats WHERE id = $1',
                    [parsedChatId]
                );

                const chatRow = chatCheck.rows[0];

                if (!chatRow || chatRow.type !== 'department' || !chatRow.department || chatRow.department !== req.user.department) {
                    return res.status(403).json({
                        error: 'Access denied to deletion history for this chat',
                        code: 'DELETE_HISTORY_DENIED'
                    });
                }
            }
        }

        const historyTableCheck = await query(
            "SELECT to_regclass('public.message_deletion_history') AS table_name"
        );

        const tableExists = historyTableCheck.rows[0] && historyTableCheck.rows[0].table_name;

        if (!tableExists) {
            return res.json({ history: [], count: 0 });
        }

        const columnInfo = await query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'message_deletion_history'
        `);

        const availableColumns = new Set(columnInfo.rows.map((row) => row.column_name));
        const hasStoredChatDepartment = availableColumns.has('chat_department');

        const chatColumnsInfo = await query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'chats'
        `);

        const chatColumnSet = new Set(chatColumnsInfo.rows.map((row) => row.column_name));

        const departmentExpressionForFilter = (() => {
            if (chatColumnSet.has('department') && hasStoredChatDepartment) {
                return 'COALESCE(c.department, h.chat_department)';
            }
            if (chatColumnSet.has('department')) {
                return 'c.department';
            }
            if (hasStoredChatDepartment) {
                return 'h.chat_department';
            }
            return null;
        })();

        if (pendingDepartmentFilter) {
            if (departmentExpressionForFilter) {
                addCondition(`${departmentExpressionForFilter} =`, pendingDepartmentFilter);
            } else {
                return res.status(403).json({
                    error: 'Department filtering unavailable for this installation',
                    code: 'DEPARTMENT_FILTER_UNAVAILABLE'
                });
            }
        }

        const limitIndex = params.push(parsedLimit);
        const offsetIndex = params.push(parsedOffset);

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const storedOrNull = (columnName, castType) => (
            availableColumns.has(columnName)
                ? `h.${columnName}`
                : `CAST(NULL AS ${castType})`
        );

        const chatNameExpr = chatColumnSet.has('name') ? 'c.name' : 'CAST(NULL AS TEXT)';
        const chatTypeExpr = chatColumnSet.has('type') ? 'c.type' : "CAST('unknown' AS TEXT)";
        const chatDepartmentExpr = chatColumnSet.has('department') ? 'c.department' : 'CAST(NULL AS TEXT)';

        const selectFragments = [
            'h.id',
            'h.message_id',
            'h.chat_id',
            `${storedOrNull('deleted_message_user_id', 'INTEGER')} AS stored_deleted_message_user_id`,
            `${storedOrNull('deleted_message_user_name', 'TEXT')} AS stored_deleted_message_user_name`,
            'h.deleted_by_user_id',
            'h.deleted_by_user_name',
            'h.deleted_by_role',
            'h.deletion_scope',
            `${storedOrNull('original_content', 'TEXT')} AS stored_original_content`,
            `${storedOrNull('file_id', 'INTEGER')} AS stored_file_id`,
            `${storedOrNull('deleted_message_created_at', 'TIMESTAMP WITH TIME ZONE')} AS stored_deleted_message_created_at`,
            `${storedOrNull('chat_name', 'TEXT')} AS stored_chat_name`,
            `${storedOrNull('chat_type', 'TEXT')} AS stored_chat_type`,
            `${storedOrNull('chat_department', 'TEXT')} AS stored_chat_department`,
            'h.deleted_at',
            `${chatNameExpr} AS chat_name_current`,
            `${chatTypeExpr} AS chat_type_current`,
            `${chatDepartmentExpr} AS chat_department_current`
        ];

        const result = await query(
            `SELECT
                ${selectFragments.join(',\n                ')}
             FROM message_deletion_history h
             LEFT JOIN chats c ON c.id = h.chat_id
             ${whereClause}
             ORDER BY h.deleted_at DESC
             LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
            params
        );

        const history = result.rows.map((row) => ({
            id: row.id,
            message_id: row.message_id,
            chat_id: row.chat_id,
            chat_name: row.chat_name_current || row.stored_chat_name || null,
            chat_type: row.chat_type_current || row.stored_chat_type || null,
            chat_department: row.chat_department_current || row.stored_chat_department || null,
            deleted_message_user_id: row.stored_deleted_message_user_id ?? null,
            deleted_message_user_name: row.stored_deleted_message_user_name || null,
            deleted_by_user_id: row.deleted_by_user_id,
            deleted_by_user_name: row.deleted_by_user_name,
            deleted_by_role: row.deleted_by_role,
            deletion_scope: row.deletion_scope,
            original_content: row.stored_original_content || null,
            file_id: row.stored_file_id ?? null,
            deleted_message_created_at: row.stored_deleted_message_created_at || null,
            deleted_at: row.deleted_at
        }));

        res.json({
            history,
            count: history.length
        });
    } catch (error) {
        if (error && (error.code === '42P01' || error.code === '42703')) { // undefined_table or undefined_column
            console.warn('Deletion history table is missing, returning empty result');
            return res.json({ history: [], count: 0 });
        }

        console.error('Get deletion history error:', error);
        res.status(500).json({
            error: 'Failed to fetch deletion history',
            code: 'GET_DELETION_HISTORY_ERROR'
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

// Pin message
const pinMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        // Get message and chat info
        const messageResult = await query(
            `SELECT m.*, c.id as chat_id, c.department_id
             FROM messages m
             JOIN chats c ON m.chat_id = c.id
             WHERE m.id = $1`,
            [messageId]
        );

        if (messageResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Message not found',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        const message = messageResult.rows[0];

        // Check permissions
        if (userRole === 'admin') {
            // Admin can pin anywhere
        } else if (userRole === 'rop') {
            // ROP can only pin in their department chats
            const userDepartment = await query(
                'SELECT department_id FROM users WHERE id = $1',
                [userId]
            );
            if (userDepartment.rows.length === 0 ||
                userDepartment.rows[0].department_id !== message.department_id) {
                return res.status(403).json({
                    error: 'You can only pin messages in your department',
                    code: 'INSUFFICIENT_PERMISSIONS'
                });
            }
        } else {
            // Others cannot pin
            return res.status(403).json({
                error: 'Insufficient permissions to pin messages',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }

        // Check if already pinned
        const existingPin = await query(
            'SELECT id FROM pinned_messages WHERE message_id = $1',
            [messageId]
        );

        if (existingPin.rows.length > 0) {
            return res.status(400).json({
                error: 'Message is already pinned',
                code: 'ALREADY_PINNED'
            });
        }

        // Pin the message
        await query(
            'INSERT INTO pinned_messages (message_id, chat_id, pinned_by, pinned_at) VALUES ($1, $2, $3, NOW())',
            [messageId, message.chat_id, userId]
        );

        res.json({
            message: 'Message pinned successfully',
            messageId
        });
    } catch (error) {
        console.error('Pin message error:', error);
        res.status(500).json({
            error: 'Failed to pin message',
            code: 'PIN_MESSAGE_ERROR'
        });
    }
};

// Add message to favorites
const addToFavorites = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        // Check if message exists
        const messageResult = await query(
            'SELECT id FROM messages WHERE id = $1',
            [messageId]
        );

        if (messageResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Message not found',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        // Check if already in favorites
        const existingFavorite = await query(
            'SELECT id FROM favorite_messages WHERE message_id = $1 AND user_id = $2',
            [messageId, userId]
        );

        if (existingFavorite.rows.length > 0) {
            return res.status(400).json({
                error: 'Message is already in favorites',
                code: 'ALREADY_FAVORITED'
            });
        }

        // Add to favorites
        await query(
            'INSERT INTO favorite_messages (message_id, user_id, created_at) VALUES ($1, $2, NOW())',
            [messageId, userId]
        );

        res.json({
            message: 'Message added to favorites',
            messageId
        });
    } catch (error) {
        console.error('Add to favorites error:', error);
        res.status(500).json({
            error: 'Failed to add message to favorites',
            code: 'ADD_FAVORITE_ERROR'
        });
    }
};

// Search messages across all user's chats
const searchMessagesGlobal = async (req, res) => {
    try {
        const { query: searchQuery, limit = 20 } = req.query;
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin';

        if (!searchQuery || searchQuery.trim().length < 2) {
            return res.status(400).json({
                error: 'Search query must be at least 2 characters',
                code: 'INVALID_QUERY'
            });
        }

        // Get chats where user has messages matching the query
        // Also return the first matching message ID for each chat
        // For admins: search in all chats
        // For regular users: search only in their chats (where they are participants)
        const result = await query(
            `SELECT DISTINCT ON (c.id)
                c.id as chat_id,
                c.name as chat_name,
                c.type as chat_type,
                m.id as first_match_message_id,
                m.created_at as first_match_at,
                (SELECT COUNT(*) FROM messages WHERE chat_id = c.id AND content ILIKE $1) as match_count
             FROM messages m
             JOIN chats c ON m.chat_id = c.id
             ${!isAdmin ? 'JOIN chat_participants cp ON c.id = cp.chat_id AND cp.user_id = $2' : ''}
             WHERE m.content ILIKE $1
             ORDER BY c.id, m.created_at DESC
             LIMIT $${isAdmin ? '2' : '3'}`,
            isAdmin ? [`%${searchQuery}%`, limit] : [`%${searchQuery}%`, userId, limit]
        );

        res.json({
            chats: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Global search messages error:', error);
        res.status(500).json({
            error: 'Failed to search messages globally',
            code: 'GLOBAL_SEARCH_ERROR'
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
    getDeletionHistory,
    searchMessages,
    searchMessagesGlobal,
    getAllMessages,
    getMessageStats,
    pinMessage,
    addToFavorites
};