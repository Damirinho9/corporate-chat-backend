const bcrypt = require('bcryptjs');  // CHANGED: was 'bcrypt', now 'bcryptjs' to match seed.js
const crypto = require('crypto');
const { query } = require('../config/database');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../middleware/auth');

const PASSWORD_LENGTH = 12;

function generateSecurePassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+';
    const bytes = crypto.randomBytes(PASSWORD_LENGTH);
    let password = '';
    for (let i = 0; i < PASSWORD_LENGTH; i++) {
        password += alphabet[bytes[i] % alphabet.length];
    }
    return password;
}

// Register new user (admin or ROP)
const register = async (req, res) => {
    try {
        const { username, password, name, role, department } = req.body;

        if (!username || !name || !role) {
            return res.status(400).json({
                error: 'Missing required fields',
                code: 'MISSING_FIELDS'
            });
        }

        const normalizedUsername = String(username).trim();
        if (!normalizedUsername) {
            return res.status(400).json({
                error: 'Username cannot be empty',
                code: 'INVALID_USERNAME'
            });
        }

        const actor = req.user || {};
        const actorRole = actor.role;
        const actorDepartment = actor.department;
        const isAdmin = actorRole === 'admin';
        const isRop = actorRole === 'rop';

        if (!isAdmin && !isRop) {
            return res.status(403).json({
                error: 'Only admins or ROPs can create users',
                code: 'CREATE_USER_FORBIDDEN'
            });
        }

        const normalizedRole = String(role).toLowerCase();

        if (!['admin', 'assistant', 'rop', 'operator', 'employee'].includes(normalizedRole)) {
            return res.status(400).json({
                error: 'Unsupported role',
                code: 'INVALID_ROLE'
            });
        }

        let trimmedDepartment = department ? String(department).trim() : null;

        if (!isAdmin) {
            // ROP-specific restrictions
            const ropAllowedRoles = ['operator', 'employee'];

            if (!ropAllowedRoles.includes(normalizedRole)) {
                return res.status(403).json({
                    error: 'ROPs can only create operators or employees',
                    code: 'ROP_ROLE_RESTRICTED'
                });
            }

            if (!actorDepartment) {
                return res.status(400).json({
                    error: 'Department is required for ROP actions',
                    code: 'ROP_DEPARTMENT_MISSING'
                });
            }

            if (trimmedDepartment && trimmedDepartment !== actorDepartment) {
                return res.status(403).json({
                    error: 'ROPs can only create users in their own department',
                    code: 'ROP_FOREIGN_DEPARTMENT'
                });
            }

            trimmedDepartment = actorDepartment;
        } else if (normalizedRole === 'rop' && !trimmedDepartment) {
            // Admins creating a ROP must specify department
            return res.status(400).json({
                error: 'Department is required for this role',
                code: 'DEPARTMENT_REQUIRED'
            });
        }

        const needsDepartment = ['rop', 'operator', 'employee'].includes(normalizedRole);

        if (needsDepartment && !trimmedDepartment) {
            return res.status(400).json({
                error: 'Department is required for this role',
                code: 'DEPARTMENT_REQUIRED'
            });
        }

        if (!isAdmin && ['admin', 'rop'].includes(normalizedRole)) {
            return res.status(403).json({
                error: 'Insufficient permissions to assign this role',
                code: 'ROLE_NOT_ALLOWED'
            });
        }

        if (normalizedRole === 'admin' && trimmedDepartment) {
            return res.status(400).json({
                error: 'Admins should not have a department',
                code: 'ADMIN_DEPARTMENT_ERROR'
            });
        }

        // Check if username already exists
        const existingUser = await query(
            'SELECT id FROM users WHERE username = $1',
            [normalizedUsername]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                error: 'Username already exists',
                code: 'USERNAME_EXISTS'
            });
        }

        const generatedPassword = password && password.length >= 8 ? password : generateSecurePassword();

        // Hash password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const passwordHash = await bcrypt.hash(generatedPassword, saltRounds);

        // Insert user
        const result = await query(
            `INSERT INTO users (username, password_hash, initial_password, name, role, department)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, username, name, role, department, created_at, initial_password`,
            [normalizedUsername, passwordHash, generatedPassword, name.trim(), normalizedRole, trimmedDepartment || null]
        );

        const newUser = result.rows[0];

        // Add user to appropriate chats
        if (normalizedRole === 'admin') {
            await query(
                `INSERT INTO chat_participants (chat_id, user_id)
                 SELECT c.id, $1
                 FROM chats c
                 WHERE c.name IN ('Руководство', 'Все ассистенты')
                   AND NOT EXISTS (
                       SELECT 1 FROM chat_participants cp
                       WHERE cp.chat_id = c.id AND cp.user_id = $1
                 )`,
                [newUser.id]
            );
        } else if (normalizedRole === 'assistant') {
            await query(
                `INSERT INTO chat_participants (chat_id, user_id)
                 SELECT c.id, $1
                 FROM chats c
                 WHERE c.name = 'Все ассистенты'
                   AND NOT EXISTS (
                       SELECT 1 FROM chat_participants cp
                       WHERE cp.chat_id = c.id AND cp.user_id = $1
                 )`,
                [newUser.id]
            );
        } else if (normalizedRole === 'rop') {
            if (trimmedDepartment) {
                const deptChat = await query(
                    `SELECT id FROM chats WHERE type = 'department' AND department = $1`,
                    [trimmedDepartment]
                );

                let departmentChatId = deptChat.rows[0]?.id;

                if (!departmentChatId) {
                    const created = await query(
                        `INSERT INTO chats (name, type, department, created_by)
                         VALUES ($1, 'department', $2, $3)
                         RETURNING id`,
                        [trimmedDepartment, trimmedDepartment, newUser.id]
                    );
                    departmentChatId = created.rows[0].id;
                }

                if (departmentChatId) {
                    await query(
                        `INSERT INTO chat_participants (chat_id, user_id)
                         SELECT $1, $2
                         WHERE NOT EXISTS (
                             SELECT 1 FROM chat_participants
                             WHERE chat_id = $1 AND user_id = $2
                         )`,
                        [departmentChatId, newUser.id]
                    );
                }
            }

            await query(
                `INSERT INTO chat_participants (chat_id, user_id)
                 SELECT c.id, $1
                 FROM chats c
                 WHERE c.name = 'Руководство'
                   AND NOT EXISTS (
                       SELECT 1 FROM chat_participants cp
                       WHERE cp.chat_id = c.id AND cp.user_id = $1
                 )`,
                [newUser.id]
            );
        } else if (normalizedRole === 'operator' || normalizedRole === 'employee') {
            if (trimmedDepartment) {
                const deptChat = await query(
                    `SELECT id FROM chats WHERE type = 'department' AND department = $1`,
                    [trimmedDepartment]
                );

                if (deptChat.rows.length > 0) {
                    await query(
                        `INSERT INTO chat_participants (chat_id, user_id)
                         SELECT $1, $2
                         WHERE NOT EXISTS (
                             SELECT 1 FROM chat_participants
                             WHERE chat_id = $1 AND user_id = $2
                         )`,
                        [deptChat.rows[0].id, newUser.id]
                    );
                }
            }
        }

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            userId: newUser.id,
            password: generatedPassword,
            user: {
                id: newUser.id,
                username: newUser.username,
                name: newUser.name,
                role: newUser.role,
                department: newUser.department,
                initial_password: generatedPassword
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            error: 'Registration failed',
            code: 'REGISTRATION_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Login
const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log('[LOGIN] Attempt:', {
            username,
            passwordLength: password?.length,
            timestamp: new Date().toISOString()
        });

        if (!username || !password) {
            console.log('[LOGIN] Missing credentials');
            return res.status(400).json({
                error: 'Username and password are required',
                code: 'MISSING_CREDENTIALS'
            });
        }

        // Get user
        const result = await query(
            `SELECT id, username, password_hash, name, role, department, is_active
             FROM users WHERE username = $1`,
            [username]
        );

        console.log('[LOGIN] User query result:', {
            found: result.rows.length > 0,
            username: username
        });

        if (result.rows.length === 0) {
            console.log('[LOGIN] User not found:', username);
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        const user = result.rows[0];

        console.log('[LOGIN] User found:', {
            id: user.id,
            username: user.username,
            role: user.role,
            is_active: user.is_active,
            has_password_hash: !!user.password_hash,
            password_hash_length: user.password_hash?.length
        });

        // Check if user is active
        if (!user.is_active) {
            console.log('[LOGIN] User inactive:', username);
            return res.status(403).json({
                error: 'User account is deactivated',
                code: 'USER_INACTIVE'
            });
        }

        // Verify password
        console.log('[LOGIN] Comparing passwords...');
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        console.log('[LOGIN] Password match:', passwordMatch);

        if (!passwordMatch) {
            console.log('[LOGIN] Invalid password for:', username);
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Generate tokens
        const token = generateToken(user.id, user.role);
        const refreshToken = generateRefreshToken(user.id);

        // Update last seen
        await query(
            'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        res.json({
            message: 'Login successful',
            token,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                department: user.department
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Login failed',
            code: 'LOGIN_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Refresh token
const refresh = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ 
                error: 'Refresh token required',
                code: 'NO_REFRESH_TOKEN'
            });
        }

        // Verify refresh token
        const decoded = verifyRefreshToken(refreshToken);

        // Get user
        const result = await query(
            'SELECT id, role, is_active FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0 || !result.rows[0].is_active) {
            return res.status(401).json({ 
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }

        const user = result.rows[0];

        // Generate new tokens
        const newToken = generateToken(user.id, user.role);
        const newRefreshToken = generateRefreshToken(user.id);

        res.json({
            token: newToken,
            refreshToken: newRefreshToken
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({ 
            error: 'Token refresh failed',
            code: 'REFRESH_ERROR'
        });
    }
};

// Get current user profile
const getProfile = async (req, res) => {
    try {
        const result = await query(
            `SELECT id, username, name, role, department, created_at, last_seen
             FROM users WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ 
            error: 'Failed to get profile',
            code: 'PROFILE_ERROR'
        });
    }
};

// Change password
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                error: 'Current and new passwords are required',
                code: 'MISSING_PASSWORDS'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ 
                error: 'New password must be at least 6 characters',
                code: 'PASSWORD_TOO_SHORT'
            });
        }

        // Get current password hash
        const result = await query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.id]
        );

        const passwordMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

        if (!passwordMatch) {
            return res.status(401).json({ 
                error: 'Current password is incorrect',
                code: 'WRONG_PASSWORD'
            });
        }

        // Hash new password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [newPasswordHash, req.user.id]
        );

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ 
            error: 'Failed to change password',
            code: 'PASSWORD_CHANGE_ERROR'
        });
    }
};

module.exports = {
    register,
    login,
    refresh,
    getProfile,
    changePassword
};
