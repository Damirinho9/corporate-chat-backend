// ==================== ADVANCED SUPPORT ANALYTICS ====================
// Comprehensive analytics for support system performance
const { query } = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('support-analytics');

class SupportAnalytics {
    /**
     * Get agent performance metrics
     */
    async getAgentPerformance(options = {}) {
        try {
            const {
                period = 30,
                agentId = null,
                sortBy = 'tickets_resolved',
                sortOrder = 'DESC'
            } = options;

            const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

            let queryText = `
                SELECT
                    u.id as agent_id,
                    u.name as agent_name,
                    u.email as agent_email,

                    -- Ticket counts
                    COUNT(DISTINCT t.id) as total_tickets,
                    COUNT(DISTINCT CASE WHEN t.status IN ('resolved', 'closed') THEN t.id END) as tickets_resolved,
                    COUNT(DISTINCT CASE WHEN t.status NOT IN ('resolved', 'closed') THEN t.id END) as tickets_active,

                    -- Response times
                    AVG(t.first_response_time) as avg_first_response_minutes,
                    AVG(t.resolution_time) as avg_resolution_minutes,

                    -- SLA compliance
                    COUNT(CASE WHEN t.breached_sla = false AND t.status IN ('resolved', 'closed') THEN 1 END) as sla_met,
                    COUNT(CASE WHEN t.breached_sla = true THEN 1 END) as sla_breached,
                    ROUND(
                        100.0 * COUNT(CASE WHEN t.breached_sla = false AND t.status IN ('resolved', 'closed') THEN 1 END) /
                        NULLIF(COUNT(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 END), 0),
                        2
                    ) as sla_compliance_rate,

                    -- Customer satisfaction
                    AVG(t.customer_rating) as avg_csat_rating,
                    COUNT(CASE WHEN t.customer_rating IS NOT NULL THEN 1 END) as rating_count,
                    COUNT(CASE WHEN t.customer_rating >= 4 THEN 1 END) as positive_ratings,

                    -- Workload
                    stm.current_ticket_count,
                    stm.max_concurrent_tickets,
                    ROUND(100.0 * stm.current_ticket_count / NULLIF(stm.max_concurrent_tickets, 0), 2) as workload_percentage,

                    -- Activity
                    COUNT(DISTINCT tm.id) as messages_sent,
                    MAX(tm.created_at) as last_activity_at

                FROM users u
                LEFT JOIN support_tickets t ON t.assigned_to = u.id AND t.created_at >= $1
                LEFT JOIN ticket_messages tm ON tm.user_id = u.id AND tm.is_customer = false AND tm.created_at >= $1
                LEFT JOIN support_team_members stm ON stm.user_id = u.id
                WHERE u.role IN ('admin', 'user')
                  AND (u.id IN (SELECT DISTINCT assigned_to FROM support_tickets WHERE assigned_to IS NOT NULL))
            `;

            const params = [startDate];
            let paramCount = 2;

            if (agentId) {
                queryText += ` AND u.id = $${paramCount}`;
                params.push(agentId);
                paramCount++;
            }

            queryText += ` GROUP BY u.id, u.name, u.email, stm.current_ticket_count, stm.max_concurrent_tickets`;

            // Sorting
            const validSortColumns = {
                tickets_resolved: 'tickets_resolved',
                avg_csat_rating: 'avg_csat_rating',
                sla_compliance_rate: 'sla_compliance_rate',
                avg_resolution_minutes: 'avg_resolution_minutes'
            };

            const sortColumn = validSortColumns[sortBy] || 'tickets_resolved';
            queryText += ` ORDER BY ${sortColumn} ${sortOrder}, u.name`;

            const result = await query(queryText, params);

            return result.rows.map(row => ({
                ...row,
                avg_first_response_minutes: Math.round(row.avg_first_response_minutes || 0),
                avg_resolution_minutes: Math.round(row.avg_resolution_minutes || 0),
                avg_csat_rating: parseFloat((row.avg_csat_rating || 0).toFixed(2)),
                sla_compliance_rate: parseFloat(row.sla_compliance_rate || 0),
                workload_percentage: parseFloat(row.workload_percentage || 0)
            }));

        } catch (error) {
            logger.error('Failed to get agent performance', { error: error.message });
            throw error;
        }
    }

