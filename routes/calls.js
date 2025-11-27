// routes/calls.js
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/calls/history/all
 * Get call history for current user
 */
router.get('/history/all', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await query(`
            SELECT
                c.*,
                u.name as initiated_by_name,
                u.username as initiated_by_username,
                ch.name as chat_name,
                (
                    SELECT json_agg(json_build_object(
                        'user_id', cp.user_id,
                        'user_name', u2.name,
                        'status', cp.status,
                        'joined_at', cp.joined_at,
                        'left_at', cp.left_at,
                        'duration', cp.duration
                    ))
                    FROM call_participants cp
                    JOIN users u2 ON cp.user_id = u2.id
                    WHERE cp.call_id = c.id
                ) as participants
            FROM calls c
            LEFT JOIN users u ON c.initiated_by = u.id
            LEFT JOIN chats ch ON c.chat_id = ch.id
            WHERE c.id IN (
                SELECT DISTINCT call_id
                FROM call_participants
                WHERE user_id = $1
            )
            OR c.initiated_by = $1
            ORDER BY c.created_at DESC
            LIMIT 100
        `, [userId]);

        res.json({ calls: result.rows });
    } catch (error) {
        console.error('Get call history error:', error);
        res.status(500).json({ error: 'Failed to load call history' });
    }
});

/**
 * GET /api/calls/:id
 * Get call details
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const result = await query(`
            SELECT
                c.*,
                u.name as initiated_by_name,
                ch.name as chat_name
            FROM calls c
            LEFT JOIN users u ON c.initiated_by = u.id
            LEFT JOIN chats ch ON c.chat_id = ch.id
            WHERE c.id = $1
            AND (
                c.id IN (
                    SELECT call_id FROM call_participants WHERE user_id = $2
                )
                OR c.initiated_by = $2
            )
        `, [id, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Call not found' });
        }

        res.json({ call: result.rows[0] });
    } catch (error) {
        console.error('Get call error:', error);
        res.status(500).json({ error: 'Failed to get call details' });
    }
});

module.exports = router;
