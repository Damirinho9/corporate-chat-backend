require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkPasswords() {
    try {
        const result = await pool.query(`
            SELECT id, username, initial_password, name, role
            FROM users
            ORDER BY id
        `);

        console.log('✅ Пароли в базе данных:\n');
        console.log('ID | Логин      | Пароль           | Имя');
        console.log('---|------------|------------------|--------------------');

        result.rows.forEach(user => {
            const pwd = user.initial_password || '(нет)';
            const id = String(user.id).padStart(2);
            const username = user.username.padEnd(10);
            const password = pwd.padEnd(16);
            console.log(`${id} | ${username} | ${password} | ${user.name}`);
        });

        const withPassword = result.rows.filter(u => u.initial_password).length;
        const total = result.rows.length;

        console.log(`\n📊 Статистика: ${withPassword}/${total} пользователей имеют пароль`);

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
    } finally {
        await pool.end();
    }
}

checkPasswords();
