const bcrypt = require('bcrypt');
const { query } = require('../config/database');

async function seedDatabase() {
    try {
        console.log('🌱 Seeding database with demo users (NEW ROLES)...');

        // Хэшируем пароли
        const adminPassword = await bcrypt.hash('admin123', 10);
        const userPassword = await bcrypt.hash('pass123', 10);
        
        console.log('✅ Passwords hashed successfully');

        // Очистить существующие данные (в правильном порядке из-за foreign keys)
        await query('DELETE FROM admin_logs');
        await query('DELETE FROM messages');
        await query('DELETE FROM chat_participants');
        await query('DELETE FROM chats');
        await query('DELETE FROM users');
        
        // Сбросить sequences
        await query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
        await query('ALTER SEQUENCE chats_id_seq RESTART WITH 1');
        await query('ALTER SEQUENCE messages_id_seq RESTART WITH 1');
        await query('ALTER SEQUENCE admin_logs_id_seq RESTART WITH 1');
        
        console.log('✅ Cleared existing data');

        // 1. Создать пользователей
        const usersResult = await query(`
            INSERT INTO users (username, password_hash, name, role, department, is_active)
            VALUES 
                -- Администраторы (нет отдела)
                ('admin', $1, 'Главный администратор', 'admin', NULL, true),
                
                -- Ассистенты (нет отдела)
                ('assistant1', $2, 'Ассистент Анна', 'assistant', NULL, true),
                ('assistant2', $2, 'Ассистент Борис', 'assistant', NULL, true),
                
                -- РОПы (есть отделы)
                ('rop_sales', $2, 'РОП Sales - Виктор', 'rop', 'Sales', true),
                ('rop_marketing', $2, 'РОП Marketing - Галина', 'rop', 'Marketing', true),
                
                -- Операторы (есть отделы)
                ('operator1', $2, 'Оператор Sales - Дмитрий', 'operator', 'Sales', true),
                ('operator2', $2, 'Оператор Sales - Елена', 'operator', 'Sales', true),
                ('operator3', $2, 'Оператор Marketing - Жанна', 'operator', 'Marketing', true),
                
                -- Сотрудники (для примера)
                ('employee1', $2, 'Сотрудник IT - Иван', 'employee', 'IT', true),
                ('employee2', $2, 'Сотрудник IT - Мария', 'employee', 'IT', true)
            RETURNING id
        `, [adminPassword, userPassword]);

        console.log('✅ Inserted demo users');

        // Получить ID созданных пользователей
        const userIds = usersResult.rows.map(row => row.id);
        const [adminId, assistant1Id, assistant2Id, ropSalesId, ropMarketingId, 
               operator1Id, operator2Id, operator3Id, employee1Id, employee2Id] = userIds;

        // 2. Создать чаты
        const chatsResult = await query(`
            INSERT INTO chats (name, type, department, created_by)
            VALUES 
                -- Общие чаты
                ('Руководство', 'group', NULL, $1),
                ('Все ассистенты', 'group', NULL, $1),
                
                -- Отдельные чаты по отделам
                ('Отдел продаж', 'department', 'Sales', $2),
                ('Отдел маркетинга', 'department', 'Marketing', $3),
                
                -- Примеры личных чатов
                (NULL, 'direct', NULL, $1),  -- админ + ассистент1
                (NULL, 'direct', NULL, $2),  -- РОП Sales + оператор1
                (NULL, 'direct', NULL, $4)   -- ассистент1 + оператор1
            RETURNING id
        `, [adminId, ropSalesId, ropMarketingId, assistant1Id]);

        console.log('✅ Created chats');

        const chatIds = chatsResult.rows.map(row => row.id);
        const [managementChatId, assistantsChatId, salesChatId, marketingChatId, 
               directChat1Id, directChat2Id, directChat3Id] = chatIds;

        // 3. Добавить участников в чаты
        await query(`
            INSERT INTO chat_participants (chat_id, user_id)
            VALUES 
                -- Руководство (только админы и РОПы)
                ($1, $2), ($1, $5), ($1, $6),
                
                -- Все ассистенты
                ($7, $2), ($7, $3), ($7, $4),
                
                -- Отдел продаж (РОП + операторы Sales)
                ($8, $5), ($8, $9), ($8, $10),
                
                -- Отдел маркетинга (РОП + операторы Marketing)
                ($11, $6), ($11, $12),
                
                -- Личный чат 1 (админ + ассистент1)
                ($13, $2), ($13, $3),
                
                -- Личный чат 2 (РОП Sales + оператор1)
                ($14, $5), ($14, $9),
                
                -- Личный чат 3 (ассистент1 + оператор1)
                ($15, $3), ($15, $9)
        `, [
            managementChatId, adminId, ropSalesId, ropMarketingId,
            assistantsChatId, adminId, assistant1Id, assistant2Id,
            salesChatId, ropSalesId, operator1Id, operator2Id,
            marketingChatId, ropMarketingId, operator3Id,
            directChat1Id, adminId, assistant1Id,
            directChat2Id, ropSalesId, operator1Id,
            directChat3Id, assistant1Id, operator1Id
        ]);

        console.log('✅ Added chat participants');

        // 4. Добавить приветственные сообщения
        await query(`
            INSERT INTO messages (chat_id, user_id, content)
            VALUES 
                ($1, $2, 'Добро пожаловать в корпоративный чат! 👋'),
                ($1, $3, 'Привет, руководство! Готовы к работе.'),
                
                ($4, $5, 'Здравствуйте, ассистенты! Это общий чат для всех помощников.'),
                
                ($6, $7, 'Отдел продаж, приветствую! Начинаем работу.'),
                ($6, $8, 'Здравствуйте! Готов к задачам.'),
                
                ($9, $10, 'Привет! Как дела?'),
                ($9, $3, 'Отлично, спасибо!')
        `, [
            managementChatId, adminId, ropSalesId,
            assistantsChatId, assistant1Id,
            salesChatId, ropSalesId, operator1Id,
            directChat1Id, adminId, assistant1Id
        ]);

        console.log('✅ Added welcome messages');
        console.log('');
        console.log('✅ Database seeded successfully!');
        console.log('');
        console.log('📋 Demo users created:');
        console.log('═════════════════════════════════════════════════');
        console.log('👑 АДМИНИСТРАТОРЫ (все права):');
        console.log('  • admin / admin123 - Главный администратор');
        console.log('');
        console.log('👔 АССИСТЕНТЫ (пишут всем):');
        console.log('  • assistant1 / pass123 - Ассистент Анна');
        console.log('  • assistant2 / pass123 - Ассистент Борис');
        console.log('');
        console.log('📊 РУКОВОДИТЕЛИ ОТДЕЛОВ (РОПы):');
        console.log('  • rop_sales / pass123 - РОП Sales - Виктор');
        console.log('  • rop_marketing / pass123 - РОП Marketing - Галина');
        console.log('');
        console.log('💼 ОПЕРАТОРЫ (ограниченные права):');
        console.log('  • operator1 / pass123 - Оператор Sales - Дмитрий');
        console.log('  • operator2 / pass123 - Оператор Sales - Елена');
        console.log('  • operator3 / pass123 - Оператор Marketing - Жанна');
        console.log('');
        console.log('📝 ПРАВА ДОСТУПА:');
        console.log('═════════════════════════════════════════════════');
        console.log('✅ Админы: видят и пишут ВСЁ');
        console.log('✅ Ассистенты: пишут всем');
        console.log('✅ РОПы: управляют своими отделами, пишут всем');
        console.log('⚠️  Операторы: пишут ассистентам и своему РОПу');
        console.log('❌ Операторы: НЕ пишут друг другу');
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