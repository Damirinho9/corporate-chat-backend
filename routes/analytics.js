// routes/analytics.js
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/analytics/messages/timeline
 * Получить статистику сообщений по времени (день/неделя/месяц)
 */
router.get('/messages/timeline', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 'week' } = req.query; // day, week, month

        let interval, limit;
        switch (period) {
            case 'day':
                interval = '1 hour';
                limit = 24;
                break;
            case 'month':
                interval = '1 day';
                limit = 30;
                break;
            case 'week':
            default:
                interval = '1 day';
                limit = 7;
        }

        const result = await query(`
            SELECT
                date_trunc($1, created_at) as time_bucket,
                COUNT(*) as message_count
            FROM messages
            WHERE created_at >= NOW() - INTERVAL '${limit} ${interval}'
            GROUP BY time_bucket
            ORDER BY time_bucket ASC
        `, [interval.split(' ')[1]]); // 'hour' or 'day'

        res.json({
            period,
            data: result.rows
        });
    } catch (error) {
        console.error('Messages timeline error:', error);
        res.status(500).json({ error: 'Failed to get messages timeline' });
    }
});

/**
 * GET /api/analytics/users/active
 * Получить самых активных пользователей
 */
router.get('/users/active', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { limit = 10, period = 'week' } = req.query;

        let timeFilter;
        switch (period) {
            case 'day':
                timeFilter = "INTERVAL '1 day'";
                break;
            case 'month':
                timeFilter = "INTERVAL '30 days'";
                break;
            case 'week':
            default:
                timeFilter = "INTERVAL '7 days'";
        }

        const result = await query(`
            SELECT
                u.id,
                u.username,
                u.name,
                u.department,
                COUNT(m.id) as message_count,
                COUNT(DISTINCT m.chat_id) as chats_participated
            FROM users u
            LEFT JOIN messages m ON u.id = m.user_id
                AND m.created_at >= NOW() - ${timeFilter}
            WHERE u.is_active = true
            GROUP BY u.id, u.username, u.name, u.department
            ORDER BY message_count DESC
            LIMIT $1
        `, [parseInt(limit)]);

        res.json({
            period,
            users: result.rows
        });
    } catch (error) {
        console.error('Active users error:', error);
        res.status(500).json({ error: 'Failed to get active users' });
    }
});

/**
 * GET /api/analytics/chats/active
 * Получить самые активные чаты
 */
router.get('/chats/active', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { limit = 10, period = 'week' } = req.query;

        let timeFilter;
        switch (period) {
            case 'day':
                timeFilter = "INTERVAL '1 day'";
                break;
            case 'month':
                timeFilter = "INTERVAL '30 days'";
                break;
            case 'week':
            default:
                timeFilter = "INTERVAL '7 days'";
        }

        const result = await query(`
            SELECT
                c.id,
                c.name,
                c.type,
                c.department,
                COUNT(m.id) as message_count,
                COUNT(DISTINCT m.user_id) as active_users,
                MAX(m.created_at) as last_message_at
            FROM chats c
            LEFT JOIN messages m ON c.id = m.chat_id
                AND m.created_at >= NOW() - ${timeFilter}
            GROUP BY c.id, c.name, c.type, c.department
            HAVING COUNT(m.id) > 0
            ORDER BY message_count DESC
            LIMIT $1
        `, [parseInt(limit)]);

        res.json({
            period,
            chats: result.rows
        });
    } catch (error) {
        console.error('Active chats error:', error);
        res.status(500).json({ error: 'Failed to get active chats' });
    }
});

/**
 * GET /api/analytics/activity/hourly
 * Получить пиковые часы активности
 */
router.get('/activity/hourly', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 'week' } = req.query;

        let timeFilter;
        switch (period) {
            case 'day':
                timeFilter = "INTERVAL '1 day'";
                break;
            case 'month':
                timeFilter = "INTERVAL '30 days'";
                break;
            case 'week':
            default:
                timeFilter = "INTERVAL '7 days'";
        }

        const result = await query(`
            SELECT
                EXTRACT(HOUR FROM created_at) as hour,
                COUNT(*) as message_count
            FROM messages
            WHERE created_at >= NOW() - ${timeFilter}
            GROUP BY hour
            ORDER BY hour ASC
        `);

        res.json({
            period,
            hours: result.rows
        });
    } catch (error) {
        console.error('Hourly activity error:', error);
        res.status(500).json({ error: 'Failed to get hourly activity' });
    }
});

/**
 * GET /api/analytics/response-time
 * Получить среднее время отклика
 */
