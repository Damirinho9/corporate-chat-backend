// ==================== AUTOMATED METRICS REPORTING SERVICE ====================
// Generates and sends scheduled metrics reports
const { query } = require('../config/database');
const { createLogger } = require('../utils/logger');
const supportAnalytics = require('./supportAnalytics');
const emailService = require('../utils/emailService');

const logger = createLogger('metrics-reporting');

class MetricsReportingService {
    constructor() {
        this.reportTypes = {
            WEEKLY: 'weekly',
            MONTHLY: 'monthly',
            QUARTERLY: 'quarterly'
        };

        this.enabled = process.env.METRICS_REPORTING_ENABLED === 'true';
        this.reportSchedules = new Map();
    }

    /**
     * Start scheduled reporting
     */
    start() {
        if (!this.enabled) {
            logger.info('Metrics reporting disabled');
            return;
        }

        // Weekly reports - every Monday at 9 AM
        this.scheduleWeeklyReport();

        // Monthly reports - 1st of month at 9 AM
        this.scheduleMonthlyReport();

        logger.info('Metrics reporting service started');
    }

    /**
     * Schedule weekly report generation
     */
    scheduleWeeklyReport() {
        const checkAndGenerate = async () => {
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
            const hour = now.getHours();

            // Monday at 9 AM
            if (dayOfWeek === 1 && hour === 9) {
                await this.generateWeeklyReport();
            }
        };

        // Check every hour
        setInterval(checkAndGenerate, 60 * 60 * 1000);
        logger.info('Weekly report scheduled');
    }

    /**
     * Schedule monthly report generation
     */
    scheduleMonthlyReport() {
        const checkAndGenerate = async () => {
            const now = new Date();
            const dayOfMonth = now.getDate();
            const hour = now.getHours();

            // 1st of month at 9 AM
            if (dayOfMonth === 1 && hour === 9) {
                await this.generateMonthlyReport();
            }
        };

        // Check every hour
        setInterval(checkAndGenerate, 60 * 60 * 1000);
        logger.info('Monthly report scheduled');
    }

    /**
     * Generate weekly metrics report
     */
    async generateWeeklyReport() {
        try {
            logger.info('Generating weekly metrics report');

            const period = 7; // Last 7 days
            const reportData = await this.collectMetrics(period);

            // Save report to database
            const reportId = await this.saveReport('weekly', reportData);

            // Send email to admins
            await this.sendReportEmail('weekly', reportData);

            logger.info('Weekly report generated', { reportId });
            return { reportId, data: reportData };
        } catch (error) {
            logger.error('Failed to generate weekly report', { error: error.message });
            throw error;
        }
    }

    /**
     * Generate monthly metrics report
     */
    async generateMonthlyReport() {
        try {
            logger.info('Generating monthly metrics report');

            const period = 30; // Last 30 days
            const reportData = await this.collectMetrics(period);

            // Save report to database
            const reportId = await this.saveReport('monthly', reportData);

            // Send email to admins
            await this.sendReportEmail('monthly', reportData);

            // Check for trends and anomalies
            const insights = await this.generateInsights(reportData);

            logger.info('Monthly report generated', { reportId, insights: insights.length });
            return { reportId, data: reportData, insights };
        } catch (error) {
            logger.error('Failed to generate monthly report', { error: error.message });
            throw error;
        }
    }

    /**
     * Collect all metrics for the report
     */
    async collectMetrics(period) {
        const [
            ticketStats,
            agentPerformance,
            trends,
            csatData,
            categoryStats,
            slaCompliance
        ] = await Promise.all([
            this.getTicketStats(period),
            supportAnalytics.getAgentPerformance({ period, limit: 10 }),
            supportAnalytics.getTicketTrends({ period, groupBy: 'day' }),
            supportAnalytics.getCSATAnalytics({ period }),
            supportAnalytics.getCategoryAnalytics({ period }),
            this.getSLACompliance(period)
        ]);

        return {
            period,
            generatedAt: new Date().toISOString(),
            summary: {
                totalTickets: ticketStats.total,
                resolvedTickets: ticketStats.resolved,
                avgResolutionTime: ticketStats.avgResolutionTime,
                slaCompliance: slaCompliance.percentage,
                csatScore: csatData.overall.rating
            },
            agents: agentPerformance,
            trends,
            csat: csatData,
            categories: categoryStats,
            sla: slaCompliance
        };
    }

