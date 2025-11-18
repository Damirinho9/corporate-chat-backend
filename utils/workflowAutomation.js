// ==================== WORKFLOW AUTOMATION & WEBHOOKS ====================
// Automated workflows and webhook triggers for support system
const fetch = require('node-fetch');
const { query } = require('../config/database');
const { createLogger } = require('./logger');

const logger = createLogger('workflow-automation');

class WorkflowAutomation {
    constructor() {
        // Workflow triggers configuration
        this.triggers = {
            TICKET_CREATED: 'ticket_created',
            TICKET_ASSIGNED: 'ticket_assigned',
            TICKET_STATUS_CHANGED: 'ticket_status_changed',
            TICKET_RESOLVED: 'ticket_resolved',
            TICKET_CLOSED: 'ticket_closed',
            SLA_BREACHED: 'sla_breached',
            SLA_WARNING: 'sla_warning',
            MESSAGE_ADDED: 'message_added',
            CUSTOMER_RATING: 'customer_rating'
        };

        // Webhook configuration
        // In production: store webhooks in database
        this.webhooks = {
            // Example webhooks (these would be configured per organization)
            slack: process.env.SLACK_WEBHOOK_URL || null,
            teams: process.env.TEAMS_WEBHOOK_URL || null,
            custom: process.env.CUSTOM_WEBHOOK_URL || null
        };

        // Auto-actions based on conditions
        this.autoActions = [
            {
                name: 'escalate_critical_priority',
                condition: (ticket) => ticket.priority === 'critical',
                action: async (ticket) => {
                    logger.info('Auto-escalating critical ticket', { ticketId: ticket.id });
                    // In production: notify team lead, assign to senior agent, etc.
                    return { escalated: true };
                }
            },
            {
                name: 'auto_close_resolved_tickets',
                condition: (ticket) =>
                    ticket.status === 'resolved' &&
                    ticket.customer_rating &&
                    ticket.customer_rating >= 4,
                action: async (ticket) => {
                    logger.info('Auto-closing well-rated resolved ticket', { ticketId: ticket.id });
                    await query(
                        `UPDATE support_tickets
                         SET status = 'closed',
                             closed_at = CURRENT_TIMESTAMP,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = $1`,
                        [ticket.id]
                    );
                    return { auto_closed: true };
                }
            },
            {
                name: 'tag_bug_tickets',
                condition: (ticket) => ticket.category === 'bug',
                action: async (ticket) => {
                    logger.info('Auto-tagging bug ticket', { ticketId: ticket.id });
                    await query(
                        `UPDATE support_tickets
                         SET tags = array_append(tags, 'needs-investigation')
                         WHERE id = $1 AND NOT ('needs-investigation' = ANY(tags))`,
                        [ticket.id]
                    );
                    return { tagged: true };
                }
            }
        ];
    }

    /**
     * Trigger workflow based on event
     */
    async triggerWorkflow(eventType, data) {
        try {
            logger.info('Workflow triggered', { eventType, data: JSON.stringify(data).substring(0, 100) });

            // Execute auto-actions if applicable
            if (data.ticket) {
                await this.executeAutoActions(data.ticket);
            }

            // Send webhooks
            await this.sendWebhooks(eventType, data);

            // Execute custom workflows
            await this.executeCustomWorkflows(eventType, data);

        } catch (error) {
            logger.error('Workflow trigger failed', {
                error: error.message,
                eventType
            });
        }
    }

    /**
     * Execute auto-actions based on ticket conditions
     */
    async executeAutoActions(ticket) {
        try {
            for (const autoAction of this.autoActions) {
                if (autoAction.condition(ticket)) {
                    logger.info('Executing auto-action', {
                        actionName: autoAction.name,
                        ticketId: ticket.id
                    });

                    try {
                        const result = await autoAction.action(ticket);
                        logger.info('Auto-action executed successfully', {
                            actionName: autoAction.name,
                            ticketId: ticket.id,
                            result
                        });
                    } catch (actionError) {
                        logger.error('Auto-action failed', {
                            error: actionError.message,
                            actionName: autoAction.name,
                            ticketId: ticket.id
                        });
                    }
                }
            }
        } catch (error) {
            logger.error('Failed to execute auto-actions', { error: error.message });
        }
    }

