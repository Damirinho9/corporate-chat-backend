// socket/callSignaling.js
const { query } = require('../config/database');

/**
 * Инициализация обработчиков событий звонков
 * @param {object} io - Socket.IO server instance
 * @param {object} socket - Socket instance
 */
function initializeCallHandlers(io, socket) {
  const userId = socket.user.id;

  // ==================== INITIATE CALL ====================
  socket.on('call_initiate', async (data) => {
    try {
      const { callId, participants } = data;

      console.log(`[Call] User ${userId} initiated call ${callId} with participants:`, participants);

      // Получаем информацию о звонке
      const callResult = await query(
        `SELECT c.*, u.name as initiator_name
         FROM calls c
         JOIN users u ON c.initiated_by = u.id
         WHERE c.id = $1`,
        [callId]
      );

      if (callResult.rows.length === 0) {
        socket.emit('call_error', { message: 'Call not found' });
        return;
      }

      const call = callResult.rows[0];

      // Отправляем уведомление всем участникам (кроме инициатора)
      for (const participantId of participants) {
        if (participantId !== userId) {
          // Отправляем через Socket.IO если пользователь онлайн
          io.to(`user_${participantId}`).emit('call_incoming', {
            callId: call.id,
            roomName: call.room_name,
            callType: call.call_type,
            callMode: call.call_mode,
            initiatedBy: {
              id: call.initiated_by,
              name: call.initiator_name
            },
            timestamp: new Date()
          });

          console.log(`[Call] Sent incoming call notification to user ${participantId}`);
        }
      }

      // Подтверждаем инициатору
      socket.emit('call_initiated', {
        callId: call.id,
        success: true
      });
    } catch (error) {
      console.error('[Call] Error in call_initiate:', error);
      socket.emit('call_error', { message: 'Failed to initiate call' });
    }
  });

  // ==================== ACCEPT CALL ====================
  socket.on('call_accept', async (data) => {
    try {
      const { callId } = data;

      console.log(`[Call] User ${userId} accepted call ${callId}`);

      // Получаем информацию о звонке и участниках
      const callResult = await query(
        'SELECT * FROM calls WHERE id = $1',
        [callId]
      );

      if (callResult.rows.length === 0) {
        socket.emit('call_error', { message: 'Call not found' });
        return;
      }

      const call = callResult.rows[0];

      // Получаем всех участников звонка
      const participantsResult = await query(
        `SELECT cp.user_id, u.name
         FROM call_participants cp
         JOIN users u ON cp.user_id = u.id
         WHERE cp.call_id = $1`,
        [callId]
      );

      // Уведомляем всех участников, что пользователь принял звонок
      participantsResult.rows.forEach(participant => {
        io.to(`user_${participant.user_id}`).emit('call_participant_accepted', {
          callId: call.id,
          userId: userId,
          userName: socket.user.name
        });
      });

      console.log(`[Call] Notified participants that user ${userId} accepted call`);
    } catch (error) {
      console.error('[Call] Error in call_accept:', error);
      socket.emit('call_error', { message: 'Failed to accept call' });
    }
  });

  // ==================== DECLINE CALL ====================
  socket.on('call_decline', async (data) => {
    try {
      const { callId } = data;

      console.log(`[Call] User ${userId} declined call ${callId}`);

      // Получаем информацию о звонке
      const callResult = await query(
        'SELECT * FROM calls WHERE id = $1',
        [callId]
      );

      if (callResult.rows.length === 0) {
        socket.emit('call_error', { message: 'Call not found' });
        return;
      }

      const call = callResult.rows[0];

      // Уведомляем инициатора о declined
      io.to(`user_${call.initiated_by}`).emit('call_participant_declined', {
        callId: call.id,
        userId: userId,
        userName: socket.user.name
      });

      console.log(`[Call] Notified initiator that user ${userId} declined call`);
    } catch (error) {
      console.error('[Call] Error in call_decline:', error);
      socket.emit('call_error', { message: 'Failed to decline call' });
    }
  });

  // ==================== JOIN CALL ====================
  socket.on('call_join', async (data) => {
    try {
      const { callId } = data;

      console.log(`[Call] User ${userId} joined call ${callId}`);

      // Присоединяемся к комнате звонка для real-time коммуникации
      socket.join(`call_${callId}`);

      // Получаем информацию о звонке
      const callResult = await query(
        'SELECT * FROM calls WHERE id = $1',
        [callId]
      );

      if (callResult.rows.length === 0) {
        socket.emit('call_error', { message: 'Call not found' });
        return;
      }

      // Уведомляем всех в комнате звонка
      socket.to(`call_${callId}`).emit('call_participant_joined', {
        callId: callId,
        userId: userId,
        userName: socket.user.name,
        userRole: socket.user.role
      });

      // Получаем текущих участников
      const participantsResult = await query(
        `SELECT cp.user_id, u.name, u.role, cp.is_moderator, cp.status
         FROM call_participants cp
         JOIN users u ON cp.user_id = u.id
         WHERE cp.call_id = $1 AND cp.status = 'joined'`,
        [callId]
      );

      // Отправляем текущему пользователю список участников
      socket.emit('call_participants_list', {
        callId: callId,
        participants: participantsResult.rows.map(p => ({
          userId: p.user_id,
          name: p.name,
          role: p.role,
          isModerator: p.is_moderator,
          status: p.status
        }))
      });

      console.log(`[Call] User ${userId} joined call room, notified ${participantsResult.rows.length} participants`);
    } catch (error) {
      console.error('[Call] Error in call_join:', error);
      socket.emit('call_error', { message: 'Failed to join call' });
    }
  });

  // ==================== LEAVE CALL ====================
  socket.on('call_leave', async (data) => {
    try {
      const { callId } = data;

      console.log(`[Call] User ${userId} left call ${callId}`);

      // Покидаем комнату звонка
      socket.leave(`call_${callId}`);

      // Уведомляем остальных участников
      socket.to(`call_${callId}`).emit('call_participant_left', {
        callId: callId,
        userId: userId,
        userName: socket.user.name
      });

      console.log(`[Call] Notified participants that user ${userId} left call`);
    } catch (error) {
      console.error('[Call] Error in call_leave:', error);
      socket.emit('call_error', { message: 'Failed to leave call' });
    }
  });

  // ==================== END CALL (Moderator only) ====================
  socket.on('call_end', async (data) => {
    try {
      const { callId } = data;

      console.log(`[Call] User ${userId} attempting to end call ${callId}`);

      // Проверяем, является ли пользователь модератором
      const participantResult = await query(
        'SELECT * FROM call_participants WHERE call_id = $1 AND user_id = $2',
        [callId, userId]
      );

      if (participantResult.rows.length === 0 || !participantResult.rows[0].is_moderator) {
        socket.emit('call_error', { message: 'Only moderators can end the call' });
        return;
      }

      // Уведомляем всех участников о завершении звонка
      io.to(`call_${callId}`).emit('call_ended', {
        callId: callId,
        endedBy: {
          id: userId,
          name: socket.user.name
        },
        timestamp: new Date()
      });

      console.log(`[Call] Call ${callId} ended by moderator ${userId}`);
    } catch (error) {
      console.error('[Call] Error in call_end:', error);
      socket.emit('call_error', { message: 'Failed to end call' });
    }
  });

  // ==================== CALL STATUS UPDATE ====================
  socket.on('call_status_update', async (data) => {
    try {
      const { callId, status } = data; // status: 'audio_muted', 'video_off', 'screen_sharing', etc.

      console.log(`[Call] User ${userId} status update in call ${callId}:`, status);

      // Уведомляем других участников об изменении статуса
      socket.to(`call_${callId}`).emit('call_participant_status_update', {
        callId: callId,
        userId: userId,
        userName: socket.user.name,
        status: status
      });
    } catch (error) {
      console.error('[Call] Error in call_status_update:', error);
    }
  });

  // ==================== CALL RECORDING STARTED ====================
  socket.on('call_recording_started', async (data) => {
    try {
      const { callId } = data;

      console.log(`[Call] Recording started for call ${callId} by user ${userId}`);

      // Уведомляем всех участников о начале записи
      io.to(`call_${callId}`).emit('call_recording_status', {
        callId: callId,
        recording: true,
        startedBy: {
          id: userId,
          name: socket.user.name
        }
      });
    } catch (error) {
      console.error('[Call] Error in call_recording_started:', error);
    }
  });

  // ==================== CALL RECORDING STOPPED ====================
  socket.on('call_recording_stopped', async (data) => {
    try {
      const { callId } = data;

      console.log(`[Call] Recording stopped for call ${callId}`);

      // Уведомляем всех участников об остановке записи
      io.to(`call_${callId}`).emit('call_recording_status', {
        callId: callId,
        recording: false
      });
    } catch (error) {
      console.error('[Call] Error in call_recording_stopped:', error);
    }
  });
}

module.exports = {
  initializeCallHandlers
};
