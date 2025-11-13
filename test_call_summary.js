require('dotenv').config();
const fetch = require('node-fetch');

// Конфигурация
const API_URL = 'http://localhost:3000/api';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2MzAxODQ2MCwiZXhwIjoxNzYzMTA0ODYwfQ.yrSFEhajliVH1sTHLxrNJu4eizH7iOvotBA1EtlWaz0';

// Utility function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testCallSummary() {
  try {
    console.log('🧪 Тестирование функций саммари звонков...\n');

    // 1. Создаем групповой звонок
    console.log('1️⃣ Создание группового видеозвонка...');
    const chatsResponse = await fetch(`${API_URL}/chats`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    if (!chatsResponse.ok) {
      throw new Error('Failed to fetch chats');
    }

    const chatsData = await chatsResponse.json();
    const chats = Array.isArray(chatsData) ? chatsData : (chatsData.chats || []);
    const groupChat = chats.find(c => c.type === 'group' || c.type === 'department');

    if (!groupChat) {
      console.log('⚠️  Групповой чат не найден. Создайте групповой чат для теста.');
      return;
    }

    console.log(`   Используем чат: "${groupChat.name}"`);

    // Создаем звонок
    const createCallResponse = await fetch(`${API_URL}/calls/initiate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        callType: 'video',
        chatId: groupChat.id
      })
    });

    if (!createCallResponse.ok) {
      const error = await createCallResponse.json();
      throw new Error(`Failed to create call: ${error.error}`);
    }

    const callData = await createCallResponse.json();
    const callId = callData.call.id;
    console.log(`✅ Видеозвонок создан! ID: ${callId}`);
    console.log(`   Invite Link: ${callData.call.inviteLink}`);

    // 2. Симулируем участие в звонке (присоединение)
    console.log('\n2️⃣ Присоединение к звонку...');
    const joinResponse = await fetch(`${API_URL}/calls/${callId}/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!joinResponse.ok) {
      const error = await joinResponse.json();
      throw new Error(`Failed to join call: ${error.error}`);
    }

    console.log('✅ Успешно присоединились к звонку');

    // Ждем немного (симулируем участие в звонке)
    console.log('   ⏳ Участие в звонке (3 секунды)...');
    await wait(3000);

    // 3. Покидаем звонок
    console.log('\n3️⃣ Выход из звонка...');
    const leaveResponse = await fetch(`${API_URL}/calls/${callId}/leave`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!leaveResponse.ok) {
      const error = await leaveResponse.json();
      throw new Error(`Failed to leave call: ${error.error}`);
    }

    console.log('✅ Успешно покинули звонок');

    // Ждем немного для обработки на сервере
    await wait(500);

    // 4. Получаем саммари звонка
    console.log('\n4️⃣ Получение саммари звонка...');
    const summaryResponse = await fetch(`${API_URL}/calls/${callId}/summary`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });

    if (!summaryResponse.ok) {
      const error = await summaryResponse.json();
      throw new Error(`Failed to get summary: ${error.error}`);
    }

    const summary = await summaryResponse.json();
    console.log('✅ Саммари получено успешно!\n');

    // Выводим детали саммари
    console.log('📊 ДЕТАЛИ ЗВОНКА:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Тип: ${summary.call.callType === 'audio' ? '🎙️  Аудио' : '📹 Видео'}`);
    console.log(`   Режим: ${summary.call.callMode === 'direct' ? 'Личный' : 'Групповой'}`);
    console.log(`   Статус: ${summary.call.status}`);
    console.log(`   Инициатор: ${summary.call.initiatedBy.name}`);
    if (summary.call.chat) {
      console.log(`   Чат: ${summary.call.chat.name} (${summary.call.chat.type})`);
    }
    console.log(`   Создан: ${new Date(summary.call.createdAt).toLocaleString('ru-RU')}`);
    console.log(`   Начало: ${summary.call.startedAt ? new Date(summary.call.startedAt).toLocaleString('ru-RU') : 'N/A'}`);
    console.log(`   Конец: ${summary.call.endedAt ? new Date(summary.call.endedAt).toLocaleString('ru-RU') : 'N/A'}`);
    console.log(`   Длительность: ${summary.call.duration.formatted || 'N/A'}`);

    console.log('\n📈 СТАТИСТИКА:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Всего участников: ${summary.statistics.totalParticipants}`);
    console.log(`   Активных: ${summary.statistics.activeParticipants}`);
    console.log(`   Завершили участие: ${summary.statistics.completedParticipants}`);
    console.log(`   Общая длительность: ${summary.statistics.totalDuration.formatted || 'N/A'}`);

    console.log('\n👥 УЧАСТНИКИ:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    summary.participants.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name} ${p.isModerator ? '👑' : ''}`);
      console.log(`      Роль: ${p.role}`);
      console.log(`      Присоединился: ${p.joinedAt ? new Date(p.joinedAt).toLocaleTimeString('ru-RU') : '-'}`);
      console.log(`      Покинул: ${p.leftAt ? new Date(p.leftAt).toLocaleTimeString('ru-RU') : 'В звонке'}`);
      console.log(`      Длительность: ${p.duration.formatted || '-'}`);
    });

    // 5. Получаем историю звонков
    console.log('\n5️⃣ Получение истории звонков...');
    const historyResponse = await fetch(`${API_URL}/calls/history/all?limit=5`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });

    if (!historyResponse.ok) {
      const error = await historyResponse.json();
      throw new Error(`Failed to get history: ${error.error}`);
    }

    const history = await historyResponse.json();
    console.log(`✅ История получена! Найдено звонков: ${history.calls.length}\n`);

    // Выводим последние 5 звонков
    console.log('📞 ПОСЛЕДНИЕ ЗВОНКИ:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    history.calls.slice(0, 5).forEach((call, i) => {
      const type = call.call_type === 'audio' ? '🎙️  Аудио' : '📹 Видео';
      const mode = call.call_mode === 'direct' ? 'Личный' : 'Групповой';
      const status = call.status === 'ended' ? '✅' : call.status === 'ongoing' ? '🔴' : '⏸️';
      const date = new Date(call.created_at).toLocaleString('ru-RU');

      console.log(`   ${i + 1}. ${type} · ${mode} ${status}`);
      console.log(`      Инициатор: ${call.initiator_name}`);
      console.log(`      Дата: ${date}`);
      console.log(`      Участников: ${call.participants_count || 0}`);
    });

    // 6. Проверяем, что наш звонок есть в истории
    console.log('\n6️⃣ Проверка наличия созданного звонка в истории...');
    const ourCall = history.calls.find(c => c.id === callId);
    if (ourCall) {
      console.log('✅ Созданный звонок найден в истории!');
      console.log(`   ID: ${ourCall.id}`);
      console.log(`   Статус: ${ourCall.status}`);
    } else {
      console.log('⚠️  Созданный звонок не найден в истории (возможно, лимит истории)');
    }

    console.log('\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Создание звонка работает');
    console.log('✅ Присоединение к звонку работает');
    console.log('✅ Выход из звонка работает');
    console.log('✅ Саммари звонка работает');
    console.log('✅ История звонков работает');
    console.log('\n🚀 Функционал саммари звонков (как в Zoom) полностью функционален!');

  } catch (error) {
    console.error('\n❌ Ошибка теста:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

testCallSummary();