    /**
     * Get ticket statistics
     */
    async getTicketStats(period) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);

        const result = await query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
                COUNT(*) FILTER (WHERE status = 'closed') as closed,
                AVG(
                    CASE WHEN resolved_at IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60
                    END
                ) as avg_resolution_minutes
            FROM support_tickets
            WHERE created_at >= $1
        `, [cutoffDate]);

        const row = result.rows[0];
        return {
            total: parseInt(row.total),
            resolved: parseInt(row.resolved),
            closed: parseInt(row.closed),
            avgResolutionTime: row.avg_resolution_minutes ? Math.round(row.avg_resolution_minutes) : null
        };
    }

    /**
     * Get SLA compliance
     */
    async getSLACompliance(period) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);

        const result = await query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE sla_breached = false) as compliant,
                ROUND(
                    COUNT(*) FILTER (WHERE sla_breached = false)::numeric /
                    NULLIF(COUNT(*), 0) * 100, 2
                ) as compliance_percentage
            FROM support_tickets
            WHERE created_at >= $1 AND status IN ('resolved', 'closed')
        `, [cutoffDate]);

        const row = result.rows[0];
        return {
            total: parseInt(row.total),
            compliant: parseInt(row.compliant),
            percentage: parseFloat(row.compliance_percentage) || 0
        };
    }

    /**
     * Save report to database
     */
    async saveReport(type, reportData) {
        const result = await query(`
            INSERT INTO support_metrics_reports (
                report_type,
                period_days,
                data,
                generated_at
            ) VALUES ($1, $2, $3, NOW())
            RETURNING id
        `, [type, reportData.period, JSON.stringify(reportData)]);

        return result.rows[0].id;
    }

    /**
     * Generate insights and recommendations
     */
    async generateInsights(reportData) {
        const insights = [];

        // Check SLA compliance
        if (reportData.sla.percentage < 90) {
            insights.push({
                type: 'warning',
                category: 'sla',
                message: `SLA compliance at ${reportData.sla.percentage}% (below 90% target)`,
                recommendation: 'Consider reviewing agent workload and auto-assignment rules'
            });
        }

        // Check CSAT score
        if (reportData.csat.overall.rating < 4.0) {
            insights.push({
                type: 'warning',
                category: 'csat',
                message: `CSAT score at ${reportData.csat.overall.rating}/5 (below 4.0 target)`,
                recommendation: 'Review ticket resolution quality and response times'
            });
        }

        // Check ticket volume trends
        if (reportData.trends.length >= 7) {
            const recentAvg = reportData.trends.slice(-3).reduce((sum, t) => sum + t.new_tickets, 0) / 3;
            const earlierAvg = reportData.trends.slice(0, 3).reduce((sum, t) => sum + t.new_tickets, 0) / 3;
            const increase = ((recentAvg - earlierAvg) / earlierAvg) * 100;

            if (increase > 20) {
                insights.push({
                    type: 'info',
                    category: 'volume',
                    message: `Ticket volume increased by ${increase.toFixed(1)}% in recent days`,
                    recommendation: 'Monitor workload and consider scaling support team'
                });
            }
        }

        // Check agent performance
        const lowPerformers = reportData.agents.filter(a =>
            a.sla_compliance_rate < 85 || a.avg_csat_rating < 3.5
        );
        if (lowPerformers.length > 0) {
            insights.push({
                type: 'action',
                category: 'agents',
                message: `${lowPerformers.length} agent(s) need performance support`,
                recommendation: 'Provide additional training or redistribute workload'
            });
        }

        return insights;
    }

    /**
     * Send report via email
     */
    async sendReportEmail(type, reportData) {
        try {
            // Get admin emails
            const admins = await query(
                `SELECT email FROM users WHERE role = 'admin' AND is_active = true`
            );

            if (admins.rows.length === 0) {
                logger.warn('No admin users to send report to');
                return;
            }

            const subject = `📊 ${type.charAt(0).toUpperCase() + type.slice(1)} Support Metrics Report`;
            const htmlContent = this.generateEmailHTML(type, reportData);

            for (const admin of admins.rows) {
                await emailService.sendEmail(admin.email, subject, htmlContent);
            }

            logger.info(`Report emails sent to ${admins.rows.length} admins`);
        } catch (error) {
            logger.error('Failed to send report email', { error: error.message });
        }
    }

    /**
     * Generate HTML content for email
     */
    generateEmailHTML(type, reportData) {
        const { summary } = reportData;

        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; }
        .metric-card { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-title { font-size: 14px; color: #666; margin-bottom: 5px; }
        .metric-value { font-size: 32px; font-weight: bold; color: #667eea; }
        .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .footer { background: #333; color: white; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; }
        .good { color: #10b981; }
        .warning { color: #f59e0b; }
        .bad { color: #ef4444; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 ${type.charAt(0).toUpperCase() + type.slice(1)} Support Metrics</h1>
            <p>Period: Last ${reportData.period} days</p>
        </div>
        <div class="content">
            <div class="metric-grid">
                <div class="metric-card">
                    <div class="metric-title">Total Tickets</div>
                    <div class="metric-value">${summary.totalTickets}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-title">Resolved</div>
                    <div class="metric-value ${summary.resolvedTickets / summary.totalTickets > 0.8 ? 'good' : 'warning'}">
                        ${summary.resolvedTickets}
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-title">Avg Resolution Time</div>
                    <div class="metric-value">${summary.avgResolutionTime ? Math.round(summary.avgResolutionTime / 60) + 'h' : 'N/A'}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-title">SLA Compliance</div>
                    <div class="metric-value ${summary.slaCompliance >= 90 ? 'good' : summary.slaCompliance >= 80 ? 'warning' : 'bad'}">
                        ${summary.slaCompliance.toFixed(1)}%
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-title">CSAT Score</div>
                    <div class="metric-value ${summary.csatScore >= 4 ? 'good' : summary.csatScore >= 3 ? 'warning' : 'bad'}">
                        ${summary.csatScore ? summary.csatScore.toFixed(1) : 'N/A'}/5
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-title">Top Agents</div>
                    <div class="metric-value" style="font-size: 20px;">
                        ${reportData.agents.slice(0, 3).map(a => a.agent_name).join(', ')}
                    </div>
                </div>
            </div>

            <div class="metric-card" style="margin-top: 20px;">
                <h3>📈 Key Insights</h3>
                <ul>
                    ${this.generateInsightsList(reportData)}
                </ul>
            </div>
        </div>
        <div class="footer">
            <p>View full report in admin dashboard</p>
            <p><a href="${process.env.APP_URL}/admin/reports" style="color: #667eea;">Open Dashboard →</a></p>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Generate insights list for email
     */
    generateInsightsList(reportData) {
        const insights = [];

        if (reportData.sla.percentage >= 95) {
            insights.push('<li>✅ Excellent SLA compliance!</li>');
        } else if (reportData.sla.percentage < 85) {
            insights.push('<li>⚠️ SLA compliance needs attention</li>');
        }

        if (reportData.csat.overall.rating >= 4.5) {
            insights.push('<li>✅ Outstanding customer satisfaction!</li>');
        }

        const topCategory = reportData.categories[0];
        if (topCategory) {
            insights.push(`<li>📊 Top category: ${topCategory.category} (${topCategory.total_tickets} tickets)</li>`);
        }

        if (insights.length === 0) {
            insights.push('<li>📊 Performance within normal range</li>');
        }

        return insights.join('');
    }

    /**
     * Get report history
     */
    async getReportHistory(options = {}) {
        const { type, limit = 10 } = options;

        let sql = `
            SELECT
                id,
                report_type,
                period_days,
                generated_at,
                data
            FROM support_metrics_reports
        `;

        const params = [];
        if (type) {
            sql += ` WHERE report_type = $1`;
            params.push(type);
        }

        sql += ` ORDER BY generated_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await query(sql, params);
        return result.rows;
    }

    /**
     * Generate ad-hoc report
     */
    async generateCustomReport(period, recipientEmails = []) {
        try {
            const reportData = await this.collectMetrics(period);
            const reportId = await this.saveReport('custom', reportData);

            if (recipientEmails.length > 0) {
                const htmlContent = this.generateEmailHTML('custom', reportData);
                for (const email of recipientEmails) {
                    await emailService.sendEmail(
                        email,
                        '📊 Custom Support Metrics Report',
                        htmlContent
                    );
                }
            }

            return { reportId, data: reportData };
        } catch (error) {
            logger.error('Failed to generate custom report', { error: error.message });
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new MetricsReportingService();
