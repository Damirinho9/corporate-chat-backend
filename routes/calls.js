// routes/calls.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');
const {
  generateRoomName,
  generateJitsiToken,
  generateJitsiUrl,
  generateJitsiConfig,
  validateJitsiConfig
} = require('../utils/jitsiHelper');

// Helper function to generate invite token
function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// ==================== GET JITSI CONFIG STATUS ====================
router.get('/config/status', authenticateToken, (req, res) => {
  const validation = validateJitsiConfig();
  res.json(validation);
});

// ==================== INITIATE CALL ====================
router.post('/initiate',
  authenticateToken,
  [
    body('callType').isIn(['audio', 'video', 'screen']).withMessage('Invalid call type'),
    body('participants').optional().isArray({ min: 1 }).withMessage('At least one participant required'),
    body('chatId').optional().isInt().withMessage('Invalid chat ID')
  ],
  validate,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      let { callType, participants, chatId } = req.body;

      // Если указан chatId, получаем информацию о чате и всех его участников
      let chat = null;
      if (chatId) {
        const chatResult = await query(
          'SELECT * FROM chats WHERE id = $1',
          [chatId]
        );

        if (chatResult.rows.length === 0) {
          return res.status(404).json({ error: 'Chat not found' });
        }

        chat = chatResult.rows[0];

        // Проверка прав для групповых чатов и чатов отделов
        if (chat.type === 'group' || chat.type === 'department') {
          // Только админы или руководители могут начинать групповые звонки
          if (userRole !== 'admin' && userRole !== 'rop') {
            return res.status(403).json({
              error: 'Only administrators and department heads can initiate group calls'
            });
          }

          // Для чатов отделов дополнительная проверка - rop может начинать только в своем отделе
          if (userRole === 'rop' && chat.type === 'department') {
            const userDept = req.user.department;
            if (chat.department !== userDept) {
              return res.status(403).json({
                error: 'You can only initiate calls in your own department'
              });
            }
          }
        }

        // Автоматически получаем всех участников чата
        const participantsResult = await query(
          'SELECT user_id FROM chat_participants WHERE chat_id = $1',
          [chatId]
        );

        participants = participantsResult.rows.map(p => p.user_id);
      }

      // Если participants не указаны, возвращаем ошибку
      if (!participants || participants.length === 0) {
        return res.status(400).json({ error: 'No participants found for this call' });
      }

      // Определяем режим звонка
      const callMode = participants.length === 1 ? 'direct' : 'group';

      // Генерируем уникальное имя комнаты и токен приглашения
      const roomName = generateRoomName(`call-${userId}`);
      const inviteToken = generateInviteToken();

      // Создаем запись звонка в БД
      const callResult = await query(
        `INSERT INTO calls (room_name, call_type, call_mode, initiated_by, chat_id, status, invite_token)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         RETURNING *`,
        [roomName, callType, callMode, userId, chatId || null, inviteToken]
      );

      const call = callResult.rows[0];

      // Добавляем инициатора как модератора
      await query(
        `INSERT INTO call_participants (call_id, user_id, status, is_moderator)
         VALUES ($1, $2, 'joined', true)`,
        [call.id, userId]
      );

      // Добавляем остальных участников
      for (const participantId of participants) {
        if (participantId !== userId) {
          await query(
            `INSERT INTO call_participants (call_id, user_id, status, is_moderator)
             VALUES ($1, $2, 'invited', false)
             ON CONFLICT (call_id, user_id) DO NOTHING`,
            [call.id, participantId]
          );
        }
      }

      // Логируем событие
      await query(
        `INSERT INTO call_events (call_id, user_id, event_type, event_data)
         VALUES ($1, $2, 'initiated', $3)`,
        [call.id, userId, JSON.stringify({ callType, callMode, participants })]
      );

      // Получаем информацию о пользователе для токена
      const userResult = await query(
        'SELECT id, name, username FROM users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];

      // Генерируем JWT токен для Jitsi
      const jitsiToken = generateJitsiToken({
        roomName,
        user: {
          id: user.id,
          name: user.name,
          email: `${user.username}@corporate-chat.local`
        },
        isModerator: true
      });

      // Генерируем URL для встречи
      const meetingUrl = generateJitsiUrl(roomName, jitsiToken, callType);

      // Генерируем конфигурацию для Jitsi
      const jitsiConfig = generateJitsiConfig({
        roomName,
        userInfo: {
          name: user.name,
          email: `${user.username}@corporate-chat.local`
        },
        isModerator: true,
        callType: callType
      });

      // Генерируем пригласительную ссылку
      const inviteLink = `${req.protocol}://${req.get('host')}/call.html?invite=${inviteToken}`;

      res.json({
        call: {
          id: call.id,
          roomName: call.room_name,
          callType: call.call_type,
          callMode: call.call_mode,
          status: call.status,
          inviteLink: inviteLink,
          inviteToken: inviteToken,
          createdAt: call.created_at
        },
        jitsi: {
          token: jitsiToken,
          meetingUrl,
          config: jitsiConfig
        }
      });
    } catch (error) {
      console.error('Error initiating call:', error);
      res.status(500).json({
        error: 'Failed to initiate call',
        details: error.message
      });
    }
  }
);

