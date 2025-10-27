// controllers/messageController.js

const { query, transaction } = require('../config/database');

// Get messages for chat
const getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const { limit = 100, before, after } = req.query;

    const accessCheck = await query(
      'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );
    if (accessCheck.rows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to this chat', code: 'CHAT_ACCESS_DENIED' });
    }

    let q = `
      SELECT 
        m.id, m.content, m.created_at, m.updated_at, m.is_edited,
        m.reply_to_id, m.forwarded_from_id, m.user_id,
        u.name as user_name, u.username,
        (
          SELECT json_build_object(
            'id', f.id,
            'filename', f.original_filename,
            'size', f.size_bytes,
            'mimeType', f.mime_type,
            'type', f.file_type,
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
          SELECT json_build_object('id', rm.id, 'content', rm.content, 'user_id', rm.user_id, 'user_name', ru.name)
          FROM messages rm JOIN users ru ON rm.user_id = ru.id
          WHERE rm.id = m.reply_to_id
        ) as reply_to,
        (
          SELECT json_build_object('id', fm.id, 'content', fm.content, 'user_id', fm.user_id, 'user_name', fu.name, 'chat_id', fm.chat_id)
          FROM messages fm JOIN users fu ON fm.user_id = fu.id
          WHERE fm.id = m.forwarded_from_id
        ) as forwarded_from,
        (
          SELECT json_agg(json_build_object('emoji', r.emoji, 'user_id', r.user_id, 'user_name', ru2.name))
          FROM reactions r JOIN users ru2 ON r.user_id = ru2.id
          WHERE r.message_id = m.id
        ) as reactions,
        (
          SELECT json_agg(json_build_object('user_id', mt.user_id, 'user_name', mu.name, 'username', mu.username))
          FROM mentions mt JOIN users mu ON mt.user_id = mu.id
          WHERE mt.message_id = m.id
        ) as mentions
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.chat_id = $1
    `;
    const params = [chatId];
    let i = 2;

    if (before) { q += ` AND m.created_at < $${i++}`; params.push(before); }
    if (after)  { q += ` AND m.created_at > $${i++}`; params.push(after); }

    q += ` ORDER BY m.created_at DESC LIMIT $${i}`; params.push(limit);

    const result = await query(q, params);
    res.json({ messages: result.rows.reverse(), count: result.rows.length });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages', code: 'GET_MESSAGES_ERROR' });
  }
};

// Send message
const sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content, fileId, replyToId, forwardedFromId, mentions } = req.body;
    const userId = req.user.id;

    const accessCheck = await query(
      'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );
    if (accessCheck.rows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to this chat', code: 'CHAT_ACCESS_DENIED' });
    }
    if (!content && !fileId) {
      return res.status(400).json({ error: 'Message content or file is required', code: 'EMPTY_MESSAGE' });
    }

    if (replyToId) {
      const r = await query('SELECT id FROM messages WHERE id = $1 AND chat_id = $2', [replyToId, chatId]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'Reply message not found', code: 'REPLY_NOT_FOUND' });
    }
    if (forwardedFromId) {
      const f = await query('SELECT id FROM messages WHERE id = $1', [forwardedFromId]);
      if (f.rows.length === 0) return res.status(404).json({ error: 'Forwarded message not found', code: 'FORWARD_NOT_FOUND' });
    }

    const inserted = await transaction(async (client) => {
      const mr = await client.query(
        `INSERT INTO messages (chat_id, user_id, content, file_id, reply_to_id, forwarded_from_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [chatId, userId, content || null, fileId || null, replyToId || null, forwardedFromId || null]
      );
      const message = mr.rows[0];

      if (mentions && mentions.length > 0) {
        const values = mentions.map((_, idx) => `($1, $${idx + 2})`).join(', ');
        await client.query(
          `INSERT INTO mentions (message_id, user_id) VALUES ${values} ON CONFLICT DO NOTHING`,
          [message.id, ...mentions]
        );
      }

      if (fileId) {
        await client.query('UPDATE files SET message_id = $1 WHERE id = $2', [message.id, fileId]);
      }

      await client.query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chatId]);
      return message.id;
    });

    const full = await query(
      `SELECT 
        m.id, m.content, m.created_at, m.user_id, u.name as user_name, u.username,
        (
          SELECT json_build_object(
            'id', f.id, 'filename', f.original_filename, 'size', f.size_bytes,
            'mimeType', f.mime_type, 'type', f.file_type, 'url', '/api/files/' || f.id,
            'thumbnailUrl', CASE WHEN f.thumbnail_path IS NOT NULL THEN '/api/files/' || f.id || '/thumbnail' ELSE NULL END
          ) FROM files f WHERE f.id = m.file_id
        ) as file,
        (
          SELECT json_build_object('id', rm.id, 'content', rm.content, 'user_id', rm.user_id, 'user_name', ru.name)
          FROM messages rm JOIN users ru ON rm.user_id = ru.id
          WHERE rm.id = m.reply_to_id
        ) as reply_to,
        (
          SELECT json_agg(json_build_object('user_id', mt.user_id, 'user_name', mu.name, 'username', mu.username))
          FROM mentions mt JOIN users mu ON mt.user_id = mu.id
          WHERE mt.message_id = m.id
        ) as mentions
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.id = $1`,
      [inserted]
    );

    res.status(201).json({ message: 'Message sent successfully', data: full.rows[0] });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message', code: 'SEND_MESSAGE_ERROR' });
  }
};

// Edit message
const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content) return res.status(400).json({ error: 'Content is required', code: 'EMPTY_CONTENT' });

    const chk = await query('SELECT user_id FROM messages WHERE id = $1', [messageId]);
    if (chk.rows.length === 0) return res.status(404).json({ error: 'Message not found', code: 'MESSAGE_NOT_FOUND' });

    if (chk.rows[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Cannot edit this message', code: 'EDIT_DENIED' });
    }

    await query(
      `UPDATE messages SET content = $1, is_edited = true, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [content, messageId]
    );

    res.json({ message: 'Message edited successfully' });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Failed to edit message', code: 'EDIT_MESSAGE_ERROR' });
  }
};

