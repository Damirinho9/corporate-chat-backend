/*
 * Автоматический сценарий проверки прямых сообщений без запуска сервера.
 *
 * Последовательность:
 * 1. Инициализация тестовой in-memory БД и заполнение демо-данными через seedDatabase.
 * 2. Вызов контроллера createDirectChat для создания/открытия личного чата.
 * 3. Получение сообщений через messageController.getMessages.
 * 4. Отправка нового сообщения через messageController.sendMessage.
 * 5. Повторное получение сообщений и проверка, что новое сообщение добавлено.
 */

process.env.NODE_ENV = 'test';
process.env.USE_IN_MEMORY_DB = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const path = require('path');

// Подменяем модуль базы данных на in-memory реализацию до подключения остальных модулей
const databaseModulePath = path.resolve(__dirname, '..', 'config', 'database.js');
const inMemoryDb = require('./utils/inMemoryDatabase');
require.cache[databaseModulePath] = { exports: inMemoryDb };

const { query } = require('../config/database');
const seedDatabase = require('../database/seed');
const chatController = require('../controllers/chatController');
const messageController = require('../controllers/messageController');

function createMockResponse() {
    const response = { statusCode: 200 };
    response.status = (code) => {
        response.statusCode = code;
        return response;
    };
    response.json = (payload) => {
        response.body = payload;
        return response;
    };
    return response;
}

(async () => {
    try {
        console.log('🧪 Подготовка тестовой базы данных (in-memory)...');
        await seedDatabase();

        const admin = (await query('SELECT id FROM users WHERE username = $1', ['admin'])).rows[0];
        const operator = (await query('SELECT id FROM users WHERE username = $1', ['operator1'])).rows[0];

        if (!admin || !operator) {
            throw new Error('Не удалось получить идентификаторы пользователей для теста');
        }

        console.log('💬 Создание/открытие личного чата через chatController.createDirectChat...');
        const createChatReq = {
            body: { receiverId: operator.id },
            user: { id: admin.id, role: 'admin' }
        };
        const createChatRes = createMockResponse();
        await chatController.createDirectChat(createChatReq, createChatRes);

        if (![200, 201].includes(createChatRes.statusCode) || !createChatRes.body?.chatId) {
            throw new Error(`Не удалось создать/открыть чат (статус ${createChatRes.statusCode})`);
        }

        const chatId = createChatRes.body.chatId;
        console.log(`✅ Чат доступен (chatId=${chatId}, isNew=${createChatRes.body.isNew})`);

        console.log('📥 Получение сообщений через messageController.getMessages...');
        const getMessagesReq = {
            params: { chatId },
            query: {},
            user: { id: admin.id, role: 'admin' }
        };
        const getMessagesRes = createMockResponse();
        await messageController.getMessages(getMessagesReq, getMessagesRes);

        if (getMessagesRes.statusCode !== 200 || !Array.isArray(getMessagesRes.body?.messages)) {
            throw new Error(`Не удалось получить сообщения (статус ${getMessagesRes.statusCode})`);
        }

        const initialMessagesCount = getMessagesRes.body.messages.length;
        console.log(`📊 Сообщений до отправки: ${initialMessagesCount}`);

        console.log('✉️ Отправка нового сообщения через messageController.sendMessage...');
        const sendMessageReq = {
            params: { chatId },
            body: { content: 'Автотест: проверка отправки сообщения' },
            user: { id: admin.id, role: 'admin' }
        };
        const sendMessageRes = createMockResponse();
        await messageController.sendMessage(sendMessageReq, sendMessageRes);

        if (sendMessageRes.statusCode !== 201 || !sendMessageRes.body?.message) {
            throw new Error(`Не удалось отправить сообщение (статус ${sendMessageRes.statusCode})`);
        }

        console.log('🔄 Повторная загрузка сообщений...');
        const finalMessagesRes = createMockResponse();
        await messageController.getMessages(getMessagesReq, finalMessagesRes);

        if (finalMessagesRes.statusCode !== 200 || !Array.isArray(finalMessagesRes.body?.messages)) {
            throw new Error(`Не удалось получить сообщения после отправки (статус ${finalMessagesRes.statusCode})`);
        }

        const finalMessagesCount = finalMessagesRes.body.messages.length;
        if (finalMessagesCount !== initialMessagesCount + 1) {
            throw new Error(`Количество сообщений не увеличилось (ожидалось ${initialMessagesCount + 1}, получено ${finalMessagesCount})`);
        }

        console.log('🎉 Автоматический тест прямых сообщений успешно пройден!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Тест прямых сообщений завершился ошибкой');
        console.error(error);
        process.exit(1);
    }
})();
