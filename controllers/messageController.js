const { query } = require('../config/database');

// Get messages from chat with pagination
const getMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { limit = 50, offset = 0, before } = req.query;

        // ИЗМЕНЕНО: добавлен LEFT JOIN на files
        let queryText = `
            SELECT 
                m.id,
                m.content,
                m.is_edited,
                m.is_deleted,
                m.created_at,
                m.updated_at,
                m.file_id,
                u.id as user_id,
                u.username,
                u.name as user_name,
                u.role as user_role,
                f.id as file_id_check,
                f.original_filename as file_name,
                f.mime_type as file_mime_type,
                f.size_bytes as file_size,
                f.file_type as file_type,
                f.thumbnail_path,
                f.width as file_width,
                f.height as file_height
            FROM messages m
            JOIN users u ON m.user_id = u.id
            LEFT JOIN files f ON m.file_id = f.id
            WHERE m.chat_id = $1
        `;

        const params = [chatId];
        let paramCount = 2;

        if (before) {
            queryText += ` AND m.created_at < $${paramCount}`;
            params.push(before);
            paramCount++;
        }

        queryText += ` ORDER BY m.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limit, offset);

        const result = await query(queryText, params);

        // ИЗМЕНЕНО: добавлена информация о файле
        const messages = result.rows.reverse().map(msg => {
            const message = {
                id: msg.id,
                content: msg.content,
                is_edited: msg.is_edited,
                is_deleted: msg.is_deleted,
                created_at: msg.created_at,
                updated_at: msg.updated_at,
                user_id: msg.user_id,
                username: msg.username,
                user_name: msg.user_name,
                user_role: msg.user_role
            };

            // ДОБАВЛЕНО: файл если есть
            if (msg.file_id_check) {
                message.file = {
                    id: msg.file_id_check,
                    filename: msg.file_name,
                    mimeType: msg.file_mime_type,
                    size: msg.file_size,
                    type: msg.file_type,
                    url: `/api/files/${msg.file_id_check}`,
                    thumbnailUrl: msg.thumbnail_path ? `/api/files/${msg.file_id_check}/thumbnail` : null,
                    width: msg.file_width,
                    height: msg.file_height
                };
            }

            return message;
        });

        const countResult = await query(
            'SELECT COUNT(*) as total FROM messages WHERE chat_id = $1',
            [chatId]
        );

        res.json({
            messages,
            pagination: {
                total: parseInt(countResult.rows[0].total),
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: parseInt(offset) + messages.length < parseInt(countResult.rows[0].total)
            }
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
        const { content, fileId } = req.body;  // ДОБАВЛЕНО: fileId
        const userId = req.user.id;

        // ИЗМЕНЕНО: content ИЛИ fileId должны быть
        if ((!content || content.trim().length === 0) && !fileId) {
            return res.status(400).json({ 
                error: 'Message content or file is required',
                code: 'EMPTY_MESSAGE'
            });
        }

        if (content && content.length > 5000) {
            return res.status(400).json({ 
                error: 'Message is too long (max 5000 characters)',
                code: 'MESSAGE_TOO_LONG'
            });
        }

        // ДОБАВЛЕНО: проверка файла
        if (fileId) {
            const fileCheck = await query(
                'SELECT id FROM files WHERE id = $1 AND uploaded_by = $2',
                [fileId, userId]
            );
            if (fileCheck.rows.length === 0) {
                return res.status(404).json({ 
                    error: 'File not found or access denied',
                    code: 'FILE_NOT_FOUND'
                });
            }
        }

        // ИЗМЕНЕНО: добавлен file_id
        const result = await query(
            `INSERT INTO messages (chat_id, user_id, content, file_id)
             VALUES ($1, $2, $3, $4)
             RETURNING id, content, file_id, created_at, is_edited, is_deleted`,
            [chatId, userId, content ? content.trim() : null, fileId || null]
        );

        const message = result.rows[0];

        await query(
            'UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [chatId]
        );

        const userInfo = await query(
            'SELECT username, name, role FROM users WHERE id = $1',
            [userId]
        );

        // ДОБАВЛЕНО: получение информации о файле
        let fileInfo = null;
        if (message.file_id) {
            const fileResult = await query(
                `SELECT id, original_filename, mime_type, size_bytes, 
                        file_type, thumbnail_path, width, height
                 FROM files WHERE id = $1`,
                [message.file_id]
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

                await query(
                    'UPDATE files SET message_id = $1 WHERE id = $2',
                    [message.id, file.id]
                );
            }
        }

        res.status(201).json({
            message: {
                ...message,
                user_id: userId,
                username: userInfo.rows[0].username,
                user_name: userInfo.rows[0].name,
                user_role: userInfo.rows[0].role,
                file: fileInfo  // ДОБАВЛЕНО
            }
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

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ 
                error: 'Message content is required',
                code: 'EMPTY_MESSAGE'
            });
        }

        // Check if message exists and belongs to user
        const messageCheck = await query(
            'SELECT id, user_id, is_deleted FROM messages WHERE id = $1',
            [messageId]
        );

        if (messageCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Message not found',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        const message = messageCheck.rows[0];

        if (message.is_deleted) {
            return res.status(400).json({ 
                error: 'Cannot edit deleted message',
                code: 'MESSAGE_DELETED'
            });
        }

        // Only message owner or admin can edit
        if (message.user_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ 
                error: 'You can only edit your own messages',
                code: 'EDIT_NOT_ALLOWED'
            });
        }

        // Update message
        const result = await query(
            `UPDATE messages 
             SET content = $1, is_edited = true, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id, content, is_edited, created_at, updated_at`,
            [content.trim(), messageId]
        );

        res.json({
            message: result.rows[0]
        });
    } catch (error) {
        console.error('Edit message error:', error);
        res.status(500).json({ 
            error: 'Failed to edit message',
            code: 'EDIT_MESSAGE_ERROR'
        });
    }
};

// Delete message (soft delete)
const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        // Check if message exists and belongs to user
        const messageCheck = await query(
            'SELECT id, user_id, is_deleted FROM messages WHERE id = $1',
            [messageId]
        );

        if (messageCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Message not found',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        const message = messageCheck.rows[0];

        if (message.is_deleted) {
            return res.status(400).json({ 
                error: 'Message already deleted',
                code: 'ALREADY_DELETED'
            });
        }

        // Only message owner or admin can delete
        if (message.user_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ 
                error: 'You can only delete your own messages',
                code: 'DELETE_NOT_ALLOWED'
            });
        }

        // Soft delete
        await query(
            `UPDATE messages 
             SET is_deleted = true, content = '[Deleted]', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [messageId]
        );

        res.json({ message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ 
            error: 'Failed to delete message',
            code: 'DELETE_MESSAGE_ERROR'
        });
    }
};

