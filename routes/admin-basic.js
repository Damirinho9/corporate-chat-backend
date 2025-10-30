// ================================================
// ADMIN ROUTES - BASIC
// ================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth'); // FIXED!

// ==================== USER MANAGEMENT ====================

// Get all users (admin/rop only)
router.get('/users', authenticateToken, async (req, res) => {
    try {
        // Check permissions
        if (req.user.role !== 'admin' && req.user.role !== 'rop') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await query(`
            SELECT id, username, name, role, department, is_active, created_at
            FROM users
            ORDER BY created_at DESC
        `);

        res.json({ users: result.rows });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create user (admin only)
router.post('/auth/register', authenticateToken, async (req, res) => {
    try {
        // Check admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admin can create users' });
        }

        const { username, password, name, role, department } = req.body;

        // Validate
        if (!username || !password || !name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check if username exists
        const existing = await query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // Insert user
        const result = await query(`
            INSERT INTO users (username, password_hash, name, role, department)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, username, name, role, department
        `, [username, password_hash, name, role || 'employee', department]);

        res.json({ 
            success: true,
            userId: result.rows[0].id, 
            user: result.rows[0] 
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user role (admin only)
router.put('/users/:userId/role', authenticateToken, async (req, res) => {
    try {
        // Check admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { userId } = req.params;
        const { role } = req.body;

        // Validate role
        const validRoles = ['admin', 'assistant', 'rop', 'operator', 'employee'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        await query(
            'UPDATE users SET role = $1 WHERE id = $2',
            [role, userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Deactivate user (admin only)
router.delete('/users/:userId', authenticateToken, async (req, res) => {
    try {
        // Check admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { userId } = req.params;

        // Don't allow deactivating yourself
        if (parseInt(userId) === req.user.id) {
            return res.status(400).json({ error: 'Cannot deactivate yourself' });
        }

        await query(
            'UPDATE users SET is_active = false WHERE id = $1',
            [userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Deactivate user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== CHAT MANAGEMENT ====================

// Create chat (admin/rop only)
router.post('/chats', authenticateToken, async (req, res) => {
    try {
        // Check permissions
        if (req.user.role !== 'admin' && req.user.role !== 'rop') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { name, type, department } = req.body;

        // Validate
        const validTypes = ['direct', 'group', 'department'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid chat type' });
        }

        // Insert chat
        const result = await query(`
            INSERT INTO chats (name, type, department, created_by)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [name, type, department, req.user.id]);

        const chat = result.rows[0];

        // Add creator to chat
        await query(
            'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)',
            [chat.id, req.user.id]
        );

        res.json({ success: true, chat });
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add participant to chat (admin/rop only)
router.post('/chats/:chatId/participants', authenticateToken, async (req, res) => {
    try {
        // Check permissions
        if (req.user.role !== 'admin' && req.user.role !== 'rop') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { chatId } = req.params;
        const { userId } = req.body;

        // Check if already participant
        const existing = await query(
            'SELECT * FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'User already in chat' });
        }

        // Add participant
        await query(
            'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)',
            [chatId, userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Add participant error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove participant from chat (admin/rop only)
router.delete('/chats/:chatId/participants/:userId', authenticateToken, async (req, res) => {
    try {
        // Check permissions
        if (req.user.role !== 'admin' && req.user.role !== 'rop') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { chatId, userId } = req.params;

        await query(
            'DELETE FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Remove participant error:', error);
        res.status(500).json({ error: error.message });
    }
});



// Get all chats (admin only)
router.get('/admin/chats', authenticateToken, async (req, res) => {
    try {
        // Check permissions
        if (req.user.role !== 'admin' && req.user.role !== 'rop') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const result = await query(`
            SELECT 
                c.id,
                c.name,
                c.type,
                c.created_at,
                COUNT(DISTINCT cp.user_id) as participant_count,
                COUNT(DISTINCT m.id) as message_count
            FROM chats c
            LEFT JOIN chat_participants cp ON c.id = cp.chat_id
            LEFT JOIN messages m ON c.id = m.chat_id
            GROUP BY c.id, c.name, c.type, c.created_at
            ORDER BY c.created_at DESC
        `);
        
        res.json({ chats: result.rows });
    } catch (err) {
        console.error('Get chats error:', err);
        res.status(500).json({ error: 'Failed to get chats' });
    }
});


// Delete chat (admin only)
router.delete('/admin/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'rop') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const { chatId } = req.params;
        
        // Delete messages first (foreign key constraint)
        await query('DELETE FROM messages WHERE chat_id = $1', [chatId]);
        
        // Delete participants
        await query('DELETE FROM chat_participants WHERE chat_id = $1', [chatId]);
        
        // Delete chat
        await query('DELETE FROM chats WHERE id = $1', [chatId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete chat error:', err);
        res.status(500).json({ error: 'Failed to delete chat' });
    }
});

// Update chat (admin only)
router.patch('/admin/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'rop') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const { chatId } = req.params;
        const { name } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        await query('UPDATE chats SET name = $1 WHERE id = $2', [name.trim(), chatId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Update chat error:', err);
        res.status(500).json({ error: 'Failed to update chat' });
    }
});

// Create chat (admin only)
router.post('/admin/chats', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'rop') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const { name, type } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        if (!type || !['group', 'direct'].includes(type)) {
            return res.status(400).json({ error: 'Invalid chat type' });
        }
        
        const result = await query(
            'INSERT INTO chats (name, type, created_by) VALUES ($1, $2, $3) RETURNING id',
            [name.trim(), type, req.user.id]
        );
        
        res.json({ success: true, chatId: result.rows[0].id });
    } catch (err) {
        console.error('Create chat error:', err);
        res.status(500).json({ error: 'Failed to create chat' });
    }
});

module.exports = router;

// Update user (admin only)
router.patch('/admin/users/:userId', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'rop') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const { userId } = req.params;
        const { name, role, department } = req.body;
        
        const updates = [];
        const values = [];
        let paramCount = 1;
        
        if (name) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (role) {
            updates.push(`role = $${paramCount++}`);
            values.push(role);
        }
        if (department !== undefined) {
            updates.push(`department = $${paramCount++}`);
            values.push(department);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        values.push(userId);
        await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete user permanently (hard delete) - admin only
router.delete('/admin/users/:userId', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'rop') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const { userId } = req.params;
        
        // Hard delete - permanently remove from database
        // First, remove user from chat_participants
        await query('DELETE FROM chat_participants WHERE user_id = $1', [userId]);
        
        // Remove user's messages (or set author to null if you want to keep messages)
        await query('DELETE FROM messages WHERE author_id = $1', [userId]);
        
        // Finally, delete the user
        await query('DELETE FROM users WHERE id = $1', [userId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});
