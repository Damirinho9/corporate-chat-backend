const { query } = require('../config/database');

// Get all role permissions
const getRolePermissions = async (req, res) => {
    try {
        const result = await query(`
            SELECT from_role, to_role, can_send_message
            FROM role_permissions
            ORDER BY
                CASE from_role
                    WHEN 'admin' THEN 1
                    WHEN 'assistant' THEN 2
                    WHEN 'rop' THEN 3
                    WHEN 'operator' THEN 4
                    WHEN 'employee' THEN 5
                END,
                CASE to_role
                    WHEN 'admin' THEN 1
                    WHEN 'assistant' THEN 2
                    WHEN 'rop' THEN 3
                    WHEN 'operator' THEN 4
                    WHEN 'employee' THEN 5
                END
        `);

        // Transform to matrix format for easy frontend display
        const roles = ['admin', 'assistant', 'rop', 'operator', 'employee'];
        const matrix = {};

        roles.forEach(fromRole => {
            matrix[fromRole] = {};
            roles.forEach(toRole => {
                matrix[fromRole][toRole] = false;
            });
        });

        result.rows.forEach(row => {
            matrix[row.from_role][row.to_role] = row.can_send_message;
        });

        res.json({
            permissions: result.rows,
            matrix: matrix,
            roles: roles
        });
    } catch (error) {
        console.error('Get permissions error:', error);
        res.status(500).json({
            error: 'Failed to get permissions',
            code: 'GET_PERMISSIONS_ERROR'
        });
    }
};

// Update role permission
const updateRolePermission = async (req, res) => {
    try {
        const { fromRole, toRole, canSend } = req.body;

        if (!fromRole || !toRole || typeof canSend !== 'boolean') {
            return res.status(400).json({
                error: 'Missing required fields',
                code: 'MISSING_FIELDS'
            });
        }

        const validRoles = ['admin', 'assistant', 'rop', 'operator', 'employee'];
        if (!validRoles.includes(fromRole) || !validRoles.includes(toRole)) {
            return res.status(400).json({
                error: 'Invalid role',
                code: 'INVALID_ROLE'
            });
        }

        await query(`
            INSERT INTO role_permissions (from_role, to_role, can_send_message, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (from_role, to_role)
            DO UPDATE SET
                can_send_message = $3,
                updated_at = CURRENT_TIMESTAMP
        `, [fromRole, toRole, canSend]);

        res.json({
            success: true,
            message: 'Permission updated successfully',
            permission: { fromRole, toRole, canSend }
        });
    } catch (error) {
        console.error('Update permission error:', error);
        res.status(500).json({
            error: 'Failed to update permission',
            code: 'UPDATE_PERMISSION_ERROR'
        });
    }
};

// Batch update permissions
const batchUpdatePermissions = async (req, res) => {
    try {
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            return res.status(400).json({
                error: 'Permissions must be an array',
                code: 'INVALID_FORMAT'
            });
        }

        const validRoles = ['admin', 'assistant', 'rop', 'operator', 'employee'];

        for (const perm of permissions) {
            const { fromRole, toRole, canSend } = perm;

            if (!fromRole || !toRole || typeof canSend !== 'boolean') {
                return res.status(400).json({
                    error: `Invalid permission: ${JSON.stringify(perm)}`,
                    code: 'INVALID_PERMISSION'
                });
            }

            if (!validRoles.includes(fromRole) || !validRoles.includes(toRole)) {
                return res.status(400).json({
                    error: `Invalid role in permission: ${fromRole} -> ${toRole}`,
                    code: 'INVALID_ROLE'
                });
            }

            await query(`
                INSERT INTO role_permissions (from_role, to_role, can_send_message, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (from_role, to_role)
                DO UPDATE SET
                    can_send_message = $3,
                    updated_at = CURRENT_TIMESTAMP
            `, [fromRole, toRole, canSend]);
        }

        res.json({
            success: true,
            message: `Successfully updated ${permissions.length} permissions`,
            count: permissions.length
        });
    } catch (error) {
        console.error('Batch update permissions error:', error);
        res.status(500).json({
            error: 'Failed to batch update permissions',
            code: 'BATCH_UPDATE_ERROR'
        });
    }
};

// Reset permissions to defaults
const resetPermissions = async (req, res) => {
    try {
        await query('DELETE FROM role_permissions');

        await query(`
            INSERT INTO role_permissions (from_role, to_role, can_send_message) VALUES
            -- Admin can send to everyone
            ('admin', 'admin', TRUE),
            ('admin', 'assistant', TRUE),
            ('admin', 'rop', TRUE),
            ('admin', 'operator', TRUE),
            ('admin', 'employee', TRUE),

            -- Assistant can send to everyone
            ('assistant', 'admin', TRUE),
            ('assistant', 'assistant', TRUE),
            ('assistant', 'rop', TRUE),
            ('assistant', 'operator', TRUE),
            ('assistant', 'employee', TRUE),

            -- ROP can send to everyone
            ('rop', 'admin', TRUE),
            ('rop', 'assistant', TRUE),
            ('rop', 'rop', TRUE),
            ('rop', 'operator', TRUE),
            ('rop', 'employee', TRUE),

            -- Operator restrictions
            ('operator', 'admin', TRUE),
            ('operator', 'assistant', TRUE),
            ('operator', 'rop', TRUE),
            ('operator', 'operator', FALSE),
            ('operator', 'employee', TRUE),

            -- Employee permissions
            ('employee', 'admin', TRUE),
            ('employee', 'assistant', TRUE),
            ('employee', 'rop', TRUE),
            ('employee', 'operator', TRUE),
            ('employee', 'employee', TRUE)
        `);

        res.json({
            success: true,
            message: 'Permissions reset to defaults'
        });
    } catch (error) {
        console.error('Reset permissions error:', error);
        res.status(500).json({
            error: 'Failed to reset permissions',
            code: 'RESET_PERMISSIONS_ERROR'
        });
    }
};

module.exports = {
    getRolePermissions,
    updateRolePermission,
    batchUpdatePermissions,
    resetPermissions
};
