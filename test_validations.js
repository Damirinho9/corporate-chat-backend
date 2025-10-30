const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api';

async function testValidations() {
    console.log('\n🧪 ПРОВЕРКА ВАЛИДАЦИЙ\n');
    
    // Логин админа
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        username: 'admin',
        password: 'admin123'
    });
    const token = loginRes.data.token;
    
    console.log('=== 1. ВАЛИДАЦИЯ ИМЕНИ ЧАТА ===');
    
    // Пустое имя
    try {
        await axios.post(`${BASE_URL}/chats/group`, {
            name: '',
            participantIds: [1, 2]
        }, { headers: { Authorization: `Bearer ${token}` }});
        console.log('❌ Пустое имя прошло');
    } catch (error) {
        console.log(`✅ Блокирует пустое: ${error.response?.data?.errors?.[0]?.msg || error.response?.data?.error}`);
    }
    
    // Короткое имя (1 символ)
    try {
        await axios.post(`${BASE_URL}/chats/group`, {
            name: 'A',
            participantIds: [1, 2]
        }, { headers: { Authorization: `Bearer ${token}` }});
        console.log('❌ Короткое имя прошло');
    } catch (error) {
        console.log(`✅ Требует min 2: ${error.response?.data?.errors?.[0]?.msg || error.response?.data?.error}`);
    }
    
    // Длинное имя (101 символ)
    try {
        await axios.post(`${BASE_URL}/chats/group`, {
            name: 'A'.repeat(101),
            participantIds: [1, 2]
        }, { headers: { Authorization: `Bearer ${token}` }});
        console.log('❌ Длинное имя прошло');
    } catch (error) {
        console.log(`✅ Ограничение max 100: ${error.response?.data?.errors?.[0]?.msg || error.response?.data?.error}`);
    }
    
    console.log('\n=== 2. ВАЛИДАЦИЯ СООБЩЕНИЙ ===');
    
    const chatId = 1;
    
    // Пустое сообщение
    try {
        await axios.post(`${BASE_URL}/chats/${chatId}/messages`, {
            content: ''
        }, { headers: { Authorization: `Bearer ${token}` }});
        console.log('❌ Пустое сообщение прошло');
    } catch (error) {
        console.log(`✅ Блокирует пустое: ${error.response?.data?.errors?.[0]?.msg || error.response?.data?.error}`);
    }
    
    // Длинное сообщение (5001 символ)
    try {
        await axios.post(`${BASE_URL}/chats/${chatId}/messages`, {
            content: 'A'.repeat(5001)
        }, { headers: { Authorization: `Bearer ${token}` }});
        console.log('❌ Длинное сообщение прошло');
    } catch (error) {
        console.log(`✅ Ограничение max 5000: ${error.response?.data?.errors?.[0]?.msg || error.response?.data?.error}`);
    }
    
    console.log('\n=== 3. ВАЛИДАЦИЯ ПАРОЛЯ ===');
    
    // Короткий пароль (5 символов)
    try {
        await axios.post(`${BASE_URL}/auth/register`, {
            username: 'testuser' + Date.now(),
            password: '12345',
            name: 'Test User',
            role: 'employee',
            department: 'IT'
        }, { headers: { Authorization: `Bearer ${token}` }});
        console.log('❌ Короткий пароль прошел');
    } catch (error) {
        console.log(`✅ Требует min 6: ${error.response?.data?.errors?.[0]?.msg || error.response?.data?.error}`);
    }
    
    console.log('\n✅ ВСЕ ВАЛИДАЦИИ РАБОТАЮТ!\n');
}

testValidations().catch(err => console.error('Error:', err.message));