    /**
     * Get ticket trends over time
     */
    async getTicketTrends(options = {}) {
        try {
            const {
                period = 30,
                groupBy = 'day' // day, week, month
            } = options;

            const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

            // Determine date grouping format
            const dateFormat = groupBy === 'month' ? 'YYYY-MM' :
                             groupBy === 'week' ? 'IYYY-IW' :
                             'YYYY-MM-DD';

            const result = await query(
                `SELECT
                    TO_CHAR(created_at, $2) as period,
                    DATE_TRUNC($3, created_at) as period_start,
                    COUNT(*) as new_tickets,
                    COUNT(CASE WHEN status IN ('resolved', 'closed') THEN 1 END) as resolved_tickets,
                    COUNT(CASE WHEN status NOT IN ('resolved', 'closed') THEN 1 END) as open_tickets,
                    AVG(first_response_time) as avg_response_time,
                    AVG(resolution_time) as avg_resolution_time,
                    COUNT(CASE WHEN breached_sla = true THEN 1 END) as sla_breached,
                    AVG(customer_rating) as avg_rating
                 FROM support_tickets
                 WHERE created_at >= $1
                 GROUP BY period, period_start
                 ORDER BY period_start ASC`,
                [startDate, dateFormat, groupBy]
            );

            return result.rows.map(row => ({
                period: row.period,
                period_start: row.period_start,
                new_tickets: parseInt(row.new_tickets),
                resolved_tickets: parseInt(row.resolved_tickets),
                open_tickets: parseInt(row.open_tickets),
                avg_response_time: Math.round(row.avg_response_time || 0),
                avg_resolution_time: Math.round(row.avg_resolution_time || 0),
                sla_breached: parseInt(row.sla_breached),
                avg_rating: parseFloat((row.avg_rating || 0).toFixed(2))
            }));

        } catch (error) {
            logger.error('Failed to get ticket trends', { error: error.message });
            throw error;
        }
    }

    /**
     * Get category distribution and performance
     */
    async getCategoryAnalytics(options = {}) {
        try {
            const { period = 30 } = options;
            const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

            const result = await query(
                `SELECT
                    category,
                    COUNT(*) as ticket_count,
                    COUNT(CASE WHEN status IN ('resolved', 'closed') THEN 1 END) as resolved_count,
                    AVG(first_response_time) as avg_response_time,
                    AVG(resolution_time) as avg_resolution_time,
                    AVG(customer_rating) as avg_rating,
                    COUNT(CASE WHEN breached_sla = true THEN 1 END) as sla_breached,
                    ROUND(
                        100.0 * COUNT(CASE WHEN status IN ('resolved', 'closed') THEN 1 END) / COUNT(*),
                        2
                    ) as resolution_rate
                 FROM support_tickets
                 WHERE created_at >= $1
                 GROUP BY category
                 ORDER BY ticket_count DESC`,
                [startDate]
            );

            return result.rows.map(row => ({
                category: row.category,
                ticket_count: parseInt(row.ticket_count),
                resolved_count: parseInt(row.resolved_count),
                avg_response_time: Math.round(row.avg_response_time || 0),
                avg_resolution_time: Math.round(row.avg_resolution_time || 0),
                avg_rating: parseFloat((row.avg_rating || 0).toFixed(2)),
                sla_breached: parseInt(row.sla_breached),
                resolution_rate: parseFloat(row.resolution_rate || 0)
            }));

        } catch (error) {
            logger.error('Failed to get category analytics', { error: error.message });
            throw error;
        }
    }

