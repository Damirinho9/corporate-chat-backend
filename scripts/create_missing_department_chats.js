#!/usr/bin/env node
/**
 * Скрипт для создания чатов отделов, если они отсутствуют
 *
 * Проблема: отделы были созданы без автоматического создания чатов,
 * что привело к ситуации "Нет группового чата" в UI
 *
 * Решение: для каждого отдела, у которого нет чата, создаём чат типа 'department'
 */

const { query, pool } = require('../config/database');

const normalizeDepartmentName = (value) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
};

async function createMissingDepartmentChats() {
    try {
        console.log('🔍 Ищем отделы без групповых чатов...\n');

        // Получаем все уникальные отделы из users
        const departmentsResult = await query(`
            SELECT DISTINCT department
            FROM users
            WHERE department IS NOT NULL AND department != ''
            ORDER BY department
        `);

        const departments = departmentsResult.rows
            .map(row => normalizeDepartmentName(row.department))
            .filter(Boolean);

        console.log(`📊 Найдено отделов: ${departments.length}`);
        departments.forEach(dept => console.log(`  - ${dept}`));
        console.log('');

        // Для каждого отдела проверяем наличие чата
        const results = [];

        for (const deptName of departments) {
            // Проверяем, есть ли чат отдела
            const chatCheck = await query(
                `SELECT id, name, type
                 FROM chats
                 WHERE type = 'department'
                   AND (department = $1 OR name = $1)
                 LIMIT 1`,
                [deptName]
            );

            if (chatCheck.rows.length > 0) {
                const chat = chatCheck.rows[0];
                console.log(`✅ Отдел "${deptName}" - чат существует (id: ${chat.id})`);
                results.push({ department: deptName, status: 'exists', chatId: chat.id });
            } else {
                console.log(`⚠️  Отдел "${deptName}" - чат отсутствует, создаём...`);

                // Получаем РОПа отдела для created_by
                const ropResult = await query(
                    `SELECT id FROM users
                     WHERE department = $1 AND role = 'rop'
                     ORDER BY created_at
                     LIMIT 1`,
                    [deptName]
                );

                const createdBy = ropResult.rows[0]?.id || null;

                // Создаём чат
                const newChatResult = await query(
                    `INSERT INTO chats (name, type, department, created_by)
                     VALUES ($1, 'department', $1, $2)
                     RETURNING id`,
                    [deptName, createdBy]
                );

                const newChatId = newChatResult.rows[0].id;

                // Добавляем всех пользователей отдела в чат
                const deptUsersResult = await query(
                    `SELECT id FROM users WHERE department = $1 AND is_active = true`,
                    [deptName]
                );

                const userIds = deptUsersResult.rows.map(u => u.id);

                if (userIds.length > 0) {
                    // Добавляем участников
                    for (const userId of userIds) {
                        await query(
                            `INSERT INTO chat_participants (chat_id, user_id)
                             VALUES ($1, $2)
                             ON CONFLICT DO NOTHING`,
                            [newChatId, userId]
                        );
                    }

                    console.log(`   ✅ Создан чат (id: ${newChatId}), добавлено участников: ${userIds.length}`);
                } else {
                    console.log(`   ✅ Создан чат (id: ${newChatId}), участников: 0`);
                }

                results.push({
                    department: deptName,
                    status: 'created',
                    chatId: newChatId,
                    participants: userIds.length
                });
            }
        }

        console.log('\n📊 Итоговая статистика:');
        console.log(`  Всего отделов: ${results.length}`);
        console.log(`  Уже были чаты: ${results.filter(r => r.status === 'exists').length}`);
        console.log(`  Создано новых: ${results.filter(r => r.status === 'created').length}`);

        const created = results.filter(r => r.status === 'created');
        if (created.length > 0) {
            console.log('\n✨ Созданные чаты:');
            created.forEach(r => {
                console.log(`  - ${r.department} (chat_id: ${r.chatId}, участников: ${r.participants})`);
            });
        }

        console.log('\n✅ Готово! Теперь перезагрузите страницу в браузере (Ctrl+Shift+R)');

    } catch (error) {
        console.error('❌ Ошибка:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Запуск скрипта
if (require.main === module) {
    createMissingDepartmentChats()
        .then(() => {
            console.log('\n🎉 Скрипт завершён успешно');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Скрипт завершён с ошибкой:', error);
            process.exit(1);
        });
}

module.exports = { createMissingDepartmentChats };