    /**
     * Send webhook notifications
     */
    async sendWebhooks(eventType, data) {
        const webhookPromises = [];

        // Slack webhook
        if (this.webhooks.slack) {
            webhookPromises.push(
                this.sendSlackWebhook(eventType, data)
            );
        }

        // Microsoft Teams webhook
        if (this.webhooks.teams) {
            webhookPromises.push(
                this.sendTeamsWebhook(eventType, data)
            );
        }

        // Custom webhook
        if (this.webhooks.custom) {
            webhookPromises.push(
                this.sendCustomWebhook(eventType, data)
            );
        }

        // Execute all webhooks in parallel
        const results = await Promise.allSettled(webhookPromises);

        // Log results
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                logger.error('Webhook failed', {
                    error: result.reason.message,
                    eventType
                });
            }
        });
    }

    /**
     * Send Slack webhook
     */
    async sendSlackWebhook(eventType, data) {
        try {
            const payload = this.formatSlackPayload(eventType, data);

            const response = await fetch(this.webhooks.slack, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                timeout: 5000
            });

            if (!response.ok) {
                throw new Error(`Slack webhook failed: ${response.statusText}`);
            }

            logger.info('Slack webhook sent successfully', { eventType });

        } catch (error) {
            logger.error('Slack webhook error', { error: error.message });
            throw error;
        }
    }

    /**
     * Send Microsoft Teams webhook
     */
    async sendTeamsWebhook(eventType, data) {
        try {
            const payload = this.formatTeamsPayload(eventType, data);

            const response = await fetch(this.webhooks.teams, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                timeout: 5000
            });

            if (!response.ok) {
                throw new Error(`Teams webhook failed: ${response.statusText}`);
            }

            logger.info('Teams webhook sent successfully', { eventType });

        } catch (error) {
            logger.error('Teams webhook error', { error: error.message });
            throw error;
        }
    }

    /**
     * Send custom webhook
     */
    async sendCustomWebhook(eventType, data) {
        try {
            const payload = {
                event_type: eventType,
                timestamp: new Date().toISOString(),
                data
            };

            const response = await fetch(this.webhooks.custom, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                timeout: 5000
            });

            if (!response.ok) {
                throw new Error(`Custom webhook failed: ${response.statusText}`);
            }

            logger.info('Custom webhook sent successfully', { eventType });

        } catch (error) {
            logger.error('Custom webhook error', { error: error.message });
            throw error;
        }
    }

    /**
     * Format payload for Slack
     */
    formatSlackPayload(eventType, data) {
        const emoji = {
            ticket_created: '🎫',
            ticket_assigned: '👤',
            ticket_resolved: '✅',
            ticket_closed: '🔒',
            sla_breached: '🚨',
            sla_warning: '⚠️'
        }[eventType] || '📋';

        let text = '';
        let color = '#3AA3E3';

        switch (eventType) {
            case this.triggers.TICKET_CREATED:
                text = `${emoji} New ticket #${data.ticket.ticket_number}: ${data.ticket.subject}`;
                color = '#36a64f';
                break;
            case this.triggers.TICKET_ASSIGNED:
                text = `${emoji} Ticket #${data.ticket.ticket_number} assigned to ${data.agent_name}`;
                color = '#3AA3E3';
                break;
            case this.triggers.TICKET_RESOLVED:
                text = `${emoji} Ticket #${data.ticket.ticket_number} resolved`;
                color = '#2eb886';
                break;
            case this.triggers.SLA_BREACHED:
                text = `${emoji} SLA BREACHED: Ticket #${data.ticket.ticket_number}`;
                color = '#ff0000';
                break;
            default:
                text = `${emoji} Ticket #${data.ticket?.ticket_number || 'Unknown'} - ${eventType}`;
        }

        return {
            text,
            attachments: [
                {
                    color,
                    fields: [
                        {
                            title: 'Priority',
                            value: data.ticket?.priority?.toUpperCase() || 'N/A',
                            short: true
                        },
                        {
                            title: 'Status',
                            value: data.ticket?.status || 'N/A',
                            short: true
                        }
                    ],
                    footer: 'Corporate Chat Support',
                    ts: Math.floor(Date.now() / 1000)
                }
            ]
        };
    }

    /**
     * Format payload for Microsoft Teams
     */
    formatTeamsPayload(eventType, data) {
        const title = `Support Ticket Update - ${eventType.replace(/_/g, ' ').toUpperCase()}`;

        return {
            '@type': 'MessageCard',
            '@context': 'http://schema.org/extensions',
            themeColor: '0076D7',
            summary: title,
            sections: [
                {
                    activityTitle: title,
                    facts: [
                        {
                            name: 'Ticket Number',
                            value: data.ticket?.ticket_number || 'N/A'
                        },
                        {
                            name: 'Priority',
                            value: data.ticket?.priority?.toUpperCase() || 'N/A'
                        },
                        {
                            name: 'Status',
                            value: data.ticket?.status || 'N/A'
                        },
                        {
                            name: 'Subject',
                            value: data.ticket?.subject || 'N/A'
                        }
                    ],
                    markdown: true
                }
            ]
        };
    }

    /**
     * Execute custom workflows from database
     */
    async executeCustomWorkflows(eventType, data) {
        try {
            // In production: fetch custom workflows from database
            // For now, just log
            logger.debug('Custom workflows execution placeholder', { eventType });

            // Example: Query custom workflows
            // const workflowsResult = await query(
            //     `SELECT * FROM custom_workflows
            //      WHERE event_type = $1 AND is_active = true`,
            //     [eventType]
            // );

            // Execute each workflow

        } catch (error) {
            logger.error('Failed to execute custom workflows', { error: error.message });
        }
    }

    /**
     * Add custom auto-action
     */
    addAutoAction(name, condition, action) {
        this.autoActions.push({ name, condition, action });
        logger.info('Custom auto-action added', { name });
    }

    /**
     * Remove auto-action
     */
    removeAutoAction(name) {
        const index = this.autoActions.findIndex(a => a.name === name);
        if (index !== -1) {
            this.autoActions.splice(index, 1);
            logger.info('Auto-action removed', { name });
            return true;
        }
        return false;
    }

    /**
     * Get workflow statistics
     */
    async getStats(daysAgo = 7) {
        try {
            // In production: track workflow executions in database
            // For now, return placeholder stats

            return {
                period_days: daysAgo,
                auto_actions_executed: 0,
                webhooks_sent: 0,
                workflows_triggered: 0
            };

        } catch (error) {
            logger.error('Failed to get workflow stats', { error: error.message });
            return null;
        }
    }
}

module.exports = new WorkflowAutomation();
