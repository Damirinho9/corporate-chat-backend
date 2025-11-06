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

        console.log('🔍 Проверка выдачи исходных паролей для администратора...');
        const listReq = { user: { id: admin.id, role: 'admin' } };
        const listRes = createMockResponse();
        await userController.getAllUsers(listReq, listRes);

        if (listRes.statusCode !== 200 || !Array.isArray(listRes.body?.users)) {
            throw new Error(`getAllUsers вернул неожиданный ответ (статус ${listRes.statusCode})`);
        }

        const createdUserEntry = listRes.body.users.find(user => user.username === 'ivan.petrov');
        if (!createdUserEntry) {
            throw new Error('Созданный пользователь отсутствует в списке пользователей для администратора');
        }

        if (createdUserEntry.initial_password !== generatedPassword) {
            throw new Error('Администратор не видит исходный пароль созданного пользователя');
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

        console.log('🧪 Проверка создания пользователя РОПом только в своём отделе...');
        const ropSalesRow = (await query('SELECT id, department FROM users WHERE username = $1', ['rop_sales'])).rows[0];
        const ropCreateReq = {
            body: {
                username: 'sales.new.operator',
                name: 'Новый оператор отдела продаж',
                role: 'operator'
            },
            user: {
                id: ropSalesRow.id,
                role: 'rop',
                department: ropSalesRow.department
            }
        };
        const ropCreateRes = createMockResponse();
        await authController.register(ropCreateReq, ropCreateRes);

        if (ropCreateRes.statusCode !== 201) {
            throw new Error(`РОП не смог создать пользователя (статус ${ropCreateRes.statusCode})`);
        }

        const ropCreatedUser = (await query('SELECT id, department FROM users WHERE username = $1', ['sales.new.operator'])).rows[0];
        if (!ropCreatedUser) {
            throw new Error('РОПом созданный пользователь отсутствует в базе данных');
        }

        if (ropCreatedUser.department !== ropSalesRow.department) {
            throw new Error('Пользователь создан РОПом не в его отделе');
        }

        const ropDeptChat = await query("SELECT id FROM chats WHERE type = 'department' AND department = $1", [ropSalesRow.department]);
        const ropDeptChatId = ropDeptChat.rows[0]?.id;
        if (!ropDeptChatId) {
            throw new Error('Чат отдела РОПа не найден');
        }

        const ropMembership = await query('SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2', [ropDeptChatId, ropCreatedUser.id]);

        if (ropMembership.rowCount === 0) {
            throw new Error('Пользователь создан РОПом не добавлен в чат своего отдела');
        }

        console.log('🚫 Проверка запрета создания пользователя в чужом отделе...');
        const ropForeignReq = {
            body: {
                username: 'marketing.hijack',
                name: 'Чужой оператор',
                role: 'operator',
                department: 'Marketing'
            },
            user: {
                id: ropSalesRow.id,
                role: 'rop',
                department: ropSalesRow.department
            }
        };
        const ropForeignRes = createMockResponse();
        await authController.register(ropForeignReq, ropForeignRes);

        if (ropForeignRes.statusCode !== 403) {
            throw new Error(`Ожидался запрет создания в чужом отделе, получен статус ${ropForeignRes.statusCode}`);
        }

        const foreignExists = await query('SELECT id FROM users WHERE username = $1', ['marketing.hijack']);
        if (foreignExists.rowCount > 0) {
            throw new Error('Пользователь был создан в чужом отделе несмотря на запрет');
        }

        console.log('🚫 Проверка запрета на создание администраторов РОПом...');
        const ropAdminReq = {
            body: {
                username: 'should.fail',
                name: 'Недопустимый пользователь',
                role: 'admin'
            },
            user: {
                id: ropSalesRow.id,
                role: 'rop',
                department: ropSalesRow.department
            }
        };
        const ropAdminRes = createMockResponse();
        await authController.register(ropAdminReq, ropAdminRes);

        if (ropAdminRes.statusCode !== 403) {
            throw new Error(`РОП смог создать администратора (статус ${ropAdminRes.statusCode})`);
        }

        console.log('🛠 Проверка редактирования сотрудника РОПом в своём отделе...');
        const ropUpdateReq = {
            params: { userId: ropCreatedUser.id },
            body: {
                name: 'Обновлённый оператор отдела продаж',
                isActive: false
            },
            user: {
                id: ropSalesRow.id,
                role: 'rop',
                department: ropSalesRow.department
            }
        };
        const ropUpdateRes = createMockResponse();
        await userController.updateUser(ropUpdateReq, ropUpdateRes);

        if (ropUpdateRes.statusCode !== 200) {
            throw new Error(`РОП не смог обновить сотрудника своего отдела (статус ${ropUpdateRes.statusCode})`);
        }

        if (!ropUpdateRes.body?.user || ropUpdateRes.body.user.name !== 'Обновлённый оператор отдела продаж') {
            throw new Error('Ответ обновления пользователя не содержит актуальное имя');
        }

        if (ropUpdateRes.body.user.is_active !== false) {
            throw new Error('Флаг активности пользователя не обновился после запроса РОПа');
        }

        if (Object.prototype.hasOwnProperty.call(ropUpdateRes.body.user, 'initial_password')) {
            throw new Error('РОП получил исходный пароль в ответе обновления');
        }

        const verifyUpdatedUser = await query(
            'SELECT id, role, department FROM users WHERE id = $1',
            [ropCreatedUser.id]
        );

        if (verifyUpdatedUser.rowCount === 0 || verifyUpdatedUser.rows[0].department !== ropSalesRow.department) {
            throw new Error('Пользователь исчез или сменил отдел после обновления РОПом');
        }

        console.log('🚫 Попытка РОПа изменить отдел сотрудника...');
        const ropChangeDeptReq = {
            params: { userId: ropCreatedUser.id },
            body: { department: 'Marketing' },
            user: {
                id: ropSalesRow.id,
                role: 'rop',
                department: ropSalesRow.department
            }
        };
        const ropChangeDeptRes = createMockResponse();
        await userController.updateUser(ropChangeDeptReq, ropChangeDeptRes);

        if (ropChangeDeptRes.statusCode !== 403) {
            throw new Error(`Ожидался отказ при смене отдела, получен статус ${ropChangeDeptRes.statusCode}`);
        }

        console.log('🚫 Попытка РОПа назначить недопустимую роль...');
        const ropForbiddenRoleReq = {
            params: { userId: ropCreatedUser.id },
            body: { role: 'admin' },
            user: {
                id: ropSalesRow.id,
                role: 'rop',
                department: ropSalesRow.department
            }
        };
        const ropForbiddenRoleRes = createMockResponse();
        await userController.updateUser(ropForbiddenRoleReq, ropForbiddenRoleRes);

        if (ropForbiddenRoleRes.statusCode !== 403) {
            throw new Error(`РОП смог сменить роль на недопустимую (статус ${ropForbiddenRoleRes.statusCode})`);
        }

        console.log('🚫 Попытка РОПа редактировать пользователя чужого отдела...');
        const marketingOperator = (await query('SELECT id, department FROM users WHERE username = $1', ['operator3'])).rows[0];
        const ropForeignEditReq = {
            params: { userId: marketingOperator.id },
            body: { name: 'Не должен обновиться' },
            user: {
                id: ropSalesRow.id,
                role: 'rop',
                department: ropSalesRow.department
            }
        };
        const ropForeignEditRes = createMockResponse();
        await userController.updateUser(ropForeignEditReq, ropForeignEditRes);

        if (ropForeignEditRes.statusCode !== 403) {
            throw new Error(`РОП смог обновить сотрудника чужого отдела (статус ${ropForeignEditRes.statusCode})`);
        }

        console.log('🗑 Подготовка временного пользователя для проверки удаления...');
        const ropDeleteTargetReq = {
            body: {
                username: 'sales.temp.delete',
                name: 'Временный сотрудник отдела продаж',
                role: 'operator'
            },
            user: {
                id: ropSalesRow.id,
                role: 'rop',
                department: ropSalesRow.department
            }
        };
        const ropDeleteTargetRes = createMockResponse();
        await authController.register(ropDeleteTargetReq, ropDeleteTargetRes);

        if (ropDeleteTargetRes.statusCode !== 201) {
            throw new Error(`Не удалось создать временного пользователя для удаления (статус ${ropDeleteTargetRes.statusCode})`);
        }

        if (!ropDeleteTargetRes.body?.user?.id) {
            throw new Error('Ответ регистрации не содержит идентификатор пользователя для удаления');
        }

        const ropDeleteUserId = ropDeleteTargetRes.body.user.id;

        console.log('🗑 Проверка удаления сотрудника своего отдела РОПом...');
        const ropDeleteOwnReq = {
            params: { userId: ropDeleteUserId },
            user: {
                id: ropSalesRow.id,
                role: 'rop',
                department: ropSalesRow.department
            }
        };
        const ropDeleteOwnRes = createMockResponse();
        await userController.deleteUser(ropDeleteOwnReq, ropDeleteOwnRes);

        if (ropDeleteOwnRes.statusCode !== 200) {
            throw new Error(`РОП не смог удалить сотрудника своего отдела (статус ${ropDeleteOwnRes.statusCode})`);
        }

        const deletedCheck = await query('SELECT id, role, department FROM users WHERE id = $1', [ropDeleteUserId]);
        if (deletedCheck.rowCount !== 0) {
            throw new Error('Пользователь не был удалён из базы данных');
        }

        console.log('🚫 Попытка удаления пользователя чужого отдела РОПом...');
        const ropDeleteForeignReq = {
            params: { userId: marketingOperator.id },
            user: {
                id: ropSalesRow.id,
                role: 'rop',
                department: ropSalesRow.department
            }
        };
        const ropDeleteForeignRes = createMockResponse();
        await userController.deleteUser(ropDeleteForeignReq, ropDeleteForeignRes);

        if (ropDeleteForeignRes.statusCode !== 403) {
            throw new Error(`РОП смог удалить сотрудника чужого отдела (статус ${ropDeleteForeignRes.statusCode})`);
        }

        const operator = (await query('SELECT id FROM users WHERE username = $1', ['operator1'])).rows[0];
        const ropSales = ropSalesRow;

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

        console.log('🕒 Проверка удаления своих сообщений с ограничением по времени...');

        const operatorDeptChatLookup = await query(
            `SELECT c.id
               FROM chats c
               JOIN chat_participants cp ON cp.chat_id = c.id
              WHERE cp.user_id = $1
                AND c.type = 'department'
              LIMIT 1`,
            [operator.id]
        );

        const operatorDepartmentChatId = operatorDeptChatLookup.rows[0]?.id;
        if (!operatorDepartmentChatId) {
            throw new Error('Чат отдела оператора не найден для проверки удаления своих сообщений');
        }

        const ownMessageInsert = await query(
            'INSERT INTO messages (chat_id, user_id, content) VALUES ($1, $2, $3) RETURNING id',
            [operatorDepartmentChatId, operator.id, 'Сообщение для проверки удаления в окне 5 минут']
        );

        const ownMessageId = ownMessageInsert.rows[0].id;

        const deleteOwnReq = {
            params: { messageId: ownMessageId },
            user: {
                id: operator.id,
                role: 'operator'
            }
        };
        const deleteOwnRes = createMockResponse();
        await messageController.deleteMessage(deleteOwnReq, deleteOwnRes);

        if (deleteOwnRes.statusCode !== 200) {
            throw new Error(`Оператор не смог удалить своё сообщение в течение 5 минут (статус ${deleteOwnRes.statusCode})`);
        }

        const ownMessageCheck = await query('SELECT id FROM messages WHERE id = $1', [ownMessageId]);
        if (ownMessageCheck.rowCount !== 0) {
            throw new Error('Сообщение не было удалено оператором в разрешённое время');
        }

        console.log('⏳ Проверка запрета удаления своих сообщений после истечения 5 минут...');

        const staleMessageInsert = await query(
            'INSERT INTO messages (chat_id, user_id, content) VALUES ($1, $2, $3) RETURNING id',
            [operatorDepartmentChatId, operator.id, 'Старое сообщение для проверки ограничения']
        );

        const staleMessageId = staleMessageInsert.rows[0].id;
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        await query('UPDATE messages SET created_at = $1 WHERE id = $2', [tenMinutesAgo, staleMessageId]);

        const deleteStaleReq = {
            params: { messageId: staleMessageId },
            user: {
                id: operator.id,
                role: 'operator'
            }
        };
        const deleteStaleRes = createMockResponse();
        await messageController.deleteMessage(deleteStaleReq, deleteStaleRes);

        if (deleteStaleRes.statusCode !== 403 || deleteStaleRes.body?.code !== 'DELETE_WINDOW_EXPIRED') {
            throw new Error(`Ожидалось ограничение по времени на удаление (статус ${deleteStaleRes.statusCode}, код ${deleteStaleRes.body?.code})`);
        }

        const staleMessageStillExists = await query('SELECT id FROM messages WHERE id = $1', [staleMessageId]);
        if (staleMessageStillExists.rowCount === 0) {
            throw new Error('Старое сообщение было удалено вопреки ограничению по времени');
        }

        await query('DELETE FROM messages WHERE id = $1', [staleMessageId]);

        console.log('🧹 Проверка удаления сообщений РОПом в своём отделе...');
        const deptMessageCandidate = await query(
            `SELECT m.id, m.user_id
             FROM messages m
             JOIN chats c ON m.chat_id = c.id
             WHERE c.type = 'department'
               AND c.department = $1
               AND m.user_id <> $2
             ORDER BY m.id
             LIMIT 1`,
            [ropSales.department, ropSales.id]
        );

        const deptChatLookup = await query(
            "SELECT id FROM chats WHERE type = 'department' AND department = $1",
            [ropSales.department]
        );
        const ropDepartmentChatId = deptChatLookup.rows[0]?.id;
        if (!ropDepartmentChatId) {
            throw new Error('Чат отдела РОПа не найден для проверки удаления сообщений');
        }

        let targetDeptMessage = deptMessageCandidate.rows[0];
        if (!targetDeptMessage) {
            const fallbackInsert = await query(
                'INSERT INTO messages (chat_id, user_id, content) VALUES ($1, $2, $3) RETURNING id, user_id',
                [ropDepartmentChatId, operator.id, 'Временное сообщение для проверки удаления РОПом']
            );
            targetDeptMessage = fallbackInsert.rows[0];
        }

        const ropDeleteMessageReq = {
            params: { messageId: targetDeptMessage.id },
            user: {
                id: ropSales.id,
                role: 'rop',
                department: ropSales.department
            }
        };
        const ropDeleteMessageRes = createMockResponse();
        await messageController.deleteMessage(ropDeleteMessageReq, ropDeleteMessageRes);

        if (ropDeleteMessageRes.statusCode !== 200) {
            throw new Error(`РОП не смог удалить сообщение своего отдела (статус ${ropDeleteMessageRes.statusCode})`);
        }

        const verifyRopDeletion = await query('SELECT id FROM messages WHERE id = $1', [targetDeptMessage.id]);
        if (verifyRopDeletion.rowCount !== 0) {
            throw new Error('Сообщение отдела не было удалено РОПом');
        }

        console.log('📜 Проверка истории удалений сообщений...');

        const deletionHistoryAdminReq = {
            query: { limit: '20' },
            user: { id: admin.id, role: 'admin' }
        };
        const deletionHistoryAdminRes = createMockResponse();
        await messageController.getDeletionHistory(deletionHistoryAdminReq, deletionHistoryAdminRes);

        if (deletionHistoryAdminRes.statusCode !== 200 || !Array.isArray(deletionHistoryAdminRes.body?.history)) {
            throw new Error(`Администратор не смог получить историю удалений (статус ${deletionHistoryAdminRes.statusCode})`);
        }

        const historyEntries = deletionHistoryAdminRes.body.history;
        const selfDeletionEntry = historyEntries.find(entry => entry.message_id === ownMessageId);
        if (!selfDeletionEntry || selfDeletionEntry.deletion_scope !== 'self' || selfDeletionEntry.deleted_by_role !== 'operator') {
            throw new Error('История не содержит запись об удалении собственного сообщения оператором');
        }

        const ropDeletionEntry = historyEntries.find(entry => entry.message_id === targetDeptMessage.id);
        if (!ropDeletionEntry || ropDeletionEntry.deleted_by_role !== 'rop' || ropDeletionEntry.deletion_scope !== 'moderator') {
            throw new Error('История не содержит запись об удалении сообщения РОПом отдела');
        }

        const ropHistoryReq = {
            query: { limit: '20' },
            user: {
                id: ropSales.id,
                role: 'rop',
                department: ropSales.department
            }
        };
        const ropHistoryRes = createMockResponse();
        await messageController.getDeletionHistory(ropHistoryReq, ropHistoryRes);

        if (ropHistoryRes.statusCode !== 200 || !Array.isArray(ropHistoryRes.body?.history)) {
            throw new Error(`РОП не смог получить историю удалений своего отдела (статус ${ropHistoryRes.statusCode})`);
        }

        const ropHistoryHasEntry = ropHistoryRes.body.history.some(entry => entry.message_id === targetDeptMessage.id);
        if (!ropHistoryHasEntry) {
            throw new Error('История РОПа не содержит запись об удалении в его отделе');
        }

        console.log('🚫 Проверка запрета удаления сообщений чужого отдела РОПом...');
        const foreignDeptMessage = await query(
            `SELECT m.id
             FROM messages m
             JOIN chats c ON m.chat_id = c.id
             WHERE c.type = 'department'
               AND c.department <> $1
             ORDER BY m.id
             LIMIT 1`,
            [ropSales.department]
        );

        const foreignMessage = foreignDeptMessage.rows[0];
        if (!foreignMessage) {
            throw new Error('Не найдено сообщение другого отдела для проверки удаления РОПом');
        }

        const foreignChatLookup = await query('SELECT chat_id FROM messages WHERE id = $1', [foreignMessage.id]);
        const foreignChatId = foreignChatLookup.rows[0]?.chat_id;

        if (foreignChatId) {
            const ropForeignHistoryReq = {
                query: { chatId: String(foreignChatId) },
                user: {
                    id: ropSales.id,
                    role: 'rop',
                    department: ropSales.department
                }
            };
            const ropForeignHistoryRes = createMockResponse();
            await messageController.getDeletionHistory(ropForeignHistoryReq, ropForeignHistoryRes);

            if (ropForeignHistoryRes.statusCode !== 403) {
                throw new Error('РОП получил доступ к истории удалений чужого отдела');
            }
        }

        const ropMessageDeleteForeignReq = {
            params: { messageId: foreignMessage.id },
            user: {
                id: ropSales.id,
                role: 'rop',
                department: ropSales.department
            }
        };
        const ropMessageDeleteForeignRes = createMockResponse();
        await messageController.deleteMessage(ropMessageDeleteForeignReq, ropMessageDeleteForeignRes);

        if (ropMessageDeleteForeignRes.statusCode !== 403) {
            throw new Error(`Ожидался запрет на удаление чужого отдела, получен статус ${ropMessageDeleteForeignRes.statusCode}`);
        }

        const verifyForeignStillExists = await query('SELECT id FROM messages WHERE id = $1', [foreignMessage.id]);
        if (verifyForeignStillExists.rowCount === 0) {
            throw new Error('Сообщение чужого отдела было удалено, несмотря на запрет');
        }

        console.log('🎉 Автоматический тест прямых сообщений успешно пройден!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Тест прямых сообщений завершился ошибкой');
        console.error(error);
        process.exit(1);
    }
})();
