// ==================== SUPPORT SYSTEM API ====================
// Comprehensive support ticketing system
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');
const { createLogger } = require('../utils/logger');

const logger = createLogger('support-api');

// Validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// ==================== TICKETS ====================

/**
 * POST /api/support/tickets
 * Create a new support ticket
 */
router.post('/tickets',
    authenticateToken,
    [
        body('subject').trim().isLength({ min: 5, max: 500 }).withMessage('Subject must be 5-500 characters'),
        body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
        body('category').optional().isIn(['technical', 'billing', 'feature_request', 'bug', 'other']),
        body('priority').optional().isIn(['low', 'normal', 'high', 'urgent', 'critical'])
    ],
    validate,
    async (req, res) => {
        try {
            const {
                subject,
                description,
                category = 'other',
                priority = 'normal',
                channel = 'chat'
            } = req.body;

            const userId = req.user.id;

            // Get user details
            const userResult = await query(
                'SELECT name, email, department FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const user = userResult.rows[0];

            // Calculate SLA due date based on priority
            const slaMinutes = {
                'low': 240,      // 4 hours
                'normal': 120,   // 2 hours
                'high': 60,      // 1 hour
                'urgent': 30,    // 30 min
                'critical': 15   // 15 min
            }[priority];

            const slaDueDate = new Date(Date.now() + slaMinutes * 60 * 1000);

            // Create ticket
            const result = await query(
                `INSERT INTO support_tickets
                (user_id, customer_name, customer_email, subject, description,
                 category, priority, status, channel, sla_due_date)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9)
                RETURNING *`,
                [userId, user.name, user.email, subject, description,
                 category, priority, channel, slaDueDate]
            );

            const ticket = result.rows[0];

            // Add initial message from customer
            await query(
                `INSERT INTO ticket_messages
                (ticket_id, user_id, author_name, author_email, is_customer, content, message_type)
                VALUES ($1, $2, $3, $4, true, $5, 'text')`,
                [ticket.id, userId, user.name, user.email, description]
            );

            // Log ticket creation
            logger.info('Support ticket created', {
                ticketId: ticket.id,
                ticketNumber: ticket.ticket_number,
                userId,
                category,
                priority
            });

            // TODO: Trigger webhook for new ticket
            // TODO: Auto-assign based on rules
            // TODO: Send notification to support team

            res.status(201).json({
                success: true,
                ticket: {
                    id: ticket.id,
                    ticket_number: ticket.ticket_number,
                    subject: ticket.subject,
                    status: ticket.status,
                    priority: ticket.priority,
                    category: ticket.category,
                    sla_due_date: ticket.sla_due_date,
                    created_at: ticket.created_at
                }
            });

        } catch (error) {
            logger.error('Failed to create support ticket', { error: error.message });
            res.status(500).json({ error: 'Failed to create support ticket' });
        }
    }
);

/**
 * GET /api/support/tickets
 * Get all tickets (for current user or all if admin)
 */
router.get('/tickets',
    authenticateToken,
    async (req, res) => {
        try {
            const {
                status,
                priority,
                category,
                assigned_to_me,
                limit = 50,
                offset = 0
            } = req.query;

            const userId = req.user.id;
            const isAdmin = req.user.role === 'admin';

            let queryText = `
                SELECT
                    t.*,
                    u.name as customer_name_full,
                    a.name as assigned_to_name,
                    (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count,
                    (SELECT created_at FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_at
                FROM support_tickets t
                LEFT JOIN users u ON t.user_id = u.id
                LEFT JOIN users a ON t.assigned_to = a.id
                WHERE 1=1
            `;

            const params = [];
            let paramCount = 1;

            // Filter by user if not admin
            if (!isAdmin) {
                queryText += ` AND (t.user_id = $${paramCount} OR t.assigned_to = $${paramCount})`;
                params.push(userId);
                paramCount++;
            }

            // Filter by status
            if (status) {
                queryText += ` AND t.status = $${paramCount}`;
                params.push(status);
                paramCount++;
            }

            // Filter by priority
            if (priority) {
                queryText += ` AND t.priority = $${paramCount}`;
                params.push(priority);
                paramCount++;
            }

            // Filter by category
            if (category) {
                queryText += ` AND t.category = $${paramCount}`;
                params.push(category);
                paramCount++;
            }

            // Filter assigned to me
            if (assigned_to_me === 'true') {
                queryText += ` AND t.assigned_to = $${paramCount}`;
                params.push(userId);
                paramCount++;
            }

            queryText += `
                ORDER BY
                    CASE t.priority
                        WHEN 'critical' THEN 1
                        WHEN 'urgent' THEN 2
                        WHEN 'high' THEN 3
                        WHEN 'normal' THEN 4
                        WHEN 'low' THEN 5
                    END,
                    t.created_at DESC
                LIMIT $${paramCount} OFFSET $${paramCount + 1}
            `;

            params.push(parseInt(limit), parseInt(offset));

            const result = await query(queryText, params);

            res.json({
                tickets: result.rows,
                total: result.rows.length,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

        } catch (error) {
            logger.error('Failed to fetch support tickets', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch support tickets' });
        }
    }
);

/**
 * GET /api/support/tickets/:id
 * Get ticket details with full conversation
 */
router.get('/tickets/:id',
    authenticateToken,
    async (req, res) => {
        try {
            const ticketId = parseInt(req.params.id);
            const userId = req.user.id;
            const isAdmin = req.user.role === 'admin';

            // Get ticket
            const ticketResult = await query(
                `SELECT t.*,
                        u.name as customer_name_full,
                        u.email as customer_email_full,
                        a.name as assigned_to_name,
                        tm.name as team_name
                 FROM support_tickets t
                 LEFT JOIN users u ON t.user_id = u.id
                 LEFT JOIN users a ON t.assigned_to = a.id
                 LEFT JOIN support_teams tm ON t.team_id = tm.id
                 WHERE t.id = $1`,
                [ticketId]
            );

            if (ticketResult.rows.length === 0) {
                return res.status(404).json({ error: 'Ticket not found' });
            }

            const ticket = ticketResult.rows[0];

            // Check access
            if (!isAdmin && ticket.user_id !== userId && ticket.assigned_to !== userId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Get messages
            const messagesResult = await query(
                `SELECT m.*,
                        u.name as user_name
                 FROM ticket_messages m
                 LEFT JOIN users u ON m.user_id = u.id
                 WHERE m.ticket_id = $1
                   AND (m.is_internal = false OR $2 = true)
                 ORDER BY m.created_at ASC`,
                [ticketId, isAdmin]
            );

            // Get status history
            const historyResult = await query(
                `SELECT h.*,
                        u.name as changed_by_name
                 FROM ticket_status_history h
                 LEFT JOIN users u ON h.changed_by = u.id
                 WHERE h.ticket_id = $1
                 ORDER BY h.created_at DESC`,
                [ticketId]
            );

            res.json({
                ticket,
                messages: messagesResult.rows,
                history: historyResult.rows
            });

        } catch (error) {
            logger.error('Failed to fetch ticket details', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch ticket details' });
        }
    }
);

/**
 * POST /api/support/tickets/:id/messages
 * Add message to ticket
 */
router.post('/tickets/:id/messages',
    authenticateToken,
    [
        body('content').trim().isLength({ min: 1 }).withMessage('Message cannot be empty'),
        body('is_internal').optional().isBoolean()
    ],
    validate,
    async (req, res) => {
        try {
            const ticketId = parseInt(req.params.id);
            const { content, is_internal = false } = req.body;
            const userId = req.user.id;
            const isAdmin = req.user.role === 'admin';

            // Get ticket and check access
            const ticketResult = await query(
                'SELECT * FROM support_tickets WHERE id = $1',
                [ticketId]
            );

            if (ticketResult.rows.length === 0) {
                return res.status(404).json({ error: 'Ticket not found' });
            }

            const ticket = ticketResult.rows[0];

            if (!isAdmin && ticket.user_id !== userId && ticket.assigned_to !== userId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Get user info
            const userResult = await query(
                'SELECT name, email FROM users WHERE id = $1',
                [userId]
            );
            const user = userResult.rows[0];

            // Add message
            const messageResult = await query(
                `INSERT INTO ticket_messages
                (ticket_id, user_id, author_name, author_email, is_customer, is_internal, content, message_type)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'text')
                RETURNING *`,
                [ticketId, userId, user.name, user.email,
                 ticket.user_id === userId, is_internal, content]
            );

            // Update ticket status if customer replied
            if (ticket.user_id === userId && ticket.status === 'waiting_customer') {
                await query(
                    `UPDATE support_tickets
                     SET status = 'open', updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [ticketId]
                );
            }

            // Record first response time
            if (!ticket.first_response_at && userId !== ticket.user_id) {
                const firstResponseTime = Math.floor(
                    (Date.now() - new Date(ticket.created_at).getTime()) / 60000
                );

                await query(
                    `UPDATE support_tickets
                     SET first_response_at = CURRENT_TIMESTAMP,
                         first_response_time = $1
                     WHERE id = $2`,
                    [firstResponseTime, ticketId]
                );
            }

            // TODO: Send notification to customer/agent
            // TODO: Trigger webhook

            logger.info('Message added to ticket', {
                ticketId,
                messageId: messageResult.rows[0].id,
                userId
            });

            res.status(201).json({
                success: true,
                message: messageResult.rows[0]
            });

        } catch (error) {
            logger.error('Failed to add message to ticket', { error: error.message });
            res.status(500).json({ error: 'Failed to add message' });
        }
    }
);

/**
 * PATCH /api/support/tickets/:id/status
 * Update ticket status
 */
router.patch('/tickets/:id/status',
    authenticateToken,
    [
        body('status').isIn(['new', 'open', 'pending', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'escalated'])
    ],
    validate,
    async (req, res) => {
        try {
            const ticketId = parseInt(req.params.id);
            const { status, reason } = req.body;
            const userId = req.user.id;

            // Get current ticket
            const ticketResult = await query(
                'SELECT * FROM support_tickets WHERE id = $1',
                [ticketId]
            );

            if (ticketResult.rows.length === 0) {
                return res.status(404).json({ error: 'Ticket not found' });
            }

            const ticket = ticketResult.rows[0];
            const oldStatus = ticket.status;

            // Calculate time in previous status
            const durationInStatus = Math.floor(
                (Date.now() - new Date(ticket.updated_at).getTime()) / 60000
            );

            // Update ticket status
            const updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
            const params = [status];
            let paramCount = 2;

            // If resolving, record resolution time
            if (status === 'resolved' && !ticket.resolved_at) {
                updateFields.push(`resolved_at = CURRENT_TIMESTAMP`);
                updateFields.push(`resolution_time = $${paramCount}`);
                const resolutionTime = Math.floor(
                    (Date.now() - new Date(ticket.created_at).getTime()) / 60000
                );
                params.push(resolutionTime);
                paramCount++;
            }

            // If closing, record close time
            if (status === 'closed' && !ticket.closed_at) {
                updateFields.push(`closed_at = CURRENT_TIMESTAMP`);
            }

            params.push(ticketId);

            await query(
                `UPDATE support_tickets
                 SET ${updateFields.join(', ')}
                 WHERE id = $${paramCount}`,
                params
            );

            // Add to status history
            await query(
                `INSERT INTO ticket_status_history
                (ticket_id, changed_by, from_status, to_status, reason, duration_in_status)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [ticketId, userId, oldStatus, status, reason || null, durationInStatus]
            );

            logger.info('Ticket status updated', {
                ticketId,
                oldStatus,
                newStatus: status,
                userId
            });

            res.json({
                success: true,
                message: 'Ticket status updated',
                old_status: oldStatus,
                new_status: status
            });

        } catch (error) {
            logger.error('Failed to update ticket status', { error: error.message });
            res.status(500).json({ error: 'Failed to update ticket status' });
        }
    }
);

/**
 * PATCH /api/support/tickets/:id/assign
 * Assign ticket to agent
 */
router.patch('/tickets/:id/assign',
    authenticateToken,
    requireAdmin,
    [
        body('assigned_to').optional().isInt()
    ],
    validate,
    async (req, res) => {
        try {
            const ticketId = parseInt(req.params.id);
            const { assigned_to } = req.body;

            // If assigning to someone, verify they exist
            if (assigned_to) {
                const userResult = await query(
                    'SELECT id FROM users WHERE id = $1',
                    [assigned_to]
                );

                if (userResult.rows.length === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }
            }

            // Update assignment
            await query(
                `UPDATE support_tickets
                 SET assigned_to = $1,
                     assigned_at = CASE WHEN $1 IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [assigned_to || null, ticketId]
            );

            logger.info('Ticket assigned', {
                ticketId,
                assignedTo: assigned_to,
                assignedBy: req.user.id
            });

            res.json({
                success: true,
                message: 'Ticket assigned successfully'
            });

        } catch (error) {
            logger.error('Failed to assign ticket', { error: error.message });
            res.status(500).json({ error: 'Failed to assign ticket' });
        }
    }
);

/**
 * POST /api/support/tickets/:id/rating
 * Rate ticket resolution (CSAT)
 */
router.post('/tickets/:id/rating',
    authenticateToken,
    [
        body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
        body('feedback').optional().trim()
    ],
    validate,
    async (req, res) => {
        try {
            const ticketId = parseInt(req.params.id);
            const { rating, feedback } = req.body;
            const userId = req.user.id;

            // Verify ticket exists and user is the customer
            const ticketResult = await query(
                'SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2',
                [ticketId, userId]
            );

            if (ticketResult.rows.length === 0) {
                return res.status(404).json({ error: 'Ticket not found or access denied' });
            }

            // Update ticket rating
            await query(
                `UPDATE support_tickets
                 SET customer_rating = $1,
                     customer_feedback = $2,
                     rated_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [rating, feedback || null, ticketId]
            );

            logger.info('Ticket rated', {
                ticketId,
                rating,
                userId
            });

            res.json({
                success: true,
                message: 'Thank you for your feedback!'
            });

        } catch (error) {
            logger.error('Failed to rate ticket', { error: error.message });
            res.status(500).json({ error: 'Failed to submit rating' });
        }
    }
);

// ==================== KNOWLEDGE BASE ====================

/**
 * GET /api/support/kb/articles
 * Get knowledge base articles (published only for non-admin)
 */
router.get('/kb/articles', async (req, res) => {
    try {
        const { category, search, limit = 20, offset = 0 } = req.query;

        let queryText = `
            SELECT a.*,
                   c.name as category_name,
                   u.name as author_name
            FROM kb_articles a
            LEFT JOIN kb_categories c ON a.category_id = c.id
            LEFT JOIN users u ON a.created_by = u.id
            WHERE a.status = 'published'
        `;

        const params = [];
        let paramCount = 1;

        if (category) {
            queryText += ` AND c.slug = $${paramCount}`;
            params.push(category);
            paramCount++;
        }

        if (search) {
            queryText += ` AND (a.title ILIKE $${paramCount} OR a.content ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }

        queryText += ` ORDER BY a.is_featured DESC, a.view_count DESC, a.created_at DESC`;
        queryText += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;

        params.push(parseInt(limit), parseInt(offset));

        const result = await query(queryText, params);

        res.json({
            articles: result.rows,
            total: result.rows.length
        });

    } catch (error) {
        logger.error('Failed to fetch KB articles', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch articles' });
    }
});

/**
 * GET /api/support/kb/articles/:slug
 * Get single KB article by slug
 */
router.get('/kb/articles/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const result = await query(
            `SELECT a.*,
                    c.name as category_name,
                    u.name as author_name
             FROM kb_articles a
             LEFT JOIN kb_categories c ON a.category_id = c.id
             LEFT JOIN users u ON a.created_by = u.id
             WHERE a.slug = $1 AND a.status = 'published'`,
            [slug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Article not found' });
        }

        const article = result.rows[0];

        // Increment view count
        await query(
            'UPDATE kb_articles SET view_count = view_count + 1 WHERE id = $1',
            [article.id]
        );

        res.json({ article });

    } catch (error) {
        logger.error('Failed to fetch KB article', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch article' });
    }
});

/**
 * GET /api/support/kb/categories
 * Get all KB categories
 */
router.get('/kb/categories', async (req, res) => {
    try {
        const result = await query(
            `SELECT c.*,
                    COUNT(a.id) as article_count
             FROM kb_categories c
             LEFT JOIN kb_articles a ON c.id = a.category_id AND a.status = 'published'
             WHERE c.is_visible = true
             GROUP BY c.id
             ORDER BY c.sort_order, c.name`,
            []
        );

        res.json({ categories: result.rows });

    } catch (error) {
        logger.error('Failed to fetch KB categories', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// ==================== CANNED RESPONSES ====================

/**
 * GET /api/support/canned-responses
 * Get canned responses (for agents)
 */
router.get('/canned-responses',
    authenticateToken,
    async (req, res) => {
        try {
            const result = await query(
                `SELECT * FROM canned_responses
                 WHERE is_public = true
                 ORDER BY category, title`,
                []
            );

            res.json({ responses: result.rows });

        } catch (error) {
            logger.error('Failed to fetch canned responses', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch canned responses' });
        }
    }
);

// ==================== ANALYTICS ====================

/**
 * GET /api/support/stats
 * Get support statistics dashboard
 */
router.get('/stats',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { period = '7d' } = req.query;

            // Calculate date range
            const daysAgo = period === '30d' ? 30 : 7;
            const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

            // Total tickets
            const totalResult = await query(
                'SELECT COUNT(*) as total FROM support_tickets WHERE created_at >= $1',
                [startDate]
            );

            // Tickets by status
            const statusResult = await query(
                `SELECT status, COUNT(*) as count
                 FROM support_tickets
                 WHERE created_at >= $1
                 GROUP BY status`,
                [startDate]
            );

            // Tickets by priority
            const priorityResult = await query(
                `SELECT priority, COUNT(*) as count
                 FROM support_tickets
                 WHERE created_at >= $1
                 GROUP BY priority`,
                [startDate]
            );

            // Average response time
            const avgResponseResult = await query(
                `SELECT AVG(first_response_time) as avg_first_response,
                        AVG(resolution_time) as avg_resolution
                 FROM support_tickets
                 WHERE created_at >= $1 AND first_response_time IS NOT NULL`,
                [startDate]
            );

            // CSAT (Customer Satisfaction)
            const csatResult = await query(
                `SELECT AVG(customer_rating) as avg_rating,
                        COUNT(*) as rated_count
                 FROM support_tickets
                 WHERE created_at >= $1 AND customer_rating IS NOT NULL`,
                [startDate]
            );

            // SLA compliance
            const slaResult = await query(
                `SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN breached_sla = false THEN 1 ELSE 0 END) as met_sla,
                    SUM(CASE WHEN breached_sla = true THEN 1 ELSE 0 END) as breached_sla
                 FROM support_tickets
                 WHERE created_at >= $1 AND status IN ('resolved', 'closed')`,
                [startDate]
            );

            res.json({
                period: `${daysAgo}d`,
                total_tickets: parseInt(totalResult.rows[0].total),
                tickets_by_status: statusResult.rows,
                tickets_by_priority: priorityResult.rows,
                avg_first_response_minutes: Math.round(avgResponseResult.rows[0].avg_first_response || 0),
                avg_resolution_minutes: Math.round(avgResponseResult.rows[0].avg_resolution || 0),
                csat: {
                    avg_rating: parseFloat(csatResult.rows[0].avg_rating || 0).toFixed(2),
                    total_ratings: parseInt(csatResult.rows[0].rated_count)
                },
                sla: {
                    total: parseInt(slaResult.rows[0]?.total || 0),
                    met: parseInt(slaResult.rows[0]?.met_sla || 0),
                    breached: parseInt(slaResult.rows[0]?.breached_sla || 0),
                    compliance_rate: slaResult.rows[0]?.total > 0
                        ? ((slaResult.rows[0].met_sla / slaResult.rows[0].total) * 100).toFixed(1)
                        : 0
                }
            });

        } catch (error) {
            logger.error('Failed to fetch support stats', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch statistics' });
        }
    }
);

module.exports = router;
