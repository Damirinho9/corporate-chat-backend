const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');
const crypto = require('crypto');

// Validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Available webhook events
const WEBHOOK_EVENTS = [
    'message.created',
    'message.updated',
    'message.deleted',
    'user.joined',
    'user.left',
    'chat.created',
    'chat.updated',
    'call.started',
    'call.ended',
    'file.uploaded',
    'reaction.added'
];

// ==================== WEBHOOK MANAGEMENT ====================

/**
 * GET /api/webhooks
 * Get all webhooks for a bot
 */
router.get('/',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { bot_id, limit = 50, offset = 0 } = req.query;

            let webhooksQuery;
            let params;

            if (bot_id) {
                webhooksQuery = `
                    SELECT w.*, b.name as bot_name, b.username as bot_username
                    FROM webhooks w
                    JOIN bots b ON w.bot_id = b.id
                    WHERE w.bot_id = $1
                    ORDER BY w.created_at DESC
                    LIMIT $2 OFFSET $3
                `;
                params = [bot_id, limit, offset];
            } else {
                webhooksQuery = `
                    SELECT w.*, b.name as bot_name, b.username as bot_username
                    FROM webhooks w
                    JOIN bots b ON w.bot_id = b.id
                    ORDER BY w.created_at DESC
                    LIMIT $1 OFFSET $2
                `;
                params = [limit, offset];
            }

            const result = await query(webhooksQuery, params);

            res.json({ webhooks: result.rows });
        } catch (error) {
            console.error('Get webhooks error:', error);
            res.status(500).json({ error: 'Failed to fetch webhooks' });
        }
    }
);

/**
 * POST /api/webhooks
 * Create a new webhook
 */
