#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query, pool } = require('./config/database');

async function applyMigration() {
    console.log('🚀 Применение миграции для таблицы files...\n');

    try {
        // Проверка подключения
        await query('SELECT 1');
        console.log('✅ Подключение к БД установлено\n');

        // Чтение файла миграции
        const migrationPath = path.join(__dirname, 'database/migrations/005_create_files_table.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('📦 Выполнение миграции...');
        await query(sql);

        console.log('✅ Миграция успешно применена!\n');

        // Проверяем результат
        const checkFiles = await query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'files'
            ORDER BY ordinal_position
        `);

        console.log('📋 Таблица files содержит колонки:');
        checkFiles.rows.forEach(col => {
            console.log(`   - ${col.column_name} (${col.data_type})`);
        });

        const checkMessages = await query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'messages' AND column_name = 'file_id'
        `);

        if (checkMessages.rows.length > 0) {
            console.log('\n✅ Колонка file_id добавлена в таблицу messages');
        }

        console.log('\n✨ Готово! Теперь можно загружать файлы.');

    } catch (error) {
        console.error('❌ Ошибка применения миграции:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

applyMigration();
