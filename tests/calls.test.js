/*
 * Автоматический тест системы звонков (audio/video calls).
 *
 * Проверяет:
 * 1. ✅ Создание звонка (start_call): БД запись, WebSocket события
 * 2. ✅ Принятие звонка (accept_call): обновление БД, call_participants
 * 3. ✅ Отклонение звонка (reject_call): статус в БД
 * 4. ✅ Завершение звонка (end_call): ended_at, длительность
 * 5. ✅ Блокировка дубликатов звонков (active call check)
 * 6. ✅ Проверка call_events логирования
 */

process.env.NODE_ENV = 'test';
process.env.USE_IN_MEMORY_DB = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const path = require('path');

// Подменяем модуль базы данных на in-memory реализацию
const databaseModulePath = path.resolve(__dirname, '..', 'config', 'database.js');
const inMemoryDb = require('./utils/inMemoryDatabase');
require.cache[databaseModulePath] = { exports: inMemoryDb };

const { query } = require('../config/database');
const seedDatabase = require('../database/seed');

// Создаём мок socket объектов
function createMockSocket(userId, io) {
    const emittedEvents = [];

    return {
        id: `socket-${userId}`,
        userId,
        emittedEvents,
        rooms: new Set(),

        emit(event, data) {
            emittedEvents.push({ event, data, target: 'self' });
            return this;
        },

        join(room) {
            this.rooms.add(room);
            return this;
        },

        leave(room) {
            this.rooms.delete(room);
            return this;
        },

        to(room) {
            return {
                emit: (event, data) => {
                    emittedEvents.push({ event, data, target: room });
                }
            };
        }
    };
}

function createMockIo() {
    const emittedEvents = [];

    return {
        emittedEvents,

        to(room) {
            return {
                emit: (event, data) => {
                    emittedEvents.push({ event, data, target: room });
                }
            };
        }
    };
}

// Имитация обработчика start_call
async function handleStartCall(socket, io, data) {
    const { chatId, type } = data;
    const userId = socket.userId;

    // Проверка доступа к чату
    const chatAccess = await query(`
        SELECT 1 FROM chat_participants
        WHERE chat_id = $1 AND user_id = $2
    `, [chatId, userId]);

    if (chatAccess.rowCount === 0) {
        socket.emit('error', { message: 'No access to chat' });
        return;
    }

    // Проверка активных звонков
    const activeCall = await query(`
        SELECT id FROM calls
        WHERE chat_id = $1 AND status IN ('ringing', 'ongoing')
        LIMIT 1
    `, [chatId]);

    if (activeCall.rows.length > 0) {
        socket.emit('error', { message: 'Call already in progress' });
        return;
    }

    // Создание звонка
    const roomName = `corporate-chat-${chatId}-${Date.now()}`;
    const callResult = await query(`
        INSERT INTO calls (chat_id, room_name, type, initiated_by, status)
        VALUES ($1, $2, $3, $4, 'ringing')
        RETURNING *
    `, [chatId, roomName, type || 'video', userId]);

    const call = callResult.rows[0];

    // Логирование события
    await query(`
        INSERT INTO call_events (call_id, user_id, event_type)
        VALUES ($1, $2, 'created')
    `, [call.id, userId]);

    // Уведомить инициатора
    socket.emit('call_created', {
        callId: call.id,
        roomName: call.room_name,
        type: call.type,
        chatId
    });

    // Получить участников чата (кроме инициатора)
    const participants = await query(`
        SELECT u.id, u.name
        FROM chat_participants cp
        JOIN users u ON u.id = cp.user_id
        WHERE cp.chat_id = $1 AND u.id != $2
    `, [chatId, userId]);

    // Получить имя инициатора
    const initiator = await query('SELECT name FROM users WHERE id = $1', [userId]);
    const initiatorName = initiator.rows[0]?.name || 'Unknown';

    // Уведомить всех участников
    io.to(`chat_${chatId}`).emit('incoming_call', {
        callId: call.id,
        roomName: call.room_name,
        type: call.type,
        chatId,
        initiator: { id: userId, name: initiatorName }
    });
}

