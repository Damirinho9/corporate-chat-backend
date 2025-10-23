const bcrypt = require('bcrypt');
const { query } = require('../config/database');

async function seedDatabase() {
    try {
        console.log('🌱 Seeding database with demo users...');

        // Хэшируем пароли
        const adminPassword = await bcrypt.hash('admin123', 10);
        const userPassword = await bcrypt.hash('pass123', 10);
        
        console.log('✅ Passwords hashed successfully');

        // Очистить существующие данные (в правильном порядке из-за foreign keys)
        await query('DELETE FROM messages');
        await query('DELETE FROM chat_participants');
        await query('DELETE FROM chats');
        await query('DELETE FROM users');
        
        // Сбросить sequences
        await query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
        await query('ALTER SEQUENCE chats_id_seq RESTART WITH 1');
        await query('ALTER SEQUENCE messages_id_seq RESTART WITH 1');
        
        console.log('✅ Cleared existing data');

        // 1. Создать пользователей
        const usersResult = await query(`
            INSERT INTO users (username, password_hash, name, role, department, is_active)
            VALUES 
                ('admin', $1, 'Администратор', 'admin', NULL, true),
                ('assistant1', $2, 'Ассистент Анна', 'assistant', NULL, true),
                ('assistant2', $2, 'Ассистент Борис', 'assistant', NULL, true),
                ('rop_sales', $2, 'РОП Sales - Виктор', 'rop', 'Sales', true),
                ('rop_marketing', $2, 'РОП Marketing - Галина', 'rop', 'Marketing', true),
                ('operator1', $2, 'Оператор Sales - Дмитрий', 'operator', 'Sales', true),
                ('operator2', $2, 'Оператор Sales - Елена', 'operator', 'Sales', true),
                ('operator3', $2, 'Оператор Marketing - Жанна', 'operator', 'Marketing', true),
                ('dev1', $2, 'Разработчик Иван', 'employee', 'IT', true),
                ('dev2', $2, 'Разработчик Ксения', 'employee', 'IT', true)
            RETURNING id
        `, [adminPassword, userPassword]);

        console.log('✅ Inserted demo users');

        // Получить ID созданных пользователей
        const userIds = usersResult.rows.map(row => row.id);
        const [adminId, assistant1Id, assistant2Id, ropSalesId, ropMarketingId, 
               operator1Id, operator2Id, operator3Id, dev1Id, dev2Id] = userIds;

        // 2. Создать чаты
        const chatsResult = await query(`
            INSERT INTO chats (name, type, department, created_by)
            VALUES 
                ('Общий чат', 'group', NULL, $1),
                ('Отдел продаж', 'department', 'Sales', $2),
                ('Отдел маркетинга', 'department', 'Marketing', $3),
                ('IT команда', 'department', 'IT', $1),
                (NULL, 'direct', NULL, $1),
                (NULL, 'direct', NULL, $2)
            RETURNING id
        `, [adminId, ropSalesId, ropMarketingId]);

        console.log('✅ Created chats');

        const chatIds = chatsResult.rows.map(row => row.id);
        const [generalChatId, salesChatId, marketingChatId, itChatId, 
               directChat1Id, directChat2Id] = chatIds;

        // 3. Добавить участников в чаты
        await query(`
            INSERT INTO chat_participants (chat_id, user_id)
            VALUES 
                -- Общий чат (все)
                ($1, $2), ($1, $3), ($1, $4), ($1, $5), ($1, $6),
                ($1, $7), ($1, $8), ($1, $9), ($1, $10), ($1, $11),
                -- Отдел продаж
                ($12, $2), ($12, $5), ($12, $7), ($12, $8),
                -- Отдел маркетинга
                ($13, $2), ($13, $6), ($13, $9),
                -- IT команда
                ($14, $2), ($14, $10), ($14, $11),
                -- Личный чат 1 (админ + ассистент1)
                ($15, $2), ($15, $3),
                -- Личный чат 2 (РОП Sales + оператор1)
                ($16, $5), ($16, $7)
        `, [
            generalChatId, adminId, assistant1Id, assistant2Id, ropSalesId, ropMarketingId,
            operator1Id, operator2Id, operator3Id, dev1Id, dev2Id,
            salesChatId, marketingChatId, itChatId, directChat1Id, directChat2Id
        ]);

        console.log('✅ Added chat participants');

        // 4. Добавить приветственные сообщения
        await query(`
            INSERT INTO messages (chat_id, user_id, content)
            VALUES 
                ($1, $2, 'Добро пожаловать в корпоративный чат! 👋'),
                ($1, $3, 'Привет всем! Рада присоединиться к команде.'),
                ($4, $5, 'Отдел продаж, добро пожаловать! Давайте обсудим цели на этот квартал.'),
                ($6, $7, 'IT команда готова к работе! 💻'),
                ($8, $2, 'Привет! Как дела?'),
                ($8, $3, 'Отлично, спасибо! У тебя как?')
        `, [
            generalChatId, adminId, assistant1Id,
            salesChatId, ropSalesId,
            itChatId, dev1Id,
            directChat1Id, adminId, assistant1Id
        ]);

        console.log('✅ Added welcome messages');
        console.log('');
        console.log('✅ Database seeded successfully!');
        console.log('');
        console.log('📋 Demo users created:');
        console.log('  • admin / admin123 - Администратор (все права)');
        console.log('  • assistant1 / pass123 - Ассистент Анна');
        console.log('  • rop_sales / pass123 - РОП Sales - Виктор');
        console.log('  • operator1 / pass123 - Оператор Sales - Дмитрий');
        console.log('  • dev1 / pass123 - Разработчик Иван');
        console.log('');

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    }
}

// Если запускается напрямую
if (require.main === module) {
    seedDatabase()
        .then(() => {
            console.log('✅ Seeding complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Seeding failed:', error);
            process.exit(1);
        });
}

module.exports = seedDatabase;