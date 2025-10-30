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
            console.log(`OK: ${error.response?.data?.error || 'Error caught'}`);
        }

        try {
            await axios.post(`${BASE_URL}/auth/login`, {
                username: 'admin',
                password: 'wrong'
            });
            console.log('FAIL: Wrong password accepted');
        } catch (error) {
            console.log(`OK: ${error.response?.data?.error}`);
        }

        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            username: 'admin',
            password: 'admin123'
        });
        adminToken = loginRes.data.token;
        console.log(`OK: Login successful, token received`);

        console.log('\n=== 2. NAVIGATION ===');
        const chatsRes = await axios.get(`${BASE_URL}/chats`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log(`OK: ${chatsRes.data.chats?.length || 0} chats loaded`);
        
        if (chatsRes.data.chats?.length > 0) {
            const chat = chatsRes.data.chats[0];
            console.log(`   Name: ${chat.name || 'NO NAME'}`);
            console.log(`   Last message: ${chat.last_message ? 'YES' : 'NO'}`);
            console.log(`   Participants: ${chat.participants?.length || 0}`);
        }

        console.log('\n=== 3. CREATE CHAT ===');
        try {
            await axios.post(`${BASE_URL}/chats/group`, {
                participantIds: [1, 2]
            }, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            console.log('WARN: Chat created without name');
        } catch (error) {
            console.log(`OK: ${error.response?.data?.error}`);
        }

        console.log('\n=== 4. PERMISSIONS ===');
        const opLogin = await axios.post(`${BASE_URL}/auth/login`, {
            username: 'operator1',
            password: 'pass123'
        });
        operatorToken = opLogin.data.token;
        console.log('OK: Operator logged in');
        
        try {
            await axios.post(`${BASE_URL}/chats/group`, {
                name: 'Test Group',
                participantIds: [1, 2]
            }, {
                headers: { Authorization: `Bearer ${operatorToken}` }
            });
            console.log('FAIL: Operator created group');
        } catch (error) {
            console.log(`OK: ${error.response?.status} - ${error.response?.data?.error}`);
        }

        try {
            await axios.get(`${BASE_URL}/users`, {
                headers: { Authorization: `Bearer ${operatorToken}` }
            });
            console.log('FAIL: Operator got all users');
        } catch (error) {
            console.log(`OK: ${error.response?.status} - ${error.response?.data?.error}`);
        }

        console.log('\n=== 5. USER LIST ===');
        const usersRes = await axios.get(`${BASE_URL}/users`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log(`OK: ${usersRes.data.users?.length || 0} users`);
        
        if (usersRes.data.users?.length > 0) {
            const u = usersRes.data.users[0];
            console.log(`   Fields: ${Object.keys(u).join(', ')}`);
            console.log(`   Password hidden: ${!u.password && !u.password_hash ? 'YES' : 'NO - DANGER!'}`);
        }

        console.log('\n=== AUDIT COMPLETE ===\n');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

test();
