# План реализации системы аудио/видеозвонков

## Текущее состояние (проблемы)

### ✅ Что работает:
- Кнопки аудио/видео звонка в UI
- Открытие Jitsi Meet для инициатора
- Логирование звонка в БД (POST /api/calls)
- Таблицы: calls, call_participants, call_events

### ❌ Что НЕ работает:
- Уведомление участникам чата о входящем звонке
- Возможность принять/отклонить звонок
- Звуковые уведомления (рингтон)
- Индикация активного звонка в чате
- Присоединение к активному звонку
- Завершение звонка с уведомлением всех

---

## Полный план реализации

### Этап 1: WebSocket события (Backend)

**Файл:** `socket/socketHandler.js`

#### События для отправки (emit):

1. **`incoming_call`** - уведомление о входящем звонке
   ```javascript
   {
     callId: 123,
     chatId: 456,
     roomName: "corporate-chat-456-1234567890",
     type: "video" | "audio",
     initiator: {
       id: 1,
       name: "Иван Иванов",
       avatar: null
     },
     participants: [2, 3, 4], // кому отправить
     timestamp: "2025-12-05T12:00:00Z"
   }
   ```

2. **`call_accepted`** - звонок принят участником
   ```javascript
   {
     callId: 123,
     userId: 2,
     userName: "Мария Петрова",
     timestamp: "2025-12-05T12:00:15Z"
   }
   ```

3. **`call_rejected`** - звонок отклонен участником
   ```javascript
   {
     callId: 123,
     userId: 3,
     userName: "Сергей Смирнов",
     reason: "busy" | "declined" | "timeout",
     timestamp: "2025-12-05T12:00:10Z"
   }
   ```

4. **`call_ended`** - звонок завершен
   ```javascript
   {
     callId: 123,
     endedBy: 1,
     userName: "Иван Иванов",
     duration: 120, // секунды
     timestamp: "2025-12-05T12:02:00Z"
   }
   ```

5. **`call_participant_joined`** - участник присоединился
   ```javascript
   {
     callId: 123,
     userId: 4,
     userName: "Анна Кузнецова",
     timestamp: "2025-12-05T12:00:30Z"
   }
   ```

6. **`call_participant_left`** - участник вышел
   ```javascript
   {
     callId: 123,
     userId: 4,
     userName: "Анна Кузнецова",
     timestamp: "2025-12-05T12:01:45Z"
   }
   ```

#### События для приема (on):

1. **`start_call`** - инициация звонка
   ```javascript
   {
     chatId: 456,
     type: "video" | "audio"
   }
   ```

2. **`accept_call`** - принятие звонка
   ```javascript
   {
     callId: 123
   }
   ```

3. **`reject_call`** - отклонение звонка
   ```javascript
   {
     callId: 123,
     reason: "busy" | "declined"
   }
   ```

4. **`end_call`** - завершение звонка
   ```javascript
   {
     callId: 123
   }
   ```

5. **`join_call`** - присоединение к активному звонку
   ```javascript
   {
     callId: 123
   }
   ```

---

### Этап 2: UI компоненты (Frontend)

**Файл:** `public/index.html`

#### 2.1. Модальное окно входящего звонка

```html
<div id="incomingCallModal" class="incoming-call-modal" style="display: none;">
    <div class="incoming-call-content">
        <div class="incoming-call-header">
            <div class="caller-avatar">И</div>
            <h3 class="caller-name">Иван Иванов</h3>
            <p class="call-type">📹 Видеозвонок</p>
        </div>
        <div class="incoming-call-actions">
            <button class="btn-reject" onclick="rejectCall()">
                ❌ Отклонить
            </button>
            <button class="btn-accept" onclick="acceptCall()">
                ✅ Принять
            </button>
        </div>
    </div>
</div>
```

**CSS:**
- Анимация пульсации для аватара
- Полноэкранная overlay
- z-index выше всего остального
- Адаптивный дизайн

#### 2.2. Индикатор активного звонка в шапке чата

