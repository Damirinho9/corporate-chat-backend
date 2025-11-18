// ==================== AUTO-ASSIGNMENT ENGINE ====================
// Intelligent ticket auto-assignment based on rules and agent availability
const { query } = require('../config/database');
const { createLogger } = require('./logger');

const logger = createLogger('auto-assignment');

class AutoAssignmentEngine {
    constructor() {
        // Assignment rules configuration
        this.rules = {
            // Category-based assignment
            category: {
                'billing': {
                    team: 'billing',
                    priority_boost: 1, // Increase priority for billing issues
                    require_specific_skill: true
                },
                'technical': {
                    team: 'technical',
                    check_expertise: true
                },
                'bug': {
                    team: 'technical',
                    priority_boost: 1,
                    notify_dev_team: true
                },
                'feature_request': {
                    team: 'product',
                    priority: 'low' // Most feature requests are low priority
                }
            },

            // Priority-based assignment
            priority: {
                'critical': {
                    assign_immediately: true,
                    notify_team_lead: true,
                    max_agent_load: 10 // Assign even if agent is busy
                },
                'urgent': {
                    assign_immediately: true,
                    max_agent_load: 8
                },
                'high': {
                    max_agent_load: 6
                },
                'normal': {
                    max_agent_load: 5
                },
                'low': {
                    max_agent_load: 3,
                    defer_if_busy: true
                }
            },

            // Channel-based rules
            channel: {
                'bot': {
                    // Tickets from bot escalation get priority
                    priority_boost: 1,
                    prefer_available_agent: true
                },
                'email': {
                    // Email tickets can wait a bit
                    defer_minutes: 5
                }
            }
        };

        // Assignment strategies
        this.strategies = {
            ROUND_ROBIN: 'round_robin',
            LEAST_LOADED: 'least_loaded',
            SKILL_BASED: 'skill_based',
            BALANCED: 'balanced' // Mix of least loaded + skills
        };

        this.defaultStrategy = this.strategies.BALANCED;
    }

