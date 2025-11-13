// utils/pushNotifications.js
const webPush = require('web-push');
const { query } = require('../config/database');
const Logger = require('./logger');
const logger = new Logger('push-notifications');

// Настройка VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@corporate-chat.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  logger.warn('VAPID keys not configured. Push notifications will not work.');
}

/**
 * Отправляет push-уведомление пользователю
 * @param {number} userId - ID пользователя
 * @param {object} notification - Данные уведомления
 * @param {string} notification.title - Заголовок
 * @param {string} notification.body - Текст
 * @param {string} notification.type - Тип уведомления
 * @param {object} notification.data - Дополнительные данные
 */
async function sendPushNotification(userId, notification) {
  try {
    // Проверяем настройки уведомлений пользователя
    const settingsResult = await query(
      'SELECT * FROM notification_settings WHERE user_id = $1',
      [userId]
    );

    // Если настройки не найдены или уведомления отключены, не отправляем
    if (settingsResult.rows.length === 0) {
      logger.info(`No notification settings found for user ${userId}, creating defaults`);
      // Создаем дефолтные настройки
      await query(
        'INSERT INTO notification_settings (user_id) VALUES ($1)',
        [userId]
      );
    } else {
      const settings = settingsResult.rows[0];

      // Проверяем глобальное включение уведомлений
      if (!settings.enabled) {
        logger.info(`Notifications disabled for user ${userId}`);
        return { sent: 0, failed: 0 };
      }

      // Проверяем специфичные настройки по типу
      if (notification.type === 'mention' && !settings.mentions) {
        logger.info(`Mention notifications disabled for user ${userId}`);
        return { sent: 0, failed: 0 };
      }

      if (notification.type === 'new_message' && !settings.new_messages) {
        logger.info(`New message notifications disabled for user ${userId}`);
        return { sent: 0, failed: 0 };
      }

      if (notification.type === 'direct_message' && !settings.direct_messages) {
        logger.info(`Direct message notifications disabled for user ${userId}`);
        return { sent: 0, failed: 0 };
      }

      if (notification.type === 'group_message' && !settings.group_messages) {
        logger.info(`Group message notifications disabled for user ${userId}`);
        return { sent: 0, failed: 0 };
      }
    }

    // Получаем все активные подписки пользователя
    const subscriptionsResult = await query(
      'SELECT * FROM push_subscriptions WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (subscriptionsResult.rows.length === 0) {
      logger.info(`No active push subscriptions found for user ${userId}`);
      return { sent: 0, failed: 0 };
    }

    // Получаем количество непрочитанных сообщений для badge
    const unreadResult = await query(
      `SELECT COUNT(*) as count
       FROM messages m
       JOIN chat_participants cp ON m.chat_id = cp.chat_id
       WHERE cp.user_id = $1
       AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')
       AND m.user_id != $1`,
      [userId]
    );

    const unreadCount = parseInt(unreadResult.rows[0]?.count || 0);

    // Формируем payload для уведомления
    const payload = JSON.stringify({
      title: notification.title || 'Новое сообщение',
      body: notification.body || '',
      icon: notification.icon || '/icon-192x192.png',
      badge: notification.badge || '/badge-72x72.png',
      tag: notification.tag || `notification-${Date.now()}`,
      data: {
        ...notification.data,
        type: notification.type,
        timestamp: Date.now(),
        url: notification.url || '/'
      },
      requireInteraction: notification.requireInteraction || false,
      actions: notification.actions || [],
      vibrate: [200, 100, 200],
      // Badge показывает количество непрочитанных
      ...(unreadCount > 0 && { badge: unreadCount })
    });

    let sent = 0;
    let failed = 0;

    // Отправляем уведомление на все подписки пользователя
    for (const subscription of subscriptionsResult.rows) {
      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        };

        await webPush.sendNotification(pushSubscription, payload);
        sent++;

        // Логируем успешную отправку
        await query(
          `INSERT INTO notification_logs
           (user_id, message_id, notification_type, title, body, success)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            userId,
            notification.messageId || null,
            notification.type,
            notification.title,
            notification.body,
            true
          ]
        );

        logger.info(`Push notification sent to user ${userId}, subscription ${subscription.id}`);
      } catch (error) {
        failed++;
        logger.error(`Failed to send push to subscription ${subscription.id}:`, error.message);

        // Если подписка недействительна (410 Gone), деактивируем её
        if (error.statusCode === 410) {
          await query(
            'UPDATE push_subscriptions SET is_active = false WHERE id = $1',
            [subscription.id]
          );
          logger.info(`Deactivated invalid subscription ${subscription.id}`);
        }

        // Логируем ошибку
        await query(
          `INSERT INTO notification_logs
           (user_id, message_id, notification_type, title, body, success, error_message)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            userId,
            notification.messageId || null,
            notification.type,
            notification.title,
            notification.body,
            false,
            error.message
          ]
        );
      }
    }

    return { sent, failed };
  } catch (error) {
    logger.error('Error in sendPushNotification:', error);
    throw error;
  }
}

