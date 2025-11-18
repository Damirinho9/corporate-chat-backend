require('dotenv').config();
const fetch = require('node-fetch');

// Конфигурация
const API_URL = 'http://localhost:3000/api';
// ВАЖНО: Получите свежий токен из localStorage в браузере или через API логина
// В браузере: откройте консоль и выполните: localStorage.getItem('token')
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2MzAxODQ2MCwiZXhwIjoxNzYzMTA0ODYwfQ.yrSFEhajliVH1sTHLxrNJu4eizH7iOvotBA1EtlWaz0';

async function testGroupCall() {
  try {
    console.log('🧪 Тестирование групповых звонков...\n');

    // Проверяем токен
    if (!ADMIN_TOKEN) {
      console.error('❌ ADMIN_TOKEN не указан!');
      console.log('\nКак получить токен:');
      console.log('1. Откройте приложение в браузере');
      console.log('2. Войдите как admin');
      console.log('3. Откройте консоль (F12)');
      console.log('4. Выполните: localStorage.getItem("token")');
      console.log('5. Скопируйте токен и запустите: ADMIN_TOKEN="..." node test_group_call.js\n');
      process.exit(1);
    }

    // 1. Получаем список чатов
    console.log('1️⃣ Получение списка чатов...');
    const chatsResponse = await fetch(`${API_URL}/chats`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });

    if (!chatsResponse.ok) {
      const errorText = await chatsResponse.text();
      if (chatsResponse.status === 401) {
        console.error('\n❌ Токен недействителен или истек!');
        console.log('\nПолучите новый токен:');
        console.log('1. Откройте приложение в браузере');
        console.log('2. Войдите как admin');
        console.log('3. Откройте консоль (F12)');
        console.log('4. Выполните: localStorage.getItem("token")');
        console.log('5. Запустите: ADMIN_TOKEN="ваш_токен" node test_group_call.js\n');
      }
      throw new Error(`Не удалось получить список чатов: ${chatsResponse.status} ${errorText}`);
    }

    const chatsData = await chatsResponse.json();
    console.log('Ответ API:', JSON.stringify(chatsData, null, 2).substring(0, 500));

    // API может вернуть объект с полем chats или массив напрямую
    const chats = Array.isArray(chatsData) ? chatsData : (chatsData.chats || []);
    console.log(`✅ Найдено ${chats.length} чатов`);

    // Ищем групповой чат или чат отдела
    const groupChat = chats.find(c => c.type === 'group' || c.type === 'department');

    if (!groupChat) {
      console.log('⚠️  Групповой чат не найден. Тест пропущен.');
      return;
    }

    console.log(`📝 Найден чат: "${groupChat.name}" (тип: ${groupChat.type})\n`);

    // 2. Создаем видеозвонок в групповом чате
    console.log('2️⃣ Создание видеозвонка в групповом чате...');
    const callResponse = await fetch(`${API_URL}/calls/initiate`, {
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

    if (!callResponse.ok) {
      const error = await callResponse.json();
      throw new Error(`Ошибка создания звонка: ${error.error || callResponse.statusText}`);
    }

    const callData = await callResponse.json();
    console.log('✅ Видеозвонок создан успешно!');
    console.log(`   Call ID: ${callData.call.id}`);
    console.log(`   Room: ${callData.call.roomName}`);
    console.log(`   Type: ${callData.call.callType}`);
    console.log(`   Mode: ${callData.call.callMode}`);
    console.log(`   Invite Token: ${callData.call.inviteToken ? '✅ Присутствует' : '❌ Отсутствует'}`);
    console.log(`   Invite Link: ${callData.call.inviteLink || '❌ Отсутствует'}\n`);

    // 3. Тестируем присоединение по invite token (если есть)
    if (callData.call.inviteToken) {
      console.log('3️⃣ Тестирование присоединения по invite token...');
      const joinResponse = await fetch(`${API_URL}/calls/join-by-invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inviteToken: callData.call.inviteToken
        })
      });

      if (joinResponse.ok) {
        const joinData = await joinResponse.json();
        console.log('✅ Присоединение по invite token работает!');
        console.log(`   Status: ${joinData.call.status}`);
      } else {
        const error = await joinResponse.json();
        console.log(`⚠️  Ошибка присоединения: ${error.error}`);
      }
    }

    console.log('\n🎉 Все тесты пройдены успешно!');

  } catch (error) {
    console.error('\n❌ Ошибка теста:', error.message);
    process.exit(1);
  }
}

testGroupCall();