// Search messages in chat
const searchMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { query: searchQuery, limit = 20 } = req.query;

        if (!searchQuery || searchQuery.trim().length < 2) {
            return res.status(400).json({ 
                error: 'Search query must be at least 2 characters',
                code: 'INVALID_SEARCH'
            });
        }

        const result = await query(
            `SELECT 
                m.id,
                m.content,
                m.created_at,
                u.name as user_name
             FROM messages m
             JOIN users u ON m.user_id = u.id
             WHERE m.chat_id = $1 
             AND m.is_deleted = false
             AND m.content ILIKE $2
             ORDER BY m.created_at DESC
             LIMIT $3`,
            [chatId, `%${searchQuery}%`, limit]
        );

        res.json({ results: result.rows });
    } catch (error) {
        console.error('Search messages error:', error);
        res.status(500).json({ 
            error: 'Failed to search messages',
            code: 'SEARCH_ERROR'
        });
    }
};

// Get all messages across all chats (admin only - for monitoring)
const getAllMessages = async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;

        const result = await query(
            `SELECT 
                m.id,
                m.content,
                m.is_edited,
                m.is_deleted,
                m.created_at,
                m.chat_id,
                c.name as chat_name,
                c.type as chat_type,
                u.id as user_id,
                u.name as user_name,
                u.role as user_role
             FROM messages m
             JOIN chats c ON m.chat_id = c.id
             JOIN users u ON m.user_id = u.id
             ORDER BY m.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countResult = await query('SELECT COUNT(*) as total FROM messages');

        res.json({
            messages: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].total),
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Get all messages error:', error);
        res.status(500).json({ 
            error: 'Failed to get all messages',
            code: 'GET_ALL_MESSAGES_ERROR'
        });
    }
};

// Get message statistics (admin only)
const getMessageStats = async (req, res) => {
    try {
        const stats = await query(`
            SELECT 
                COUNT(*) as total_messages,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as messages_today,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as messages_this_week,
                COUNT(*) FILTER (WHERE is_edited = true) as edited_messages,
                COUNT(*) FILTER (WHERE is_deleted = true) as deleted_messages,
                COUNT(DISTINCT chat_id) as active_chats,
                COUNT(DISTINCT user_id) as active_users
            FROM messages
        `);

        const chatStats = await query(`
            SELECT 
                c.name as chat_name,
                c.type as chat_type,
                COUNT(m.id) as message_count,
                MAX(m.created_at) as last_message_at
            FROM chats c
            LEFT JOIN messages m ON c.id = m.chat_id
            GROUP BY c.id, c.name, c.type
            ORDER BY message_count DESC
            LIMIT 10
        `);

        const userStats = await query(`
            SELECT 
                u.name as user_name,
                u.role as user_role,
                COUNT(m.id) as message_count
            FROM users u
            LEFT JOIN messages m ON u.id = m.user_id
            GROUP BY u.id, u.name, u.role
            ORDER BY message_count DESC
            LIMIT 10
        `);

        res.json({
            overall: stats.rows[0],
            topChats: chatStats.rows,
            topUsers: userStats.rows
        });
    } catch (error) {
        console.error('Get message stats error:', error);
        res.status(500).json({ 
            error: 'Failed to get message statistics',
            code: 'GET_STATS_ERROR'
        });
    }
};

module.exports = {
    getMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    searchMessages,
    getAllMessages,
    getMessageStats
};
