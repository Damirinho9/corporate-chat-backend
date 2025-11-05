const bcrypt = require('bcryptjs');  // CHANGED: was 'bcrypt', now 'bcryptjs' to match seed.js
const { query, transaction } = require('../config/database');

function sanitizeInitialPassword(payload, includeSecret) {
    if (includeSecret) {
        return payload;
    }

    if (!payload) {
        return payload;
    }

    if (Array.isArray(payload)) {
        return payload.map((item) => {
            const { initial_password, ...rest } = item;
            return rest;
        });
    }

    const { initial_password, ...rest } = payload;
    return rest;
}

// Get all users (admin only)
const getAllUsers = async (req, res) => {
    try {
        const result = await query(
            `SELECT id, username, name, role, department, initial_password, is_active, created_at, last_seen
             FROM users
             ORDER BY created_at DESC`
        );

        res.json({ users: result.rows });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ 
            error: 'Failed to get users',
            code: 'GET_USERS_ERROR'
        });
    }
};

// Get user by ID
const getUserById = async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await query(
            `SELECT id, username, name, role, department, initial_password, is_active, created_at, last_seen
             FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        const includeSecret = req.user?.role === 'admin';
        res.json({ user: sanitizeInitialPassword(result.rows[0], includeSecret) });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ 
            error: 'Failed to get user',
            code: 'GET_USER_ERROR'
        });
    }
};

// Update user (admin only)
const updateUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, role, department, isActive } = req.body;

        // Check if user exists
        const userCheck = await query(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramCount}`);
            values.push(name);
            paramCount++;
        }

        if (role !== undefined) {
            updates.push(`role = $${paramCount}`);
            values.push(role);
            paramCount++;
        }

        if (department !== undefined) {
            updates.push(`department = $${paramCount}`);
            values.push(department);
            paramCount++;
        }

        if (isActive !== undefined) {
            updates.push(`is_active = $${paramCount}`);
            values.push(isActive);
            paramCount++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ 
                error: 'No fields to update',
                code: 'NO_UPDATE_FIELDS'
            });
        }

        values.push(userId);

        const result = await query(
            `UPDATE users SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING id, username, name, role, department, initial_password, is_active`,
            values
        );

        res.json({
            message: 'User updated successfully',
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ 
            error: 'Failed to update user',
            code: 'UPDATE_USER_ERROR'
        });
    }
};

// Delete user (admin only)
const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;

        // Check if user exists
        const userCheck = await query(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Prevent deleting yourself
        if (parseInt(userId) === req.user.id) {
            return res.status(400).json({ 
                error: 'Cannot delete your own account',
                code: 'CANNOT_DELETE_SELF'
            });
        }

        // Delete user (cascade will handle messages and chat participants)
        await query('DELETE FROM users WHERE id = $1', [userId]);

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ 
            error: 'Failed to delete user',
            code: 'DELETE_USER_ERROR'
        });
    }
};

// Reset user password (admin only)
const resetPassword = async (req, res) => {
    try {
        const { userId } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ 
                error: 'Password must be at least 6 characters',
                code: 'INVALID_PASSWORD'
            });
        }

        // Check if user exists
        const userCheck = await query(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Hash new password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const passwordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await query(
            'UPDATE users SET password_hash = $1, initial_password = $2 WHERE id = $3',
            [passwordHash, newPassword, userId]
        );

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ 
            error: 'Failed to reset password',
            code: 'PASSWORD_RESET_ERROR'
        });
    }
};

// Get users by department
const getUsersByDepartment = async (req, res) => {
    try {
        const { department } = req.params;

        const result = await query(
            `SELECT id, username, name, role, department, initial_password, is_active, last_seen
             FROM users
             WHERE department = $1 AND is_active = true
             ORDER BY role, name`,
            [department]
        );

        const includeSecret = req.user?.role === 'admin';
        res.json({ users: sanitizeInitialPassword(result.rows, includeSecret) });
    } catch (error) {
        console.error('Get department users error:', error);
        res.status(500).json({ 
            error: 'Failed to get department users',
            code: 'GET_DEPT_USERS_ERROR'
        });
    }
};

// Get users by role
const getUsersByRole = async (req, res) => {
    try {
        const { role } = req.params;

        if (!['admin', 'assistant', 'rop', 'operator', 'employee'].includes(role)) {
            return res.status(400).json({
                error: 'Invalid role',
                code: 'INVALID_ROLE'
            });
        }

        const result = await query(
            `SELECT id, username, name, role, department, initial_password, is_active, last_seen
             FROM users
             WHERE role = $1 AND is_active = true
             ORDER BY name`,
            [role]
        );

        const includeSecret = req.user?.role === 'admin';
        res.json({ users: sanitizeInitialPassword(result.rows, includeSecret) });
    } catch (error) {
        console.error('Get role users error:', error);
        res.status(500).json({ 
            error: 'Failed to get role users',
            code: 'GET_ROLE_USERS_ERROR'
        });
    }
};

// Get user statistics (admin only)
const getUserStats = async (req, res) => {
    try {
        const stats = await query(`
            SELECT 
                (COUNT(*))::integer as total_users,
                (COUNT(*) FILTER (WHERE is_active = true))::integer as active_users,
                (COUNT(*) FILTER (WHERE role = 'admin'))::integer as admins,
                (COUNT(*) FILTER (WHERE role = 'rop'))::integer as rops,
                (COUNT(*) FILTER (WHERE role = 'employee'))::integer as employees,
                (COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '5 minutes'))::integer as online_users
            FROM users
        `);

        const deptStats = await query(`
            SELECT 
                department,
                (COUNT(*))::integer as user_count,
                (COUNT(*) FILTER (WHERE role = 'rop'))::integer as rops,
                (COUNT(*) FILTER (WHERE role = 'employee'))::integer as employees
            FROM users
            WHERE department IS NOT NULL AND is_active = true
            GROUP BY department
            ORDER BY user_count DESC
        `);

        res.json({
            overall: stats.rows[0],
            byDepartment: deptStats.rows
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({ 
            error: 'Failed to get user statistics',
            code: 'GET_STATS_ERROR'
        });
    }
};

module.exports = {
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    resetPassword,
    getUsersByDepartment,
    getUsersByRole,
    getUserStats
};