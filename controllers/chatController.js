const { query } = require('../config/database');
const { pool } = require('../config/database');

// Get all accessible chats for user
const getUserChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const me = await query('SELECT role FROM users WHERE id=$1', [userId]);
    const isAdmin = me.rows[0]?.role === 'admin';

    const { limit = 50, offset = 0 } = req.query;

    const baseSelect = `
      SELECT 
        c.id, c.name, c.type, c.department, cp.last_read_at, c.updated_at,
        (
          SELECT COUNT(*) FROM messages m
           WHERE m.chat_id = c.id 
             AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')
             AND m.user_id != $1
        ) AS unread_count,
        (
          SELECT json_build_object(
            'id', m.id, 'content', m.content, 'created_at', m.created_at,
            'user_id', m.user_id, 'username', u.name
          )
            FROM messages m
            JOIN users u ON m.user_id=u.id
           WHERE m.chat_id = c.id
           ORDER BY m.created_at DESC
           LIMIT 1
        ) AS last_message,
        (
          SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'role', u.role))
            FROM chat_participants cp2
            JOIN users u ON cp2.user_id=u.id
           WHERE cp2.chat_id = c.id AND u.id <> $1
        ) AS participants
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
    `;

    const sql = isAdmin
      ? baseSelect + ` WHERE 1=1 ORDER BY c.updated_at DESC LIMIT $2 OFFSET $3`
      : baseSelect + ` WHERE cp.user_id = $1 ORDER BY c.updated_at DESC LIMIT $2 OFFSET $3`;

    const result = await query(sql, [userId, limit, offset]);

    res.json({ chats: result.rows });
  } catch (error) {
    console.error('Get user chats error:', error);
    res.status(500).json({ error: 'Failed to get chats', code: 'GET_CHATS_ERROR' });
  }
};

// Get chat by ID
const getChatById = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user.id;

        const result = await query(
            `SELECT 
                c.id,
                c.name,
                c.type,
                c.department,
                c.created_at,
                (
                    SELECT json_agg(json_build_object(
                        'id', u.id, 
                        'username', u.username, 
                        'name', u.name, 
                        'role', u.role,
                        'department', u.department,
                        'last_seen', u.last_seen
                    ))
                    FROM chat_participants cp
                    JOIN users u ON cp.user_id = u.id
                    WHERE cp.chat_id = c.id
                ) as participants
            FROM chats c
            WHERE c.id = $1`,
            [chatId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Chat not found',
                code: 'CHAT_NOT_FOUND'
            });
        }

        const chat = result.rows[0];

        // Check access (except for admins)
        if (req.user.role !== 'admin') {
            const hasAccess = chat.participants.some(p => p.id === userId);
            if (!hasAccess) {
                return res.status(403).json({ 
                    error: 'Access denied to this chat',
                    code: 'CHAT_ACCESS_DENIED'
                });
            }
        }

        res.json({ chat });
    } catch (error) {
        console.error('Get chat error:', error);
        res.status(500).json({ 
            error: 'Failed to get chat',
            code: 'GET_CHAT_ERROR'
        });
    }
};

// Create direct message chat
const createDirectChat = async (req, res) => {
    try {
        const { receiverId } = req.body;
        const senderId = req.user.id;

        if (!receiverId) {
            return res.status(400).json({ 
                error: 'Receiver ID is required',
                code: 'MISSING_RECEIVER'
            });
        }

        // Check if receiver exists
        const receiverCheck = await query(
            'SELECT id, username, name FROM users WHERE id = $1 AND is_active = true',
            [receiverId]
        );

        if (receiverCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Receiver not found',
                code: 'RECEIVER_NOT_FOUND'
            });
        }

        // Check if chat already exists
        const existingChat = await query(
            `SELECT c.id 
             FROM chats c
             JOIN chat_participants cp1 ON c.id = cp1.chat_id
             JOIN chat_participants cp2 ON c.id = cp2.chat_id
             WHERE c.type = 'direct'
             AND cp1.user_id = $1 
             AND cp2.user_id = $2`,
            [senderId, receiverId]
        );

        if (existingChat.rows.length > 0) {
            return res.json({ 
                message: 'Chat already exists',
                chatId: existingChat.rows[0].id,
                isNew: false
            });
        }

        // Create new chat
        const client = await pool.connect();
        let result;
        try {
            await client.query('BEGIN');
            

            const chatResult = await client.query(
                `INSERT INTO chats (type, created_by)
                 VALUES ('direct', $1)
                 RETURNING id`,
                [senderId]
            );

            const chatId = chatResult.rows[0].id;

            // Add both participants
            await client.query(
                `INSERT INTO chat_participants (chat_id, user_id)
                 VALUES ($1, $2), ($1, $3)`,
                [chatId, senderId, receiverId]
            );

            await client.query('COMMIT');
            result = chatId;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        res.status(201).json({
            message: 'Direct chat created successfully',
            chatId: result,
            isNew: true
        });
    } catch (error) {
        console.error('Create direct chat error:', error);
        res.status(500).json({ 
            error: 'Failed to create direct chat',
            code: 'CREATE_CHAT_ERROR'
        });
    }
};