// Имитация обработчика accept_call
async function handleAcceptCall(socket, io, data) {
    const { callId } = data;
    const userId = socket.userId;

    // Получить информацию о звонке
    const callResult = await query(`
        SELECT * FROM calls WHERE id = $1
    `, [callId]);

    if (callResult.rowCount === 0) {
        socket.emit('error', { message: 'Call not found' });
        return;
    }

    const call = callResult.rows[0];

    // Добавить участника
    await query(`
        INSERT INTO call_participants (call_id, user_id, status)
        VALUES ($1, $2, $3)
    `, [callId, userId, 'joined']);

    // Обновить статус звонка
    await query(`
        UPDATE calls SET status = $1, started_at = NOW()
        WHERE id = $2
    `, ['ongoing', callId]);

    // Логирование
    await query(`
        INSERT INTO call_events (call_id, user_id, event_type)
        VALUES ($1, $2, 'accepted')
    `, [callId, userId]);

    // Подтвердить принимающему
    socket.emit('call_accepted_confirmed', {
        callId,
        roomName: call.room_name,
        type: call.type,
        chatId: call.chat_id
    });

    // Уведомить всех
    const acceptor = await query('SELECT name FROM users WHERE id = $1', [userId]);
    io.to(`chat_${call.chat_id}`).emit('call_accepted', {
        callId,
        user: { id: userId, name: acceptor.rows[0]?.name }
    });
}

// Имитация обработчика reject_call
async function handleRejectCall(socket, io, data) {
    const { callId, reason } = data;
    const userId = socket.userId;

    const callResult = await query(`SELECT * FROM calls WHERE id = $1`, [callId]);
    if (callResult.rowCount === 0) {
        socket.emit('error', { message: 'Call not found' });
        return;
    }

    const call = callResult.rows[0];

    // Обновить статус
    await query(`UPDATE calls SET status = $1 WHERE id = $2`, ['rejected', callId]);

    // Логирование
    await query(`
        INSERT INTO call_events (call_id, user_id, event_type, metadata)
        VALUES ($1, $2, 'rejected', $3)
    `, [callId, userId, JSON.stringify({ reason: reason || 'user_declined' })]);

    // Уведомить всех
    const rejector = await query('SELECT name FROM users WHERE id = $1', [userId]);
    io.to(`chat_${call.chat_id}`).emit('call_rejected', {
        callId,
        reason: reason || 'user_declined',
        user: { id: userId, name: rejector.rows[0]?.name }
    });
}

// Имитация обработчика end_call
async function handleEndCall(socket, io, data) {
    const { callId } = data;
    const userId = socket.userId;

    const callResult = await query(`SELECT * FROM calls WHERE id = $1`, [callId]);
    if (callResult.rowCount === 0) {
        socket.emit('error', { message: 'Call not found' });
        return;
    }

    const call = callResult.rows[0];

    // Обновить статус
    await query(`
        UPDATE calls
        SET status = $1, ended_at = NOW()
        WHERE id = $2
    `, ['ended', callId]);

    // Логирование
    await query(`
        INSERT INTO call_events (call_id, user_id, event_type)
        VALUES ($1, $2, 'ended')
    `, [callId, userId]);

    // Получить длительность
    const updatedCall = await query(`
        SELECT
            EXTRACT(EPOCH FROM (ended_at - started_at)) as duration
        FROM calls WHERE id = $1
    `, [callId]);

    const duration = updatedCall.rows[0]?.duration || 0;

    // Уведомить всех
    io.to(`chat_${call.chat_id}`).emit('call_ended', {
        callId,
        duration: Math.round(duration)
    });
}

