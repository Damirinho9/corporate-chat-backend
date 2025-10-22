const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const chatController = require('../controllers/chatController');
const messageController = require('../controllers/messageController');
const { authenticateToken, requireAdmin, requireHead } = require('../middleware/auth');
const { canAccessChat, canSendToChat, canCreateDirectMessage, canViewAllMessages } = require('../middleware/permissions');
const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// ==================== AUTH ROUTES ====================
router.post('/auth/register',
    authenticateToken,
    requireAdmin,
    [
        body('username').trim().isLength({ min: 3, max: 50 }),
        body('password').isLength({ min: 6 }),
        body('name').trim().isLength({ min: 2, max: 100 }),
        body('role').isIn(['admin', 'head', 'employee']),
        body('department').optional().trim()
    ],
    validate,
    authController.register
);

router.post('/auth/login',
    [
        body('username').trim().notEmpty(),
        body('password').notEmpty()
    ],
    validate,
    authController.login
);

router.post('/auth/refresh',
    [body('refreshToken').notEmpty()],
    validate,
    authController.refresh
);

router.get('/auth/profile', authenticateToken, authController.getProfile);

router.put('/auth/change-password',
    authenticateToken,
    [
        body('currentPassword').notEmpty(),
        body('newPassword').isLength({ min: 6 })
    ],
    validate,
    authController.changePassword
);

// ==================== USER ROUTES ====================
router.get('/users', authenticateToken, requireAdmin, userController.getAllUsers);

router.get('/users/stats', authenticateToken, requireAdmin, userController.getUserStats);

router.get('/users/role/:role',
    authenticateToken,
    requireHead,
    [param('role').isIn(['admin', 'head', 'employee'])],
    validate,
    userController.getUsersByRole
);

router.get('/users/department/:department',
    authenticateToken,
    requireHead,
    userController.getUsersByDepartment
);

router.get('/users/:userId',
    authenticateToken,
    [param('userId').isInt()],
    validate,
    userController.getUserById
);

router.put('/users/:userId',
    authenticateToken,
    requireAdmin,
    [
        param('userId').isInt(),
        body('name').optional().trim().isLength({ min: 2, max: 100 }),
        body('role').optional().isIn(['admin', 'head', 'employee']),
        body('department').optional().trim(),
        body('isActive').optional().isBoolean()
    ],
    validate,
    userController.updateUser
);

router.delete('/users/:userId',
    authenticateToken,
    requireAdmin,
    [param('userId').isInt()],
    validate,
    userController.deleteUser
);

router.post('/users/:userId/reset-password',
    authenticateToken,
    requireAdmin,
    [
        param('userId').isInt(),
        body('newPassword').isLength({ min: 6 })
    ],
    validate,
    userController.resetPassword
);

// ==================== CHAT ROUTES ====================
router.get('/chats',
    authenticateToken,
    [
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    validate,
    chatController.getUserChats
);

router.get('/chats/:chatId',
    authenticateToken,
    [param('chatId').isInt()],
    validate,
    canAccessChat,
    chatController.getChatById
);

router.post('/chats/direct',
    authenticateToken,
    [body('receiverId').isInt()],
    validate,
    canCreateDirectMessage,
    chatController.createDirectChat
);

router.post('/chats/group',
    authenticateToken,
    requireAdmin,
    [
        body('name').trim().isLength({ min: 2, max: 100 }),
        body('participantIds').isArray({ min: 1 })
    ],
    validate,
    chatController.createGroupChat
);

router.post('/chats/:chatId/participants',
    authenticateToken,
    requireAdmin,
    [
        param('chatId').isInt(),
        body('userId').isInt()
    ],
    validate,
    chatController.addParticipant
);

router.delete('/chats/:chatId/participants/:userId',
    authenticateToken,
    requireAdmin,
    [
        param('chatId').isInt(),
        param('userId').isInt()
    ],
    validate,
    chatController.removeParticipant
);

router.put('/chats/:chatId/read',
    authenticateToken,
    [param('chatId').isInt()],
    validate,
    canAccessChat,
    chatController.markAsRead
);

router.delete('/chats/:chatId',
    authenticateToken,
    requireAdmin,
    [param('chatId').isInt()],
    validate,
    chatController.deleteChat
);

// ==================== MESSAGE ROUTES ====================
router.get('/chats/:chatId/messages',
    authenticateToken,
    [
        param('chatId').isInt(),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 }),
        query('before').optional().isISO8601()
    ],
    validate,
    canAccessChat,
    messageController.getMessages
);

router.post('/chats/:chatId/messages',
    authenticateToken,
    [
        param('chatId').isInt(),
        body('content').trim().isLength({ min: 1, max: 5000 })
    ],
    validate,
    canAccessChat,
    canSendToChat,
    messageController.sendMessage
);

router.put('/messages/:messageId',
    authenticateToken,
    [
        param('messageId').isInt(),
        body('content').trim().isLength({ min: 1, max: 5000 })
    ],
    validate,
    messageController.editMessage
);

router.delete('/messages/:messageId',
    authenticateToken,
    [param('messageId').isInt()],
    validate,
    messageController.deleteMessage
);

router.get('/chats/:chatId/messages/search',
    authenticateToken,
    [
        param('chatId').isInt(),
        query('query').trim().isLength({ min: 2 }),
        query('limit').optional().isInt({ min: 1, max: 50 })
    ],
    validate,
    canAccessChat,
    messageController.searchMessages
);

router.get('/messages/all',
    authenticateToken,
    requireAdmin,
    canViewAllMessages,
    [
        query('limit').optional().isInt({ min: 1, max: 200 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    validate,
    messageController.getAllMessages
);

router.get('/messages/stats',
    authenticateToken,
    requireAdmin,
    messageController.getMessageStats
);

// ==================== HEALTH CHECK ====================
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

module.exports = router;
