// controllers/pushController.js
// Web Push notifications controller

const webpush = require('web-push');
const { query } = require('../config/database');

// Configure web-push with VAPID keys
const initWebPush = () => {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

    if (!vapidPublicKey || !vapidPrivateKey ||
        vapidPublicKey === 'your_vapid_public_key_here') {
        console.warn('⚠️  VAPID keys not configured. Web Push disabled.');
        console.warn('   Generate keys with: npx web-push generate-vapid-keys');
        return false;
    }

    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
    console.log('✅ Web Push configured successfully');
    return true;
};

// Get VAPID public key for client
const getVapidPublicKey = (req, res) => {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;

    if (!vapidPublicKey || vapidPublicKey === 'your_vapid_public_key_here') {
        return res.status(503).json({
            error: 'Push notifications not configured',
            code: 'PUSH_NOT_CONFIGURED'
        });
    }

    res.json({ publicKey: vapidPublicKey });
};

// Subscribe to push notifications
const subscribe = async (req, res) => {
    try {
        const userId = req.user.id;
        const { subscription } = req.body;

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({
                error: 'Invalid subscription object',
                code: 'INVALID_SUBSCRIPTION'
            });
        }

        const { endpoint, keys } = subscription;
        const { p256dh, auth } = keys;
        const userAgent = req.headers['user-agent'] || '';

        // Upsert subscription (update if endpoint exists, insert if not)
        await query(`
            INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (endpoint)
            DO UPDATE SET
                user_id = $1,
                p256dh = $3,
                auth = $4,
                user_agent = $5,
                last_used_at = CURRENT_TIMESTAMP
        `, [userId, endpoint, p256dh, auth, userAgent]);

        console.log(`📱 Push subscription saved for user ${userId}`);

        res.json({
            success: true,
            message: 'Successfully subscribed to push notifications'
        });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({
            error: 'Failed to subscribe',
            code: 'SUBSCRIBE_ERROR'
        });
    }
};

// Unsubscribe from push notifications
const unsubscribe = async (req, res) => {
    try {
        const userId = req.user.id;
        const { endpoint } = req.body;

        if (endpoint) {
            // Unsubscribe specific endpoint
            await query(
                'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
                [userId, endpoint]
            );
        } else {
            // Unsubscribe all endpoints for user
            await query(
                'DELETE FROM push_subscriptions WHERE user_id = $1',
                [userId]
            );
        }

        console.log(`📱 Push subscription removed for user ${userId}`);

        res.json({
            success: true,
            message: 'Successfully unsubscribed from push notifications'
        });
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({
            error: 'Failed to unsubscribe',
            code: 'UNSUBSCRIBE_ERROR'
        });
    }
};

// Send push notification to a user
const sendPushToUser = async (userId, payload) => {
    try {
        const result = await query(
            'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return { sent: 0, failed: 0 };
        }

        const notifications = result.rows.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };

            try {
                await webpush.sendNotification(
                    pushSubscription,
                    JSON.stringify(payload)
                );

                // Update last_used_at
                await query(
                    'UPDATE push_subscriptions SET last_used_at = CURRENT_TIMESTAMP WHERE endpoint = $1',
                    [sub.endpoint]
                );

                return { success: true };
            } catch (error) {
                // Remove invalid subscriptions (410 Gone or 404 Not Found)
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await query(
                        'DELETE FROM push_subscriptions WHERE endpoint = $1',
                        [sub.endpoint]
                    );
                    console.log(`🗑️  Removed expired subscription: ${sub.endpoint.substring(0, 50)}...`);
                }
                return { success: false, error: error.message };
            }
        });

        const results = await Promise.all(notifications);
        const sent = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        return { sent, failed };
    } catch (error) {
        console.error('Send push error:', error);
        return { sent: 0, failed: 0, error: error.message };
    }
};

// Send notification for new message
const sendNewMessageNotification = async (recipientId, senderName, messagePreview, chatId, chatName) => {
    const payload = {
        type: 'new_message',
        title: chatName || senderName,
        body: `${senderName}: ${messagePreview.substring(0, 100)}${messagePreview.length > 100 ? '...' : ''}`,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data: {
            chatId,
            url: `/?chat=${chatId}`
        },
        tag: `chat-${chatId}`, // Group notifications by chat
        renotify: true
    };

    return sendPushToUser(recipientId, payload);
};

// Send notification for incoming call (Phase 4: UX improvements)
const sendIncomingCallNotification = async (recipientId, callerName, callType, chatId, chatName, callId) => {
    const callTypeIcon = callType === 'video' ? '📹' : '📞';
    const callTypeText = callType === 'video' ? 'Видеозвонок' : 'Аудиозвонок';

    const payload = {
        type: 'incoming_call',
        title: `${callTypeIcon} Входящий звонок`,
        body: `${callerName} звонит вам${chatName ? ` в "${chatName}"` : ''}`,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data: {
            chatId,
            callId,
            callType,
            url: `/?chat=${chatId}`
        },
        tag: `call-${callId}`, // Unique tag per call
        renotify: true,
        requireInteraction: true, // Keep notification visible until user interacts
        vibrate: [200, 100, 200, 100, 200] // Vibration pattern for mobile
    };

    return sendPushToUser(recipientId, payload);
};

// Get user's subscription status
const getSubscriptionStatus = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await query(
            'SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = $1',
            [userId]
        );

        const subscriptionCount = parseInt(result.rows[0].count);

        res.json({
            subscribed: subscriptionCount > 0,
            deviceCount: subscriptionCount
        });
    } catch (error) {
        console.error('Get subscription status error:', error);
        res.status(500).json({
            error: 'Failed to get subscription status',
            code: 'STATUS_ERROR'
        });
    }
};

// Test push notification (for debugging)
const testPush = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await sendPushToUser(userId, {
            type: 'test',
            title: 'Тестовое уведомление',
            body: 'Push-уведомления работают!',
            icon: '/favicon.ico'
        });

        res.json({
            success: true,
            message: `Test notification sent: ${result.sent} delivered, ${result.failed} failed`
        });
    } catch (error) {
        console.error('Test push error:', error);
        res.status(500).json({
            error: 'Failed to send test notification',
            code: 'TEST_PUSH_ERROR'
        });
    }
};

module.exports = {
    initWebPush,
    getVapidPublicKey,
    subscribe,
    unsubscribe,
    sendPushToUser,
    sendNewMessageNotification,
    sendIncomingCallNotification,
    getSubscriptionStatus,
    testPush
};
