// ==================== EMAIL-TO-TICKET SERVICE ====================
// Monitors email inbox and automatically creates support tickets
const { simpleParser } = require('mailparser');
const { query } = require('../config/database');
const { createLogger } = require('../utils/logger');
const { sendTicketCreatedEmail } = require('../utils/supportEmailService');
const { getIO } = require('../socket/socketHandler');
const { emitTicketCreated } = require('../socket/supportHandler');
const autoAssignment = require('../utils/autoAssignment');
const workflowAutomation = require('../utils/workflowAutomation');

const logger = createLogger('email-to-ticket');

class EmailToTicketService {
    constructor() {
        this.isRunning = false;
        this.pollInterval = null;
        this.pollIntervalMs = parseInt(process.env.EMAIL_POLL_INTERVAL_MS || 60000); // 1 minute default

        // Configuration
        this.config = {
            enabled: process.env.EMAIL_TO_TICKET_ENABLED === 'true',
            imapHost: process.env.SUPPORT_EMAIL_IMAP_HOST || 'imap.gmail.com',
            imapPort: parseInt(process.env.SUPPORT_EMAIL_IMAP_PORT || 993),
            imapTls: process.env.SUPPORT_EMAIL_IMAP_TLS !== 'false',
            email: process.env.SUPPORT_EMAIL,
            password: process.env.SUPPORT_EMAIL_PASSWORD
        };
    }

