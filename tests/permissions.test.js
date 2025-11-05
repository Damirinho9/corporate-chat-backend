/**
 * Автоматические тесты для проверки системы прав и личных сообщений
 *
 * Для запуска: node tests/permissions.test.js
 *
 * Требования:
 * - NODE_ENV=test npm install
 * - Сервер должен быть запущен на порту 3000
 * - База данных должна быть заполнена тестовыми данными (npm run seed)
 */

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

// Счетчики тестов
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Токены пользователей
const tokens = {};

// Вспомогательные функции
async function request(method, endpoint, token = null, body = null) {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_URL}${endpoint}`, options);
    const data = await response.json();

    return {
        status: response.status,
        ok: response.ok,
        data
    };
}

function log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

function assert(condition, testName) {
    totalTests++;
    if (condition) {
        passedTests++;
        log(`  ✓ ${testName}`, 'green');
        return true;
    } else {
        failedTests++;
        log(`  ✗ ${testName}`, 'red');
        return false;
    }
}

async function test(name, fn) {
    log(`\n${name}`, 'cyan');
    try {
        await fn();
    } catch (err) {
        log(`  ✗ Критическая ошибка: ${err.message}`, 'red');
        failedTests++;
    }
}

// ==================== ТЕСТЫ ====================

async function runTests() {
    log('\n='.repeat(60), 'yellow');
    log('🧪 Автоматические тесты системы прав и личных сообщений', 'yellow');
    log('='.repeat(60), 'yellow');

    // 1. Авторизация всех пользователей
    await test('1. Авторизация пользователей', async () => {
        const users = [
            { username: 'admin', password: 'admin123', role: 'admin' },
            { username: 'assist1', password: 'pass123', role: 'assistant' },
            { username: 'assist2', password: 'pass123', role: 'assistant' },
            { username: 'rop1', password: 'pass123', role: 'rop' },
            { username: 'rop2', password: 'pass123', role: 'rop' },
            { username: 'rop3', password: 'pass123', role: 'rop' },
            { username: 'op1a', password: 'pass123', role: 'operator' },
            { username: 'op1b', password: 'pass123', role: 'operator' },
            { username: 'op2a', password: 'pass123', role: 'operator' },
            { username: 'op3a', password: 'pass123', role: 'operator' }
        ];

        for (const user of users) {
            const res = await request('POST', '/auth/login', null, {
                username: user.username,
                password: user.password
            });

            tokens[user.username] = res.data.token;
            assert(res.ok && res.data.token, `Авторизация ${user.username} (${user.role})`);
        }
    });

    // 2. Администратор может писать всем
    await test('2. Администратор может создавать чаты со всеми', async () => {
        const testUsers = ['rop1', 'op1a', 'assist1'];

        for (const username of testUsers) {
            // Получаем ID пользователя
            const usersRes = await request('GET', '/users', tokens.admin);
            const targetUser = usersRes.data.find(u => u.username === username);

            if (!targetUser) {
                log(`  ⚠ Пользователь ${username} не найден`, 'yellow');
                continue;
            }

            const res = await request('POST', '/chats/direct', tokens.admin, {
                receiverId: targetUser.id
            });

            assert(
                res.ok || res.status === 200,
                `Админ → ${username}: ${res.data.message || 'OK'}`
            );
        }
    });

    // 3. Ассистенты могут писать всем
    await test('3. Ассистенты могут создавать чаты со всеми', async () => {
        const testUsers = ['admin', 'rop1', 'op1a'];

        for (const username of testUsers) {
            const usersRes = await request('GET', '/users', tokens.admin);
            const targetUser = usersRes.data.find(u => u.username === username);

            if (!targetUser) {
                log(`  ⚠ Пользователь ${username} не найден`, 'yellow');
                continue;
            }

            const res = await request('POST', '/chats/direct', tokens.assist1, {
                receiverId: targetUser.id
            });

            assert(
                res.ok || res.status === 200,
                `Ассистент → ${username}: ${res.data.message || 'OK'}`
            );
        }
    });

    // 4. РОП может писать всем
    await test('4. РОП может создавать чаты со всеми', async () => {
        const testUsers = ['admin', 'assist1', 'op1a', 'rop2'];

        for (const username of testUsers) {
            const usersRes = await request('GET', '/users', tokens.admin);
            const targetUser = usersRes.data.find(u => u.username === username);

            if (!targetUser) {
                log(`  ⚠ Пользователь ${username} не найден`, 'yellow');
                continue;
            }

            const res = await request('POST', '/chats/direct', tokens.rop1, {
                receiverId: targetUser.id
            });

            assert(
                res.ok || res.status === 200,
                `РОП → ${username}: ${res.data.message || 'OK'}`
            );
        }
    });

    // 5. Операторы могут писать ассистентам
    await test('5. Операторы могут создавать чаты с ассистентами', async () => {
        const assistants = ['assist1', 'assist2'];

        for (const username of assistants) {
            const usersRes = await request('GET', '/users', tokens.admin);
            const targetUser = usersRes.data.find(u => u.username === username);

            if (!targetUser) {
                log(`  ⚠ Пользователь ${username} не найден`, 'yellow');
                continue;
            }

            const res = await request('POST', '/chats/direct', tokens.op1a, {
                receiverId: targetUser.id
            });

            assert(
                res.ok || res.status === 200,
                `Оператор → ${username}: ${res.data.message || 'OK'}`
            );
        }
    });

    // 6. Операторы могут писать своему РОПу
    await test('6. Операторы могут создавать чаты со своим РОПом', async () => {
        const usersRes = await request('GET', '/users', tokens.admin);
        const rop1User = usersRes.data.find(u => u.username === 'rop1');

        if (rop1User) {
            const res = await request('POST', '/chats/direct', tokens.op1a, {
                receiverId: rop1User.id
            });

            assert(
                res.ok || res.status === 200,
                `Оператор 1А → РОП 1 (свой отдел): ${res.data.message || 'OK'}`
            );
        }
    });

    // 7. Операторы НЕ могут писать чужому РОПу
    await test('7. Операторы НЕ могут создавать чаты с чужим РОПом', async () => {
        const usersRes = await request('GET', '/users', tokens.admin);
        const rop2User = usersRes.data.find(u => u.username === 'rop2');

        if (rop2User) {
            const res = await request('POST', '/chats/direct', tokens.op1a, {
                receiverId: rop2User.id
            });

            assert(
                !res.ok && res.status === 403,
                `Оператор 1А ✗ РОП 2 (чужой отдел): Доступ запрещен`
            );
        }
    });

    // 8. Операторы НЕ могут писать друг другу
    await test('8. Операторы НЕ могут создавать чаты между собой', async () => {
        const usersRes = await request('GET', '/users', tokens.admin);
        const op1bUser = usersRes.data.find(u => u.username === 'op1b');
        const op2aUser = usersRes.data.find(u => u.username === 'op2a');

        // Тест 1: Оператор того же отдела
        if (op1bUser) {
            const res1 = await request('POST', '/chats/direct', tokens.op1a, {
                receiverId: op1bUser.id
            });

            assert(
                !res1.ok && res1.status === 403,
                `Оператор 1А ✗ Оператор 1Б (тот же отдел): Доступ запрещен`
            );
        }

        // Тест 2: Оператор другого отдела
        if (op2aUser) {
            const res2 = await request('POST', '/chats/direct', tokens.op1a, {
                receiverId: op2aUser.id
            });

            assert(
                !res2.ok && res2.status === 403,
                `Оператор 1А ✗ Оператор 2А (другой отдел): Доступ запрещен`
            );
        }
    });

    // 9. Проверка открытия существующих чатов
    await test('9. Повторное создание чата возвращает существующий', async () => {
        const usersRes = await request('GET', '/users', tokens.admin);
        const assist1User = usersRes.data.find(u => u.username === 'assist1');

        if (assist1User) {
            // Первый запрос
            const res1 = await request('POST', '/chats/direct', tokens.admin, {
                receiverId: assist1User.id
            });

            const chatId1 = res1.data.chatId;

            // Второй запрос (должен вернуть тот же чат)
            const res2 = await request('POST', '/chats/direct', tokens.admin, {
                receiverId: assist1User.id
            });

            const chatId2 = res2.data.chatId;

            assert(
                chatId1 === chatId2 && res2.data.isNew === false,
                `Повторный запрос вернул существующий чат (ID: ${chatId1})`
            );
        }
    });

    // 10. Проверка доступа к сообщениям чата
    await test('10. Доступ к сообщениям чата', async () => {
        const usersRes = await request('GET', '/users', tokens.admin);
        const assist1User = usersRes.data.find(u => u.username === 'assist1');

        if (assist1User) {
            // Создаем чат
            const createRes = await request('POST', '/chats/direct', tokens.admin, {
                receiverId: assist1User.id
            });

            const chatId = createRes.data.chatId;

            // Админ должен иметь доступ
            const adminAccess = await request('GET', `/chats/${chatId}/messages`, tokens.admin);
            assert(
                adminAccess.ok,
                `Админ имеет доступ к чату ${chatId}`
            );

            // Ассистент должен иметь доступ
            const assistAccess = await request('GET', `/chats/${chatId}/messages`, tokens.assist1);
            assert(
                assistAccess.ok,
                `Ассистент имеет доступ к чату ${chatId}`
            );

            // Посторонний НЕ должен иметь доступ
            const strangerAccess = await request('GET', `/chats/${chatId}/messages`, tokens.op2a);
            assert(
                !strangerAccess.ok && strangerAccess.status === 403,
                `Посторонний НЕ имеет доступа к чату ${chatId}`
            );
        }
    });

    // Итоги
    log('\n' + '='.repeat(60), 'yellow');
    log('📊 Результаты тестирования', 'yellow');
    log('='.repeat(60), 'yellow');
    log(`\nВсего тестов: ${totalTests}`, 'cyan');
    log(`Пройдено: ${passedTests}`, 'green');
    log(`Провалено: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
    log(`Успешность: ${((passedTests / totalTests) * 100).toFixed(1)}%`, failedTests > 0 ? 'yellow' : 'green');
    log('');

    process.exit(failedTests > 0 ? 1 : 0);
}

// Запуск тестов
runTests().catch(err => {
    log(`\n❌ Критическая ошибка: ${err.message}`, 'red');
    log(err.stack, 'gray');
    process.exit(1);
});
