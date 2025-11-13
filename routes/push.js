// routes/push.js
const express = require('express');
const router = express.Router();
const webPush = require('web-push');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Настройка VAPID
webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@corporate-chat.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// ==================== GET VAPID PUBLIC KEY ====================
// Клиент должен получить публичный ключ для подписки на уведомления
router.get('/vapid-public-key', authenticateToken, (req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY
  });
});

// ==================== SUBSCRIBE TO PUSH ====================
router.post('/subscribe',
  authenticateToken,
  [
    body('endpoint').isURL().withMessage('Invalid endpoint URL'),
    body('keys.p256dh').notEmpty().withMessage('p256dh key is required'),
    body('keys.auth').notEmpty().withMessage('auth key is required')
  ],
  validate,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { endpoint, keys } = req.body;
      const { p256dh, auth } = keys;
      const userAgent = req.get('User-Agent');

      // Проверяем, существует ли уже такая подписка
      const existingSubscription = await query(
        'SELECT * FROM push_subscriptions WHERE endpoint = $1',
        [endpoint]
      );

      if (existingSubscription.rows.length > 0) {
        // Обновляем существующую подписку
        await query(
          `UPDATE push_subscriptions
           SET user_id = $1, p256dh = $2, auth = $3, is_active = true, updated_at = CURRENT_TIMESTAMP
           WHERE endpoint = $4`,
          [userId, p256dh, auth, endpoint]
        );
      } else {
        // Создаем новую подписку
        await query(
          `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, endpoint, p256dh, auth, userAgent]
        );
      }

      // Создаем настройки уведомлений по умолчанию, если их нет
      const settingsExist = await query(
        'SELECT id FROM notification_settings WHERE user_id = $1',
        [userId]
      );

      if (settingsExist.rows.length === 0) {
        await query(
          `INSERT INTO notification_settings (user_id)
           VALUES ($1)`,
          [userId]
        );
      }

      res.json({
        success: true,
        message: 'Successfully subscribed to push notifications'
      });
    } catch (error) {
      console.error('Error subscribing to push:', error);
      res.status(500).json({
        error: 'Failed to subscribe to push notifications',
        details: error.message
      });
    }
  }
);

// ==================== UNSUBSCRIBE FROM PUSH ====================
router.post('/unsubscribe',
  authenticateToken,
  [body('endpoint').isURL().withMessage('Invalid endpoint URL')],
  validate,
  async (req, res) => {
    try {
      const { endpoint } = req.body;
      const userId = req.user.userId;

      await query(
        `UPDATE push_subscriptions
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE endpoint = $1 AND user_id = $2`,
        [endpoint, userId]
      );

      res.json({
        success: true,
        message: 'Successfully unsubscribed from push notifications'
      });
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      res.status(500).json({
        error: 'Failed to unsubscribe from push notifications',
        details: error.message
      });
    }
  }
);

// ==================== GET NOTIFICATION SETTINGS ====================
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    let settings = await query(
      'SELECT * FROM notification_settings WHERE user_id = $1',
      [userId]
    );

    // Если настроек нет, создаем их с дефолтными значениями
    if (settings.rows.length === 0) {
      await query(
        'INSERT INTO notification_settings (user_id) VALUES ($1)',
        [userId]
      );
      settings = await query(
        'SELECT * FROM notification_settings WHERE user_id = $1',
        [userId]
      );
    }

    res.json(settings.rows[0]);
  } catch (error) {
    console.error('Error getting notification settings:', error);
    res.status(500).json({
      error: 'Failed to get notification settings',
      details: error.message
    });
  }
});

// ==================== UPDATE NOTIFICATION SETTINGS ====================
router.put('/settings',
  authenticateToken,
  [
    body('enabled').optional().isBoolean(),
    body('new_messages').optional().isBoolean(),
    body('mentions').optional().isBoolean(),
    body('direct_messages').optional().isBoolean(),
    body('group_messages').optional().isBoolean(),
    body('sound').optional().isBoolean()
  ],
  validate,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const updates = req.body;

      // Сначала проверяем, существуют ли настройки
      const existing = await query(
        'SELECT id FROM notification_settings WHERE user_id = $1',
        [userId]
      );

      if (existing.rows.length === 0) {
        // Создаем новые настройки
        await query(
          'INSERT INTO notification_settings (user_id) VALUES ($1)',
          [userId]
        );
      }

      // Обновляем настройки
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          fields.push(`${key} = $${paramCount}`);
          values.push(updates[key]);
          paramCount++;
        }
      });

      if (fields.length > 0) {
        values.push(userId);
        await query(
          `UPDATE notification_settings
           SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $${paramCount}`,
          values
        );
      }

      const updated = await query(
        'SELECT * FROM notification_settings WHERE user_id = $1',
        [userId]
      );

      res.json(updated.rows[0]);
    } catch (error) {
      console.error('Error updating notification settings:', error);
      res.status(500).json({
        error: 'Failed to update notification settings',
        details: error.message
      });
    }
  }
);

// ==================== TEST NOTIFICATION ====================
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Получаем все активные подписки пользователя
    const subscriptions = await query(
      'SELECT * FROM push_subscriptions WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (subscriptions.rows.length === 0) {
      return res.status(404).json({
        error: 'No active push subscriptions found'
      });
    }

    const payload = JSON.stringify({
      title: 'Тестовое уведомление',
      body: 'Push-уведомления работают корректно!',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: 'test-notification',
      data: {
        type: 'test',
        timestamp: Date.now()
      }
    });

    let successCount = 0;
    let failCount = 0;

    for (const sub of subscriptions.rows) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        await webPush.sendNotification(pushSubscription, payload);
        successCount++;

        // Логируем отправку
        await query(
          `INSERT INTO notification_logs
           (user_id, notification_type, title, body, success)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, 'test', 'Тестовое уведомление', 'Push-уведомления работают корректно!', true]
        );
      } catch (error) {
        console.error('Error sending to subscription:', error);
        failCount++;

        // Если подписка недействительна (410 Gone), деактивируем её
        if (error.statusCode === 410) {
          await query(
            'UPDATE push_subscriptions SET is_active = false WHERE id = $1',
            [sub.id]
          );
        }

        // Логируем ошибку
        await query(
          `INSERT INTO notification_logs
           (user_id, notification_type, title, body, success, error_message)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, 'test', 'Тестовое уведомление', 'Push-уведомления работают корректно!', false, error.message]
        );
      }
    }

    res.json({
      success: true,
      message: `Test notification sent to ${successCount} subscription(s)`,
      successCount,
      failCount
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      error: 'Failed to send test notification',
      details: error.message
    });
  }
});

// ==================== GET USER SUBSCRIPTIONS ====================
router.get('/subscriptions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const subscriptions = await query(
      `SELECT id, endpoint, user_agent, is_active, created_at, updated_at
       FROM push_subscriptions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(subscriptions.rows);
  } catch (error) {
    console.error('Error getting subscriptions:', error);
    res.status(500).json({
      error: 'Failed to get subscriptions',
      details: error.message
    });
  }
});

// ==================== GET UNREAD COUNT (FOR BADGE) ====================
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await query(
      `SELECT COUNT(*) as count
       FROM messages m
       JOIN chat_participants cp ON m.chat_id = cp.chat_id
       WHERE cp.user_id = $1
       AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')
       AND m.user_id != $1`,
      [userId]
    );

    const unreadCount = parseInt(result.rows[0]?.count || 0);

    res.json({
      count: unreadCount
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      error: 'Failed to get unread count',
      details: error.message
    });
  }
});

module.exports = router;