```html
<div id="activeCallIndicator" class="active-call-indicator" style="display: none;">
    <span class="call-icon">📞</span>
    <span class="call-status">Звонок идёт (2 участника)</span>
    <button class="btn-join-call" onclick="joinActiveCall()">
        Присоединиться
    </button>
    <button class="btn-end-call" onclick="endCall()">
        Завершить
    </button>
</div>
```

**Логика показа:**
- Показывать если в чате есть активный звонок (status = 'ongoing')
- "Присоединиться" только для групповых чатов
- "Завершить" только для инициатора или админа

#### 2.3. Обновление кнопок звонков

```javascript
// Disable call buttons during active call
function updateCallButtons(callActive) {
    const audioBtn = document.getElementById('audioCallBtn');
    const videoBtn = document.getElementById('videoCallBtn');

    if (callActive) {
        audioBtn.disabled = true;
        videoBtn.disabled = true;
        audioBtn.title = "Звонок уже идёт";
        videoBtn.title = "Звонок уже идёт";
    } else {
        audioBtn.disabled = false;
        videoBtn.disabled = false;
        audioBtn.title = "Аудиозвонок";
        videoBtn.title = "Видеозвонок";
    }
}
```

---

### Этап 3: Звуковые уведомления

**Файл:** `public/index.html`

#### Звуки:

1. **Рингтон входящего звонка** - 30 сек loop
   - Генерируем через Web Audio API или используем audio file
   - Источник: https://freesound.org/ или генерация

2. **Звук принятия звонка** - короткий beep

3. **Звук отклонения/завершения** - короткий звук

```javascript
// Ringtone generation with Web Audio API
function playRingtone() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 440; // A note
    gainNode.gain.value = 0.3;

    oscillator.start();

    // Loop pattern: 2 sec on, 1 sec off
    let playing = true;
    const ringtoneInterval = setInterval(() => {
        if (!playing) {
            clearInterval(ringtoneInterval);
            oscillator.stop();
            return;
        }
        // Toggle on/off pattern
    }, 3000);

    return () => {
        playing = false;
        clearInterval(ringtoneInterval);
        oscillator.stop();
    };
}

// Store stop function globally
let stopRingtone = null;
```

---

### Этап 4: Логика обработки звонков

**Файл:** `public/index.html`

#### 4.1. Инициация звонка (звонящий)

```javascript
async function startJitsiCall(withVideo = true) {
    // 1. Emit socket event to backend
    socket.emit('start_call', {
        chatId: currentChatId,
        type: withVideo ? 'video' : 'audio'
    });

    // 2. Wait for room_name from backend
    socket.once('call_created', (data) => {
        const { callId, roomName } = data;

        // 3. Open Jitsi for initiator immediately
        openJitsiModal(roomName, withVideo, callId);

        // 4. Show "calling..." state
        showCallStatus('Вызов...', callId);
    });
}
```

#### 4.2. Прием входящего звонка (получатель)

```javascript
socket.on('incoming_call', (data) => {
    const { callId, chatId, roomName, type, initiator } = data;

    // 1. Show incoming call modal
    showIncomingCallModal({
        callId,
        callerName: initiator.name,
        callType: type,
        chatId
    });

    // 2. Play ringtone
    stopRingtone = playRingtone();

    // 3. Set timeout (30 seconds)
    const timeoutId = setTimeout(() => {
        // Auto-reject after 30 sec
        rejectCall(callId, 'timeout');
    }, 30000);

    // Store timeout to clear on accept/reject
    window.currentCallTimeout = timeoutId;
    window.currentIncomingCall = { callId, roomName, type };
});
```

#### 4.3. Принятие звонка

```javascript
function acceptCall() {
    const { callId, roomName, type } = window.currentIncomingCall;

    // 1. Stop ringtone
    if (stopRingtone) stopRingtone();

    // 2. Clear timeout
    clearTimeout(window.currentCallTimeout);

    // 3. Emit acceptance to backend
    socket.emit('accept_call', { callId });

    // 4. Close incoming call modal
    closeIncomingCallModal();

    // 5. Open Jitsi
    openJitsiModal(roomName, type === 'video', callId);

    // 6. Cleanup
    window.currentIncomingCall = null;
}
```

