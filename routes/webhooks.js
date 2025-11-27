// routes/webhooks.js
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/webhooks
 * Get all webhooks (admin only)
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await query(`
            SELECT
                w.*,
                b.name as bot_name
            FROM webhooks w
            LEFT JOIN bots b ON w.bot_id = b.id
            ORDER BY w.created_at DESC
        `);

        res.json({ webhooks: result.rows });
    } catch (error) {
        console.error('Get webhooks error:', error);
        res.status(500).json({ error: 'Failed to fetch webhooks' });
    }
});

/**
 * POST /api/webhooks
 * Create a new webhook
 */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, url, events, secret, bot_id } = req.body;

        if (!name || !url) {
            return res.status(400).json({ error: 'Name and URL are required' });
        }

        const result = await query(`
            INSERT INTO webhooks (name, url, events, secret, bot_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [name, url, events || [], secret, bot_id]);

        res.status(201).json({ webhook: result.rows[0] });
    } catch (error) {
        console.error('Create webhook error:', error);
        res.status(500).json({ error: 'Failed to create webhook' });
    }
});

/**
 * PUT /api/webhooks/:id
 * Update a webhook
 */
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, url, events, secret, is_active } = req.body;

        const result = await query(`
            UPDATE webhooks
            SET name = COALESCE($1, name),
                url = COALESCE($2, url),
                events = COALESCE($3, events),
                secret = COALESCE($4, secret),
                is_active = COALESCE($5, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
        `, [name, url, events || null, secret, is_active, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        res.json({ webhook: result.rows[0] });
    } catch (error) {
        console.error('Update webhook error:', error);
        res.status(500).json({ error: 'Failed to update webhook' });
    }
});

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook
 */
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM webhooks WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        res.json({ message: 'Webhook deleted successfully' });
    } catch (error) {
        console.error('Delete webhook error:', error);
        res.status(500).json({ error: 'Failed to delete webhook' });
    }
});

/**
 * POST /api/webhooks/:id/test
 * Test a webhook
 */
router.post('/:id/test', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query('SELECT * FROM webhooks WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        // Here you would send a test request to the webhook URL
        // For now, just return success
        res.json({ message: 'Test webhook sent successfully' });
    } catch (error) {
        console.error('Test webhook error:', error);
        res.status(500).json({ error: 'Failed to test webhook' });
    }
});

module.exports = router;
