// ================================================
// ADMIN ROUTES - BASIC
// ================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { query } = require('../config/database'); // ADDED!
const { auth } = require('../middleware/auth'); // FIXED: removed isAdmin

// ==================== USER MANAGEMENT ====================

// Get all users (admin/rop only)
router.get('/users', auth, async (req, res) => {
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
router.post('/auth/register', auth, async (req, res) => {
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
            user: result.rows[0] 
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user role (admin only)
router.put('/users/:userId/role', auth, async (req, res) => {
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
router.delete('/users/:userId', auth, async (req, res) => {
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
router.post('/chats', auth, async (req, res) => {
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
router.post('/chats/:chatId/participants', auth, async (req, res) => {
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
router.delete('/chats/:chatId/participants/:userId', auth, async (req, res) => {
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

module.exports = router;