#### 4.4. Отклонение звонка

```javascript
function rejectCall(callId, reason = 'declined') {
    // 1. Stop ringtone
    if (stopRingtone) stopRingtone();

    // 2. Clear timeout
    clearTimeout(window.currentCallTimeout);

    // 3. Emit rejection to backend
    socket.emit('reject_call', { callId, reason });

    // 4. Close modal
    closeIncomingCallModal();

    // 5. Show toast
    showToast('Звонок отклонён', 'info');

    // 6. Cleanup
    window.currentIncomingCall = null;
}
```

#### 4.5. Завершение звонка

```javascript
function endCall() {
    if (!window.currentActiveCall) return;

    const { callId } = window.currentActiveCall;

    // 1. Emit to backend
    socket.emit('end_call', { callId });

    // 2. Close Jitsi modal
    closeModal();

    // 3. Hide active call indicator
    hideActiveCallIndicator();

    // 4. Show toast
    showToast('Звонок завершён', 'info');

    // 5. Cleanup
    window.currentActiveCall = null;
}
```

#### 4.6. Присоединение к активному звонку

```javascript
function joinActiveCall() {
    if (!window.currentActiveCall) return;

    const { callId, roomName, type } = window.currentActiveCall;

    // 1. Emit to backend
    socket.emit('join_call', { callId });

    // 2. Open Jitsi
    openJitsiModal(roomName, type === 'video', callId);
}
```

---

### Этап 5: Backend обработчики

**Файл:** `socket/socketHandler.js`

#### 5.1. Обработчик start_call

```javascript
socket.on('start_call', async (data) => {
    try {
        const { chatId, type } = data;
        const userId = socket.user.id;

        // 1. Check if user has access to chat
        const hasAccess = await checkChatAccess(userId, chatId);
        if (!hasAccess) {
            return socket.emit('error', { message: 'No access to chat' });
        }

        // 2. Check if there's already an active call
        const activeCall = await query(`
            SELECT id FROM calls
            WHERE chat_id = $1 AND status = 'ongoing'
        `, [chatId]);

        if (activeCall.rows.length > 0) {
            return socket.emit('error', { message: 'Call already in progress' });
        }

        // 3. Create call in database
        const roomName = `corporate-chat-${chatId}-${Date.now()}`;
        const callResult = await query(`
            INSERT INTO calls (chat_id, room_name, type, initiated_by, status)
            VALUES ($1, $2, $3, $4, 'ringing')
            RETURNING *
        `, [chatId, roomName, type, userId]);

        const callId = callResult.rows[0].id;

        // 4. Add initiator as participant
        await query(`
            INSERT INTO call_participants (call_id, user_id, status, joined_at)
            VALUES ($1, $2, 'joined', NOW())
        `, [callId, userId]);

        // 5. Get chat participants (exclude initiator)
        const participantsResult = await query(`
            SELECT user_id FROM chat_participants
            WHERE chat_id = $1 AND user_id != $2
        `, [chatId, userId]);

        const participantIds = participantsResult.rows.map(r => r.user_id);

        // 6. Notify initiator with room name
        socket.emit('call_created', {
            callId,
            roomName,
            type
        });

        // 7. Notify all other participants about incoming call
        participantIds.forEach(participantId => {
            const participantSocketId = connectedUsers.get(participantId);
            if (participantSocketId) {
                io.to(participantSocketId).emit('incoming_call', {
                    callId,
                    chatId,
                    roomName,
                    type,
                    initiator: {
                        id: userId,
                        name: socket.user.name,
                        avatar: null
                    }
                });
            }
        });

        // 8. Log event
        await query(`
            INSERT INTO call_events (call_id, event_type, user_id, metadata)
            VALUES ($1, 'call_initiated', $2, $3)
        `, [callId, userId, JSON.stringify({ type })]);

    } catch (error) {
        console.error('Start call error:', error);
        socket.emit('error', { message: 'Failed to start call' });
    }
});
```