// Delete message
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const chk = await query('SELECT user_id FROM messages WHERE id = $1', [messageId]);
    if (chk.rows.length === 0) return res.status(404).json({ error: 'Message not found', code: 'MESSAGE_NOT_FOUND' });

    if (chk.rows[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Cannot delete this message', code: 'DELETE_DENIED' });
    }

    await query('DELETE FROM messages WHERE id = $1', [messageId]);
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message', code: 'DELETE_MESSAGE_ERROR' });
  }
};

// Add reaction
const addReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;

    if (!emoji) return res.status(400).json({ error: 'Emoji is required', code: 'MISSING_EMOJI' });

    const chk = await query(
      `SELECT m.id FROM messages m
       JOIN chat_participants cp ON m.chat_id = cp.chat_id
       WHERE m.id = $1 AND cp.user_id = $2`,
      [messageId, userId]
    );
    if (chk.rows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied', code: 'REACTION_ACCESS_DENIED' });
    }

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
    res.status(500).json({ error: 'Failed to add reaction', code: 'ADD_REACTION_ERROR' });
  }
};

// Remove reaction
const removeReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    await query('DELETE FROM reactions WHERE message_id = $1 AND user_id = $2', [messageId, userId]);
    res.json({ message: 'Reaction removed successfully' });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Failed to remove reaction', code: 'REMOVE_REACTION_ERROR' });
  }
};

// Forward message
const forwardMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { targetChatIds } = req.body;
    const userId = req.user.id;

    if (!targetChatIds || targetChatIds.length === 0) {
      return res.status(400).json({ error: 'Target chat IDs are required', code: 'MISSING_TARGET_CHATS' });
    }

    const original = await query('SELECT content, file_id FROM messages WHERE id = $1', [messageId]);
    if (original.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found', code: 'MESSAGE_NOT_FOUND' });
    }

    const forwardedTo = [];
    for (const targetChatId of targetChatIds) {
      const access = await query(
        'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
        [targetChatId, userId]
      );
      if (access.rows.length === 0 && req.user.role !== 'admin') continue;

      const ins = await query(
        `INSERT INTO messages (chat_id, user_id, content, file_id, forwarded_from_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [targetChatId, userId, original.rows[0].content, original.rows[0].file_id, messageId]
      );
      forwardedTo.push({ chatId: targetChatId, messageId: ins.rows[0].id });
    }

    res.json({ message: 'Message forwarded successfully', forwardedTo });
  } catch (error) {
    console.error('Forward message error:', error);
    res.status(500).json({ error: 'Failed to forward message', code: 'FORWARD_MESSAGE_ERROR' });
  }
};

// Search messages
const searchMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { query: searchQuery, limit = 50 } = req.query;
    const userId = req.user.id;

    if (!searchQuery) return res.status(400).json({ error: 'Search query is required', code: 'MISSING_QUERY' });

    const access = await query(
      'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );
    if (access.rows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied', code: 'SEARCH_ACCESS_DENIED' });
    }

    const r = await query(
      `SELECT m.id, m.content, m.created_at, m.user_id, u.name as user_name
       FROM messages m JOIN users u ON m.user_id = u.id
       WHERE m.chat_id = $1 AND m.content ILIKE $2
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [chatId, `%${searchQuery}%`, limit]
    );

    res.json({ messages: r.rows, count: r.rows.length });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Failed to search messages', code: 'SEARCH_MESSAGES_ERROR' });
  }
};

// Get all messages (admin only)
const getAllMessages = async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const r = await query(
      `SELECT 
         m.id, m.content, m.created_at, m.user_id, m.chat_id,
         u.name as user_name, u.username,
         c.name as chat_name, c.type as chat_type
       FROM messages m
       JOIN users u ON m.user_id = u.id
       JOIN chats c ON m.chat_id = c.id
       ORDER BY m.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ messages: r.rows, count: r.rows.length });
  } catch (error) {
    console.error('Get all messages error:', error);
    res.status(500).json({ error: 'Failed to get messages', code: 'GET_ALL_MESSAGES_ERROR' });
  }
};

// Get message statistics (admin only)
const getMessageStats = async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT user_id) as unique_senders,
        COUNT(DISTINCT chat_id) as active_chats,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as messages_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as messages_7d,
        COUNT(*) FILTER (WHERE file_id IS NOT NULL) as messages_with_files
      FROM messages
    `);

    const topUsers = await query(`
      SELECT u.id, u.name, u.username, COUNT(m.id) as message_count
      FROM users u JOIN messages m ON u.id = m.user_id
      GROUP BY u.id, u.name, u.username
      ORDER BY message_count DESC
      LIMIT 10
    `);

    res.json({ overall: stats.rows[0], topUsers: topUsers.rows });
  } catch (error) {
    console.error('Get message stats error:', error);
    res.status(500).json({ error: 'Failed to get message statistics', code: 'GET_MESSAGE_STATS_ERROR' });
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