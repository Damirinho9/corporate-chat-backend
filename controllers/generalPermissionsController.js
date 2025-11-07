const { query } = require('../config/database');

// Permission categories for UI organization
const PERMISSION_CATEGORIES = {
    'users': {
        label: 'Управление пользователями',
        permissions: [
            { key: 'create_user', label: 'Создание пользователей' },
            { key: 'edit_user', label: 'Редактирование пользователей' },
            { key: 'delete_user', label: 'Удаление пользователей' },
            { key: 'reset_password', label: 'Сброс паролей' },
            { key: 'view_all_users', label: 'Просмотр всех пользователей' }
        ]
    },
    'departments': {
        label: 'Управление отделами',
        permissions: [
            { key: 'create_department', label: 'Создание отделов' },
            { key: 'edit_department', label: 'Редактирование отделов' },
            { key: 'delete_department', label: 'Удаление отделов' },
            { key: 'manage_department_members', label: 'Управление сотрудниками отдела' }
        ]
    },
    'chats': {
        label: 'Управление чатами',
        permissions: [
            { key: 'create_chat', label: 'Создание чатов' },
            { key: 'edit_chat', label: 'Редактирование чатов' },
            { key: 'delete_chat', label: 'Удаление чатов' },
            { key: 'manage_chat_participants', label: 'Управление участниками' }
        ]
    },
    'messages': {
        label: 'Управление сообщениями',
        permissions: [
            { key: 'edit_own_messages', label: 'Редактирование своих сообщений (5 мин)' },
            { key: 'delete_own_messages', label: 'Удаление своих сообщений (5 мин)' },
            { key: 'delete_any_messages', label: 'Удаление любых сообщений' },
            { key: 'delete_department_messages', label: 'Удаление сообщений в своем отделе (РОП)' },
            { key: 'view_all_messages', label: 'Просмотр всех сообщений' },
            { key: 'view_deletion_history', label: 'Просмотр истории удалений' }
        ]
    },
    'files': {
        label: 'Управление файлами',
        permissions: [
            { key: 'upload_files', label: 'Загрузка файлов' },
            { key: 'delete_any_file', label: 'Удаление любых файлов' },
            { key: 'view_all_files', label: 'Просмотр всех файлов' }
        ]
    },
    'logs': {
        label: 'Логи и мониторинг',
        permissions: [
            { key: 'view_logs', label: 'Просмотр логов' },
            { key: 'view_admin_logs', label: 'Просмотр логов администратора' }
        ]
    },
    'system': {
        label: 'Системные права',
        permissions: [
            { key: 'manage_permissions', label: 'Управление правами' },
            { key: 'access_admin_panel', label: 'Доступ к админ-панели' },
            { key: 'manage_settings', label: 'Управление настройками' }
        ]
    }
};

// Get all general permissions
const getGeneralPermissions = async (req, res) => {
    console.log('[GeneralPermissions] GET /api/permissions/general - Request received');
    console.log('[GeneralPermissions] User:', req.user?.id, req.user?.username, req.user?.role);

    try {
        const result = await query(`
            SELECT role, permission, can_perform
            FROM role_general_permissions
            ORDER BY role, permission
        `);

        // Transform to nested structure: { role: { permission: boolean } }
        const roles = ['admin', 'assistant', 'rop', 'operator', 'employee'];
        const permissions = {};

        roles.forEach(role => {
            permissions[role] = {};
        });

        result.rows.forEach(row => {
            if (!permissions[row.role]) {
                permissions[row.role] = {};
            }
            permissions[row.role][row.permission] = row.can_perform;
        });

        console.log('[GeneralPermissions] Successfully retrieved', result.rows.length, 'permissions');
        res.json({
            permissions: permissions,
            categories: PERMISSION_CATEGORIES,
            roles: roles
        });
    } catch (error) {
        console.error('[GeneralPermissions] ERROR in getGeneralPermissions:', error);
        console.error('[GeneralPermissions] Stack:', error.stack);
        res.status(500).json({
            error: 'Failed to get general permissions',
            code: 'GET_GENERAL_PERMISSIONS_ERROR',
            details: error.message
        });
    }
};