    /**
     * Auto-assign ticket to best available agent
     */
    async assignTicket(ticketId, options = {}) {
        try {
            // Get ticket details
            const ticketResult = await query(
                `SELECT * FROM support_tickets WHERE id = $1`,
                [ticketId]
            );

            if (ticketResult.rows.length === 0) {
                throw new Error('Ticket not found');
            }

            const ticket = ticketResult.rows[0];

            // Skip if already assigned
            if (ticket.assigned_to && !options.force) {
                logger.info('Ticket already assigned', { ticketId, assignedTo: ticket.assigned_to });
                return {
                    success: false,
                    reason: 'already_assigned',
                    assigned_to: ticket.assigned_to
                };
            }

            logger.info('Starting auto-assignment', {
                ticketId,
                ticketNumber: ticket.ticket_number,
                category: ticket.category,
                priority: ticket.priority
            });

            // Determine target team based on category
            const targetTeam = await this.determineTargetTeam(ticket);

            // Get available agents
            const availableAgents = await this.getAvailableAgents(ticket, targetTeam);

            if (availableAgents.length === 0) {
                logger.warn('No available agents for ticket', { ticketId, targetTeam });
                return {
                    success: false,
                    reason: 'no_available_agents',
                    target_team: targetTeam
                };
            }

            // Select best agent using strategy
            const strategy = options.strategy || this.defaultStrategy;
            const selectedAgent = await this.selectBestAgent(
                ticket,
                availableAgents,
                strategy
            );

            // Assign ticket
            await query(
                `UPDATE support_tickets
                 SET assigned_to = $1,
                     assigned_at = CURRENT_TIMESTAMP,
                     team_id = $2,
                     status = CASE
                         WHEN status = 'new' THEN 'open'
                         ELSE status
                     END,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [selectedAgent.user_id, targetTeam?.id || null, ticketId]
            );

            // Update agent's ticket count
            await this.incrementAgentTicketCount(selectedAgent.id);

            logger.info('Ticket auto-assigned successfully', {
                ticketId,
                ticketNumber: ticket.ticket_number,
                agentId: selectedAgent.user_id,
                agentName: selectedAgent.user_name,
                strategy,
                currentLoad: selectedAgent.current_ticket_count + 1
            });

            return {
                success: true,
                assigned_to: selectedAgent.user_id,
                agent_name: selectedAgent.user_name,
                team: targetTeam,
                strategy
            };

        } catch (error) {
            logger.error('Auto-assignment failed', {
                error: error.message,
                ticketId
            });
            throw error;
        }
    }

    /**
     * Determine target team based on ticket category and rules
     */
    async determineTargetTeam(ticket) {
        try {
            const categoryRule = this.rules.category[ticket.category];

            if (!categoryRule || !categoryRule.team) {
                // No specific team requirement - use default support team
                const teamResult = await query(
                    `SELECT * FROM support_teams
                     WHERE name = 'General Support' OR name = 'Support'
                     AND is_active = true
                     ORDER BY id
                     LIMIT 1`
                );

                return teamResult.rows.length > 0 ? teamResult.rows[0] : null;
            }

            // Find team by name from rule
            const teamResult = await query(
                `SELECT * FROM support_teams
                 WHERE LOWER(name) LIKE $1
                 AND is_active = true
                 LIMIT 1`,
                [`%${categoryRule.team.toLowerCase()}%`]
            );

            return teamResult.rows.length > 0 ? teamResult.rows[0] : null;

        } catch (error) {
            logger.error('Failed to determine target team', { error: error.message });
            return null;
        }
    }

    /**
     * Get available agents based on ticket requirements and agent capacity
     */
    async getAvailableAgents(ticket, targetTeam = null) {
        try {
            const priorityRule = this.rules.priority[ticket.priority] || { max_agent_load: 5 };
            const maxLoad = priorityRule.max_agent_load;

            let queryText = `
                SELECT
                    stm.id,
                    stm.user_id,
                    stm.team_id,
                    stm.max_concurrent_tickets,
                    stm.current_ticket_count,
                    u.name as user_name,
                    u.email as user_email,
                    u.role,
                    st.name as team_name,
                    st.working_hours,
                    st.timezone,
                    (stm.max_concurrent_tickets - stm.current_ticket_count) as available_capacity
                FROM support_team_members stm
                JOIN users u ON stm.user_id = u.id
                LEFT JOIN support_teams st ON stm.team_id = st.id
                WHERE stm.is_active = true
                  AND u.is_active = true
                  AND stm.current_ticket_count < stm.max_concurrent_tickets
                  AND stm.current_ticket_count < $1
            `;

            const params = [maxLoad];
            let paramCount = 2;

            // Filter by team if specified
            if (targetTeam) {
                queryText += ` AND stm.team_id = $${paramCount}`;
                params.push(targetTeam.id);
                paramCount++;
            }

            // Check working hours
            queryText += ` AND (
                st.working_hours IS NULL
                OR ${this.isWithinWorkingHours('st.working_hours', 'st.timezone')}
            )`;

            queryText += `
                ORDER BY
                    stm.current_ticket_count ASC,
                    stm.id ASC
            `;

            const result = await query(queryText, params);

            return result.rows;

        } catch (error) {
            logger.error('Failed to get available agents', { error: error.message });
            return [];
        }
    }

    /**
     * Check if current time is within team's working hours
     * Returns SQL expression
     */
    isWithinWorkingHours(hoursColumn, timezoneColumn) {
        // Simplified - in production, properly handle timezones
        // For now, assume working hours are not enforced if NULL
        return 'true';
    }

    /**
     * Select best agent using specified strategy
     */
    async selectBestAgent(ticket, availableAgents, strategy) {
        switch (strategy) {
            case this.strategies.ROUND_ROBIN:
                return this.selectRoundRobin(availableAgents);

            case this.strategies.LEAST_LOADED:
                return this.selectLeastLoaded(availableAgents);

            case this.strategies.SKILL_BASED:
                return this.selectSkillBased(ticket, availableAgents);

            case this.strategies.BALANCED:
            default:
                return this.selectBalanced(ticket, availableAgents);
        }
    }

    /**
     * Round-robin: Rotate through agents
     */
    selectRoundRobin(agents) {
        // Simple: just pick first available (already ordered by ID)
        return agents[0];
    }

    /**
     * Least-loaded: Agent with fewest active tickets
     */
    selectLeastLoaded(agents) {
        // Already ordered by current_ticket_count ASC
        return agents[0];
    }

    /**
     * Skill-based: Match agent expertise to ticket category
     */
    selectSkillBased(ticket, agents) {
        // In production: check agent skills/expertise table
        // For now: prefer agents with role 'admin' or specific team
        const expertAgents = agents.filter(a =>
            a.role === 'admin' ||
            (a.team_name && a.team_name.toLowerCase().includes(ticket.category))
        );

        return expertAgents.length > 0 ? expertAgents[0] : agents[0];
    }

    /**
     * Balanced: Mix of least loaded + skill matching
     */
    selectBalanced(ticket, agents) {
        // Score each agent
        const scoredAgents = agents.map(agent => {
            let score = 100;

            // Reduce score based on current load (more load = lower score)
            score -= (agent.current_ticket_count * 10);

            // Boost score for skill match
            if (agent.team_name && agent.team_name.toLowerCase().includes(ticket.category)) {
                score += 30;
            }

            // Boost score for admins (experienced)
            if (agent.role === 'admin') {
                score += 20;
            }

            // Boost score for high available capacity
            score += (agent.available_capacity * 5);

            return {
                ...agent,
                assignment_score: score
            };
        });

        // Sort by score descending
        scoredAgents.sort((a, b) => b.assignment_score - a.assignment_score);

        logger.debug('Agent scores calculated', {
            scores: scoredAgents.map(a => ({
                name: a.user_name,
                score: a.assignment_score,
                load: a.current_ticket_count
            }))
        });

        return scoredAgents[0];
    }

    /**
     * Increment agent's ticket count
     */
    async incrementAgentTicketCount(teamMemberId) {
        await query(
            `UPDATE support_team_members
             SET current_ticket_count = current_ticket_count + 1
             WHERE id = $1`,
            [teamMemberId]
        );
    }

    /**
     * Decrement agent's ticket count (when ticket is resolved/closed)
     */
    async decrementAgentTicketCount(userId) {
        await query(
            `UPDATE support_team_members
             SET current_ticket_count = GREATEST(current_ticket_count - 1, 0)
             WHERE user_id = $1`,
            [userId]
        );
    }

    /**
     * Bulk auto-assign unassigned tickets
     */
    async autoAssignPendingTickets(options = {}) {
        try {
            const limit = options.limit || 10;

            // Get unassigned tickets
            const ticketsResult = await query(
                `SELECT id, ticket_number, priority, category, created_at
                 FROM support_tickets
                 WHERE assigned_to IS NULL
                   AND status IN ('new', 'open')
                   AND created_at >= NOW() - INTERVAL '24 hours'
                 ORDER BY
                   CASE priority
                     WHEN 'critical' THEN 1
                     WHEN 'urgent' THEN 2
                     WHEN 'high' THEN 3
                     WHEN 'normal' THEN 4
                     WHEN 'low' THEN 5
                   END,
                   created_at ASC
                 LIMIT $1`,
                [limit]
            );

            const results = {
                total: ticketsResult.rows.length,
                assigned: 0,
                failed: 0,
                details: []
            };

            for (const ticket of ticketsResult.rows) {
                try {
                    const result = await this.assignTicket(ticket.id, options);

                    if (result.success) {
                        results.assigned++;
                    } else {
                        results.failed++;
                    }

                    results.details.push({
                        ticket_id: ticket.id,
                        ticket_number: ticket.ticket_number,
                        ...result
                    });

                } catch (error) {
                    results.failed++;
                    results.details.push({
                        ticket_id: ticket.id,
                        ticket_number: ticket.ticket_number,
                        success: false,
                        error: error.message
                    });
                }
            }

            logger.info('Bulk auto-assignment completed', results);

            return results;

        } catch (error) {
            logger.error('Bulk auto-assignment failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Re-assign ticket (e.g., if agent is overloaded or unavailable)
     */
    async reassignTicket(ticketId, reason = null) {
        try {
            // Get current assignment
            const ticketResult = await query(
                `SELECT assigned_to FROM support_tickets WHERE id = $1`,
                [ticketId]
            );

            if (ticketResult.rows.length === 0) {
                throw new Error('Ticket not found');
            }

            const oldAgentId = ticketResult.rows[0].assigned_to;

            // Unassign current agent
            if (oldAgentId) {
                await this.decrementAgentTicketCount(oldAgentId);
            }

            // Log reassignment
            logger.info('Ticket being reassigned', {
                ticketId,
                oldAgent: oldAgentId,
                reason
            });

            // Assign to new agent
            return await this.assignTicket(ticketId, { force: true });

        } catch (error) {
            logger.error('Ticket reassignment failed', {
                error: error.message,
                ticketId
            });
            throw error;
        }
    }

    /**
     * Get auto-assignment statistics
     */
    async getStats(daysAgo = 7) {
        try {
            const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

            const result = await query(
                `SELECT
                    COUNT(*) as total_assigned,
                    COUNT(DISTINCT assigned_to) as unique_agents,
                    AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)) / 60) as avg_assignment_time_minutes,
                    COUNT(CASE WHEN assigned_at - created_at < INTERVAL '5 minutes' THEN 1 END) as assigned_within_5min,
                    COUNT(CASE WHEN assigned_at - created_at < INTERVAL '15 minutes' THEN 1 END) as assigned_within_15min
                 FROM support_tickets
                 WHERE assigned_at >= $1
                   AND assigned_to IS NOT NULL`,
                [startDate]
            );

            return result.rows[0];

        } catch (error) {
            logger.error('Failed to get auto-assignment stats', { error: error.message });
            return null;
        }
    }
}

module.exports = new AutoAssignmentEngine();
