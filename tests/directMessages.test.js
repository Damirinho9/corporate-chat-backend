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
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');

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

        console.log('🔐 Создание пользователя с автогенерацией пароля...');
        const registerReq = {
            body: {
                username: 'ivan.petrov',
                name: 'Иван Петров',
                role: 'operator',
                department: 'Sales'
            },
            user: { id: admin.id, role: 'admin' }
        };
        const registerRes = createMockResponse();
        await authController.register(registerReq, registerRes);

        if (registerRes.statusCode !== 201 || !registerRes.body?.password) {
            throw new Error(`Автогенерация пароля не сработала (статус ${registerRes.statusCode})`);
        }

        const generatedPassword = registerRes.body.password;
        if (generatedPassword.length < 8) {
            throw new Error('Сгенерированный пароль слишком короткий');
        }

        const storedUser = (await query('SELECT id, initial_password, department FROM users WHERE username = $1', ['ivan.petrov'])).rows[0];
        if (!storedUser) {
            throw new Error('Созданный пользователь не найден в базе');
        }

        if (storedUser.initial_password !== generatedPassword) {
            throw new Error('В таблице users не сохранён сгенерированный пароль');
        }

        if (storedUser.department !== 'Sales') {
            throw new Error('Пользователь не привязан к ожидаемому отделу');
        }

        const salesChat = await query("SELECT id FROM chats WHERE type = 'department' AND department = $1", ['Sales']);
        const salesChatId = salesChat.rows[0]?.id;
        if (!salesChatId) {
            throw new Error('Чат отдела Sales не найден');
        }

        const membership = await query('SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2', [salesChatId, storedUser.id]);
        if (membership.rowCount === 0) {
            throw new Error('Новый оператор не добавлен в чат отдела');
        }

        console.log(`✅ Пользователь создан с паролем ${generatedPassword}`);

        const operator = (await query('SELECT id FROM users WHERE username = $1', ['operator1'])).rows[0];
        const ropSales = (await query('SELECT id FROM users WHERE username = $1', ['rop_sales'])).rows[0];

        console.log('🔒 Проверка отсутствия выдачи исходных паролей для не-админов...');
        const deptReq = {
            params: { department: 'Sales' },
            user: { id: ropSales.id, role: 'rop' }
        };
        const deptRes = createMockResponse();
        await userController.getUsersByDepartment(deptReq, deptRes);

        if (deptRes.statusCode !== 200) {
            throw new Error(`getUsersByDepartment вернул статус ${deptRes.statusCode}`);
        }

        const leakedSecret = Array.isArray(deptRes.body?.users)
            && deptRes.body.users.some(user => Object.prototype.hasOwnProperty.call(user, 'initial_password'));

        if (leakedSecret) {
            throw new Error('initial_password утёк в ответ для не-админа');
        }

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
        const afterTextMessagesRes = createMockResponse();
        await messageController.getMessages(getMessagesReq, afterTextMessagesRes);

        if (afterTextMessagesRes.statusCode !== 200 || !Array.isArray(afterTextMessagesRes.body?.messages)) {
            throw new Error(`Не удалось получить сообщения после отправки текста (статус ${afterTextMessagesRes.statusCode})`);
        }

        const afterTextMessagesCount = afterTextMessagesRes.body.messages.length;
        if (afterTextMessagesCount !== initialMessagesCount + 1) {
            throw new Error(`Количество сообщений после текста не увеличилось (ожидалось ${initialMessagesCount + 1}, получено ${afterTextMessagesCount})`);
        }

        console.log('📎 Подготовка тестового файла для сообщения без текста...');
        const fileInsert = await query(
            `INSERT INTO files (filename, original_filename, mime_type, size_bytes, path, thumbnail_path, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
                'test-file-attachment.pdf',
                'test-file-attachment.pdf',
                'application/pdf',
                2048,
                '/tmp/test-file-attachment.pdf',
                null,
                admin.id
            ]
        );

        const fileId = fileInsert.rows[0]?.id;
        if (!fileId) {
            throw new Error('Не удалось подготовить файл для тестового сообщения');
        }

        console.log('📨 Отправка сообщения только с файлом...');
        const sendFileMessageReq = {
            params: { chatId },
            body: { content: null, fileId },
            user: { id: admin.id, role: 'admin' }
        };
        const sendFileMessageRes = createMockResponse();
        await messageController.sendMessage(sendFileMessageReq, sendFileMessageRes);

        if (sendFileMessageRes.statusCode !== 201 || !sendFileMessageRes.body?.message) {
            throw new Error(`Не удалось отправить сообщение с файлом (статус ${sendFileMessageRes.statusCode})`);
        }

        if (!sendFileMessageRes.body.message.file?.id) {
            throw new Error('Ответ сервера не содержит информацию о прикреплённом файле');
        }

        console.log('🔄 Финальная проверка количества сообщений после отправки файла...');
        const afterFileMessagesRes = createMockResponse();
        await messageController.getMessages(getMessagesReq, afterFileMessagesRes);

        if (afterFileMessagesRes.statusCode !== 200 || !Array.isArray(afterFileMessagesRes.body?.messages)) {
            throw new Error(`Не удалось получить сообщения после отправки файла (статус ${afterFileMessagesRes.statusCode})`);
        }

        const afterFileMessagesCount = afterFileMessagesRes.body.messages.length;
        if (afterFileMessagesCount !== initialMessagesCount + 2) {
            throw new Error(`Количество сообщений после файла некорректно (ожидалось ${initialMessagesCount + 2}, получено ${afterFileMessagesCount})`);
        }

        const lastMessage = afterFileMessagesRes.body.messages[afterFileMessagesRes.body.messages.length - 1];
        if (!lastMessage?.file?.id || lastMessage.file.id !== fileId) {
            throw new Error('Последнее сообщение не содержит ожидаемый файл');
        }

        console.log('🎉 Автоматический тест прямых сообщений успешно пройден!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Тест прямых сообщений завершился ошибкой');
        console.error(error);
        process.exit(1);
    }
})();
