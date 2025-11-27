const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { authenticateBot, requireBotPermission, generateBotToken } = require('../middleware/botAuth');
const { body, param, validationResult } = require('express-validator');

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

// ==================== BOT MANAGEMENT (Admin Only) ====================

/**
 * GET /api/bots
 * Get all bots (admin only)
 */
router.get('/',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { limit = 50, offset = 0 } = req.query;

            const result = await query(
                `SELECT b.*,
                        u.name as creator_name,
                        COUNT(DISTINCT bp.id) as permissions_count,
                        COUNT(DISTINCT w.id) as webhooks_count,
                        COUNT(DISTINCT bc.id) as commands_count
                 FROM bots b
                 LEFT JOIN users u ON b.created_by = u.id
                 LEFT JOIN bot_permissions bp ON b.id = bp.bot_id
                 LEFT JOIN webhooks w ON b.id = w.bot_id
                 LEFT JOIN bot_commands bc ON b.id = bc.bot_id
                 GROUP BY b.id, u.name
                 ORDER BY b.created_at DESC
                 LIMIT $1 OFFSET $2`,
                [limit, offset]
            );

            res.json({
                bots: result.rows.map(bot => ({
                    ...bot,
                    api_token: bot.api_token ? '***' + bot.api_token.slice(-8) : null // Mask token
                }))
            });
        } catch (error) {
            console.error('Get bots error:', error);
            res.status(500).json({ error: 'Failed to fetch bots' });
        }
    }
);

/**
 * POST /api/bots
 * Create a new bot (admin only)
 */
router.post('/',
    authenticateToken,
    requireAdmin,
    [
        body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Name required (1-255 chars)'),
        body('username').trim().isLength({ min: 3, max: 50 }).matches(/^[a-z0-9_]+$/).withMessage('Username must be lowercase alphanumeric with underscores'),
        body('description').optional().isString(),
        body('avatar_url').optional().isURL()
    ],
    validate,
    async (req, res) => {
        try {
            const { name, username, description, avatar_url } = req.body;
            const userId = req.user.id;

            // Check if username already exists
            const existing = await query(
                'SELECT id FROM bots WHERE username = $1',
                [username]
            );

            if (existing.rows.length > 0) {
                return res.status(409).json({ error: 'Username already taken' });
            }

            // Generate bot token
            const apiToken = generateBotToken();

            // Create bot
            const result = await query(
                `INSERT INTO bots (name, username, description, avatar_url, api_token, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [name, username, description, avatar_url, apiToken, userId]
            );

            const bot = result.rows[0];

            res.status(201).json({
                bot: {
                    ...bot,
                    api_token: apiToken // Show full token only on creation
                },
                message: 'Bot created successfully. Save the API token - it won\'t be shown again!'
            });
        } catch (error) {
            console.error('Create bot error:', error);
            res.status(500).json({ error: 'Failed to create bot' });
        }
    }
);

/**
 * GET /api/bots/:id
 * Get bot details
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
                `SELECT b.*,
                        u.name as creator_name,
                        json_agg(
                            DISTINCT jsonb_build_object(
                                'id', bp.id,
                                'permission_type', bp.permission_type,
                                'resource_type', bp.resource_type,
                                'resource_id', bp.resource_id,
                                'created_at', bp.created_at
                            )
                        ) FILTER (WHERE bp.id IS NOT NULL) as permissions,
                        json_agg(
                            DISTINCT jsonb_build_object(
                                'id', w.id,
                                'name', w.name,
                                'url', w.url,
                                'events', w.events,
                                'is_active', w.is_active
                            )
                        ) FILTER (WHERE w.id IS NOT NULL) as webhooks
                 FROM bots b
                 LEFT JOIN users u ON b.created_by = u.id
                 LEFT JOIN bot_permissions bp ON b.id = bp.bot_id
                 LEFT JOIN webhooks w ON b.id = w.bot_id
                 WHERE b.id = $1
                 GROUP BY b.id, u.name`,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Bot not found' });
            }

            const bot = result.rows[0];

            res.json({
                bot: {
                    ...bot,
                    api_token: bot.api_token ? '***' + bot.api_token.slice(-8) : null
                }
            });
        } catch (error) {
            console.error('Get bot error:', error);
            res.status(500).json({ error: 'Failed to fetch bot' });
        }
    }
);

/**
 * PUT /api/bots/:id
 * Update bot
 */
router.put('/:id',
    authenticateToken,
    requireAdmin,
    [
        param('id').isInt(),
        body('name').optional().trim().isLength({ min: 1, max: 255 }),
        body('description').optional().isString(),
        body('avatar_url').optional().isURL(),
        body('is_active').optional().isBoolean()
    ],
    validate,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, description, avatar_url, is_active } = req.body;

            const updates = [];
            const values = [];
            let paramCount = 1;

            if (name !== undefined) {
                updates.push(`name = $${paramCount++}`);
                values.push(name);
            }
            if (description !== undefined) {
                updates.push(`description = $${paramCount++}`);
                values.push(description);
            }
            if (avatar_url !== undefined) {
                updates.push(`avatar_url = $${paramCount++}`);
                values.push(avatar_url);
            }
            if (is_active !== undefined) {
                updates.push(`is_active = $${paramCount++}`);
                values.push(is_active);
            }

            if (updates.length === 0) {
                return res.status(400).json({ error: 'No fields to update' });
            }

            values.push(id);

            const result = await query(
                `UPDATE bots SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
                values
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Bot not found' });
            }

            res.json({ bot: result.rows[0] });
        } catch (error) {
            console.error('Update bot error:', error);
            res.status(500).json({ error: 'Failed to update bot' });
        }
    }
);