/**
 * Отправляет уведомление о новом сообщении
 * @param {object} message - Объект сообщения
 * @param {object} sender - Объект отправителя
 * @param {object} chat - Объект чата
 * @param {array} recipientUserIds - Массив ID получателей
 */
async function sendNewMessageNotification(message, sender, chat, recipientUserIds) {
  try {
    const chatName = chat.type === 'direct'
      ? sender.name
      : chat.name || 'Групповой чат';

    const messagePreview = message.content
      ? (message.content.length > 50 ? message.content.substring(0, 50) + '...' : message.content)
      : '[Файл]';

    const notificationType = chat.type === 'direct' ? 'direct_message' : 'group_message';

    for (const userId of recipientUserIds) {
      // Не отправляем уведомление отправителю
      if (userId === sender.id) continue;

      await sendPushNotification(userId, {
        title: `${sender.name} в "${chatName}"`,
        body: messagePreview,
        type: notificationType,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: `message-${message.id}`,
        messageId: message.id,
        data: {
          chatId: chat.id,
          messageId: message.id,
          senderId: sender.id,
          chatType: chat.type
        },
        url: `/chat/${chat.id}`,
        requireInteraction: false
      });
    }
  } catch (error) {
    logger.error('Error sending new message notification:', error);
  }
}

/**
 * Отправляет уведомление об упоминании
 * @param {object} message - Объект сообщения
 * @param {object} sender - Объект отправителя
 * @param {object} chat - Объект чата
 * @param {number} mentionedUserId - ID упомянутого пользователя
 */
async function sendMentionNotification(message, sender, chat, mentionedUserId) {
  try {
    const chatName = chat.type === 'direct'
      ? sender.name
      : chat.name || 'Групповой чат';

    const messagePreview = message.content
      ? (message.content.length > 50 ? message.content.substring(0, 50) + '...' : message.content)
      : '[Файл]';

    await sendPushNotification(mentionedUserId, {
      title: `${sender.name} упомянул вас в "${chatName}"`,
      body: messagePreview,
      type: 'mention',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: `mention-${message.id}`,
      messageId: message.id,
      data: {
        chatId: chat.id,
        messageId: message.id,
        senderId: sender.id,
        chatType: chat.type
      },
      url: `/chat/${chat.id}`,
      requireInteraction: true // Требуем взаимодействия для упоминаний
    });
  } catch (error) {
    logger.error('Error sending mention notification:', error);
  }
}

/**
 * Получает количество непрочитанных сообщений для пользователя
 * @param {number} userId - ID пользователя
 * @returns {number} Количество непрочитанных сообщений
 */
async function getUnreadCount(userId) {
  try {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM messages m
       JOIN chat_participants cp ON m.chat_id = cp.chat_id
       WHERE cp.user_id = $1
       AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')
       AND m.user_id != $1`,
      [userId]
    );

    return parseInt(result.rows[0]?.count || 0);
  } catch (error) {
    logger.error('Error getting unread count:', error);
    return 0;
  }
}

module.exports = {
  sendPushNotification,
  sendNewMessageNotification,
  sendMentionNotification,
  getUnreadCount
};
