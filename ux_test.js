const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api';
let adminToken, operatorToken;

console.log('\n🎨 UX/UI AUDIT\n');

async function test() {
    try {
        console.log('=== 1. ONBOARDING ===');
        
        try {
            await axios.post(`${BASE_URL}/auth/login`, {});
            console.log('FAIL: Empty login accepted');
        } catch (error) {
            console.log(`OK: ${error.response?.data?.error}`);
        }

        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            username: 'admin',
            password: 'admin123'
        });
        adminToken = loginRes.data.token;
        console.log('OK: Login successful');

        console.log('\n=== 2. NAVIGATION ===');
        const chatsRes = await axios.get(`${BASE_URL}/chats`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log(`OK: Chats loaded: ${chatsRes.data.chats?.length || 0}`);

        console.log('\n=== 3. PERMISSIONS ===');
        const opLogin = await axios.post(`${BASE_URL}/auth/login`, {
            username: 'operator1',
            password: 'operator123'
        });
        operatorToken = opLogin.data.token;
        
        try {
            await axios.post(`${BASE_URL}/chats/group`, {
                name: 'Test',
                participantIds: [1, 2]
            }, {
                headers: { Authorization: `Bearer ${operatorToken}` }
            });
            console.log('FAIL: Operator created group');
        } catch (error) {
            console.log(`OK: 403 - ${error.response?.data?.error}`);
        }

        console.log('\n=== DONE ===\n');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

test();