// ==================== JOIN CALL ====================
router.post('/:callId/join',
  authenticateToken,
  [param('callId').isInt()],
  validate,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { callId } = req.params;

      // Проверяем существование звонка
      const callResult = await query(
        'SELECT * FROM calls WHERE id = $1',
        [callId]
      );

      if (callResult.rows.length === 0) {
        return res.status(404).json({ error: 'Call not found' });
      }

      const call = callResult.rows[0];

      // Проверяем, является ли пользователь участником
      const participantResult = await query(
        'SELECT * FROM call_participants WHERE call_id = $1 AND user_id = $2',
        [callId, userId]
      );

      if (participantResult.rows.length === 0) {
        return res.status(403).json({ error: 'You are not a participant of this call' });
      }

      const participant = participantResult.rows[0];

      // Обновляем статус участника
      await query(
        `UPDATE call_participants
         SET status = 'joined', joined_at = CURRENT_TIMESTAMP
         WHERE call_id = $1 AND user_id = $2`,
        [callId, userId]
      );

      // Если звонок еще не начался, начинаем его
      if (call.status === 'pending') {
        await query(
          `UPDATE calls
           SET status = 'ongoing', started_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [callId]
        );
      }

      // Логируем событие
      await query(
        `INSERT INTO call_events (call_id, user_id, event_type)
         VALUES ($1, $2, 'joined')`,
        [callId, userId]
      );

      // Получаем информацию о пользователе
      const userResult = await query(
        'SELECT id, name, username FROM users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];

      // Генерируем JWT токен
      const jitsiToken = generateJitsiToken({
        roomName: call.room_name,
        user: {
          id: user.id,
          name: user.name,
          email: `${user.username}@corporate-chat.local`
        },
        isModerator: participant.is_moderator
      });

      // Генерируем URL
      const meetingUrl = generateJitsiUrl(call.room_name, jitsiToken, call.call_type);

      // Генерируем конфигурацию
      const jitsiConfig = generateJitsiConfig({
        roomName: call.room_name,
        userInfo: {
          name: user.name,
          email: `${user.username}@corporate-chat.local`
        },
        isModerator: participant.is_moderator,
        callType: call.call_type
      });

      res.json({
        call: {
          id: call.id,
          roomName: call.room_name,
          callType: call.call_type,
          callMode: call.call_mode,
          status: 'ongoing',
          startedAt: call.started_at
        },
        jitsi: {
          token: jitsiToken,
          meetingUrl,
          config: jitsiConfig
        }
      });
    } catch (error) {
      console.error('Error joining call:', error);
      res.status(500).json({
        error: 'Failed to join call',
        details: error.message
      });
    }
  }
);

// ==================== JOIN CALL BY INVITE TOKEN ====================
router.post('/join-by-invite',
  authenticateToken,
  [body('inviteToken').isString().notEmpty().withMessage('Invite token required')],
  validate,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { inviteToken } = req.body;

      // Находим звонок по invite_token
      const callResult = await query(
        'SELECT * FROM calls WHERE invite_token = $1',
        [inviteToken]
      );

      if (callResult.rows.length === 0) {
        return res.status(404).json({ error: 'Call not found or invite link is invalid' });
      }

      const call = callResult.rows[0];

      // Проверяем, что звонок еще активен
      if (call.status === 'ended') {
        return res.status(410).json({ error: 'Call has ended' });
      }

      // Проверяем, является ли пользователь уже участником
      let participantResult = await query(
        'SELECT * FROM call_participants WHERE call_id = $1 AND user_id = $2',
        [call.id, userId]
      );

      let participant;
      if (participantResult.rows.length === 0) {
        // Добавляем пользователя как участника (не модератор)
        await query(
          `INSERT INTO call_participants (call_id, user_id, status, is_moderator)
           VALUES ($1, $2, 'joined', false)`,
          [call.id, userId]
        );

        participantResult = await query(
          'SELECT * FROM call_participants WHERE call_id = $1 AND user_id = $2',
          [call.id, userId]
        );

        participant = participantResult.rows[0];
      } else {
        participant = participantResult.rows[0];

        // Обновляем статус участника
        await query(
          `UPDATE call_participants
           SET status = 'joined', joined_at = CURRENT_TIMESTAMP
           WHERE call_id = $1 AND user_id = $2`,
          [call.id, userId]
        );
      }

      // Если звонок еще не начался, начинаем его
      if (call.status === 'pending') {
        await query(
          `UPDATE calls
           SET status = 'ongoing', started_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [call.id]
        );
      }

      // Логируем событие
      await query(
        `INSERT INTO call_events (call_id, user_id, event_type, event_data)
         VALUES ($1, $2, 'joined', $3)`,
        [call.id, userId, JSON.stringify({ via: 'invite_link' })]
      );

      // Получаем информацию о пользователе
      const userResult = await query(
        'SELECT id, name, username FROM users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];

      // Генерируем JWT токен
      const jitsiToken = generateJitsiToken({
        roomName: call.room_name,
        user: {
          id: user.id,
          name: user.name,
          email: `${user.username}@corporate-chat.local`
        },
        isModerator: participant.is_moderator
      });

      // Генерируем URL
      const meetingUrl = generateJitsiUrl(call.room_name, jitsiToken, call.call_type);

      // Генерируем конфигурацию
      const jitsiConfig = generateJitsiConfig({
        roomName: call.room_name,
        userInfo: {
          name: user.name,
          email: `${user.username}@corporate-chat.local`
        },
        isModerator: participant.is_moderator,
        callType: call.call_type
      });

      res.json({
        call: {
          id: call.id,
          roomName: call.room_name,
          callType: call.call_type,
          callMode: call.call_mode,
          status: 'ongoing',
          startedAt: call.started_at
        },
        jitsi: {
          token: jitsiToken,
          meetingUrl,
          config: jitsiConfig
        }
      });
    } catch (error) {
      console.error('Error joining call by invite:', error);
      res.status(500).json({
        error: 'Failed to join call',
        details: error.message
      });
    }
  }
);

