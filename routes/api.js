// ==================== BASE INIT ====================
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { getAvailableRecipients } = require('../controllers/chatController');
const { getOnlineUsers } = require('../socket/socketHandler');

// ==================== IMPORTS ====================
const { uploadSingle, uploadMultiple, validateFile } = require('../middleware/fileUpload');
const fileController = require('../controllers/fileController');
const fileRoutes = require('./files');

const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const chatController = require('../controllers/chatController');
const messageController = require('../controllers/messageController');
const departmentController = require('../controllers/departmentController');
const permissionsController = require('../controllers/permissionsController');
const generalPermissionsController = require('../controllers/generalPermissionsController');
const pushController = require('../controllers/pushController');
const { PERMISSIONS_MATRIX } = require('../config/permissionsMatrix');

const { authenticateToken, requireAdmin, requireHead, requireAdminOrRop } = require('../middleware/auth');
const { canAccessChat, canSendToChat, canCreateDirectMessage } = require('../middleware/permissions');

const { body, param, query: queryValidator, validationResult } = require('express-validator');

// ADMIN ROUTES - IMPORTS
const adminBasic = require('./admin-basic');
const adminExtended = require('./admin-extended');

// Additional routes
const analyticsRoutes = require('./analytics');
const registrationRoutes = require('./registration');
const botsRoutes = require('./bots');
const webhooksRoutes = require('./webhooks');
const callsRoutes = require('./calls');

// ==================== VALIDATION ====================
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// ==================== ADMIN ROUTES ====================
router.use('/', adminBasic);
router.use('/', adminExtended);

// Additional routes
router.use('/analytics', analyticsRoutes);
router.use('/registration', registrationRoutes);
router.use('/bots', botsRoutes);
router.use('/webhooks', webhooksRoutes);
router.use('/calls', callsRoutes);

router.get('/chats/available-recipients', authenticateToken, getAvailableRecipients);

// ==================== PERMISSIONS MATRIX ====================
router.get('/permissions/matrix',
    authenticateToken,
    requireAdminOrRop,
    (req, res) => {
        res.json({ matrix: PERMISSIONS_MATRIX });
    }
);

