const { query } = require('../config/database');

// Check if user can access chat
const canAccessChat = async (req, res, next) => {
    try {
        const chatId = req.params.chatId || req.body.chatId;
        const userId = req.user.id;

        // Admins can access all chats
        if (req.user.role === 'admin') {
            return next();
        }

        // Check if user is participant of the chat
        const result = await query(
            `SELECT cp.* FROM chat_participants cp
             JOIN chats c ON cp.chat_id = c.id
             WHERE cp.chat_id = $1 AND cp.user_id = $2`,
            [chatId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ 
                error: 'Access denied to this chat',
                code: 'CHAT_ACCESS_DENIED'
            });
        }

        next();
    } catch (error) {
        console.error('Chat access check error:', error);
        res.status(500).json({ 
            error: 'Failed to verify chat access',
            code: 'ACCESS_CHECK_ERROR'
        });
    }
};

// Check if user can send message to chat
const canSendToChat = async (req, res, next) => {
    try {
        const chatId = req.params.chatId || req.body.chatId;
        const userId = req.user.id;
        const userRole = req.user.role;
        const userDept = req.user.department;

        // Get chat info
        const chatResult = await query(
            'SELECT * FROM chats WHERE id = $1',
            [chatId]
        );

        if (chatResult.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Chat not found',
                code: 'CHAT_NOT_FOUND'
            });
        }

        const chat = chatResult.rows[0];

        // Admins can send to all chats
        if (userRole === 'admin') {
            return next();
        }

        // Check for direct message chats
        if (chat.type === 'direct') {
            const participants = await query(
                'SELECT user_id FROM chat_participants WHERE chat_id = $1',
                [chatId]
            );

            if (!participants.rows.find(p => p.user_id === userId)) {
                return res.status(403).json({ 
                    error: 'You are not a participant of this chat',
                    code: 'NOT_PARTICIPANT'
                });
            }

            // Check if user can send DM based on hierarchy
            const otherUserId = participants.rows.find(p => p.user_id !== userId).user_id;
            const canSend = await query(
                'SELECT can_send_direct_message($1, $2) as can_send',
                [userId, otherUserId]
            );

            if (!canSend.rows[0].can_send) {
                return res.status(403).json({ 
                    error: 'You cannot send direct messages to this user',
                    code: 'DM_NOT_ALLOWED'
                });
            }

            return next();
        }

        // For group chats, check if user is participant
        if (chat.type === 'group') {
            const isParticipant = await query(
                'SELECT * FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
                [chatId, userId]
            );

            if (isParticipant.rows.length === 0) {
                return res.status(403).json({ 
                    error: 'You are not a member of this group',
                    code: 'NOT_GROUP_MEMBER'
                });
            }

            return next();
        }

        // For department chats, allow heads and operators of same department
        if (chat.type === 'department') {
            // Allow ROP/head or operator of the same department
            if ((['rop', 'head'].includes(userRole) || userRole === 'operator') && userDept === chat.department) {
                return next();
            }
            // Allow admin
            if (userRole === 'admin') {
                return next();
            }
            // Deny others
            return res.status(403).json({ 
                error: 'Only department members can send messages in department chats',
                code: 'DEPARTMENT_ONLY'
            });
        }

        res.status(403).json({ 
            error: 'Cannot send message to this chat',
            code: 'SEND_NOT_ALLOWED'
        });
    } catch (error) {
        console.error('Send permission check error:', error);
        res.status(500).json({ 
            error: 'Failed to verify send permission',
            code: 'PERMISSION_CHECK_ERROR'
        });
    }
};

// Check if user can create direct message with another user
const canCreateDirectMessage = async (req, res, next) => {
    try {
        const { receiverId } = req.body;
        const senderId = req.user.id;

        if (senderId === receiverId) {
            return res.status(400).json({
                error: 'Cannot create chat with yourself',
                code: 'SELF_CHAT_ERROR'
            });
        }

        // Admins and assistants can create chats with anyone
        if (req.user.role === 'admin' || req.user.role === 'assistant') {
            return next();
        }

        // Check if DM is allowed
        const result = await query(
            'SELECT can_send_direct_message($1, $2) as can_send',
            [senderId, receiverId]
        );

        if (!result.rows[0].can_send) {
            return res.status(403).json({
                error: 'You cannot create a direct message with this user',
                code: 'DM_CREATION_NOT_ALLOWED'
            });
        }

        next();
    } catch (error) {
        console.error('DM creation check error:', error);
        res.status(500).json({
            error: 'Failed to verify DM creation permission',
            code: 'DM_CHECK_ERROR'
        });
    }
};

// Check if user can view all messages (admins only)
const canViewAllMessages = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            error: 'Only admins can view all messages',
            code: 'ADMIN_ONLY'
        });
    }
    next();
};

module.exports = {
    canAccessChat,
    canSendToChat,
    canCreateDirectMessage,
    canViewAllMessages
};