    /**
     * Start monitoring email inbox
     */
    async start() {
        if (!this.config.enabled) {
            logger.info('Email-to-ticket service is disabled (set EMAIL_TO_TICKET_ENABLED=true to enable)');
            return;
        }

        if (!this.config.email || !this.config.password) {
            logger.warn('Email-to-ticket service disabled: Missing SUPPORT_EMAIL or SUPPORT_EMAIL_PASSWORD');
            return;
        }

        if (this.isRunning) {
            logger.warn('Email-to-ticket service already running');
            return;
        }

        this.isRunning = true;
        logger.info('Starting email-to-ticket service', {
            email: this.config.email,
            pollInterval: `${this.pollIntervalMs / 1000}s`
        });

        // Run initial check
        await this.checkInbox();

        // Start polling
        this.pollInterval = setInterval(() => {
            this.checkInbox().catch(err => {
                logger.error('Error in email polling', { error: err.message });
            });
        }, this.pollIntervalMs);
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            this.isRunning = false;
            logger.info('Email-to-ticket service stopped');
        }
    }

    /**
     * Check inbox for new emails
     */
    async checkInbox() {
        if (!this.config.enabled) return;

        try {
            logger.debug('Checking inbox for new emails');

            // In production: use imap-simple or nodemailer IMAP
            // For now: simulate email checking with database flag

            // Example pseudo-code (requires 'imap-simple' package):
            /*
            const imaps = require('imap-simple');

            const connection = await imaps.connect({
                imap: {
                    user: this.config.email,
                    password: this.config.password,
                    host: this.config.imapHost,
                    port: this.config.imapPort,
                    tls: this.config.imapTls,
                    authTimeout: 10000
                }
            });

            // Search for unread emails in INBOX
            const searchCriteria = ['UNSEEN'];
            const fetchOptions = {
                bodies: ['HEADER', 'TEXT', ''],
                markSeen: false
            };

            const messages = await connection.search(searchCriteria, fetchOptions);

            for (const message of messages) {
                try {
                    const mail = await this.parseEmail(message);
                    const ticket = await this.createTicketFromEmail(mail);

                    // Mark email as read after successful ticket creation
                    await connection.addFlags(message.attributes.uid, ['\\Seen']);

                    logger.info('Ticket created from email', {
                        ticketId: ticket.id,
                        ticketNumber: ticket.ticket_number,
                        from: mail.from,
                        subject: mail.subject
                    });
                } catch (err) {
                    logger.error('Failed to process email', {
                        error: err.message,
                        messageId: message.attributes.uid
                    });
                }
            }

            connection.end();
            */

            // Placeholder: Log that service is running
            logger.debug('Email check complete (IMAP not configured)');

        } catch (error) {
            logger.error('Failed to check inbox', { error: error.message });
        }
    }

    /**
     * Parse email message
     */
    async parseEmail(message) {
        try {
            // Get email body
            const all = message.parts.find(part => part.which === '');
            const emailBuffer = all.body;

            // Parse with mailparser
            const parsed = await simpleParser(emailBuffer);

            return {
                from: parsed.from.value[0].address,
                fromName: parsed.from.value[0].name,
                to: parsed.to ? parsed.to.value[0].address : this.config.email,
                subject: parsed.subject,
                text: parsed.text,
                html: parsed.html,
                date: parsed.date,
                messageId: parsed.messageId,
                inReplyTo: parsed.inReplyTo,
                references: parsed.references
            };

        } catch (error) {
            logger.error('Failed to parse email', { error: error.message });
            throw error;
        }
    }

    /**
     * Create support ticket from email
     */
    async createTicketFromEmail(mail) {
        try {
            // Find or create user based on email
            let user = await this.findOrCreateUser(mail.from, mail.fromName);

            // Check if this is a reply to existing ticket
            const existingTicket = await this.findTicketByReference(mail.inReplyTo, mail.references);

            if (existingTicket) {
                // Add message to existing ticket
                return await this.addReplyToTicket(existingTicket, user, mail);
            }

            // Create new ticket
            const category = this.detectCategory(mail.subject, mail.text);
            const priority = this.detectPriority(mail.subject, mail.text);

            // Calculate SLA
            const slaMinutes = {
                'low': 240,
                'normal': 120,
                'high': 60,
                'urgent': 30,
                'critical': 15
            }[priority];

            const slaDueDate = new Date(Date.now() + slaMinutes * 60 * 1000);

            // Create ticket
            const ticketResult = await query(
                `INSERT INTO support_tickets
                (user_id, customer_name, customer_email, subject, description,
                 category, priority, status, channel, sla_due_date)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', 'email', $8)
                RETURNING *`,
                [user.id, user.name, user.email, mail.subject, mail.text || mail.html,
                 category, priority, slaDueDate]
            );

            const ticket = ticketResult.rows[0];

            // Add initial message
            await query(
                `INSERT INTO ticket_messages
                (ticket_id, user_id, author_name, author_email, is_customer, content, message_type)
                VALUES ($1, $2, $3, $4, true, $5, 'text')`,
                [ticket.id, user.id, user.name, user.email, mail.text || mail.html]
            );

            // Store email reference for threading
            await query(
                `UPDATE support_tickets
                 SET custom_fields = jsonb_build_object(
                    'email_message_id', $1,
                    'email_date', $2
                 )
                 WHERE id = $3`,
                [mail.messageId, mail.date, ticket.id]
            );

            // Send confirmation email
            sendTicketCreatedEmail(ticket, user).catch(err => {
                logger.error('Failed to send confirmation email', { error: err.message });
            });

            // Emit Socket.IO event
            try {
                const io = getIO();
                emitTicketCreated(io, ticket, user);
            } catch (err) {
                logger.error('Failed to emit ticket created event', { error: err.message });
            }

            // Auto-assign
            autoAssignment.assignTicket(ticket.id).catch(err => {
                logger.error('Failed to auto-assign email ticket', { error: err.message });
            });

            // Trigger workflows
            workflowAutomation.triggerWorkflow('ticket_created', {
                ticket,
                customer: user,
                source: 'email'
            }).catch(err => {
                logger.error('Failed to trigger workflow', { error: err.message });
            });

            logger.info('Ticket created from email', {
                ticketId: ticket.id,
                ticketNumber: ticket.ticket_number,
                from: mail.from
            });

            return ticket;

        } catch (error) {
            logger.error('Failed to create ticket from email', { error: error.message });
            throw error;
        }
    }

    /**
     * Find or create user from email address
     */
    async findOrCreateUser(email, name) {
        try {
            // Try to find existing user
            let result = await query(
                'SELECT id, name, email FROM users WHERE email = $1',
                [email]
            );

            if (result.rows.length > 0) {
                return result.rows[0];
            }

            // Create new user
            const username = email.split('@')[0];
            const randomPassword = Math.random().toString(36).slice(-12);

            result = await query(
                `INSERT INTO users (username, password, email, name, role, is_active)
                 VALUES ($1, $2, $3, $4, 'user', true)
                 RETURNING id, name, email`,
                [username, randomPassword, email, name || username]
            );

            logger.info('Created user from email', { email, name });

            return result.rows[0];

        } catch (error) {
            logger.error('Failed to find/create user', { error: error.message, email });
            throw error;
        }
    }

    /**
     * Find existing ticket by email references
     */
    async findTicketByReference(inReplyTo, references) {
        if (!inReplyTo && (!references || references.length === 0)) {
            return null;
        }

        try {
            const result = await query(
                `SELECT * FROM support_tickets
                 WHERE custom_fields->>'email_message_id' = $1
                    OR custom_fields->>'email_message_id' = ANY($2)
                 LIMIT 1`,
                [inReplyTo, references || []]
            );

            return result.rows.length > 0 ? result.rows[0] : null;

        } catch (error) {
            logger.error('Failed to find ticket by reference', { error: error.message });
            return null;
        }
    }

    /**
     * Add reply to existing ticket
     */
    async addReplyToTicket(ticket, user, mail) {
        try {
            // Add message
            await query(
                `INSERT INTO ticket_messages
                (ticket_id, user_id, author_name, author_email, is_customer, content, message_type)
                VALUES ($1, $2, $3, $4, true, $5, 'text')`,
                [ticket.id, user.id, user.name, user.email, mail.text || mail.html]
            );

            // Update ticket status if needed
            if (ticket.status === 'waiting_customer') {
                await query(
                    `UPDATE support_tickets
                     SET status = 'open', updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [ticket.id]
                );
            }

            logger.info('Added email reply to ticket', {
                ticketId: ticket.id,
                ticketNumber: ticket.ticket_number,
                from: mail.from
            });

            return ticket;

        } catch (error) {
            logger.error('Failed to add reply to ticket', { error: error.message });
            throw error;
        }
    }

    /**
     * Detect ticket category from email content
     */
    detectCategory(subject, body) {
        const text = `${subject} ${body}`.toLowerCase();

        if (text.match(/bug|error|broken|not working|crash/i)) return 'bug';
        if (text.match(/payment|billing|invoice|subscription/i)) return 'billing';
        if (text.match(/feature|request|suggest|add|improve/i)) return 'feature_request';
        if (text.match(/technical|setup|install|configure/i)) return 'technical';

        return 'other';
    }

    /**
     * Detect ticket priority from email content
     */
    detectPriority(subject, body) {
        const text = `${subject} ${body}`.toLowerCase();

        if (text.match(/urgent|asap|emergency|critical|immediately/i)) return 'urgent';
        if (text.match(/important|high priority/i)) return 'high';
        if (text.match(/low priority|when possible/i)) return 'low';

        return 'normal';
    }

    /**
     * Get service statistics
     */
    async getStats() {
        try {
            const result = await query(
                `SELECT
                    COUNT(*) as total_email_tickets,
                    COUNT(CASE WHEN status IN ('resolved', 'closed') THEN 1 END) as resolved,
                    AVG(resolution_time) as avg_resolution_minutes
                 FROM support_tickets
                 WHERE channel = 'email'
                   AND created_at >= NOW() - INTERVAL '30 days'`
            );

            return {
                enabled: this.config.enabled,
                running: this.isRunning,
                poll_interval_seconds: this.pollIntervalMs / 1000,
                ...result.rows[0]
            };

        } catch (error) {
            logger.error('Failed to get email-to-ticket stats', { error: error.message });
            return { enabled: this.config.enabled, running: this.isRunning };
        }
    }
}

module.exports = new EmailToTicketService();