router.put('/permissions/matrix',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { matrix } = req.body;

            if (!Array.isArray(matrix) || matrix.length === 0) {
                return res.status(400).json({ error: 'Invalid matrix format' });
            }

            // Validate matrix structure
            const isValid = matrix.every(perm =>
                perm.id &&
                perm.label &&
                perm.category &&
                perm.roles &&
                typeof perm.roles === 'object'
            );

            if (!isValid) {
                return res.status(400).json({ error: 'Invalid permission structure' });
            }

            // Write to file
            const fs = require('fs').promises;
            const path = require('path');
            const configPath = path.join(__dirname, '../config/permissionsMatrix.js');

            const fileContent = `const PERMISSIONS_MATRIX = ${JSON.stringify(matrix, null, 4)};\n\nmodule.exports = {\n    PERMISSIONS_MATRIX\n};\n`;

            await fs.writeFile(configPath, fileContent, 'utf-8');

            // Update in-memory cache
            delete require.cache[require.resolve('../config/permissionsMatrix')];
            const reloaded = require('../config/permissionsMatrix');
            Object.assign(PERMISSIONS_MATRIX, reloaded.PERMISSIONS_MATRIX);

            res.json({
                success: true,
                message: 'Permissions matrix updated successfully',
                matrix: PERMISSIONS_MATRIX
            });
        } catch (error) {
            console.error('Error updating permissions matrix:', error);
            res.status(500).json({ error: 'Failed to update permissions matrix' });
        }
    }
);
// ==================== AUTH ROUTES ====================
router.post('/auth/register',
    authenticateToken,
    requireAdminOrRop,
    [
        body('username').trim().isLength({ min: 3, max: 50 }),
        body('password').optional({ nullable: true }).isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
        body('name').trim().isLength({ min: 2, max: 100 }),
        body('role').isIn(['admin', 'assistant', 'rop', 'operator', 'employee']),
        body('department').optional({ nullable: true }).trim().isLength({ min: 2, max: 100 })
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

// NOTE: Users cannot change their own passwords
// Only admins can reset passwords via POST /users/:userId/reset-password

// ==================== USER ROUTES ====================
router.get('/users', authenticateToken, requireAdmin, userController.getAllUsers);
router.get('/users/stats', authenticateToken, requireAdmin, userController.getUserStats);
router.get('/users/online', authenticateToken, (req, res) => {
    try {
        const onlineUserIds = getOnlineUsers();
        res.json({ online: onlineUserIds, count: onlineUserIds.length });
    } catch (error) {
        console.error('Get online users error:', error);
        res.status(500).json({ error: 'Failed to get online users' });
    }
});

router.get('/users/role/:role',
    authenticateToken,
    requireHead,
    [param('role').isIn(['admin', 'assistant', 'rop', 'operator', 'employee'])],
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
    requireAdminOrRop,
    [
        param('userId').isInt(),
        body('username').optional().trim().isLength({ min: 3, max: 50 }),
        body('name').optional().trim().isLength({ min: 2, max: 100 }),
        body('role').optional().isIn(['admin', 'assistant', 'rop', 'operator', 'employee']),
        body('department').optional({ nullable: true }).trim().isLength({ min: 2, max: 100 }),
        body('isActive').optional().isBoolean()
    ],
    validate,
    userController.updateUser
);

router.delete('/users/:userId',
    authenticateToken,
    requireAdminOrRop,
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
        queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
        queryValidator('offset').optional().isInt({ min: 0 })
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

// Chat settings routes (admin/rop)
router.get('/chats/:chatId/settings',
    authenticateToken,
    requireAdminOrRop,
    [param('chatId').isInt()],
    validate,
    chatController.getChatSettings
);

router.put('/chats/:chatId/settings',
    authenticateToken,
    requireAdminOrRop,
    [
        param('chatId').isInt(),
        body('name').optional().trim().isLength({ min: 2, max: 100 }),
        body('description').optional().trim()
    ],
    validate,
    chatController.updateChatSettings
);

router.put('/chats/:chatId/participants/:userId/permissions',
    authenticateToken,
    requireAdmin,
    [
        param('chatId').isInt(),
        param('userId').isInt(),
        body('canAddMembers').optional().isBoolean(),
        body('canRemoveMembers').optional().isBoolean(),
        body('role').optional().isIn(['owner', 'admin', 'member'])
    ],
    validate,
    chatController.updateParticipantPermissions
);

// ==================== DEPARTMENT ROUTES ====================

// Get structured contacts (departments + assistants)
router.get('/contacts/structured',
    authenticateToken,
    departmentController.getContactsStructured
);

// Get all departments with stats
router.get('/departments',
    authenticateToken,
    requireAdminOrRop,
    departmentController.getAllDepartments
);

// Get department users
router.get('/departments/:departmentName/users',
    authenticateToken,
    requireAdminOrRop,
    [param('departmentName').trim().notEmpty()],
    validate,
    departmentController.getDepartmentUsers
);

// Get assistants
router.get('/assistants',
    authenticateToken,
    departmentController.getAssistants
);

// Create department (admin only)
router.post('/departments',
    authenticateToken,
    requireAdmin,
    [
        body('name').trim().isLength({ min: 2, max: 100 }),
        body('headUserId').optional().isInt()
    ],
    validate,
    departmentController.createDepartment
);

// Assign department head (admin only)
router.put('/departments/:departmentName/head',
    authenticateToken,
    requireAdmin,
    [
        param('departmentName').trim().notEmpty(),
        body('userId').isInt()
    ],
    validate,
    departmentController.assignDepartmentHead
);

// Rename department (admin only) - syncs department and chat name
router.put('/departments/:departmentName/rename',
    authenticateToken,
    requireAdmin,
    [
        param('departmentName').trim().notEmpty(),
        body('newName').trim().isLength({ min: 2, max: 50 })
    ],
    validate,
    departmentController.renameDepartment
);

// Move user to department (admin only)
router.put('/users/:userId/department',
    authenticateToken,
    requireAdmin,
    [
        param('userId').isInt(),
        body('departmentName').trim().notEmpty(),
        body('role').optional().isIn(['admin', 'assistant', 'rop', 'operator', 'employee'])
    ],
    validate,
    departmentController.moveUserToDepartment
);

// Add user to department (admin/rop)
router.post('/departments/:departmentName/users',
    authenticateToken,
    requireAdminOrRop,
    [
        param('departmentName').trim().notEmpty(),
        body('userId').isInt(),
        body('role').optional().isIn(['rop', 'operator', 'employee', 'assistant'])
    ],
    validate,
    departmentController.addUserToDepartment
);

// Remove user from department (admin only)
router.delete('/users/:userId/department',
    authenticateToken,
    requireAdmin,
    [param('userId').isInt()],
    validate,
    departmentController.removeUserFromDepartment
);

// Get department stats (admin only)
router.get('/departments/stats',
    authenticateToken,
    requireAdmin,
    departmentController.getDepartmentStats
);

// ==================== PERMISSIONS ROUTES (Admin Only) ====================

// Get all role permissions as matrix
router.get('/permissions',
    authenticateToken,
    requireAdmin,
    permissionsController.getRolePermissions
);

// Update single permission
router.put('/permissions',
    authenticateToken,
    requireAdmin,
    [
        body('fromRole').isIn(['admin', 'assistant', 'rop', 'operator', 'employee']),
        body('toRole').isIn(['admin', 'assistant', 'rop', 'operator', 'employee']),
        body('canSend').isBoolean()
    ],
    validate,
    permissionsController.updateRolePermission
);

// Batch update permissions
router.post('/permissions/batch',
    authenticateToken,
    requireAdmin,
    [body('permissions').isArray()],
    validate,
    permissionsController.batchUpdatePermissions
);

// Reset permissions to defaults
router.post('/permissions/reset',
    authenticateToken,
    requireAdmin,
    permissionsController.resetPermissions
);

// ==================== GENERAL PERMISSIONS ROUTES (Admin Only) ====================

// Get all general permissions
router.get('/permissions/general',
    authenticateToken,
    requireAdmin,
    generalPermissionsController.getGeneralPermissions
);

// Update single general permission
router.put('/permissions/general',
    authenticateToken,
    requireAdmin,
    [
        body('role').isIn(['admin', 'assistant', 'rop', 'operator', 'employee']),
        body('permission').isString().notEmpty(),
        body('canPerform').isBoolean()
    ],
    validate,
    generalPermissionsController.updateGeneralPermission
);

// Batch update general permissions
router.post('/permissions/general/batch',
    authenticateToken,
    requireAdmin,
    [body('updates').isArray()],
    validate,
    generalPermissionsController.batchUpdateGeneralPermissions
);

// Reset general permissions to defaults
router.post('/permissions/general/reset',
    authenticateToken,
    requireAdmin,
    generalPermissionsController.resetGeneralPermissions
);

// ==================== MESSAGE ROUTES ====================
router.get('/chats/:chatId/messages',
    authenticateToken,
    [
        param('chatId').isInt(),
        queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
        queryValidator('offset').optional().isInt({ min: 0 }),
        queryValidator('before').optional().isISO8601()
    ],
    validate,
    canAccessChat,
    messageController.getMessages
);

router.post('/chats/:chatId/messages',
    authenticateToken,
    [
        param('chatId').isInt(),
        body('content')
            .optional({ nullable: true })
            .trim()
            .isLength({ min: 1, max: 5000 })
            .withMessage('Message content must be between 1 and 5000 characters'),
        body('fileId')
            .optional({ nullable: true })
            .toInt()
            .isInt({ min: 1 })
            .withMessage('fileId must be a positive integer'),
        body()
            .custom(({ content, fileId }) => {
                const hasContent = typeof content === 'string' && content.trim().length > 0;
                if (hasContent || fileId) {
                    return true;
                }
                throw new Error('Message content or file is required');
            })
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

// Message reactions
router.post('/messages/:messageId/reactions',
    authenticateToken,
    [param('messageId').isInt()],
    validate,
    messageController.addReaction
);

router.delete('/messages/:messageId/reactions',
    authenticateToken,
    [param('messageId').isInt()],
    validate,
    messageController.removeReaction
);

// Forward message
router.post('/messages/:messageId/forward',
    authenticateToken,
    [param('messageId').isInt()],
    validate,
    messageController.forwardMessage
);

// Pin message
router.post('/messages/:messageId/pin',
    authenticateToken,
    [param('messageId').isInt()],
    validate,
    messageController.pinMessage
);

// Add to favorites
router.post('/messages/:messageId/favorite',
    authenticateToken,
    [param('messageId').isInt()],
    validate,
    messageController.addToFavorites
);

router.get('/chats/:chatId/messages/search',
    authenticateToken,
    [
        param('chatId').isInt(),
        queryValidator('query').trim().isLength({ min: 2 }),
        queryValidator('limit').optional().isInt({ min: 1, max: 50 })
    ],
    validate,
    canAccessChat,
    messageController.searchMessages
);

router.get('/messages/all',
    authenticateToken,
    requireAdmin,
    [
        queryValidator('limit').optional().isInt({ min: 1, max: 200 }),
        queryValidator('offset').optional().isInt({ min: 0 }),
    ],
    validate,
    messageController.getAllMessages
);

router.get('/messages/deletion-history',
    authenticateToken,
    requireAdminOrRop,
    [
        queryValidator('chatId').optional().isInt({ min: 1 }),
        queryValidator('limit').optional().isInt({ min: 1, max: 200 }),
        queryValidator('offset').optional().isInt({ min: 0 })
    ],
    validate,
    messageController.getDeletionHistory
);

router.get('/messages/stats',
    authenticateToken,
    requireAdmin,
    messageController.getMessageStats
);

// ==================== FILE ROUTES ====================
router.post('/chats/:chatId/upload',
    authenticateToken,
    canAccessChat,
    canSendToChat,
    uploadSingle,
    validateFile,
    fileController.uploadFileToMessage
);

router.post('/chats/:chatId/upload-multiple',
    authenticateToken,
    canAccessChat,
    canSendToChat,
    uploadMultiple,
    validateFile,
    fileController.uploadMultipleFiles
);

router.delete('/messages/:messageId/file',
    authenticateToken,
    fileController.deleteFileFromMessage
);

router.get('/files/stats',
    authenticateToken,
    requireAdmin,
    fileController.getFileStats
);

router.use('/files', fileRoutes);

// ==================== PUSH NOTIFICATIONS ====================
router.get('/push/vapid-public-key', pushController.getVapidPublicKey);
router.post('/push/subscribe', authenticateToken, pushController.subscribe);
router.post('/push/unsubscribe', authenticateToken, pushController.unsubscribe);
router.get('/push/status', authenticateToken, pushController.getSubscriptionStatus);
router.post('/push/test', authenticateToken, pushController.testPush);

// ==================== HEALTH CHECK ====================
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ==================== EXPORT ====================
module.exports = router;