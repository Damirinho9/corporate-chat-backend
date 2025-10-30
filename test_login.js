const axios = require('axios');

async function testLogins() {
    const passwords = ['operator123', 'operator', '12345', 'password'];
    
    for (const pwd of passwords) {
        try {
            const res = await axios.post('http://localhost:3000/api/auth/login', {
                username: 'operator1',
                password: pwd
            });
            console.log(`✅ SUCCESS with password: ${pwd}`);
            process.exit(0);
        } catch (error) {
            console.log(`❌ Failed: ${pwd}`);
        }
    }
    console.log('\nNone worked. Check seed.js file.');
}

testLogins();