// ==================== LEAVE CALL ====================
router.post('/:callId/leave',
  authenticateToken,
  [param('callId').isInt()],
  validate,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { callId } = req.params;

      // Обновляем статус участника
      await query(
        `UPDATE call_participants
         SET status = 'left', left_at = CURRENT_TIMESTAMP
         WHERE call_id = $1 AND user_id = $2`,
        [callId, userId]
      );

      // Логируем событие
      await query(
        `INSERT INTO call_events (call_id, user_id, event_type)
         VALUES ($1, $2, 'left')`,
        [callId, userId]
      );

      // Проверяем, остались ли участники в звонке
      const participantsResult = await query(
        `SELECT COUNT(*) as count
         FROM call_participants
         WHERE call_id = $1 AND status = 'joined'`,
        [callId]
      );

      const activeParticipants = parseInt(participantsResult.rows[0].count);

      // Если никого не осталось, завершаем звонок
      if (activeParticipants === 0) {
        await query(
          `UPDATE calls
           SET status = 'ended', ended_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [callId]
        );

        await query(
          `INSERT INTO call_events (call_id, event_type)
           VALUES ($1, 'ended')`,
          [callId]
        );
      }

      res.json({
        success: true,
        message: 'Successfully left the call'
      });
    } catch (error) {
      console.error('Error leaving call:', error);
      res.status(500).json({
        error: 'Failed to leave call',
        details: error.message
      });
    }
  }
);

// ==================== END CALL (Moderator only) ====================
router.post('/:callId/end',
  authenticateToken,
  [param('callId').isInt()],
  validate,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { callId } = req.params;

      // Проверяем, является ли пользователь модератором
      const participantResult = await query(
        'SELECT * FROM call_participants WHERE call_id = $1 AND user_id = $2 AND is_moderator = true',
        [callId, userId]
      );

      if (participantResult.rows.length === 0) {
        return res.status(403).json({ error: 'Only moderators can end the call' });
      }

      // Завершаем звонок
      await query(
        `UPDATE calls
         SET status = 'ended', ended_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [callId]
      );

      // Обновляем статус всех участников
      await query(
        `UPDATE call_participants
         SET status = 'left', left_at = CURRENT_TIMESTAMP
         WHERE call_id = $1 AND status = 'joined'`,
        [callId]
      );

      // Логируем событие
      await query(
        `INSERT INTO call_events (call_id, user_id, event_type)
         VALUES ($1, $2, 'ended')`,
        [callId, userId]
      );

      res.json({
        success: true,
        message: 'Call ended successfully'
      });
    } catch (error) {
      console.error('Error ending call:', error);
      res.status(500).json({
        error: 'Failed to end call',
        details: error.message
      });
    }
  }
);