// Главная функция тестов
(async () => {
    try {
        console.log('📞 === ТЕСТ СИСТЕМЫ ЗВОНКОВ ===\n');

        console.log('🧪 Подготовка тестовой базы данных...');
        await seedDatabase();

        // Получить тестовых пользователей
        const admin = (await query('SELECT id, name FROM users WHERE username = $1', ['admin'])).rows[0];
        const rop = (await query('SELECT id, name FROM users WHERE username = $1', ['rop_sales'])).rows[0];

        if (!admin || !rop) {
            throw new Error('Тестовые пользователи не найдены');
        }

        // Создать direct чат между admin и rop
        const chatResult = await query(`
            INSERT INTO chats (type, name, created_by)
            VALUES ('direct', 'Test Direct Chat', $1)
            RETURNING *
        `, [admin.id]);

        const directChat = chatResult.rows[0];

        // Добавить участников
        await query(`
            INSERT INTO chat_participants (chat_id, user_id, joined_at)
            VALUES ($1, $2, NOW()), ($1, $3, NOW())
        `, [directChat.id, admin.id, rop.id]);

        console.log(`✅ Создан direct чат ID=${directChat.id} между ${admin.name} и ${rop.name}\n`);

        // ============================================================
        // ТЕСТ 1: Создание звонка (start_call)
        // ============================================================
        console.log('🧪 ТЕСТ 1: Создание видеозвонка (start_call)');

        const io = createMockIo();
        const adminSocket = createMockSocket(admin.id, io);

        await handleStartCall(adminSocket, io, {
            chatId: directChat.id,
            type: 'video'
        });

        // Проверка: звонок создан в БД
        const callsInDb = await query(`
            SELECT * FROM calls
            WHERE chat_id = $1 AND status = 'ringing'
        `, [directChat.id]);

        if (callsInDb.rowCount === 0) {
            throw new Error('❌ Звонок не создан в БД');
        }

        const createdCall = callsInDb.rows[0];
        console.log(`  ✅ Звонок создан в БД: ID=${createdCall.id}, room_name=${createdCall.room_name}`);

        // Проверка: call_events
        const callEvents = await query(`
            SELECT * FROM call_events
            WHERE call_id = $1 AND event_type = 'created'
        `, [createdCall.id]);

        if (callEvents.rowCount === 0) {
            throw new Error('❌ Событие created не записано в call_events');
        }
        console.log('  ✅ Событие "created" записано в call_events');

        // Проверка: WebSocket события
        const callCreatedEvent = adminSocket.emittedEvents.find(e => e.event === 'call_created');
        if (!callCreatedEvent) {
            throw new Error('❌ Событие call_created не отправлено инициатору');
        }
        console.log('  ✅ Событие call_created отправлено инициатору');

        const incomingCallEvent = io.emittedEvents.find(e => e.event === 'incoming_call');
        if (!incomingCallEvent) {
            throw new Error('❌ Событие incoming_call не отправлено участникам');
        }
        console.log('  ✅ Событие incoming_call отправлено участникам чата\n');

        // ============================================================
        // ТЕСТ 2: Блокировка дубликатов
        // ============================================================
        console.log('🧪 ТЕСТ 2: Блокировка дубликатов звонков');

        const adminSocket2 = createMockSocket(admin.id, io);
        await handleStartCall(adminSocket2, io, {
            chatId: directChat.id,
            type: 'audio'
        });

        const errorEvent = adminSocket2.emittedEvents.find(e => e.event === 'error');
        if (!errorEvent || errorEvent.data.message !== 'Call already in progress') {
            throw new Error('❌ Дубликат звонка не заблокирован');
        }
        console.log('  ✅ Попытка создать дубликат звонка заблокирована\n');

        // ============================================================
        // ТЕСТ 3: Принятие звонка (accept_call)
        // ============================================================
        console.log('🧪 ТЕСТ 3: Принятие звонка (accept_call)');

        const ropSocket = createMockSocket(rop.id, io);
        await handleAcceptCall(ropSocket, io, { callId: createdCall.id });

        // Проверка: статус обновлён
        const acceptedCall = await query(`
            SELECT status, started_at FROM calls WHERE id = $1
        `, [createdCall.id]);

        if (acceptedCall.rows[0].status !== 'ongoing') {
            throw new Error(`❌ Статус звонка не обновлён на ongoing (текущий: ${acceptedCall.rows[0].status})`);
        }
        console.log('  ✅ Статус звонка обновлён на "ongoing"');

        if (!acceptedCall.rows[0].started_at) {
            throw new Error('❌ started_at не установлен');
        }
        console.log('  ✅ started_at установлен');

        // Проверка: call_participants
        const participants = await query(`
            SELECT * FROM call_participants
            WHERE call_id = $1 AND user_id = $2 AND status = 'joined'
        `, [createdCall.id, rop.id]);

        if (participants.rowCount === 0) {
            throw new Error('❌ Участник не добавлен в call_participants');
        }
        console.log('  ✅ Участник добавлен в call_participants');

        // Проверка: call_events
        const acceptEvents = await query(`
            SELECT * FROM call_events
            WHERE call_id = $1 AND event_type = 'accepted'
        `, [createdCall.id]);

        if (acceptEvents.rowCount === 0) {
            throw new Error('❌ Событие accepted не записано');
        }
        console.log('  ✅ Событие "accepted" записано в call_events');

        // Проверка: WebSocket события
        const confirmedEvent = ropSocket.emittedEvents.find(e => e.event === 'call_accepted_confirmed');
        if (!confirmedEvent) {
            throw new Error('❌ Событие call_accepted_confirmed не отправлено');
        }
        console.log('  ✅ Событие call_accepted_confirmed отправлено принимающему\n');

        // ============================================================
        // ТЕСТ 4: Завершение звонка (end_call)
        // ============================================================
        console.log('🧪 ТЕСТ 4: Завершение звонка (end_call)');

        // Подождём 2 секунды для длительности
        await new Promise(resolve => setTimeout(resolve, 2000));

        await handleEndCall(adminSocket, io, { callId: createdCall.id });

        // Проверка: статус и ended_at
        const endedCall = await query(`
            SELECT status, ended_at, started_at,
                   EXTRACT(EPOCH FROM (ended_at - started_at)) as duration
            FROM calls WHERE id = $1
        `, [createdCall.id]);

        if (endedCall.rows[0].status !== 'ended') {
            throw new Error(`❌ Статус не обновлён на ended (текущий: ${endedCall.rows[0].status})`);
        }
        console.log('  ✅ Статус звонка обновлён на "ended"');

        if (!endedCall.rows[0].ended_at) {
            throw new Error('❌ ended_at не установлен');
        }
        console.log('  ✅ ended_at установлен');

        const duration = Math.round(endedCall.rows[0].duration);
        if (duration < 1) {
            throw new Error(`❌ Длительность некорректна: ${duration} сек`);
        }
        console.log(`  ✅ Длительность звонка: ${duration} сек`);

        // Проверка: call_events
        const endEvents = await query(`
            SELECT * FROM call_events
            WHERE call_id = $1 AND event_type = 'ended'
        `, [createdCall.id]);

        if (endEvents.rowCount === 0) {
            throw new Error('❌ Событие ended не записано');
        }
        console.log('  ✅ Событие "ended" записано в call_events\n');

        // ============================================================
        // ТЕСТ 5: Отклонение звонка (reject_call)
        // ============================================================
        console.log('🧪 ТЕСТ 5: Отклонение звонка (reject_call)');

        // Создать новый звонок
        const newCallResult = await query(`
            INSERT INTO calls (chat_id, room_name, type, initiated_by, status)
            VALUES ($1, $2, 'audio', $3, 'ringing')
            RETURNING *
        `, [directChat.id, `corporate-chat-${directChat.id}-${Date.now()}`, admin.id]);

        const newCall = newCallResult.rows[0];

        // Отклонить
        await handleRejectCall(ropSocket, io, {
            callId: newCall.id,
            reason: 'busy'
        });

        // Проверка: статус
        const rejectedCall = await query(`
            SELECT status FROM calls WHERE id = $1
        `, [newCall.id]);

        if (rejectedCall.rows[0].status !== 'rejected') {
            throw new Error(`❌ Статус не обновлён на rejected (текущий: ${rejectedCall.rows[0].status})`);
        }
        console.log('  ✅ Статус звонка обновлён на "rejected"');

        // Проверка: call_events с metadata
        const rejectEvents = await query(`
            SELECT metadata FROM call_events
            WHERE call_id = $1 AND event_type = 'rejected'
        `, [newCall.id]);

        if (rejectEvents.rowCount === 0) {
            throw new Error('❌ Событие rejected не записано');
        }

        const metadata = rejectEvents.rows[0].metadata;
        if (!metadata || !metadata.reason) {
            throw new Error('❌ metadata.reason не записан в call_events');
        }
        console.log(`  ✅ Событие "rejected" записано с причиной: ${metadata.reason}\n`);

        // ============================================================
        // ИТОГОВАЯ ПРОВЕРКА: Все события в call_events
        // ============================================================
        console.log('🧪 ИТОГОВАЯ ПРОВЕРКА: Полнота логирования');

        const allEvents = await query(`
            SELECT event_type, COUNT(*) as count
            FROM call_events
            GROUP BY event_type
            ORDER BY event_type
        `);

        console.log('  Записанные события в call_events:');
        allEvents.rows.forEach(row => {
            console.log(`    - ${row.event_type}: ${row.count}`);
        });

        const requiredEvents = ['created', 'accepted', 'rejected', 'ended'];
        const recordedEvents = allEvents.rows.map(r => r.event_type);

        for (const eventType of requiredEvents) {
            if (!recordedEvents.includes(eventType)) {
                throw new Error(`❌ Событие ${eventType} не найдено в call_events`);
            }
        }

        console.log('  ✅ Все типы событий присутствуют\n');

        // ============================================================
        // ФИНАЛЬНАЯ ПРОВЕРКА: Консистентность БД
        // ============================================================
        console.log('🧪 ФИНАЛЬНАЯ ПРОВЕРКА: Консистентность БД');

        const callsCount = await query('SELECT COUNT(*) FROM calls');
        console.log(`  Всего звонков: ${callsCount.rows[0].count}`);

        const participantsCount = await query('SELECT COUNT(*) FROM call_participants');
        console.log(`  Всего участников: ${participantsCount.rows[0].count}`);

        const eventsCount = await query('SELECT COUNT(*) FROM call_events');
        console.log(`  Всего событий: ${eventsCount.rows[0].count}`);

        // Проверка: все call_events связаны с существующими calls
        const orphanEvents = await query(`
            SELECT COUNT(*) FROM call_events ce
            LEFT JOIN calls c ON c.id = ce.call_id
            WHERE c.id IS NULL
        `);

        if (parseInt(orphanEvents.rows[0].count) > 0) {
            throw new Error('❌ Найдены события без связанных звонков (orphan events)');
        }
        console.log('  ✅ Все события связаны с существующими звонками');

        // Проверка: все call_participants связаны с существующими calls
        const orphanParticipants = await query(`
            SELECT COUNT(*) FROM call_participants cp
            LEFT JOIN calls c ON c.id = cp.call_id
            WHERE c.id IS NULL
        `);

        if (parseInt(orphanParticipants.rows[0].count) > 0) {
            throw new Error('❌ Найдены участники без связанных звонков');
        }
        console.log('  ✅ Все участники связаны с существующими звонками\n');

        // ============================================================
        // УСПЕХ
        // ============================================================
        console.log('✅ === ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО ===');
        console.log('');
        console.log('📊 Проверено:');
        console.log('  ✅ Создание звонка (start_call)');
        console.log('  ✅ Блокировка дубликатов звонков');
        console.log('  ✅ Принятие звонка (accept_call)');
        console.log('  ✅ Завершение звонка (end_call) с длительностью');
        console.log('  ✅ Отклонение звонка (reject_call)');
        console.log('  ✅ Логирование всех событий в call_events');
        console.log('  ✅ Консистентность БД (foreign keys, orphans)');
        console.log('  ✅ WebSocket события (emit to initiator/participants)');
        console.log('');

        process.exit(0);

    } catch (error) {
        console.error('');
        console.error('❌ === ТЕСТ ПРОВАЛЕН ===');
        console.error(`Ошибка: ${error.message}`);
        console.error('');
        console.error(error.stack);
        process.exit(1);
    }
})();