router.get('/response-time', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 'week' } = req.query;

        let timeFilter;
        switch (period) {
            case 'day':
                timeFilter = "INTERVAL '1 day'";
                break;
            case 'month':
                timeFilter = "INTERVAL '30 days'";
                break;
            case 'week':
            default:
                timeFilter = "INTERVAL '7 days'";
        }

        // Среднее время между сообщениями в чате (упрощенная метрика)
        const result = await query(`
            WITH message_gaps AS (
                SELECT
                    chat_id,
                    created_at,
                    LAG(created_at) OVER (PARTITION BY chat_id ORDER BY created_at) as prev_message_at,
                    EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY chat_id ORDER BY created_at))) as gap_seconds
                FROM messages
                WHERE created_at >= NOW() - ${timeFilter}
            )
            SELECT
                AVG(gap_seconds) as avg_response_seconds,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_seconds) as median_response_seconds,
                COUNT(*) as total_responses
            FROM message_gaps
            WHERE gap_seconds IS NOT NULL
                AND gap_seconds < 3600 -- Игнорируем разрывы больше часа
        `);

        const avgSeconds = parseFloat(result.rows[0]?.avg_response_seconds || 0);
        const medianSeconds = parseFloat(result.rows[0]?.median_response_seconds || 0);

        res.json({
            period,
            average_response_time_seconds: Math.round(avgSeconds),
            average_response_time_minutes: Math.round(avgSeconds / 60),
            median_response_time_seconds: Math.round(medianSeconds),
            median_response_time_minutes: Math.round(medianSeconds / 60),
            total_responses: parseInt(result.rows[0]?.total_responses || 0)
        });
    } catch (error) {
        console.error('Response time error:', error);
        res.status(500).json({ error: 'Failed to get response time' });
    }
});

/**
 * GET /api/analytics/departments
 * Получить статистику по отделам
 */
router.get('/departments', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 'week' } = req.query;

        let timeFilter;
        switch (period) {
            case 'day':
                timeFilter = "INTERVAL '1 day'";
                break;
            case 'month':
                timeFilter = "INTERVAL '30 days'";
                break;
            case 'week':
            default:
                timeFilter = "INTERVAL '7 days'";
        }

        const result = await query(`
            SELECT
                u.department,
                COUNT(DISTINCT u.id) as user_count,
                COUNT(m.id) as message_count,
                COUNT(DISTINCT m.chat_id) as active_chats
            FROM users u
            LEFT JOIN messages m ON u.id = m.user_id
                AND m.created_at >= NOW() - ${timeFilter}
            WHERE u.department IS NOT NULL
            GROUP BY u.department
            ORDER BY message_count DESC
        `);

        res.json({
            period,
            departments: result.rows
        });
    } catch (error) {
        console.error('Departments stats error:', error);
        res.status(500).json({ error: 'Failed to get departments stats' });
    }
});

/**
 * GET /api/analytics/overview
 * Получить общую статистику за период
 */
router.get('/overview', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 'week' } = req.query;

        let timeFilter;
        switch (period) {
            case 'day':
                timeFilter = "INTERVAL '1 day'";
                break;
            case 'month':
                timeFilter = "INTERVAL '30 days'";
                break;
            case 'week':
            default:
                timeFilter = "INTERVAL '7 days'";
        }

        // Общая статистика
        const overview = await query(`
            SELECT
                COUNT(DISTINCT m.id) as total_messages,
                COUNT(DISTINCT m.user_id) as active_users,
                COUNT(DISTINCT m.chat_id) as active_chats,
                COUNT(DISTINCT DATE(m.created_at)) as days_with_activity
            FROM messages m
            WHERE m.created_at >= NOW() - ${timeFilter}
        `);

        // Сравнение с предыдущим периодом
        const comparison = await query(`
            SELECT
                COUNT(DISTINCT m.id) as prev_messages,
                COUNT(DISTINCT m.user_id) as prev_active_users
            FROM messages m
            WHERE m.created_at >= NOW() - ${timeFilter} * 2
                AND m.created_at < NOW() - ${timeFilter}
        `);

        const current = overview.rows[0];
        const previous = comparison.rows[0];

        const messagesChange = previous.prev_messages > 0
            ? ((current.total_messages - previous.prev_messages) / previous.prev_messages * 100).toFixed(1)
            : 0;

        const usersChange = previous.prev_active_users > 0
            ? ((current.active_users - previous.prev_active_users) / previous.prev_active_users * 100).toFixed(1)
            : 0;

        res.json({
            period,
            current: {
                total_messages: parseInt(current.total_messages || 0),
                active_users: parseInt(current.active_users || 0),
                active_chats: parseInt(current.active_chats || 0),
                days_with_activity: parseInt(current.days_with_activity || 0)
            },
            comparison: {
                messages_change: parseFloat(messagesChange),
                users_change: parseFloat(usersChange)
            }
        });
    } catch (error) {
        console.error('Overview stats error:', error);
        res.status(500).json({ error: 'Failed to get overview stats' });
    }
});

module.exports = router;
