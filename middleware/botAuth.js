const { query } = require('../config/database');

/**
 * Middleware to authenticate bot API requests
 * Accepts token in:
 * - X-Bot-Token header
 * - Authorization: Bot <token> header
 */
const authenticateBot = async (req, res, next) => {
    try {
        // Extract token from headers
        let token = req.headers['x-bot-token'];

        if (!token) {
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bot ')) {
                token = authHeader.substring(4);
            }
        }

        if (!token) {
            return res.status(401).json({
                error: 'Bot token required',
                message: 'Provide token in X-Bot-Token header or Authorization: Bot <token>'
            });
        }

        // Validate token and get bot
        const result = await query(
            `SELECT b.*,
                    json_agg(
                        json_build_object(
                            'permission_type', bp.permission_type,
                            'resource_type', bp.resource_type,
                            'resource_id', bp.resource_id
                        )
                    ) FILTER (WHERE bp.id IS NOT NULL) as permissions
             FROM bots b
             LEFT JOIN bot_permissions bp ON b.id = bp.bot_id
             WHERE b.api_token = $1 AND b.is_active = true
             GROUP BY b.id`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: 'Invalid or inactive bot token'
            });
        }

        const bot = result.rows[0];

        // Attach bot to request
        req.bot = {
            id: bot.id,
            username: bot.username,
            name: bot.name,
            permissions: bot.permissions || [],
            created_by: bot.created_by
        };

        next();
    } catch (error) {
        console.error('Bot authentication error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            details: error.message
        });
    }
};

/**
 * Middleware to check if bot has specific permission
 * @param {string} permissionType - Type of permission required
 * @param {string} resourceType - Optional resource type
 */
const requireBotPermission = (permissionType, resourceType = null) => {
    return (req, res, next) => {
        if (!req.bot) {
            return res.status(401).json({
                error: 'Bot authentication required'
            });
        }

        const hasPermission = req.bot.permissions.some(p => {
            if (p.permission_type !== permissionType) return false;
            if (resourceType && p.resource_type !== resourceType) return false;
            return true;
        });

        if (!hasPermission) {
            return res.status(403).json({
                error: 'Insufficient bot permissions',
                required: { permissionType, resourceType }
            });
        }

        next();
    };
};

/**
 * Check if bot has access to specific resource
 * @param {string} permissionType - Permission type
 * @param {string} resourceType - Resource type (chat, user, etc.)
 * @param {number} resourceId - Resource ID
 */
const checkBotResourceAccess = async (bot, permissionType, resourceType, resourceId) => {
    // Check for wildcard permission (no specific resource_id)
    const hasWildcard = bot.permissions.some(p =>
        p.permission_type === permissionType &&
        p.resource_type === resourceType &&
        p.resource_id === null
    );

    if (hasWildcard) return true;

    // Check for specific resource permission
    const hasSpecific = bot.permissions.some(p =>
        p.permission_type === permissionType &&
        p.resource_type === resourceType &&
        p.resource_id === resourceId
    );

    return hasSpecific;
};

/**
 * Generate a secure random bot token
 */
const generateBotToken = () => {
    const crypto = require('crypto');
    return 'bot_' + crypto.randomBytes(48).toString('hex');
};

module.exports = {
    authenticateBot,
    requireBotPermission,
    checkBotResourceAccess,
    generateBotToken
};