// Create group chat (admin only)
const createGroupChat = async (req, res) => {
    try {
        const { name, participantIds } = req.body;

        if (!name) {
            return res.status(400).json({ 
                error: 'Chat name is required',
                code: 'MISSING_NAME'
            });
        }

        if (!participantIds || participantIds.length === 0) {
            return res.status(400).json({ 
                error: 'At least one participant is required',
                code: 'MISSING_PARTICIPANTS'
            });
        }

        const client = await pool.connect();
        let result;
        try {
            await client.query('BEGIN');
            

            const chatResult = await client.query(
                `INSERT INTO chats (name, type, created_by)
                 VALUES ($1, 'group', $2)
                 RETURNING id`,
                [name, req.user.id]
            );

            const chatId = chatResult.rows[0].id;

            // Add participants
            const values = participantIds.map((userId, i) => 
                `($1, $${i + 2})`
            ).join(', ');

            await client.query(
                `INSERT INTO chat_participants (chat_id, user_id)
                 VALUES ${values}`,
                [chatId, ...participantIds]
            );

            await client.query('COMMIT');
            result = chatId;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        res.status(201).json({
            message: 'Group chat created successfully',
            chatId: result
        });
    } catch (error) {
        console.error('Create group chat error:', error);
        res.status(500).json({ 
            error: 'Failed to create group chat',
            code: 'CREATE_GROUP_ERROR'
        });
    }
};

// Add participant to chat (admin or ROP can add to their department chats)
const addParticipant = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { userId } = req.body;
        const currentUserId = req.user.id;
        const currentUserRole = req.user.role;
        const currentUserDept = req.user.department;

        if (!userId) {
            return res.status(400).json({
                error: 'User ID is required',
                code: 'MISSING_USER_ID'
            });
        }

        // Check if chat exists
        const chatCheck = await query(
            'SELECT id, type, department FROM chats WHERE id = $1',
            [chatId]
        );

        if (chatCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Chat not found',
                code: 'CHAT_NOT_FOUND'
            });
        }

        const chat = chatCheck.rows[0];

        if (chat.type === 'direct') {
            return res.status(400).json({
                error: 'Cannot add participants to direct chats',
                code: 'DIRECT_CHAT_MODIFY'
            });
        }

        // Check permissions: admin can add to any chat, ROP can add to their department chats
        if (currentUserRole === 'rop') {
            if (chat.type === 'department' && chat.department !== currentUserDept) {
                return res.status(403).json({
                    error: 'ROP can only add participants to their own department chats',
                    code: 'PERMISSION_DENIED'
                });
            }
            // РОП может добавлять в групповые чаты, где он является участником с правами
            if (chat.type === 'group') {
                const ropPermCheck = await query(
                    'SELECT can_add_members FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
                    [chatId, currentUserId]
                );
                if (ropPermCheck.rows.length === 0 || !ropPermCheck.rows[0].can_add_members) {
                    return res.status(403).json({
                        error: 'You do not have permission to add members to this chat',
                        code: 'PERMISSION_DENIED'
                    });
                }
            }
        } else if (currentUserRole !== 'admin') {
            return res.status(403).json({
                error: 'Only admin or ROP can add participants',
                code: 'PERMISSION_DENIED'
            });
        }

        // Check if user exists
        const userCheck = await query(
            'SELECT id FROM users WHERE id = $1 AND is_active = true',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Add participant
        await query(
            `INSERT INTO chat_participants (chat_id, user_id)
             VALUES ($1, $2)
             ON CONFLICT (chat_id, user_id) DO NOTHING`,
            [chatId, userId]
        );

        res.json({ message: 'Participant added successfully' });
    } catch (error) {
        console.error('Add participant error:', error);
        res.status(500).json({
            error: 'Failed to add participant',
            code: 'ADD_PARTICIPANT_ERROR'
        });
    }
};