// ==================== DECLINE CALL ====================
router.post('/:callId/decline',
  authenticateToken,
  [param('callId').isInt()],
  validate,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { callId } = req.params;

      // Обновляем статус участника
      await query(
        `UPDATE call_participants
         SET status = 'declined'
         WHERE call_id = $1 AND user_id = $2`,
        [callId, userId]
      );

      // Логируем событие
      await query(
        `INSERT INTO call_events (call_id, user_id, event_type)
         VALUES ($1, $2, 'declined')`,
        [callId, userId]
      );

      res.json({
        success: true,
        message: 'Call declined'
      });
    } catch (error) {
      console.error('Error declining call:', error);
      res.status(500).json({
        error: 'Failed to decline call',
        details: error.message
      });
    }
  }
);

// ==================== GET CALL DETAILS ====================
router.get('/:callId',
  authenticateToken,
  [param('callId').isInt()],
  validate,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { callId } = req.params;

      // Получаем информацию о звонке
      const callResult = await query(
        `SELECT c.*, u.name as initiator_name, u.username as initiator_username
         FROM calls c
         JOIN users u ON c.initiated_by = u.id
         WHERE c.id = $1`,
        [callId]
      );

      if (callResult.rows.length === 0) {
        return res.status(404).json({ error: 'Call not found' });
      }

      const call = callResult.rows[0];

      // Проверяем доступ пользователя
      const participantCheck = await query(
        'SELECT * FROM call_participants WHERE call_id = $1 AND user_id = $2',
        [callId, userId]
      );

      if (participantCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Получаем участников
      const participantsResult = await query(
        `SELECT cp.*, u.name, u.username, u.role
         FROM call_participants cp
         JOIN users u ON cp.user_id = u.id
         WHERE cp.call_id = $1
         ORDER BY cp.is_moderator DESC, cp.joined_at ASC`,
        [callId]
      );

      res.json({
        call: {
          id: call.id,
          roomName: call.room_name,
          callType: call.call_type,
          callMode: call.call_mode,
          status: call.status,
          initiatedBy: {
            id: call.initiated_by,
            name: call.initiator_name,
            username: call.initiator_username
          },
          chatId: call.chat_id,
          startedAt: call.started_at,
          endedAt: call.ended_at,
          duration: call.duration,
          createdAt: call.created_at
        },
        participants: participantsResult.rows.map(p => ({
          id: p.id,
          userId: p.user_id,
          name: p.name,
          username: p.username,
          role: p.role,
          status: p.status,
          isModerator: p.is_moderator,
          joinedAt: p.joined_at,
          leftAt: p.left_at,
          duration: p.duration
        }))
      });
    } catch (error) {
      console.error('Error getting call details:', error);
      res.status(500).json({
        error: 'Failed to get call details',
        details: error.message
      });
    }
  }
);

// ==================== GET CALL HISTORY ====================
router.get('/history/all',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      // Получаем историю звонков пользователя
      const callsResult = await query(
        `SELECT c.*, u.name as initiator_name,
                COUNT(DISTINCT cp.user_id) as participants_count
         FROM calls c
         JOIN users u ON c.initiated_by = u.id
         JOIN call_participants cp ON c.id = cp.call_id
         WHERE cp.user_id = $1
         GROUP BY c.id, u.name
         ORDER BY c.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      res.json({
        calls: callsResult.rows,
        limit,
        offset
      });
    } catch (error) {
      console.error('Error getting call history:', error);
      res.status(500).json({
        error: 'Failed to get call history',
        details: error.message
      });
    }
  }
);

// ==================== GET ACTIVE CALLS ====================
router.get('/active/all',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;

      // Получаем активные звонки пользователя
      const callsResult = await query(
        `SELECT c.*, u.name as initiator_name,
                COUNT(DISTINCT cp.user_id) as participants_count
         FROM calls c
         JOIN users u ON c.initiated_by = u.id
         JOIN call_participants cp ON c.id = cp.call_id
         WHERE cp.user_id = $1 AND c.status IN ('pending', 'ongoing')
         GROUP BY c.id, u.name
         ORDER BY c.created_at DESC`,
        [userId]
      );

      res.json({
        activeCalls: callsResult.rows
      });
    } catch (error) {
      console.error('Error getting active calls:', error);
      res.status(500).json({
        error: 'Failed to get active calls',
        details: error.message
      });
    }
  }
);

module.exports = router;
