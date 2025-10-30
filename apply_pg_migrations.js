const { query } = require('./config/database');

async function applyMigrations() {
    console.log('🔧 Применение миграций...\n');
    
    try {
        // 1. Добавляем last_read_message_id
        console.log('1. Добавляем last_read_message_id...');
        await query(`
            ALTER TABLE chat_participants 
            ADD COLUMN IF NOT EXISTS last_read_message_id INTEGER DEFAULT 0
        `);
        console.log('✅ last_read_message_id добавлен');
        
        // 2. Добавляем last_seen
        console.log('2. Добавляем last_seen...');
        await query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NULL
        `);
        console.log('✅ last_seen добавлен');
        
        // 3. Обновляем last_seen для активных пользователей
        console.log('3. Обновляем last_seen...');
        const result = await query(`
            UPDATE users 
            SET last_seen = CURRENT_TIMESTAMP 
            WHERE is_active = true AND last_seen IS NULL
        `);
        console.log(`✅ Обновлено ${result.rowCount} пользователей`);
        
        console.log('\n✅ ВСЕ МИГРАЦИИ ПРИМЕНЕНЫ!\n');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
}

applyMigrations();
