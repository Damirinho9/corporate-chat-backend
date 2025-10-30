const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let adminToken, operatorToken;

console.log('\n🎨 UX/UI ТЕСТИРОВАНИЕ - ПРОВЕРКА ЗДРАВОГО СМЫСЛА\n');

async function testUserExperience() {
    try {
        // 1. ONBOARDING - Первый опыт пользователя
        console.log('=== 1. ONBOARDING - Первый опыт ===');
        
        // Попытка войти без credentials
        try {
            await axios.post(`${BASE_URL}/auth/login`, {});
            console.log('❌ Система пропустила пустой логин');
        } catch (error) {
            if (error.response?.data?.error) {
                console.log(`✅ Понятное сообщение об ошибке: "${error.response.data.error}"`);
            } else {
                console.log('⚠️ Нет понятного сообщения об ошибке');
            }
        }

        // Попытка с неправильным паролем
        try {
            await axios.post(`${BASE_URL}/auth/login`, {
                username: 'admin',
                password: 'wrongpassword'
            });
            console.log('❌ Система пропустила неверный пароль');
        } catch (error) {
            if (error.response?.data?.error === 'Invalid credentials') {
                console.log('✅ Безопасное сообщение (не раскрывает username)');
            } else {
                console.log(`⚠️ Сообщение: ${error.response?.data?.error}`);
            }
        }

        // Успешный логин
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            username: 'admin',
            password: 'admin123'
        });
        adminToken = loginRes.data.token;
        const user = loginRes.data.user;
        
        console.log(`✅ Успешный логин`);
        console.log(`   Возвращается: token, user {${Object.keys(user).join(', ')}}`);
        
        if (!user.name || !user.role) {
            console.log('⚠️ Не хватает данных пользователя для UI');
        }

        // 2. НАВИГАЦИЯ - Что видит пользователь после логина?
        console.log('\n=== 2. НАВИГАЦИЯ - Первый экран ===');
        
        const chatsRes = await axios.get(`${BASE_URL}/chats`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        
        console.log(`✅ Получено ${chatsRes.data.chats?.length || 0} чатов`);
        
        if (chatsRes.data.chats?.length > 0) {
            const chat = chatsRes.data.chats[0];
            console.log(`   Пример чата: ${chat.name || 'Без имени'}`);
            console.log(`   Есть ли превью последнего сообщения? ${chat.last_message ? '✅' : '❌'}`);
            console.log(`   Есть ли счетчик непрочитанных? ${typeof chat.unread_count !== 'undefined' ? '✅' : '❌'}`);
            console.log(`   Есть ли участники? ${chat.participants?.length > 0 ? '✅' : '❌'}`);
        }

        // 3. СОЗДАНИЕ ЧАТА - Насколько это просто?
        console.log('\n=== 3. СОЗДАНИЕ ЧАТА - Простота использования ===');
        
        // Попытка создать чат без имени
        try {
            await axios.post(`${BASE_URL}/chats/group`, {
                participantIds: [1, 2]
            }, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            console.log('⚠️ Система создала чат без имени');
        } catch (error) {
            console.log(`✅ Требует имя чата: "${error.response?.data?.error}"`);
        }

        // Попытка создать чат без участников
        try {
            await axios.post(`${BASE_URL}/chats/group`, {
                name: 'Тестовый чат'
            }, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            console.log('⚠️ Система создала чат без участников');
        } catch (error) {
            console.log(`✅ Требует участников: "${error.response?.data?.error}"`);
        }

        // 4. ОТПРАВКА СООБЩЕНИЙ - UX отправки
        console.log('\n=== 4. ОТПРАВКА СООБЩЕНИЙ - User Experience ===');
        
        const chatId = chatsRes.data.chats[0]?.id;
        
        if (chatId) {
            // Пустое сообщение
            try {
                await axios.post(`${BASE_URL}/chats/${chatId}/messages`, {
                    content: ''
                }, {
                    headers: { Authorization: `Bearer ${adminToken}` }
                });
                console.log('⚠️ Система отправила пустое сообщение');
            } catch (error) {
                console.log(`✅ Блокирует пустые сообщения: "${error.response?.data?.error}"`);
            }

            // Очень длинное сообщение
            const longMessage = 'А'.repeat(10000);
            try {
                await axios.post(`${BASE_URL}/chats/${chatId}/messages`, {
                    content: longMessage
                }, {
                    headers: { Authorization: `Bearer ${adminToken}` }
                });
                console.log('⚠️ Система приняла сообщение на 10k символов без предупреждения');
            } catch (error) {
                console.log(`✅ Есть лимит длины: "${error.response?.data?.error}"`);
            }

            // Нормальное сообщение
            const msgRes = await axios.post(`${BASE_URL}/chats/${chatId}/messages`, {
                content: 'Тестовое сообщение для UX проверки'
            }, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            
            console.log(`✅ Сообщение отправлено`);
            console.log(`   ID сообщения возвращается? ${msgRes.data.message?.id ? '✅' : '❌'}`);
            console.log(`   Timestamp возвращается? ${msgRes.data.message?.created_at ? '✅' : '❌'}`);
        }

        // 5. ПОЛУЧЕНИЕ СООБЩЕНИЙ - Что видит пользователь?
        console.log('\n=== 5. ПОЛУЧЕНИЕ СООБЩЕНИЙ - Отображение ===');
        
        if (chatId) {
            const messagesRes = await axios.get(`${BASE_URL}/chats/${chatId}/messages`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            
            console.log(`✅ Получено ${messagesRes.data.messages?.length || 0} сообщений`);
            
            if (messagesRes.data.messages?.length > 0) {
                const msg = messagesRes.data.messages[0];
                console.log(`   Есть имя отправителя? ${msg.sender_name ? '✅' : '❌'}`);
                console.log(`   Есть username? ${msg.sender_username ? '✅' : '❌'}`);
                console.log(`   Есть роль пользователя? ${msg.sender_role ? '✅' : '❌'}`);
                console.log(`   Есть timestamp? ${msg.created_at ? '✅' : '❌'}`);
                console.log(`   Есть поддержка файлов? ${msg.files !== undefined ? '✅' : '❌'}`);
                console.log(`   Есть поддержка реакций? ${msg.reactions !== undefined ? '✅' : '❌'}`);
            }
        }

        // 6. СПИСОК ПОЛЬЗОВАТЕЛЕЙ - Для админа
        console.log('\n=== 6. СПИСОК ПОЛЬЗОВАТЕЛЕЙ - Админ панель ===');
        
        const usersRes = await axios.get(`${BASE_URL}/users`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        
        console.log(`✅ Получено ${usersRes.data.users?.length || 0} пользователей`);
        
        if (usersRes.data.users?.length > 0) {
            const u = usersRes.data.users[0];
            console.log(`   Видно: ${Object.keys(u).join(', ')}`);
            console.log(`   Скрыт пароль? ${!u.password && !u.password_hash ? '✅' : '❌ ОПАСНО!'}`);
            console.log(`   Есть last_seen? ${u.last_seen ? '✅' : '❌'}`);
            console.log(`   Есть is_active? ${typeof u.is_active !== 'undefined' ? '✅' : '❌'}`);
        }

        // 7. СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ - Валидация
        console.log('\n=== 7. СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ - Валидация ===');
        
        // Дубликат username
        try {
            await axios.post(`${BASE_URL}/auth/register`, {
                username: 'admin',
                password: 'test123',
                name: 'Test',
                role: 'employee',
                department: 'IT'
            }, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            console.log('❌ Система создала дубликат username');
        } catch (error) {
            console.log(`✅ Блокирует дубликаты: "${error.response?.data?.error}"`);
        }

        // Слабый пароль
        try {
            await axios.post(`${BASE_URL}/auth/register`, {
                username: 'testuser' + Date.now(),
                password: '123',
                name: 'Test',
                role: 'employee',
                department: 'IT'
            }, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            console.log('⚠️ Система приняла слабый пароль (123)');
        } catch (error) {
            console.log(`✅ Требует сильный пароль: "${error.response?.data?.error}"`);
        }

        // 8. СТАТИСТИКА - Насколько она полезна?
        console.log('\n=== 8. СТАТИСТИКА - Полезность для бизнеса ===');
        
        const statsRes = await axios.get(`${BASE_URL}/users/stats`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        
        console.log(`✅ Статистика пользователей:`);
        console.log(`   Всего: ${statsRes.data.overall?.total_users || 0}`);
        console.log(`   Активных: ${statsRes.data.overall?.active_users || 0}`);
        console.log(`   Онлайн: ${statsRes.data.overall?.online_users || 0}`);
        console.log(`   По отделам: ${statsRes.data.byDepartment?.length || 0} отделов`);
        
        const msgStats = await axios.get(`${BASE_URL}/messages/stats`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        
        console.log(`✅ Статистика сообщений:`);
        console.log(`   Всего: ${msgStats.data.overall?.total_messages || 0}`);
        console.log(`   За 24ч: ${msgStats.data.overall?.messages_24h || 0}`);
        console.log(`   Активных чатов: ${msgStats.data.overall?.active_chats || 0}`);
        console.log(`   Топ юзеров: ${msgStats.data.topUsers?.length || 0}`);

        // 9. ПРАВА ДОСТУПА - Понятны ли ошибки?
        console.log('\n=== 9. ПРАВА ДОСТУПА - User Experience ===');
        
        // Логин оператора
        const opLogin = await axios.post(`${BASE_URL}/auth/login`, {
            username: 'operator1',
            password: 'operator123'
        });
        operatorToken = opLogin.data.token;
        
        // Оператор пытается создать группу
        try {
            await axios.post(`${BASE_URL}/chats/group`, {
                name: 'Test',
                participantIds: [1, 2]
            }, {
                headers: { Authorization: `Bearer ${operatorToken}` }
            });
            console.log('❌ Оператор создал группу (не должен)');
        } catch (error) {
            if (error.response?.status === 403) {
                console.log(`✅ Правильный статус 403`);
                console.log(`   Сообщение понятное? "${error.response.data.error}"`);
            } else {
                console.log(`⚠️ Неправильный статус: ${error.response?.status}`);
            }
        }

        // Оператор пытается получить список всех пользователей
        try {
            await axios.get(`${BASE_URL}/users`, {
                headers: { Authorization: `Bearer ${operatorToken}` }
            });
            console.log('❌ Оператор получил список всех пользователей');
        } catch (error) {
            console.log(`✅ Доступ запрещен: "${error.response?.data?.error}"`);
        }

        console.log('\n=== ✅ UX/UI АУДИТ ЗАВЕРШЕН ===\n');

    } catch (error) {
        console.error('Ошибка тестирования:', error.message);
    }
}

testUserExperience();