// Remove participant from chat (admin only)
const removeParticipant = async (req, res) => {
    try {
        const { chatId, userId } = req.params;

        // Check if chat exists and is not direct
        const chatCheck = await query(
            'SELECT id, type FROM chats WHERE id = $1',
            [chatId]
        );

        if (chatCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Chat not found',
                code: 'CHAT_NOT_FOUND'
            });
        }

        if (chatCheck.rows[0].type === 'direct') {
            return res.status(400).json({ 
                error: 'Cannot remove participants from direct chats',
                code: 'DIRECT_CHAT_MODIFY'
            });
        }

        // Remove participant
        await query(
            'DELETE FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );

        res.json({ message: 'Participant removed successfully' });
    } catch (error) {
        console.error('Remove participant error:', error);
        res.status(500).json({ 
            error: 'Failed to remove participant',
            code: 'REMOVE_PARTICIPANT_ERROR'
        });
    }
};

// Mark chat as read
const markAsRead = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user.id;

        await query(
            `UPDATE chat_participants 
             SET last_read_at = CURRENT_TIMESTAMP
             WHERE chat_id = $1 AND user_id = $2`,
            [chatId, userId]
        );

        res.json({ message: 'Chat marked as read' });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ 
            error: 'Failed to mark chat as read',
            code: 'MARK_READ_ERROR'
        });
    }
};

// Delete chat (admin only)
const deleteChat = async (req, res) => {
    try {
        const { chatId } = req.params;

        // Check if chat exists
        const chatCheck = await query(
            'SELECT id FROM chats WHERE id = $1',
            [chatId]
        );

        if (chatCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Chat not found',
                code: 'CHAT_NOT_FOUND'
            });
        }

        // Delete chat (cascade will handle participants and messages)
        await query('DELETE FROM chats WHERE id = $1', [chatId]);

        res.json({ message: 'Chat deleted successfully' });
    } catch (error) {
        console.error('Delete chat error:', error);
        res.status(500).json({ 
            error: 'Failed to delete chat',
            code: 'DELETE_CHAT_ERROR'
        });
    }
};

// helper: получить доступных адресатов для DM по RBAC
const getAvailableRecipients = async (req, res) => {
  try {
    const meId = req.user.id;
    const me = await query(
      'SELECT id, role, department FROM users WHERE id = $1',
      [meId]
    );
    if (me.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const { role, department } = me.rows[0];

    // админ и ассистент - могут писать всем активным
    if (role === 'admin' || role === 'assistant') {
      const r = await query(
        'SELECT id, name, role, department FROM users WHERE is_active = true AND id <> $1 ORDER BY role, name',
        [meId]
      );
      return res.json({ recipients: r.rows });
    }

    // руководитель - всем
    if (role === 'manager') {
      const r = await query(
        'SELECT id, name, role, department FROM users WHERE is_active = true AND id <> $1 ORDER BY role, name',
        [meId]
      );
      return res.json({ recipients: r.rows });
    }

    // оператор - только ассистентам + руководителю своего отдела
    if (role === 'operator') {
      const r = await query(
        `SELECT id, name, role, department
           FROM users
          WHERE is_active = true
            AND id <> $1
            AND (
              role = 'assistant'
              OR (role = 'manager' AND department = $2)
            )
          ORDER BY role, name`,
        [meId, department]
      );
      return res.json({ recipients: r.rows });
    }

    // по умолчанию: никому
    return res.json({ recipients: [] });
  } catch (e) {
    console.error('getAvailableRecipients error:', e);
    return res.status(500).json({ error: 'Failed to get recipients' });
  }
};

// Get chat settings (admin/rop)
const getChatSettings = async (req, res) => {
    try {
        const { chatId } = req.params;
        const currentUser = req.user;

        // Check if chat exists
        const chatCheck = await query(
            'SELECT id, type, department, name FROM chats WHERE id = $1',
            [chatId]
        );

        if (chatCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Chat not found',
                code: 'CHAT_NOT_FOUND'
            });
        }

        const chat = chatCheck.rows[0];

        // Check permissions
        if (currentUser.role === 'rop') {
            if (chat.type === 'department' && chat.department !== currentUser.department) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'PERMISSION_DENIED'
                });
            }
        } else if (currentUser.role !== 'admin') {
            return res.status(403).json({
                error: 'Only admin or ROP can access chat settings',
                code: 'PERMISSION_DENIED'
            });
        }

        // Get participants with their roles
        const participants = await query(`
            SELECT
                u.id, u.name, u.username, u.role as user_role, u.department,
                cp.role as chat_role, cp.can_add_members, cp.can_remove_members
            FROM chat_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.chat_id = $1
            ORDER BY u.name
        `, [chatId]);

        res.json({
            chat,
            participants: participants.rows
        });
    } catch (error) {
        console.error('Get chat settings error:', error);
        res.status(500).json({
            error: 'Failed to get chat settings',
            code: 'GET_SETTINGS_ERROR'
        });
    }
};

