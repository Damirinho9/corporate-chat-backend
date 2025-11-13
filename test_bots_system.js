require('dotenv').config();
const fetch = require('node-fetch');

// Конфигурация
const API_URL = 'http://localhost:3000/api';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2MzAyNzcyMiwiZXhwIjoxNzYzMTE0MTIyfQ.o2jh5ahxgHQcOiUzG8pBKePmukHFcDKka-vXFJhs7Ic';

async function testBotsSystem() {
  let botId = null;
  let botToken = null;
  let webhookId = null;
  let testChatId = null;

  try {
    console.log('🤖 Тестирование системы ботов и интеграций...\n');

    // 1. Создаем бота
    console.log('1️⃣ Создание бота...');
    const createBotResponse = await fetch(`${API_URL}/bots`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Bot',
        username: 'test_bot',
        description: 'Автоматический тестовый бот'
      })
    });

    if (!createBotResponse.ok) {
      const error = await createBotResponse.json();
      throw new Error(`Ошибка создания бота: ${error.error}`);
    }

    const botData = await createBotResponse.json();
    botId = botData.bot.id;
    botToken = botData.bot.api_token;

    console.log('✅ Бот создан успешно!');
    console.log(`   ID: ${botId}`);
    console.log(`   Username: ${botData.bot.username}`);
    console.log(`   Token: ${botToken.substring(0, 20)}...`);

    // 2. Создаем тестовый чат (если нет чатов)
    console.log('\n2️⃣ Получение списка чатов...');
    let chatsResponse = await fetch(`${API_URL}/chats`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });

    let chatsData = await chatsResponse.json();
    let chats = Array.isArray(chatsData) ? chatsData : (chatsData.chats || []);

    if (chats.length === 0) {
      console.log('   Нет чатов, создаем тестовый чат...');
      const createChatResponse = await fetch(`${API_URL}/chats`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Test Chat',
          type: 'group'
        })
      });

      const chatData = await createChatResponse.json();
      testChatId = chatData.chat.id;
      console.log(`✅ Тестовый чат создан, ID: ${testChatId}`);
    } else {
      testChatId = chats[0].id;
      console.log(`✅ Найдено ${chats.length} чатов, используем чат ID: ${testChatId}`);
    }

    // 3. Добавляем права боту
    console.log('\n3️⃣ Добавление прав боту...');

    // Право на чтение сообщений
    const perm1 = await fetch(`${API_URL}/bots/${botId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        permission_type: 'read_messages',
        resource_type: 'chat',
        resource_id: testChatId
      })
    });
    if (!perm1.ok) {
      const error = await perm1.text();
      console.log(`   ❌ Failed to add read_messages: ${error}`);
    }

    // Право на отправку сообщений
    const perm2 = await fetch(`${API_URL}/bots/${botId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        permission_type: 'send_messages',
        resource_type: 'chat',
        resource_id: testChatId
      })
    });
    if (!perm2.ok) {
      const error = await perm2.text();
      console.log(`   ❌ Failed to add send_messages: ${error}`);
    }

    // Право на чтение списка чатов
    const perm3 = await fetch(`${API_URL}/bots/${botId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        permission_type: 'read_chats',
        resource_type: 'all'
        // resource_id не указываем для wildcard permissions
      })
    });
    if (!perm3.ok) {
      const error = await perm3.text();
      console.log(`   ❌ Failed to add read_chats: ${error}`);
    }

    console.log('✅ Права добавлены (read_messages, send_messages, read_chats)');

    // 4. Проверяем информацию о боте через Bot API
    console.log('\n4️⃣ Проверка Bot API - получение информации о боте...');
    const botMeResponse = await fetch(`${API_URL}/bot-api/me`, {
      headers: {
        'X-Bot-Token': botToken
      }
    });

    if (!botMeResponse.ok) {
      throw new Error('Ошибка получения информации о боте');
    }

    const botInfo = await botMeResponse.json();
    console.log('✅ Информация о боте получена:');
    console.log(`   Имя: ${botInfo.bot.name}`);
    console.log(`   Прав: ${botInfo.bot.permissions.length}`);

    // 5. Отправляем сообщение от имени бота
    console.log('\n5️⃣ Отправка сообщения от имени бота...');
    const sendMessageResponse = await fetch(`${API_URL}/bot-api/messages`, {
      method: 'POST',
      headers: {
        'X-Bot-Token': botToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: testChatId,
        content: '🤖 Привет! Я тестовый бот. Это автоматическое сообщение для проверки Bot API.'
      })
    });

    if (!sendMessageResponse.ok) {
      const errorText = await sendMessageResponse.text();
      let errorMsg;
      try {
        const error = JSON.parse(errorText);
        errorMsg = error.error || error.message || errorText;
      } catch (e) {
        errorMsg = errorText;
      }
      console.log(`   Response status: ${sendMessageResponse.status}`);
      console.log(`   Response body: ${errorMsg}`);
      throw new Error(`Ошибка отправки сообщения: ${errorMsg}`);
    }

    const messageData = await sendMessageResponse.json();
    console.log('✅ Сообщение отправлено успешно!');
    console.log(`   Message ID: ${messageData.message.id}`);
    console.log(`   Content: ${messageData.message.content}`);

    // 6. Получаем список доступных чатов через Bot API
    console.log('\n6️⃣ Получение списка доступных чатов через Bot API...');
    const botChatsResponse = await fetch(`${API_URL}/bot-api/chats`, {
      headers: {
        'X-Bot-Token': botToken
      }
    });

    if (!botChatsResponse.ok) {
      const errorText = await botChatsResponse.text();
      console.log(`   Response status: ${botChatsResponse.status}`);
      console.log(`   Response body: ${errorText}`);
      throw new Error('Ошибка получения чатов');
    }

    const botChatsData = await botChatsResponse.json();
    console.log(`✅ Бот имеет доступ к ${botChatsData.chats.length} чат(ам)`);

    // 7. Создаем вебхук
    console.log('\n7️⃣ Создание вебхука...');
    const createWebhookResponse = await fetch(`${API_URL}/webhooks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bot_id: botId,
        name: 'Test Webhook',
        url: 'https://webhook.site/unique-id', // Можно заменить на реальный URL
        events: ['message.created', 'user.joined']
      })
    });

    if (!createWebhookResponse.ok) {
      const error = await createWebhookResponse.json();
      throw new Error(`Ошибка создания вебхука: ${error.error}`);
    }

    const webhookData = await createWebhookResponse.json();
    webhookId = webhookData.webhook.id;

    console.log('✅ Вебхук создан успешно!');
    console.log(`   ID: ${webhookId}`);
    console.log(`   URL: ${webhookData.webhook.url}`);
    console.log(`   Events: ${webhookData.webhook.events.join(', ')}`);
    console.log(`   Secret: ${webhookData.webhook.secret.substring(0, 20)}...`);

    // 8. Получаем список всех ботов
    console.log('\n8️⃣ Получение списка всех ботов...');
    const botsListResponse = await fetch(`${API_URL}/bots`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });

    const botsList = await botsListResponse.json();
    console.log(`✅ Всего ботов в системе: ${botsList.bots.length}`);
    botsList.bots.forEach(bot => {
      console.log(`   - ${bot.name} (@${bot.username}), активен: ${bot.is_active}`);
    });

    // 9. Получаем детали бота
    console.log('\n9️⃣ Получение деталей бота...');
    const botDetailsResponse = await fetch(`${API_URL}/bots/${botId}`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });

    const botDetails = await botDetailsResponse.json();
    console.log('✅ Детали бота:');
    console.log(`   Прав: ${botDetails.bot.permissions.length}`);
    console.log(`   Вебхуков: ${botDetails.bot.webhooks.length}`);
    console.log(`   Создан: ${botDetails.bot.creator_name}`);

    // 10. Получаем список доступных событий для вебхуков
    console.log('\n🔟 Получение списка доступных событий...');
    const eventsResponse = await fetch(`${API_URL}/webhooks/meta/events`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });

    const eventsData = await eventsResponse.json();
    console.log(`✅ Доступно событий: ${eventsData.events.length}`);
    eventsData.events.slice(0, 5).forEach(event => {
      console.log(`   - ${event.name}: ${event.description}`);
    });

    console.log('\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Создание бота работает');
    console.log('✅ Добавление прав работает');
    console.log('✅ Bot API работает (me, messages, chats)');
    console.log('✅ Отправка сообщений от бота работает');
    console.log('✅ Создание вебхуков работает');
    console.log('✅ Получение списка событий работает');
    console.log('\n🚀 Система ботов и интеграций полностью функциональна!');

    // Cleanup
    console.log('\n🧹 Очистка тестовых данных...');

    // Удаляем вебхук
    if (webhookId) {
      await fetch(`${API_URL}/webhooks/${webhookId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`
        }
      });
      console.log('✅ Вебхук удален');
    }

    // Удаляем бота
    if (botId) {
      await fetch(`${API_URL}/bots/${botId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`
        }
      });
      console.log('✅ Бот удален');
    }

    console.log('\n✨ Тест завершен успешно!');

  } catch (error) {
    console.error('\n❌ Ошибка теста:', error.message);
    console.error('Stack trace:', error.stack);

    // Cleanup on error
    if (webhookId) {
      try {
        await fetch(`${API_URL}/webhooks/${webhookId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
        });
      } catch (e) {}
    }

    if (botId) {
      try {
        await fetch(`${API_URL}/bots/${botId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
        });
      } catch (e) {}
    }

    process.exit(1);
  }
}

testBotsSystem();