    /**
     * Get CSAT (Customer Satisfaction) analytics
     */
    async getCSATAnalytics(options = {}) {
        try {
            const { period = 30 } = options;
            const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

            // Overall CSAT
            const overallResult = await query(
                `SELECT
                    AVG(customer_rating) as overall_rating,
                    COUNT(*) as total_ratings,
                    COUNT(CASE WHEN customer_rating >= 4 THEN 1 END) as positive_ratings,
                    COUNT(CASE WHEN customer_rating <= 2 THEN 1 END) as negative_ratings,
                    MODE() WITHIN GROUP (ORDER BY customer_rating) as most_common_rating
                 FROM support_tickets
                 WHERE created_at >= $1
                   AND customer_rating IS NOT NULL`,
                [startDate]
            );

            // Rating distribution
            const distributionResult = await query(
                `SELECT
                    customer_rating as rating,
                    COUNT(*) as count,
                    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
                 FROM support_tickets
                 WHERE created_at >= $1
                   AND customer_rating IS NOT NULL
                 GROUP BY customer_rating
                 ORDER BY customer_rating DESC`,
                [startDate]
            );

            // Trend over time
            const trendResult = await query(
                `SELECT
                    TO_CHAR(created_at, 'YYYY-MM-DD') as date,
                    AVG(customer_rating) as avg_rating,
                    COUNT(*) as rating_count
                 FROM support_tickets
                 WHERE created_at >= $1
                   AND customer_rating IS NOT NULL
                 GROUP BY date
                 ORDER BY date ASC`,
                [startDate]
            );

            // By category
            const byCategoryResult = await query(
                `SELECT
                    category,
                    AVG(customer_rating) as avg_rating,
                    COUNT(*) as rating_count
                 FROM support_tickets
                 WHERE created_at >= $1
                   AND customer_rating IS NOT NULL
                 GROUP BY category
                 ORDER BY avg_rating DESC`,
                [startDate]
            );

            // By agent
            const byAgentResult = await query(
                `SELECT
                    u.id as agent_id,
                    u.name as agent_name,
                    AVG(t.customer_rating) as avg_rating,
                    COUNT(*) as rating_count
                 FROM support_tickets t
                 JOIN users u ON t.assigned_to = u.id
                 WHERE t.created_at >= $1
                   AND t.customer_rating IS NOT NULL
                 GROUP BY u.id, u.name
                 ORDER BY avg_rating DESC`,
                [startDate]
            );

            const overall = overallResult.rows[0];

            return {
                overall: {
                    rating: parseFloat((overall.overall_rating || 0).toFixed(2)),
                    total_ratings: parseInt(overall.total_ratings || 0),
                    positive_ratings: parseInt(overall.positive_ratings || 0),
                    negative_ratings: parseInt(overall.negative_ratings || 0),
                    most_common_rating: parseInt(overall.most_common_rating || 0),
                    positive_percentage: overall.total_ratings > 0
                        ? parseFloat(((overall.positive_ratings / overall.total_ratings) * 100).toFixed(2))
                        : 0
                },
                distribution: distributionResult.rows.map(row => ({
                    rating: parseInt(row.rating),
                    count: parseInt(row.count),
                    percentage: parseFloat(row.percentage)
                })),
                trend: trendResult.rows.map(row => ({
                    date: row.date,
                    avg_rating: parseFloat((row.avg_rating).toFixed(2)),
                    rating_count: parseInt(row.rating_count)
                })),
                by_category: byCategoryResult.rows.map(row => ({
                    category: row.category,
                    avg_rating: parseFloat((row.avg_rating).toFixed(2)),
                    rating_count: parseInt(row.rating_count)
                })),
                by_agent: byAgentResult.rows.map(row => ({
                    agent_id: row.agent_id,
                    agent_name: row.agent_name,
                    avg_rating: parseFloat((row.avg_rating).toFixed(2)),
                    rating_count: parseInt(row.rating_count)
                }))
            };

        } catch (error) {
            logger.error('Failed to get CSAT analytics', { error: error.message });
            throw error;
        }
    }

    /**
     * Get comprehensive dashboard data
     */
    async getDashboardData(options = {}) {
        try {
            const { period = 7 } = options;

            const [
                agentPerformance,
                ticketTrends,
                categoryAnalytics,
                csatAnalytics
            ] = await Promise.all([
                this.getAgentPerformance({ period, sortBy: 'tickets_resolved', sortOrder: 'DESC' }),
                this.getTicketTrends({ period, groupBy: 'day' }),
                this.getCategoryAnalytics({ period }),
                this.getCSATAnalytics({ period })
            ]);

            return {
                agents: agentPerformance.slice(0, 10), // Top 10 agents
                trends: ticketTrends,
                categories: categoryAnalytics,
                csat: csatAnalytics,
                generated_at: new Date().toISOString(),
                period_days: period
            };

        } catch (error) {
            logger.error('Failed to get dashboard data', { error: error.message });
            throw error;
        }
    }
}

module.exports = new SupportAnalytics();