// Update chat settings (admin/rop)
const updateChatSettings = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { name, description } = req.body;
        const currentUser = req.user;

        // Check if chat exists
        const chatCheck = await query(
            'SELECT id, type, department FROM chats WHERE id = $1',
            [chatId]
        );

        if (chatCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Chat not found',
                code: 'CHAT_NOT_FOUND'
            });
        }

        const chat = chatCheck.rows[0];

        // Check permissions
        if (currentUser.role === 'rop') {
            if (chat.type === 'department' && chat.department !== currentUser.department) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'PERMISSION_DENIED'
                });
            }
        } else if (currentUser.role !== 'admin') {
            return res.status(403).json({
                error: 'Only admin or ROP can update chat settings',
                code: 'PERMISSION_DENIED'
            });
        }

        // Build update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramCount}`);
            values.push(name);
            paramCount++;
        }

        if (description !== undefined) {
            updates.push(`description = $${paramCount}`);
            values.push(description);
            paramCount++;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No fields to update',
                code: 'NO_UPDATE_FIELDS'
            });
        }

        values.push(chatId);

        await query(
            `UPDATE chats SET ${updates.join(', ')} WHERE id = $${paramCount}`,
            values
        );

        res.json({ message: 'Chat settings updated successfully' });
    } catch (error) {
        console.error('Update chat settings error:', error);
        res.status(500).json({
            error: 'Failed to update chat settings',
            code: 'UPDATE_SETTINGS_ERROR'
        });
    }
};

// Update participant permissions (admin only)
const updateParticipantPermissions = async (req, res) => {
    try {
        const { chatId, userId } = req.params;
        const { canAddMembers, canRemoveMembers, role } = req.body;

        // Check if participant exists
        const participantCheck = await query(
            'SELECT * FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );

        if (participantCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Participant not found in this chat',
                code: 'PARTICIPANT_NOT_FOUND'
            });
        }

        // Build update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (canAddMembers !== undefined) {
            updates.push(`can_add_members = $${paramCount}`);
            values.push(canAddMembers);
            paramCount++;
        }

        if (canRemoveMembers !== undefined) {
            updates.push(`can_remove_members = $${paramCount}`);
            values.push(canRemoveMembers);
            paramCount++;
        }

        if (role !== undefined) {
            updates.push(`role = $${paramCount}`);
            values.push(role);
            paramCount++;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No fields to update',
                code: 'NO_UPDATE_FIELDS'
            });
        }

        values.push(chatId, userId);

        await query(
            `UPDATE chat_participants SET ${updates.join(', ')}
             WHERE chat_id = $${paramCount} AND user_id = $${paramCount + 1}`,
            values
        );

        res.json({ message: 'Participant permissions updated successfully' });
    } catch (error) {
        console.error('Update participant permissions error:', error);
        res.status(500).json({
            error: 'Failed to update participant permissions',
            code: 'UPDATE_PERMISSIONS_ERROR'
        });
    }
};

module.exports = {
    getUserChats,
    getChatById,
    createDirectChat,
    createGroupChat,
    addParticipant,
    removeParticipant,
    markAsRead,
    deleteChat,
    getAvailableRecipients,
    getChatSettings,
    updateChatSettings,
    updateParticipantPermissions
};