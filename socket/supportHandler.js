/**
 * Socket.IO Support System Handler
 * Handles real-time events for support tickets
 */

const { createLogger } = require('../utils/logger');
const logger = createLogger('socket-support');

/**
 * Initialize support-related Socket.IO handlers
 * @param {Server} io - Socket.IO server instance
 * @param {Socket} socket - Socket instance
 */
function initializeSupportHandlers(io, socket) {
    const userId = socket.user.id;

    /**
     * Join support rooms
     * Agents join 'support_queue' to receive new ticket notifications
     * Customers join their ticket rooms
     */
    socket.on('support:join', async (data) => {
        try {
            const { ticketId, role } = data;

            // Agents join support queue
            if (role === 'admin' || role === 'assistant' || role === 'head') {
                socket.join('support_queue');
                logger.info('Agent joined support queue', { userId, role });
            }

            // Join specific ticket room
            if (ticketId) {
                socket.join(`ticket_${ticketId}`);
                logger.info('User joined ticket room', { userId, ticketId });
            }

            socket.emit('support:joined', { success: true });
        } catch (error) {
            logger.error('Failed to join support room', { error: error.message, userId });
            socket.emit('support:error', { message: 'Failed to join support room' });
        }
    });

    /**
     * Leave support rooms
     */
    socket.on('support:leave', async (data) => {
        try {
            const { ticketId } = data;

            if (ticketId) {
                socket.leave(`ticket_${ticketId}`);
                logger.info('User left ticket room', { userId, ticketId });
            }

            socket.leave('support_queue');
            logger.info('User left support queue', { userId });

            socket.emit('support:left', { success: true });
        } catch (error) {
            logger.error('Failed to leave support room', { error: error.message, userId });
        }
    });

    /**
     * Typing indicator for ticket
     */
    socket.on('support:typing', (data) => {
        try {
            const { ticketId } = data;
            socket.to(`ticket_${ticketId}`).emit('support:user_typing', {
                ticketId,
                userId,
                userName: socket.user.name
            });
        } catch (error) {
            logger.error('Failed to send typing indicator', { error: error.message, userId });
        }
    });

    logger.info('Support handlers initialized', { userId });
}

/**
 * Emit event when new ticket is created
 * @param {Server} io - Socket.IO server instance
 * @param {Object} ticket - Ticket object
 * @param {Object} customer - Customer object
 */
function emitTicketCreated(io, ticket, customer) {
    try {
        // Notify support queue (all agents)
        io.to('support_queue').emit('support:ticket_created', {
            ticket: {
                id: ticket.id,
                ticket_number: ticket.ticket_number,
                subject: ticket.subject,
                priority: ticket.priority,
                category: ticket.category,
                status: ticket.status,
                customer_name: customer.name,
                customer_email: customer.email,
                created_at: ticket.created_at
            }
        });

        logger.info('Ticket created event emitted', { ticketId: ticket.id });
    } catch (error) {
        logger.error('Failed to emit ticket created event', { error: error.message, ticketId: ticket.id });
    }
}

/**
 * Emit event when ticket is updated
 * @param {Server} io - Socket.IO server instance
 * @param {number} ticketId - Ticket ID
 * @param {Object} updates - Updated fields
 */
function emitTicketUpdated(io, ticketId, updates) {
    try {
        // Notify users in ticket room
        io.to(`ticket_${ticketId}`).emit('support:ticket_updated', {
            ticketId,
            updates
        });

        // If priority or status changed, notify support queue
        if (updates.priority || updates.status) {
            io.to('support_queue').emit('support:ticket_updated', {
                ticketId,
                updates
            });
        }

        logger.info('Ticket updated event emitted', { ticketId, updates });
    } catch (error) {
        logger.error('Failed to emit ticket updated event', { error: error.message, ticketId });
    }
}

/**
 * Emit event when new message is added to ticket
 * @param {Server} io - Socket.IO server instance
 * @param {number} ticketId - Ticket ID
 * @param {Object} message - Message object
 * @param {Object} author - Author object
 */
function emitTicketMessage(io, ticketId, message, author) {
    try {
        // Notify users in ticket room
        io.to(`ticket_${ticketId}`).emit('support:ticket_message', {
            ticketId,
            message: {
                id: message.id,
                content: message.content,
                is_customer: message.is_customer,
                is_internal: message.is_internal,
                author_name: author.name,
                author_email: author.email,
                created_at: message.created_at
            }
        });

        // If not internal, notify support queue
        if (!message.is_internal) {
            io.to('support_queue').emit('support:ticket_activity', {
                ticketId,
                type: 'message',
                author_name: author.name
            });
        }

        logger.info('Ticket message event emitted', { ticketId, messageId: message.id });
    } catch (error) {
        logger.error('Failed to emit ticket message event', { error: error.message, ticketId });
    }
}

/**
 * Emit event when ticket is assigned
 * @param {Server} io - Socket.IO server instance
 * @param {number} ticketId - Ticket ID
 * @param {number|null} assignedTo - Assigned agent user ID
 * @param {Object} ticket - Ticket object
 */
function emitTicketAssigned(io, ticketId, assignedTo, ticket) {
    try {
        // Notify ticket room
        io.to(`ticket_${ticketId}`).emit('support:ticket_assigned', {
            ticketId,
            assignedTo
        });

        // Notify assigned agent directly
        if (assignedTo) {
            io.to(`user_${assignedTo}`).emit('support:ticket_assigned_to_you', {
                ticket: {
                    id: ticket.id,
                    ticket_number: ticket.ticket_number,
                    subject: ticket.subject,
                    priority: ticket.priority,
                    category: ticket.category
                }
            });
        }

        // Notify support queue
        io.to('support_queue').emit('support:ticket_activity', {
            ticketId,
            type: 'assignment',
            assignedTo
        });

        logger.info('Ticket assigned event emitted', { ticketId, assignedTo });
    } catch (error) {
        logger.error('Failed to emit ticket assigned event', { error: error.message, ticketId });
    }
}

/**
 * Emit event when ticket status changes
 * @param {Server} io - Socket.IO server instance
 * @param {number} ticketId - Ticket ID
 * @param {string} oldStatus - Old status
 * @param {string} newStatus - New status
 */
function emitTicketStatusChanged(io, ticketId, oldStatus, newStatus) {
    try {
        // Notify ticket room
        io.to(`ticket_${ticketId}`).emit('support:ticket_status_changed', {
            ticketId,
            oldStatus,
            newStatus
        });

        // Notify support queue
        io.to('support_queue').emit('support:ticket_activity', {
            ticketId,
            type: 'status_change',
            oldStatus,
            newStatus
        });

        logger.info('Ticket status changed event emitted', { ticketId, oldStatus, newStatus });
    } catch (error) {
        logger.error('Failed to emit ticket status changed event', { error: error.message, ticketId });
    }
}

module.exports = {
    initializeSupportHandlers,
    emitTicketCreated,
    emitTicketUpdated,
    emitTicketMessage,
    emitTicketAssigned,
    emitTicketStatusChanged
};