#### 5.2. Обработчик accept_call

```javascript
socket.on('accept_call', async (data) => {
    try {
        const { callId } = data;
        const userId = socket.user.id;

        // 1. Add user as participant
        await query(`
            INSERT INTO call_participants (call_id, user_id, status, joined_at)
            VALUES ($1, $2, 'joined', NOW())
        `, [callId, userId]);

        // 2. Update call status to 'ongoing' if still 'ringing'
        await query(`
            UPDATE calls SET status = 'ongoing'
            WHERE id = $1 AND status = 'ringing'
        `, [callId]);

        // 3. Get call details
        const callResult = await query(`
            SELECT chat_id, room_name, type FROM calls WHERE id = $1
        `, [callId]);

        const { chat_id: chatId, room_name: roomName, type } = callResult.rows[0];

        // 4. Notify all participants in chat about acceptance
        io.to(`chat_${chatId}`).emit('call_accepted', {
            callId,
            userId,
            userName: socket.user.name
        });

        // 5. Log event
        await query(`
            INSERT INTO call_events (call_id, event_type, user_id)
            VALUES ($1, 'call_accepted', $2)
        `, [callId, userId]);

    } catch (error) {
        console.error('Accept call error:', error);
        socket.emit('error', { message: 'Failed to accept call' });
    }
});
```

#### 5.3. Обработчик reject_call

```javascript
socket.on('reject_call', async (data) => {
    try {
        const { callId, reason } = data;
        const userId = socket.user.id;

        // 1. Get call details
        const callResult = await query(`
            SELECT chat_id, initiated_by FROM calls WHERE id = $1
        `, [callId]);

        const { chat_id: chatId, initiated_by: initiatorId } = callResult.rows[0];

        // 2. Notify initiator about rejection
        const initiatorSocketId = connectedUsers.get(initiatorId);
        if (initiatorSocketId) {
            io.to(initiatorSocketId).emit('call_rejected', {
                callId,
                userId,
                userName: socket.user.name,
                reason
            });
        }

        // 3. Check if all participants rejected
        const participantsResult = await query(`
            SELECT COUNT(*) as total FROM chat_participants
            WHERE chat_id = $1
        `, [chatId]);

        const totalParticipants = participantsResult.rows[0].total;

        // If only 1 other participant and they rejected, end call
        if (totalParticipants === 2) {
            await query(`
                UPDATE calls SET status = 'rejected', ended_at = NOW()
                WHERE id = $1
            `, [callId]);
        }

        // 4. Log event
        await query(`
            INSERT INTO call_events (call_id, event_type, user_id, metadata)
            VALUES ($1, 'call_rejected', $2, $3)
        `, [callId, userId, JSON.stringify({ reason })]);

    } catch (error) {
        console.error('Reject call error:', error);
    }
});
```

#### 5.4. Обработчик end_call

```javascript
socket.on('end_call', async (data) => {
    try {
        const { callId } = data;
        const userId = socket.user.id;

        // 1. Update call status
        const result = await query(`
            UPDATE calls
            SET status = 'ended', ended_at = NOW()
            WHERE id = $1
            RETURNING chat_id, started_at
        `, [callId]);

        const { chat_id: chatId, started_at } = result.rows[0];
        const duration = Math.floor((Date.now() - new Date(started_at)) / 1000);

        // 2. Update all participants left_at
        await query(`
            UPDATE call_participants
            SET left_at = NOW(), duration = EXTRACT(EPOCH FROM (NOW() - joined_at))
            WHERE call_id = $1 AND left_at IS NULL
        `, [callId]);

        // 3. Notify all participants in chat
        io.to(`chat_${chatId}`).emit('call_ended', {
            callId,
            endedBy: userId,
            userName: socket.user.name,
            duration
        });

        // 4. Log event
        await query(`
            INSERT INTO call_events (call_id, event_type, user_id, metadata)
            VALUES ($1, 'call_ended', $2, $3)
        `, [callId, userId, JSON.stringify({ duration })]);

    } catch (error) {
        console.error('End call error:', error);
        socket.emit('error', { message: 'Failed to end call' });
    }
});
```

