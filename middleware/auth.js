const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Generate JWT token
const generateToken = (userId, role) => {
    return jwt.sign(
        { userId, role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
};

// Generate refresh token
const generateRefreshToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
};

// Verify JWT token middleware
const authenticateToken = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ 
                error: 'Access token required',
                code: 'NO_TOKEN'
            });
        }

        // Verify token
        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
            if (err) {
                if (err.name === 'TokenExpiredError') {
                    return res.status(401).json({ 
                        error: 'Token expired',
                        code: 'TOKEN_EXPIRED'
                    });
                }
                return res.status(401).json({ 
                    error: 'Invalid token',
                    code: 'INVALID_TOKEN'
                });
            }

            // Get user from database
            const result = await query(
                'SELECT id, username, name, role, department, is_active FROM users WHERE id = $1',
                [decoded.userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ 
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }

            const user = result.rows[0];

            if (!user.is_active) {
                return res.status(403).json({ 
                    error: 'User account is deactivated',
                    code: 'USER_INACTIVE'
                });
            }

            // Update last seen
            await query(
                'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
                [user.id]
            );

            // Attach user to request
            req.user = user;
            next();
        });
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ 
            error: 'Authentication failed',
            code: 'AUTH_ERROR'
        });
    }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            error: 'Admin access required',
            code: 'ADMIN_REQUIRED'
        });
    }
    next();
};

// Check if user is head or admin
const requireHead = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'head') {
        return res.status(403).json({ 
            error: 'Head or admin access required',
            code: 'HEAD_REQUIRED'
        });
    }
    next();
};

// Verify refresh token
const verifyRefreshToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
        throw new Error('Invalid refresh token');
    }
};

module.exports = {
    generateToken,
    generateRefreshToken,
    authenticateToken,
    requireAdmin,
    requireHead,
    verifyRefreshToken
};