// Update single general permission
const updateGeneralPermission = async (req, res) => {
    console.log('[GeneralPermissions] PUT /api/permissions/general - Update permission');

    try {
        const { role, permission, canPerform } = req.body;

        if (!role || !permission || typeof canPerform !== 'boolean') {
            return res.status(400).json({
                error: 'Missing required fields: role, permission, canPerform',
                code: 'MISSING_FIELDS'
            });
        }

        const validRoles = ['admin', 'assistant', 'rop', 'operator', 'employee'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({
                error: 'Invalid role',
                code: 'INVALID_ROLE'
            });
        }

        await query(`
            INSERT INTO role_general_permissions (role, permission, can_perform, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (role, permission)
            DO UPDATE SET
                can_perform = $3,
                updated_at = CURRENT_TIMESTAMP
        `, [role, permission, canPerform]);

        console.log('[GeneralPermissions] Updated:', role, permission, '=', canPerform);
        res.json({
            success: true,
            message: 'Permission updated successfully',
            permission: { role, permission, canPerform }
        });
    } catch (error) {
        console.error('[GeneralPermissions] ERROR in updateGeneralPermission:', error);
        res.status(500).json({
            error: 'Failed to update permission',
            code: 'UPDATE_PERMISSION_ERROR',
            details: error.message
        });
    }
};

// Batch update general permissions
const batchUpdateGeneralPermissions = async (req, res) => {
    console.log('[GeneralPermissions] POST /api/permissions/general/batch - Batch update');

    try {
        const { updates } = req.body;

        if (!Array.isArray(updates)) {
            return res.status(400).json({
                error: 'Updates must be an array',
                code: 'INVALID_FORMAT'
            });
        }

        const validRoles = ['admin', 'assistant', 'rop', 'operator', 'employee'];

        for (const update of updates) {
            const { role, permission, canPerform } = update;

            if (!role || !permission || typeof canPerform !== 'boolean') {
                return res.status(400).json({
                    error: `Invalid update: ${JSON.stringify(update)}`,
                    code: 'INVALID_UPDATE'
                });
            }

            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    error: `Invalid role in update: ${role}`,
                    code: 'INVALID_ROLE'
                });
            }

            await query(`
                INSERT INTO role_general_permissions (role, permission, can_perform, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (role, permission)
                DO UPDATE SET
                    can_perform = $3,
                    updated_at = CURRENT_TIMESTAMP
            `, [role, permission, canPerform]);
        }

        console.log('[GeneralPermissions] Batch updated', updates.length, 'permissions');
        res.json({
            success: true,
            message: `Successfully updated ${updates.length} permissions`,
            count: updates.length
        });
    } catch (error) {
        console.error('[GeneralPermissions] ERROR in batchUpdateGeneralPermissions:', error);
        res.status(500).json({
            error: 'Failed to batch update permissions',
            code: 'BATCH_UPDATE_ERROR',
            details: error.message
        });
    }
};

// Reset general permissions to defaults
const resetGeneralPermissions = async (req, res) => {
    console.log('[GeneralPermissions] POST /api/permissions/general/reset - Reset to defaults');

    try {
        await query('DELETE FROM role_general_permissions');

        // Re-run the insert from migration
        const fs = require('fs');
        const path = require('path');
        const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '008_create_general_permissions.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        // Extract just the INSERT statement
        const insertMatch = migrationSQL.match(/INSERT INTO role_general_permissions[\s\S]*?ON CONFLICT[\s\S]*?;/);
        if (insertMatch) {
            await query(insertMatch[0]);
        }

        console.log('[GeneralPermissions] Permissions reset to defaults');
        res.json({
            success: true,
            message: 'General permissions reset to defaults'
        });
    } catch (error) {
        console.error('[GeneralPermissions] ERROR in resetGeneralPermissions:', error);
        res.status(500).json({
            error: 'Failed to reset permissions',
            code: 'RESET_PERMISSIONS_ERROR',
            details: error.message
        });
    }
};

// Helper function to check if a user has a specific permission
const hasPermission = async (userId, permissionKey) => {
    try {
        const userResult = await query(
            'SELECT role FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return false;
        }

        const role = userResult.rows[0].role;

        const permResult = await query(
            'SELECT can_perform FROM role_general_permissions WHERE role = $1 AND permission = $2',
            [role, permissionKey]
        );

        return permResult.rows.length > 0 && permResult.rows[0].can_perform;
    } catch (error) {
        console.error('Permission check error:', error);
        return false;
    }
};

module.exports = {
    getGeneralPermissions,
    updateGeneralPermission,
    batchUpdateGeneralPermissions,
    resetGeneralPermissions,
    hasPermission
};
