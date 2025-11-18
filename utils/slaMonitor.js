// ==================== SLA MONITORING & ALERTS ====================
// Monitor SLA compliance and send alerts for approaching/breached SLAs
const { query } = require('../config/database');
const { createLogger } = require('./logger');
const { sendTicketStatusChangedEmail } = require('./supportEmailService');

const logger = createLogger('sla-monitor');

class SLAMonitor {
    constructor() {
        this.checkIntervalMinutes = 5; // Check every 5 minutes
        this.alertThresholds = {
            warning: 0.75,   // Alert when 75% of SLA time has elapsed
            urgent: 0.90,    // Urgent alert at 90%
            critical: 0.95   // Critical alert at 95%
        };

        this.monitorInterval = null;
    }

    /**
     * Start SLA monitoring background job
     */
    start() {
        if (this.monitorInterval) {
            logger.warn('SLA monitor already running');
            return;
        }

        logger.info('Starting SLA monitor', {
            interval: `${this.checkIntervalMinutes} minutes`
        });

        // Run immediately
        this.checkSLAs();

        // Then run periodically
        this.monitorInterval = setInterval(
            () => this.checkSLAs(),
            this.checkIntervalMinutes * 60 * 1000
        );
    }

    /**
     * Stop SLA monitoring
     */
    stop() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
            logger.info('SLA monitor stopped');
        }
    }

    /**
     * Check all active tickets for SLA compliance
     */
    async checkSLAs() {
        try {
            logger.info('Running SLA compliance check');

            // Get all active tickets with SLA due dates
            const ticketsResult = await query(
                `SELECT
                    t.id,
                    t.ticket_number,
                    t.subject,
                    t.priority,
                    t.status,
                    t.sla_due_date,
                    t.breached_sla,
                    t.created_at,
                    t.first_response_at,
                    t.user_id,
                    t.assigned_to,
                    u.name as customer_name,
                    u.email as customer_email,
                    a.name as agent_name,
                    a.email as agent_email,
                    EXTRACT(EPOCH FROM (t.sla_due_date - NOW())) / 60 as minutes_until_sla
                 FROM support_tickets t
                 LEFT JOIN users u ON t.user_id = u.id
                 LEFT JOIN users a ON t.assigned_to = a.id
                 WHERE t.status NOT IN ('resolved', 'closed')
                   AND t.sla_due_date IS NOT NULL
                 ORDER BY t.sla_due_date ASC`,
                []
            );

            const stats = {
                total_checked: ticketsResult.rows.length,
                newly_breached: 0,
                warnings_sent: 0,
                urgent_alerts: 0,
                critical_alerts: 0
            };

            for (const ticket of ticketsResult.rows) {
                await this.processTicketSLA(ticket, stats);
            }

            logger.info('SLA compliance check completed', stats);

            return stats;

        } catch (error) {
            logger.error('SLA check failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Process individual ticket SLA
     */
    async processTicketSLA(ticket, stats) {
        try {
            const minutesUntilSLA = ticket.minutes_until_sla;
            const slaDueDate = new Date(ticket.sla_due_date);
            const created = new Date(ticket.created_at);
            const totalSLAMinutes = (slaDueDate - created) / 60000;
            const elapsedMinutes = (Date.now() - created) / 60000;
            const percentageElapsed = elapsedMinutes / totalSLAMinutes;

            // Check if SLA is breached
            if (minutesUntilSLA <= 0 && !ticket.breached_sla) {
                await this.markSLABreached(ticket);
                stats.newly_breached++;
                await this.sendSLAAlert(ticket, 'breached', minutesUntilSLA);
                logger.warn('SLA breached', {
                    ticketId: ticket.id,
                    ticketNumber: ticket.ticket_number,
                    overdue_minutes: Math.abs(minutesUntilSLA)
                });
                return;
            }

            // Check if critical threshold reached (95%)
            if (percentageElapsed >= this.alertThresholds.critical && minutesUntilSLA > 0) {
                await this.sendSLAAlert(ticket, 'critical', minutesUntilSLA);
                stats.critical_alerts++;
                return;
            }

            // Check if urgent threshold reached (90%)
            if (percentageElapsed >= this.alertThresholds.urgent && minutesUntilSLA > 0) {
                await this.sendSLAAlert(ticket, 'urgent', minutesUntilSLA);
                stats.urgent_alerts++;
                return;
            }

            // Check if warning threshold reached (75%)
            if (percentageElapsed >= this.alertThresholds.warning && minutesUntilSLA > 0) {
                await this.sendSLAAlert(ticket, 'warning', minutesUntilSLA);
                stats.warnings_sent++;
                return;
            }

        } catch (error) {
            logger.error('Failed to process ticket SLA', {
                error: error.message,
                ticketId: ticket.id
            });
        }
    }

    /**
     * Mark ticket as SLA breached
     */
    async markSLABreached(ticket) {
        try {
            await query(
                `UPDATE support_tickets
                 SET breached_sla = true,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [ticket.id]
            );

            // Add note to ticket
            await query(
                `INSERT INTO ticket_messages
                (ticket_id, author_name, author_email, is_customer, is_internal, content, message_type)
                VALUES ($1, 'System', 'system@corporate-chat.com', false, true, $2, 'note')`,
                [ticket.id, `⚠️ SLA BREACHED - Ticket exceeded response time SLA of ${this.formatMinutes(ticket.minutes_until_sla)}`]
            );

            logger.error('SLA marked as breached', {
                ticketId: ticket.id,
                ticketNumber: ticket.ticket_number,
                priority: ticket.priority
            });

        } catch (error) {
            logger.error('Failed to mark SLA as breached', {
                error: error.message,
                ticketId: ticket.id
            });
        }
    }

    /**
     * Send SLA alert to assigned agent and/or team lead
     */
    async sendSLAAlert(ticket, severity, minutesRemaining) {
        try {
            // Check if alert was already sent recently (debounce)
            const recentAlertResult = await query(
                `SELECT created_at
                 FROM ticket_messages
                 WHERE ticket_id = $1
                   AND is_internal = true
                   AND content LIKE '%SLA%'
                   AND created_at >= NOW() - INTERVAL '30 minutes'
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [ticket.id]
            );

            if (recentAlertResult.rows.length > 0) {
                // Alert already sent in last 30 minutes, skip
                return;
            }

            const severityEmoji = {
                warning: '⚠️',
                urgent: '🔴',
                critical: '🚨',
                breached: '❌'
            }[severity];

            const severityText = {
                warning: 'Warning: SLA approaching (75%)',
                urgent: 'URGENT: SLA nearing deadline (90%)',
                critical: 'CRITICAL: SLA about to breach (95%)',
                breached: 'SLA BREACHED'
            }[severity];

            const timeText = minutesRemaining > 0
                ? `${this.formatMinutes(minutesRemaining)} remaining`
                : `Overdue by ${this.formatMinutes(Math.abs(minutesRemaining))}`;

            const alertMessage = `${severityEmoji} ${severityText}\n\nTime: ${timeText}\nPriority: ${ticket.priority.toUpperCase()}\nTicket: #${ticket.ticket_number}`;

            // Add internal note
            await query(
                `INSERT INTO ticket_messages
                (ticket_id, author_name, author_email, is_customer, is_internal, content, message_type)
                VALUES ($1, 'SLA Monitor', 'system@corporate-chat.com', false, true, $2, 'note')`,
                [ticket.id, alertMessage]
            );

            // Send email to assigned agent if exists
            if (ticket.agent_email) {
                // In production: send dedicated SLA alert email
                logger.info('SLA alert sent to agent', {
                    ticketId: ticket.id,
                    severity,
                    agentEmail: ticket.agent_email
                });
            }

            // Emit Socket.IO event for real-time alert
            try {
                const { getIO } = require('../socket/socketHandler');
                const io = getIO();

                io.to(`ticket_${ticket.id}`).emit('support:sla_alert', {
                    ticket_id: ticket.id,
                    ticket_number: ticket.ticket_number,
                    severity,
                    message: alertMessage,
                    minutes_remaining: minutesRemaining
                });

                // Also alert the assigned agent personally
                if (ticket.assigned_to) {
                    io.to(`user_${ticket.assigned_to}`).emit('support:sla_alert', {
                        ticket_id: ticket.id,
                        ticket_number: ticket.ticket_number,
                        severity,
                        message: alertMessage,
                        minutes_remaining: minutesRemaining
                    });
                }

            } catch (err) {
                logger.error('Failed to emit SLA alert event', { error: err.message });
            }

            logger.info('SLA alert created', {
                ticketId: ticket.id,
                ticketNumber: ticket.ticket_number,
                severity,
                minutesRemaining
            });

        } catch (error) {
            logger.error('Failed to send SLA alert', {
                error: error.message,
                ticketId: ticket.id,
                severity
            });
        }
    }

    /**
     * Format minutes into human-readable format
     */
    formatMinutes(minutes) {
        const absMinutes = Math.abs(minutes);

        if (absMinutes < 60) {
            return `${Math.round(absMinutes)} minutes`;
        }

        const hours = Math.floor(absMinutes / 60);
        const mins = Math.round(absMinutes % 60);

        if (hours < 24) {
            return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
        }

        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;

        return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days} days`;
    }

    /**
     * Get SLA compliance statistics
     */
    async getComplianceStats(daysAgo = 7) {
        try {
            const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

            const result = await query(
                `SELECT
                    COUNT(*) as total_tickets,
                    COUNT(CASE WHEN breached_sla = true THEN 1 END) as breached,
                    COUNT(CASE WHEN breached_sla = false AND status IN ('resolved', 'closed') THEN 1 END) as met_sla,
                    AVG(CASE
                        WHEN first_response_time IS NOT NULL THEN first_response_time
                        ELSE NULL
                    END) as avg_first_response_minutes,
                    AVG(CASE
                        WHEN resolution_time IS NOT NULL THEN resolution_time
                        ELSE NULL
                    END) as avg_resolution_minutes,
                    COUNT(CASE
                        WHEN first_response_time IS NOT NULL
                        AND sla_due_date IS NOT NULL
                        AND first_response_at < sla_due_date
                        THEN 1
                    END) as first_response_within_sla
                 FROM support_tickets
                 WHERE created_at >= $1`,
                [startDate]
            );

            const stats = result.rows[0];

            // Calculate compliance rate
            const totalCompleted = parseInt(stats.breached) + parseInt(stats.met_sla);
            const complianceRate = totalCompleted > 0
                ? ((stats.met_sla / totalCompleted) * 100).toFixed(2)
                : 0;

            return {
                period_days: daysAgo,
                total_tickets: parseInt(stats.total_tickets),
                breached: parseInt(stats.breached),
                met_sla: parseInt(stats.met_sla),
                compliance_rate: parseFloat(complianceRate),
                avg_first_response_minutes: Math.round(stats.avg_first_response_minutes || 0),
                avg_resolution_minutes: Math.round(stats.avg_resolution_minutes || 0),
                first_response_within_sla: parseInt(stats.first_response_within_sla || 0)
            };

        } catch (error) {
            logger.error('Failed to get SLA compliance stats', { error: error.message });
            return null;
        }
    }

    /**
     * Get tickets at risk of SLA breach
     */
    async getTicketsAtRisk(minutesThreshold = 30) {
        try {
            const result = await query(
                `SELECT
                    t.id,
                    t.ticket_number,
                    t.subject,
                    t.priority,
                    t.status,
                    t.sla_due_date,
                    t.assigned_to,
                    a.name as agent_name,
                    EXTRACT(EPOCH FROM (t.sla_due_date - NOW())) / 60 as minutes_until_breach
                 FROM support_tickets t
                 LEFT JOIN users a ON t.assigned_to = a.id
                 WHERE t.status NOT IN ('resolved', 'closed')
                   AND t.sla_due_date IS NOT NULL
                   AND t.breached_sla = false
                   AND t.sla_due_date <= NOW() + INTERVAL '${minutesThreshold} minutes'
                 ORDER BY t.sla_due_date ASC`,
                []
            );

            return result.rows;

        } catch (error) {
            logger.error('Failed to get tickets at risk', { error: error.message });
            return [];
        }
    }

    /**
     * Manually check SLA for specific ticket
     */
    async checkTicketSLA(ticketId) {
        try {
            const ticketResult = await query(
                `SELECT
                    t.*,
                    u.name as customer_name,
                    u.email as customer_email,
                    a.name as agent_name,
                    a.email as agent_email,
                    EXTRACT(EPOCH FROM (t.sla_due_date - NOW())) / 60 as minutes_until_sla
                 FROM support_tickets t
                 LEFT JOIN users u ON t.user_id = u.id
                 LEFT JOIN users a ON t.assigned_to = a.id
                 WHERE t.id = $1`,
                [ticketId]
            );

            if (ticketResult.rows.length === 0) {
                throw new Error('Ticket not found');
            }

            const ticket = ticketResult.rows[0];
            const stats = {
                warnings_sent: 0,
                urgent_alerts: 0,
                critical_alerts: 0,
                newly_breached: 0
            };

            await this.processTicketSLA(ticket, stats);

            return {
                ticket_id: ticketId,
                sla_status: ticket.minutes_until_sla > 0 ? 'on_track' : 'breached',
                minutes_until_sla: ticket.minutes_until_sla,
                breached: ticket.breached_sla,
                ...stats
            };

        } catch (error) {
            logger.error('Failed to check ticket SLA', {
                error: error.message,
                ticketId
            });
            throw error;
        }
    }
}

module.exports = new SLAMonitor();
