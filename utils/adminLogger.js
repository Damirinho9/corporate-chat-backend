// utils/adminLogger.js
const { query } = require('../config/database');

/**
 * Логирование действий администратора
 * @param {number} userId - ID пользователя, совершившего действие
 * @param {string} action - Название действия
 * @param {object} details - Детали действия (будет сохранено как JSONB)
 */
async function logAdminAction(userId, action, details = {}) {
    try {
        // Создаем таблицу, если её нет (на случай если база данных старая)
        await query(`
            CREATE TABLE IF NOT EXISTS admin_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                action VARCHAR(100) NOT NULL,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Добавляем индексы, если их нет
        await query(`
            CREATE INDEX IF NOT EXISTS idx_admin_logs_user ON admin_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
        `);

        // Записываем лог
        await query(
            'INSERT INTO admin_logs (user_id, action, details) VALUES ($1, $2, $3)',
            [userId, action, JSON.stringify(details)]
        );

        console.log(`[Admin Log] User ${userId} performed action: ${action}`);
    } catch (error) {
        // Логируем ошибку, но не прерываем основную операцию
        console.error('Failed to log admin action:', error.message);
    }
}

/**
 * Получить последние логи администратора
 * @param {number} limit - Количество записей
 * @param {number} offset - Смещение для пагинации
 */
async function getAdminLogs(limit = 100, offset = 0) {
    try {
        const result = await query(`
            SELECT
                al.id,
                al.user_id,
                al.action,
                al.details,
                al.created_at,
                u.name as user_name,
                u.username
            FROM admin_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        return result.rows;
    } catch (error) {
        console.error('Failed to get admin logs:', error.message);
        return [];
    }
}

/**
 * Получить статистику по действиям администратора
 * @param {number} days - Количество дней для анализа
 */
async function getAdminLogStats(days = 30) {
    try {
        const result = await query(`
            SELECT
                action,
                COUNT(*) as count,
                COUNT(DISTINCT user_id) as unique_admins
            FROM admin_logs
            WHERE created_at >= NOW() - $1::interval
            GROUP BY action
            ORDER BY count DESC
        `, [`${days} days`]);

        return result.rows;
    } catch (error) {
        console.error('Failed to get admin log stats:', error.message);
        return [];
    }
}

module.exports = {
    logAdminAction,
    getAdminLogs,
    getAdminLogStats
};
