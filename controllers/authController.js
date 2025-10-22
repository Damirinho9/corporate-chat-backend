const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../middleware/auth');

// Register new user (admin only)
const register = async (req, res) => {
    try {
        const { username, password, name, role, department } = req.body;

        // Validate input
        if (!username || !password || !name || !role) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                code: 'MISSING_FIELDS'
            });
        }

        // Check if role requires department
        if ((role === 'head' || role === 'employee') && !department) {
            return res.status(400).json({ 
                error: 'Department is required for heads and employees',
                code: 'DEPARTMENT_REQUIRED'
            });
        }

        // Check if admin shouldn't have department
        if (role === 'admin' && department) {
            return res.status(400).json({ 
                error: 'Admins should not have a department',
                code: 'ADMIN_DEPARTMENT_ERROR'
            });
        }

        // Check if username already exists
        const existingUser = await query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ 
                error: 'Username already exists',
                code: 'USERNAME_EXISTS'
            });
        }

        // Hash password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert user
        const result = await query(
            `INSERT INTO users (username, password_hash, name, role, department)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, username, name, role, department, created_at`,
            [username, passwordHash, name, role, department || null]
        );

        const newUser = result.rows[0];

        // Add user to appropriate chats
        if (role === 'admin') {
            // Add to management and all heads chats
            await query(
                `INSERT INTO chat_participants (chat_id, user_id)
                 SELECT id, $1 FROM chats WHERE name IN ('Руководство', 'Руководители')`,
                [newUser.id]
            );
        } else if (role === 'head') {
            // Add to all heads chat
            await query(
                `INSERT INTO chat_participants (chat_id, user_id)
                 SELECT id, $1 FROM chats WHERE name = 'Руководители'`,
                [newUser.id]
            );

            // Add to department chat (create if not exists)
            const deptChat = await query(
                `INSERT INTO chats (name, type, department, created_by)
                 VALUES ($1, 'department', $2, $3)
                 ON CONFLICT DO NOTHING
                 RETURNING id`,
                [`${department} отдел`, department, newUser.id]
            );

            if (deptChat.rows.length > 0) {
                await query(
                    'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)',
                    [deptChat.rows[0].id, newUser.id]
                );
            } else {
                // Chat already exists, just add user
                const existingChat = await query(
                    'SELECT id FROM chats WHERE type = $1 AND department = $2',
                    ['department', department]
                );
                if (existingChat.rows.length > 0) {
                    await query(
                        'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)',
                        [existingChat.rows[0].id, newUser.id]
                    );
                }
            }
        } else if (role === 'employee') {
            // Add to department chat
            const deptChat = await query(
                'SELECT id FROM chats WHERE type = $1 AND department = $2',
                ['department', department]
            );

            if (deptChat.rows.length > 0) {
                await query(
                    'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)',
                    [deptChat.rows[0].id, newUser.id]
                );
            }
        }

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: newUser.id,
                username: newUser.username,
                name: newUser.name,
                role: newUser.role,
                department: newUser.department
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

        if (!username || !password) {
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

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        const user = result.rows[0];

        // Check if user is active
        if (!user.is_active) {
            return res.status(403).json({ 
                error: 'User account is deactivated',
                code: 'USER_INACTIVE'
            });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
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