---

### Этап 6: Сценарии использования

#### Сценарий 1: Успешный звонок в ЛС (Direct chat)

**Участники:** Иван (звонящий), Мария (получатель)

1. Иван нажимает 📹 Видеозвонок
2. **Backend:** создает call (status='ringing'), room_name
3. **Иван:** получает `call_created`, открывает Jitsi
4. **Мария:** получает `incoming_call`, видит модалку, слышит рингтон
5. Мария нажимает "Принять"
6. **Backend:** обновляет status='ongoing'
7. **Мария:** открывает Jitsi с тем же room_name
8. **Оба:** видят друг друга в видеозвонке
9. Иван завершает звонок
10. **Backend:** status='ended', уведомляет обоих
11. **Оба:** модалки закрываются, toast "Звонок завершён"

#### Сценарий 2: Отклонение звонка

**Участники:** Иван (звонящий), Мария (получатель)

1. Иван нажимает 📞 Аудиозвонок
2. **Backend:** создает call (status='ringing')
3. **Иван:** видит "Вызов..."
4. **Мария:** получает модалку, рингтон
5. Мария нажимает "Отклонить"
6. **Backend:** status='rejected'
7. **Иван:** получает toast "Мария отклонила звонок"
8. **Мария:** модалка закрывается, рингтон останавливается

#### Сценарий 3: Таймаут (не ответили)

**Участники:** Иван (звонящий), Мария (получатель - AFK)

1. Иван нажимает 📹 Видеозвонок
2. **Мария:** модалка + рингтон (но она не у компьютера)
3. **Клиент Марии:** через 30 сек auto-reject
4. **Backend:** status='rejected', reason='timeout'
5. **Иван:** toast "Мария не ответила на звонок"

#### Сценарий 4: Групповой звонок (3+ участников)

**Участники:** Иван (инициатор), Мария, Сергей, Анна (чат "4 отдел")

1. Иван нажимает 📹 Видеозвонок
2. **Backend:** уведомляет Марию, Сергея, Анну
3. **Мария:** принимает, присоединяется к Jitsi
4. **Сергей:** принимает, присоединяется
5. **Анна:** пропустила уведомление, но видит в чате индикатор "Звонок идёт (3)"
6. Анна нажимает "Присоединиться"
7. **Все 4:** в одном Jitsi звонке
8. Иван завершает звонок
9. **Backend:** уведомляет всех участников

#### Сценарий 5: Звонок уже идёт

**Участники:** Иван, Мария (уже в звонке), Сергей (пытается позвонить)

1. Иван и Мария в активном звонке
2. Сергей нажимает 📞 Аудиозвонок
3. **Backend:** проверяет активные звонки в чате
4. **Сергей:** toast "Звонок уже идёт. Присоединиться?"
5. Сергей нажимает "Да"
6. **Сергей:** присоединяется к текущему звонку

---

### Этап 7: Обработка edge cases

#### 7.1. Отключение интернета у звонящего

- **Проблема:** Иван инициировал звонок, потерял соединение
- **Решение:** Backend должен автоматически завершать звонки через 60 сек если инициатор offline
- **Реализация:** Периодическая проверка (cron или setInterval)

#### 7.2. Одновременное принятие звонка несколькими участниками

- **Проблема:** В группе все одновременно нажали "Принять"
- **Решение:** Нормально, все присоединяются к одному room_name
- **Реализация:** Jitsi поддерживает множественных участников

#### 7.3. Звонок в групповой чат где 20 человек

- **Проблема:** Всем придут уведомления
- **Решение:** Это ок, но рассмотреть rate limiting
- **Улучшение:** В будущем добавить "targeted calls" (выбор кому звонить)

