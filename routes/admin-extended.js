// ========================================================
// РАСШИРЕННЫЕ ADMIN ROUTES
// ========================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// ==================== DEPARTMENT MANAGEMENT ====================
// DEPRECATED: Old department routes moved to departmentController.js
// These routes were returning simple strings instead of full department objects
// Now using proper routes in api.js with departmentController

/* COMMENTED OUT - Use departmentController.js routes instead

// Get all departments
router.get('/departments', authenticateToken, async (req, res) => {
    try {
        const result = await query(`
            SELECT DISTINCT department
            FROM users
            WHERE department IS NOT NULL
            ORDER BY department
        `);

        const departments = result.rows.map(r => r.department);
        res.json({ departments });
    } catch (error) {
        console.error('Get departments error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new department (admin only)
router.post('/departments', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Department name required' });
        }

        // Just validate it's a new department
        const existing = await query(
            'SELECT id FROM users WHERE department = $1 LIMIT 1',
            [name]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Department already exists' });
        }

        // Log action
        await logAdminAction(req.user.id, 'create_department', { name });

        res.json({ success: true, department: name });
    } catch (error) {
        console.error('Create department error:', error);
        res.status(500).json({ error: error.message });
    }
});

*/ // END OF COMMENTED OUT DEPARTMENT ROUTES

// ==================== CHAT MANAGEMENT ====================

// Archive chat (admin only)
router.put('/chats/:chatId/archive', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { chatId } = req.params;

        // Add is_archived column if doesn't exist
        await query(`
            ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false
        `);

        await query(
            'UPDATE chats SET is_archived = true WHERE id = $1',
            [chatId]
        );

        // Log action
        await logAdminAction(req.user.id, 'archive_chat', { chatId });

        res.json({ success: true });
    } catch (error) {
        console.error('Archive chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Unarchive chat (admin only)
router.put('/chats/:chatId/unarchive', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { chatId } = req.params;

        await query(
            'UPDATE chats SET is_archived = false WHERE id = $1',
            [chatId]
        );

        // Log action
        await logAdminAction(req.user.id, 'unarchive_chat', { chatId });

        res.json({ success: true });
    } catch (error) {
        console.error('Unarchive chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== MESSAGE MANAGEMENT ====================

// Pin message (admin or chat owner)
router.post('/chats/:chatId/messages/:messageId/pin', authenticateToken, async (req, res) => {
    try {
        const { chatId, messageId } = req.params;

        // Check if user is admin or chat owner
        const chatResult = await query(
            'SELECT created_by FROM chats WHERE id = $1',
            [chatId]
        );

        if (chatResult.rows.length === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        const isOwner = chatResult.rows[0].created_by === req.user.id;
        const isAdmin = req.user.role === 'admin';

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Add is_pinned column if doesn't exist
        await query(`
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false
        `);

        await query(
            'UPDATE messages SET is_pinned = true WHERE id = $1 AND chat_id = $2',
            [messageId, chatId]
        );

        // Log action
        await logAdminAction(req.user.id, 'pin_message', { chatId, messageId });

        res.json({ success: true });
    } catch (error) {
        console.error('Pin message error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Unpin message
router.delete('/chats/:chatId/messages/:messageId/pin', authenticateToken, async (req, res) => {
    try {
        const { chatId, messageId } = req.params;

        // Check permissions
        const chatResult = await query(
            'SELECT created_by FROM chats WHERE id = $1',
            [chatId]
        );

        const isOwner = chatResult.rows[0]?.created_by === req.user.id;
        const isAdmin = req.user.role === 'admin';

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await query(
            'UPDATE messages SET is_pinned = false WHERE id = $1 AND chat_id = $2',
            [messageId, chatId]
        );

        // Log action
        await logAdminAction(req.user.id, 'unpin_message', { chatId, messageId });

        res.json({ success: true });
    } catch (error) {
        console.error('Unpin message error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get pinned messages for chat
router.get('/chats/:chatId/pinned', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;

        const result = await query(`
            SELECT m.*, u.name as user_name
            FROM messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.chat_id = $1 AND m.is_pinned = true
            ORDER BY m.created_at DESC
        `, [chatId]);

        res.json({ messages: result.rows });
    } catch (error) {
        console.error('Get pinned messages error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== ADMIN LOGS ====================

// Log admin action
async function logAdminAction(userId, action, details) {
    try {
        // Create admin_logs table if doesn't exist
        await query(`
            CREATE TABLE IF NOT EXISTS admin_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                action VARCHAR(100) NOT NULL,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await query(
            'INSERT INTO admin_logs (user_id, action, details) VALUES ($1, $2, $3)',
            [userId, action, JSON.stringify(details)]
        );
    } catch (error) {
        console.error('Log admin action error:', error);
    }
}

// Get admin logs (admin only)
router.get('/admin/logs', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { limit = 100, offset = 0 } = req.query;

        const result = await query(`
            SELECT al.*, u.name as user_name, u.username
            FROM admin_logs al
            JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json({ logs: result.rows });
    } catch (error) {
        console.error('Get admin logs error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;