/**
 * DELETE /api/bots/:id
 * Delete bot
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
                'DELETE FROM bots WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Bot not found' });
            }

            res.json({
                message: 'Bot deleted successfully',
                bot: result.rows[0]
            });
        } catch (error) {
            console.error('Delete bot error:', error);
            res.status(500).json({ error: 'Failed to delete bot' });
        }
    }
);

/**
 * POST /api/bots/:id/regenerate-token
 * Regenerate bot API token
 */
router.post('/:id/regenerate-token',
    authenticateToken,
    requireAdmin,
    [param('id').isInt()],
    validate,
    async (req, res) => {
        try {
            const { id } = req.params;

            const newToken = generateBotToken();

            const result = await query(
                'UPDATE bots SET api_token = $1 WHERE id = $2 RETURNING *',
                [newToken, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Bot not found' });
            }

            res.json({
                api_token: newToken,
                message: 'Token regenerated. Save it - it won\'t be shown again!'
            });
        } catch (error) {
            console.error('Regenerate token error:', error);
            res.status(500).json({ error: 'Failed to regenerate token' });
        }
    }
);

// ==================== BOT PERMISSIONS ====================

/**
 * POST /api/bots/:id/permissions
 * Add permission to bot
 */
router.post('/:id/permissions',
    authenticateToken,
    requireAdmin,
    [
        param('id').isInt(),
        body('permission_type').isIn([
            'read_messages', 'send_messages', 'edit_messages', 'delete_messages',
            'read_users', 'manage_users',
            'read_chats', 'manage_chats',
            'read_files', 'upload_files',
            'execute_commands'
        ]).withMessage('Invalid permission type'),
        body('resource_type').optional().isIn(['chat', 'user', 'file', 'all']),
        body('resource_id').optional().isInt()
    ],
    validate,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { permission_type, resource_type, resource_id } = req.body;

            const result = await query(
                `INSERT INTO bot_permissions (bot_id, permission_type, resource_type, resource_id)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (bot_id, permission_type, resource_type, resource_id) DO NOTHING
                 RETURNING *`,
                [id, permission_type, resource_type || null, resource_id || null]
            );

            if (result.rows.length === 0) {
                return res.status(409).json({ error: 'Permission already exists' });
            }

            res.status(201).json({ permission: result.rows[0] });
        } catch (error) {
            console.error('Add bot permission error:', error);
            res.status(500).json({ error: 'Failed to add permission' });
        }
    }
);

/**
 * DELETE /api/bots/:id/permissions/:permissionId
 * Remove permission from bot
 */
router.delete('/:id/permissions/:permissionId',
    authenticateToken,
    requireAdmin,
    [
        param('id').isInt(),
        param('permissionId').isInt()
    ],
    validate,
    async (req, res) => {
        try {
            const { id, permissionId } = req.params;

            const result = await query(
                'DELETE FROM bot_permissions WHERE id = $1 AND bot_id = $2 RETURNING *',
                [permissionId, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Permission not found' });
            }

            res.json({ message: 'Permission removed' });
        } catch (error) {
            console.error('Remove bot permission error:', error);
            res.status(500).json({ error: 'Failed to remove permission' });
        }
    }
);

module.exports = router;
