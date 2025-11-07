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

function extractToken(req, { allowQueryToken = false } = {}) {
    const authHeader = req.headers['authorization'];
    if (authHeader && typeof authHeader === 'string') {
        const [scheme, token] = authHeader.split(' ');
        if (scheme?.toLowerCase() === 'bearer' && token) {
            return token;
        }
    }

    if (allowQueryToken) {
        const queryToken = req.query?.token || req.query?.access_token;
        if (typeof queryToken === 'string' && queryToken.trim().length > 0) {
            return queryToken.trim();
        }
    }

    return null;
}

async function resolveUserFromToken(token, res) {
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            res.status(401).json({
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
            return null;
        }
        res.status(401).json({
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
        });
        return null;
    }

    const result = await query(
        'SELECT id, username, name, role, department, is_active FROM users WHERE id = $1',
        [decoded.userId]
    );

    if (result.rows.length === 0) {
        res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND'
        });
        return null;
    }

    const user = result.rows[0];

    if (!user.is_active) {
        res.status(403).json({
            error: 'User account is deactivated',
            code: 'USER_INACTIVE'
        });
        return null;
    }

    await query(
        'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
    );

    return user;
}

function createAuthenticateMiddleware(options = {}) {
    const { allowQueryToken = false } = options;

    return async function authenticateTokenMiddleware(req, res, next) {
        try {
            const token = extractToken(req, { allowQueryToken });

            if (!token) {
                return res.status(401).json({
                    error: 'Access token required',
                    code: 'NO_TOKEN'
                });
            }

            const user = await resolveUserFromToken(token, res);
            if (!user) {
                return;
            }

            req.user = user;

            if (allowQueryToken) {
                delete req.query.token;
                delete req.query.access_token;
            }

            next();
        } catch (error) {
            console.error('Authentication error:', error);
            res.status(500).json({
                error: 'Authentication failed',
                code: 'AUTH_ERROR'
            });
        }
    };
}

// Verify JWT token middleware
const authenticateToken = createAuthenticateMiddleware();
const authenticateTokenAllowQuery = createAuthenticateMiddleware({ allowQueryToken: true });

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
    if (!['admin', 'head', 'rop'].includes(req.user.role)) {
        return res.status(403).json({
            error: 'Head/ROP or admin access required',
            code: 'HEAD_REQUIRED'
        });
    }
    next();
};

// Check if user is ROP (Regional Operations Manager)
const requireRop = (req, res, next) => {
    if (req.user.role !== 'rop' && req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'ROP or admin access required',
            code: 'ROP_REQUIRED'
        });
    }
    next();
};

// Check if user is admin or ROP
const requireAdminOrRop = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'rop') {
        return res.status(403).json({
            error: 'Admin or ROP access required',
            code: 'ADMIN_OR_ROP_REQUIRED'
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

// Optional authentication - doesn't fail if no token, but attaches user if valid token provided
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            // No token provided, continue without user
            req.user = null;
            return next();
        }

        // Verify token
        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
            if (err) {
                // Invalid/expired token, continue without user
                req.user = null;
                return next();
            }

            try {
                // Get user from database
                const result = await query(
                    'SELECT id, username, name, role, department, is_active FROM users WHERE id = $1',
                    [decoded.userId]
                );

                if (result.rows.length > 0 && result.rows[0].is_active) {
                    req.user = result.rows[0];
                } else {
                    req.user = null;
                }
            } catch (error) {
                console.error('Optional auth error:', error);
                req.user = null;
            }
            next();
        });
    } catch (error) {
        console.error('Optional authentication error:', error);
        req.user = null;
        next();
    }
};

module.exports = {
    generateToken,
    generateRefreshToken,
    authenticateToken,
    authenticateTokenAllowQuery,
    requireAdmin,
    requireHead,
    requireRop,
    requireAdminOrRop,
    verifyRefreshToken
};