router.post('/',
    authenticateToken,
    requireAdmin,
    [
        body('bot_id').isInt().withMessage('Valid bot_id required'),
        body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Name required'),
        body('url').isURL().withMessage('Valid URL required'),
        body('events').isArray({ min: 1 }).withMessage('At least one event required'),
        body('events.*').isIn(WEBHOOK_EVENTS).withMessage('Invalid event type'),
        body('headers').optional().isObject()
    ],
    validate,
    async (req, res) => {
        try {
            const { bot_id, name, url, events, headers } = req.body;

            // Verify bot exists and user owns it
            const botCheck = await query(
                'SELECT * FROM bots WHERE id = $1',
                [bot_id]
            );

            if (botCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Bot not found' });
            }

            // Generate webhook secret for HMAC signatures
            const secret = crypto.randomBytes(32).toString('hex');

            const result = await query(
                `INSERT INTO webhooks (bot_id, name, url, secret, events, headers)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [bot_id, name, url, secret, events, JSON.stringify(headers || {})]
            );

            res.status(201).json({
                webhook: result.rows[0],
                message: 'Webhook created. Save the secret for signature verification.'
            });
        } catch (error) {
            console.error('Create webhook error:', error);
            res.status(500).json({ error: 'Failed to create webhook' });
        }
    }
);

/**
 * GET /api/webhooks/:id
 * Get webhook details
 */
router.get('/:id',
    authenticateToken,
    requireAdmin,
    [param('id').isInt()],
    validate,
    async (req, res) => {
        try {
            const { id } = req.params;

            const result = await query(
                `SELECT w.*, b.name as bot_name, b.username as bot_username
                 FROM webhooks w
                 JOIN bots b ON w.bot_id = b.id
                 WHERE w.id = $1`,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            res.json({ webhook: result.rows[0] });
        } catch (error) {
            console.error('Get webhook error:', error);
            res.status(500).json({ error: 'Failed to fetch webhook' });
        }
    }
);

/**
 * PUT /api/webhooks/:id
 * Update webhook
 */
router.put('/:id',
    authenticateToken,
    requireAdmin,
    [
        param('id').isInt(),
        body('name').optional().trim().isLength({ min: 1, max: 255 }),
        body('url').optional().isURL(),
        body('events').optional().isArray({ min: 1 }),
        body('events.*').optional().isIn(WEBHOOK_EVENTS),
        body('is_active').optional().isBoolean(),
        body('headers').optional().isObject()
    ],
    validate,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, url, events, is_active, headers } = req.body;

            const updates = [];
            const values = [];
            let paramCount = 1;

            if (name !== undefined) {
                updates.push(`name = $${paramCount++}`);
                values.push(name);
            }
            if (url !== undefined) {
                updates.push(`url = $${paramCount++}`);
                values.push(url);
            }
            if (events !== undefined) {
                updates.push(`events = $${paramCount++}`);
                values.push(events);
            }
            if (is_active !== undefined) {
                updates.push(`is_active = $${paramCount++}`);
                values.push(is_active);
            }
            if (headers !== undefined) {
                updates.push(`headers = $${paramCount++}`);
                values.push(JSON.stringify(headers));
            }

            if (updates.length === 0) {
                return res.status(400).json({ error: 'No fields to update' });
            }

            values.push(id);

            const result = await query(
                `UPDATE webhooks SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
                values
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            res.json({ webhook: result.rows[0] });
        } catch (error) {
            console.error('Update webhook error:', error);
            res.status(500).json({ error: 'Failed to update webhook' });
        }
    }
);

/**
 * DELETE /api/webhooks/:id
 * Delete webhook
 */
router.delete('/:id',
    authenticateToken,
    requireAdmin,
    [param('id').isInt()],
    validate,
    async (req, res) => {
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
    }
);

/**
 * POST /api/webhooks/:id/test
 * Test webhook by sending a test payload
 */
router.post('/:id/test',
    authenticateToken,
    requireAdmin,
    [param('id').isInt()],
    validate,
    async (req, res) => {
        try {
            const { id } = req.params;

            const webhookResult = await query(
                'SELECT * FROM webhooks WHERE id = $1',
                [id]
            );

            if (webhookResult.rows.length === 0) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            const webhook = webhookResult.rows[0];

            // Trigger test webhook
            const { triggerWebhook } = require('../utils/webhookTrigger');

            const testPayload = {
                event: 'webhook.test',
                data: {
                    message: 'This is a test webhook',
                    timestamp: new Date().toISOString()
                }
            };

            const result = await triggerWebhook(webhook, testPayload);

            res.json({
                message: 'Test webhook sent',
                success: result.success,
                status_code: result.statusCode,
                duration_ms: result.duration
            });
        } catch (error) {
            console.error('Test webhook error:', error);
            res.status(500).json({ error: 'Failed to test webhook' });
        }
    }
);

/**
 * GET /api/webhooks/:id/logs
 * Get webhook execution logs
 */
router.get('/:id/logs',
    authenticateToken,
    requireAdmin,
    [param('id').isInt()],
    validate,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { limit = 100, offset = 0 } = req.query;

            const result = await query(
                `SELECT *
                 FROM webhook_logs
                 WHERE webhook_id = $1
                 ORDER BY created_at DESC
                 LIMIT $2 OFFSET $3`,
                [id, limit, offset]
            );

            res.json({ logs: result.rows });
        } catch (error) {
            console.error('Get webhook logs error:', error);
            res.status(500).json({ error: 'Failed to fetch logs' });
        }
    }
);

/**
 * GET /api/webhooks/events
 * Get list of available webhook events
 */
router.get('/meta/events',
    authenticateToken,
    async (req, res) => {
        res.json({
            events: WEBHOOK_EVENTS.map(event => ({
                name: event,
                description: getEventDescription(event)
            }))
        });
    }
);

function getEventDescription(event) {
    const descriptions = {
        'message.created': 'Triggered when a new message is sent',
        'message.updated': 'Triggered when a message is edited',
        'message.deleted': 'Triggered when a message is deleted',
        'user.joined': 'Triggered when a user joins a chat',
        'user.left': 'Triggered when a user leaves a chat',
        'chat.created': 'Triggered when a new chat is created',
        'chat.updated': 'Triggered when chat settings are updated',
        'call.started': 'Triggered when a call starts',
        'call.ended': 'Triggered when a call ends',
        'file.uploaded': 'Triggered when a file is uploaded',
        'reaction.added': 'Triggered when a reaction is added to a message'
    };
    return descriptions[event] || 'No description available';
}

module.exports = router;