#### 7.4. Пользователь в офлайн режиме

- **Проблема:** Мария offline, Иван ей звонит
- **Решение:** Если пользователь не в connectedUsers, не отправлять incoming_call
- **UI:** Показать "Пользователь не в сети" до звонка

#### 7.5. Несколько вкладок у одного пользователя

- **Проблема:** Мария открыла чат в двух вкладках
- **Решение:** Обе вкладки получат incoming_call, любая может принять
- **Backend:** При accept_call проверять не было ли уже accepted

---

### Этап 8: Дополнительные улучшения (опционально)

#### 8.1. История звонков в чате

- Показывать сообщения типа "📞 Иван позвонил (3 мин, 45 сек)"
- Кликабельно - показывает детали звонка

#### 8.2. Push уведомления о звонке

- Если пользователь не активен в браузере
- Browser Notification API + звук

#### 8.3. Индикатор качества соединения

- Jitsi предоставляет статистику
- Показывать "Плохое соединение" если нужно

#### 8.4. Запись звонков (в далёком будущем)

- Jitsi поддерживает запись
- Требует Jibri сервер

---

## Порядок реализации (приоритеты)

### Фаза 1: MVP (Минимум для работы)
1. ✅ Backend WebSocket события (start_call, accept_call, reject_call, end_call)
2. ✅ UI модального окна входящего звонка
3. ✅ Звуковые уведомления (рингтон)
4. ✅ Логика принятия/отклонения звонка
5. ✅ Передача room_name при принятии

### Фаза 2: Групповые звонки
6. ✅ Индикатор активного звонка в чате
7. ✅ Присоединение к активному звонку (join_call)
8. ✅ Обработка call_participant_joined/left

### Фаза 3: Стабильность
9. ✅ Таймауты (30 сек на ответ)
10. ✅ Обработка разрыва соединения
11. ✅ Auto-end при disconnect инициатора
12. ✅ Edge cases обработка

### Фаза 4: UX улучшения
13. ⭕ История звонков в чате (сообщения)
14. ⭕ Push уведомления (Browser API)
15. ⭕ Проверка доступности перед звонком (online/offline)
16. ⭕ Индикатор качества соединения

---

## Оценка трудозатрат

- **Фаза 1 (MVP):** 4-6 часов работы
  - Backend events: 1-2 часа
  - UI модалка + CSS: 1 час
  - Звук: 30 мин
  - Логика + интеграция: 2 часа
  - Тестирование: 1 час

- **Фаза 2 (Групповые):** 2-3 часа
  - Индикатор в чате: 30 мин
  - Join logic: 1 час
  - Participant events: 1 час
  - Тестирование: 30 мин

- **Фаза 3 (Стабильность):** 2-3 часа
  - Таймауты: 1 час
  - Disconnect handling: 1-2 часа
  - Edge cases: 1 час

**Итого на полноценную систему звонков: 8-12 часов**

---

## Риски и зависимости

### Риски:
1. **Jitsi публичный сервер** - может быть заблокирован в России
   - Митигация: Опция указать свой Jitsi сервер в конфиге

2. **WebRTC через DPI** - могут быть проблемы с российскими провайдерами
   - Митигация: Использовать TURN сервер

3. **Производительность при 10+ участниках**
   - Митигация: Jitsi справляется, но браузер может тормозить

### Зависимости:
- Jitsi Meet External API (уже загружается)
- Web Audio API (для рингтона)
- WebSocket соединение (уже есть)
- Browser Notification API (для push, опционально)

---

## Готовность к реализации

**Готов начать? Варианты:**

A) **Поэтапно** - сначала Фаза 1 (MVP), потом тестируем, потом остальное
B) **Всё сразу** - делаю Фазы 1-3 одним большим PR
C) **Фокус на конкретном** - например, только direct чаты сначала

**Рекомендую вариант A** - сделать MVP, протестировать базовый флоу, потом добавлять групповые звонки.

Начинаем?
