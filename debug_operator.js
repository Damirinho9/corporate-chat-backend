const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api';

async function debugOperator() {
    // Логин оператора
    const login = await axios.post(`${BASE_URL}/auth/login`, {
        username: 'operator1',
        password: 'pass123'
    });
    const token = login.data.token;
    
    console.log('✅ Оператор залогинен:', login.data.user);
    
    // Получаем его чаты
    const chats = await axios.get(`${BASE_URL}/chats`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(`\n📊 Чатов доступно: ${chats.data.chats.length}`);
    
    if (chats.data.chats.length > 0) {
        const chat = chats.data.chats[0];
        console.log(`\nПервый чат: ${chat.name} (ID: ${chat.id})`);
        console.log(`Участники:`, chat.participants);
        
        try {
            const msg = await axios.post(`${BASE_URL}/chats/${chat.id}/messages`, {
                content: 'Test message from operator'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('\n✅ СООБЩЕНИЕ ОТПРАВЛЕНО!');
        } catch (error) {
            console.log('\n❌ Ошибка отправки:', error.response?.data);
        }
    } else {
        console.log('\n⚠️  У оператора нет доступных чатов!');
    }
}

debugOperator().catch(err => console.error('Error:', err.message));
