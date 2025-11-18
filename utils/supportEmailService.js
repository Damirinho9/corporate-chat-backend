const nodemailer = require('nodemailer');

// Email configuration from environment variables
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 465;
const EMAIL_CONFIG = {
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
        user: process.env.SMTP_USER || '9b9c23001@smtp-brevo.com',
        pass: process.env.SMTP_PASS
    }
};

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'vaitmarket@ya.ru';

// Create transporter
let transporter = null;

function getTransporter() {
    if (!transporter) {
        if (!EMAIL_CONFIG.auth.pass) {
            console.warn('[Support Email] SMTP_PASS not configured. Email sending disabled.');
            return null;
        }
        transporter = nodemailer.createTransport(EMAIL_CONFIG);
    }
    return transporter;
}

/**
 * Get priority emoji and color
 */
function getPriorityInfo(priority) {
    const priorities = {
        'critical': { emoji: '🔴', color: '#dc2626', label: 'Критический' },
        'urgent': { emoji: '🟠', color: '#ea580c', label: 'Срочный' },
        'high': { emoji: '🟡', color: '#ca8a04', label: 'Высокий' },
        'normal': { emoji: '🟢', color: '#16a34a', label: 'Нормальный' },
        'low': { emoji: '🔵', color: '#2563eb', label: 'Низкий' }
    };
    return priorities[priority] || priorities['normal'];
}

/**
 * Get category emoji
 */
function getCategoryInfo(category) {
    const categories = {
        'technical': { emoji: '⚙️', label: 'Технические вопросы' },
        'billing': { emoji: '💳', label: 'Оплата и тарифы' },
        'account': { emoji: '👤', label: 'Аккаунт и доступ' },
        'feature_request': { emoji: '💡', label: 'Запрос функций' },
        'bug_report': { emoji: '🐛', label: 'Сообщение об ошибке' },
        'other': { emoji: '📋', label: 'Другое' }
    };
    return categories[category] || categories['other'];
}

/**
 * Get status info
 */
function getStatusInfo(status) {
    const statuses = {
        'new': { emoji: '🆕', color: '#3b82f6', label: 'Новый' },
        'open': { emoji: '📂', color: '#8b5cf6', label: 'Открыт' },
        'in_progress': { emoji: '⚡', color: '#f59e0b', label: 'В работе' },
        'waiting_customer': { emoji: '⏳', color: '#06b6d4', label: 'Ожидание клиента' },
        'waiting_agent': { emoji: '⌛', color: '#14b8a6', label: 'Ожидание агента' },
        'resolved': { emoji: '✅', color: '#10b981', label: 'Решён' },
        'closed': { emoji: '🔒', color: '#6b7280', label: 'Закрыт' }
    };
    return statuses[status] || statuses['new'];
}

/**
 * Send email notification when new ticket is created
 */
async function sendTicketCreatedEmail(ticket, customer) {
    const transport = getTransporter();
    if (!transport) {
        console.warn('[Support Email] Skipping email - transporter not configured');
        return { success: false, error: 'Email not configured' };
    }

    try {
        const priority = getPriorityInfo(ticket.priority);
        const category = getCategoryInfo(ticket.category);
        const ticketUrl = `${APP_URL}/support.html?ticket=${ticket.id}`;

        const mailOptions = {
            from: `"Corporate Chat Support" <${SMTP_FROM}>`,
            to: customer.email,
            subject: `🎫 Тикет #${ticket.ticket_number} создан: ${ticket.subject}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                        .ticket-number { background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; display: inline-block; margin-top: 10px; font-size: 14px; }
                        .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
                        .ticket-info { background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; }
                        .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
                        .info-row:last-child { border-bottom: none; }
                        .info-label { font-weight: 600; color: #6b7280; }
                        .info-value { color: #111827; }
                        .description { background: #f3f4f6; border-left: 4px solid #8b5cf6; padding: 20px; margin: 20px 0; border-radius: 4px; }
                        .btn { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.25); }
                        .btn:hover { box-shadow: 0 6px 8px rgba(102, 126, 234, 0.35); }
                        .footer { text-align: center; margin-top: 30px; padding: 20px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb; }
                        .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🎫 Ваш тикет создан</h1>
                            <div class="ticket-number">#${ticket.ticket_number}</div>
                        </div>
                        <div class="content">
                            <p>Здравствуйте, <strong>${customer.name}</strong>!</p>
                            <p>Ваш запрос в службу поддержки был успешно создан. Мы приступим к его рассмотрению в ближайшее время.</p>

                            <div class="ticket-info">
                                <div class="info-row">
                                    <span class="info-label">Номер тикета:</span>
                                    <span class="info-value"><strong>#${ticket.ticket_number}</strong></span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Тема:</span>
                                    <span class="info-value">${ticket.subject}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Категория:</span>
                                    <span class="info-value">${category.emoji} ${category.label}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Приоритет:</span>
                                    <span class="info-value">${priority.emoji} ${priority.label}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Создан:</span>
                                    <span class="info-value">${new Date(ticket.created_at).toLocaleString('ru-RU')}</span>
                                </div>
                            </div>

                            <div class="description">
                                <strong>Ваше сообщение:</strong>
                                <p style="margin: 10px 0 0 0; white-space: pre-wrap;">${ticket.description}</p>
                            </div>

                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${ticketUrl}" class="btn">Открыть тикет</a>
                            </div>

                            <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
                                Вы можете отслеживать статус тикета и отправлять дополнительные сообщения по ссылке выше.
                            </p>
                        </div>
                        <div class="footer">
                            <p>Это автоматическое уведомление от системы Corporate Chat Support</p>
                            <p>Пожалуйста, не отвечайте на это письмо. Используйте интерфейс поддержки для общения.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transport.sendMail(mailOptions);
        console.log(`[Support Email] Ticket created email sent to ${customer.email}:`, info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[Support Email] Failed to send ticket created email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send email notification when ticket receives a reply
 */
async function sendTicketReplyEmail(ticket, message, sender, recipient) {
    const transport = getTransporter();
    if (!transport) {
        console.warn('[Support Email] Skipping email - transporter not configured');
        return { success: false, error: 'Email not configured' };
    }

    try {
        const ticketUrl = `${APP_URL}/support.html?ticket=${ticket.id}`;
        const isFromAgent = message.is_from_customer === false;

        const mailOptions = {
            from: `"Corporate Chat Support" <${SMTP_FROM}>`,
            to: recipient.email,
            subject: `💬 Новый ответ в тикете #${ticket.ticket_number}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                        .ticket-number { background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; display: inline-block; margin-top: 10px; font-size: 14px; }
                        .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
                        .message-box { background: #f9fafb; border-left: 4px solid #8b5cf6; padding: 20px; margin: 20px 0; border-radius: 4px; }
                        .sender-info { display: flex; align-items: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e5e7eb; }
                        .sender-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; margin-right: 12px; }
                        .sender-details { flex: 1; }
                        .sender-name { font-weight: 600; color: #111827; }
                        .sender-time { font-size: 13px; color: #6b7280; margin-top: 2px; }
                        .message-content { white-space: pre-wrap; color: #374151; line-height: 1.7; }
                        .btn { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.25); }
                        .footer { text-align: center; margin-top: 30px; padding: 20px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>💬 Новый ответ</h1>
                            <div class="ticket-number">#${ticket.ticket_number}</div>
                        </div>
                        <div class="content">
                            <p>Здравствуйте, <strong>${recipient.name}</strong>!</p>
                            <p>${isFromAgent ? 'Агент поддержки' : 'Клиент'} ответил на ваш тикет <strong>${ticket.subject}</strong>:</p>

                            <div class="message-box">
                                <div class="sender-info">
                                    <div class="sender-avatar">${sender.name.charAt(0).toUpperCase()}</div>
                                    <div class="sender-details">
                                        <div class="sender-name">${sender.name}${isFromAgent ? ' (Агент поддержки)' : ''}</div>
                                        <div class="sender-time">${new Date(message.created_at).toLocaleString('ru-RU')}</div>
                                    </div>
                                </div>
                                <div class="message-content">${message.content}</div>
                            </div>

                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${ticketUrl}" class="btn">Ответить на тикет</a>
                            </div>
                        </div>
                        <div class="footer">
                            <p>Это автоматическое уведомление от системы Corporate Chat Support</p>
                            <p>Пожалуйста, не отвечайте на это письмо. Используйте интерфейс поддержки для общения.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transport.sendMail(mailOptions);
        console.log(`[Support Email] Ticket reply email sent to ${recipient.email}:`, info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[Support Email] Failed to send ticket reply email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send email notification when ticket status changes
 */
async function sendTicketStatusChangedEmail(ticket, oldStatus, newStatus, customer, agent) {
    const transport = getTransporter();
    if (!transport) {
        console.warn('[Support Email] Skipping email - transporter not configured');
        return { success: false, error: 'Email not configured' };
    }

    try {
        const oldStatusInfo = getStatusInfo(oldStatus);
        const newStatusInfo = getStatusInfo(newStatus);
        const ticketUrl = `${APP_URL}/support.html?ticket=${ticket.id}`;

        const mailOptions = {
            from: `"Corporate Chat Support" <${SMTP_FROM}>`,
            to: customer.email,
            subject: `${newStatusInfo.emoji} Статус тикета #${ticket.ticket_number} изменён`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                        .ticket-number { background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; display: inline-block; margin-top: 10px; font-size: 14px; }
                        .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
                        .status-change { background: #f9fafb; border-radius: 8px; padding: 25px; margin: 20px 0; text-align: center; }
                        .status-badge { display: inline-block; padding: 10px 20px; border-radius: 20px; font-weight: 600; margin: 0 10px; }
                        .arrow { color: #6b7280; font-size: 24px; margin: 0 10px; }
                        .btn { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.25); }
                        .footer { text-align: center; margin-top: 30px; padding: 20px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>${newStatusInfo.emoji} Статус изменён</h1>
                            <div class="ticket-number">#${ticket.ticket_number}</div>
                        </div>
                        <div class="content">
                            <p>Здравствуйте, <strong>${customer.name}</strong>!</p>
                            <p>Статус вашего тикета <strong>${ticket.subject}</strong> был изменён${agent ? ` агентом ${agent.name}` : ''}:</p>

                            <div class="status-change">
                                <div style="display: flex; align-items: center; justify-content: center; flex-wrap: wrap;">
                                    <span class="status-badge" style="background: ${oldStatusInfo.color}; color: white;">
                                        ${oldStatusInfo.emoji} ${oldStatusInfo.label}
                                    </span>
                                    <span class="arrow">→</span>
                                    <span class="status-badge" style="background: ${newStatusInfo.color}; color: white;">
                                        ${newStatusInfo.emoji} ${newStatusInfo.label}
                                    </span>
                                </div>
                            </div>

                            ${newStatus === 'resolved' ? `
                                <div style="background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                    <p style="margin: 0; color: #059669; font-weight: 600;">✅ Ваш вопрос решён!</p>
                                    <p style="margin: 10px 0 0 0; color: #047857;">Если проблема решена, тикет будет автоматически закрыт через 48 часов. Если у вас остались вопросы, вы можете продолжить обсуждение.</p>
                                </div>
                            ` : ''}

                            ${newStatus === 'closed' ? `
                                <div style="background: #f3f4f6; border: 1px solid #6b7280; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                    <p style="margin: 0; color: #374151; font-weight: 600;">🔒 Тикет закрыт</p>
                                    <p style="margin: 10px 0 0 0; color: #4b5563;">Спасибо за обращение! Если у вас появятся новые вопросы, создайте новый тикет.</p>
                                </div>
                            ` : ''}

                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${ticketUrl}" class="btn">Открыть тикет</a>
                            </div>
                        </div>
                        <div class="footer">
                            <p>Это автоматическое уведомление от системы Corporate Chat Support</p>
                            <p>Пожалуйста, не отвечайте на это письмо. Используйте интерфейс поддержки для общения.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transport.sendMail(mailOptions);
        console.log(`[Support Email] Status changed email sent to ${customer.email}:`, info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[Support Email] Failed to send status changed email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send email notification when ticket is assigned to an agent
 */
async function sendTicketAssignedEmail(ticket, agent, customer) {
    const transport = getTransporter();
    if (!transport) {
        console.warn('[Support Email] Skipping email - transporter not configured');
        return { success: false, error: 'Email not configured' };
    }

    try {
        const ticketUrl = `${APP_URL}/support-agent.html?ticket=${ticket.id}`;

        const mailOptions = {
            from: `"Corporate Chat Support" <${SMTP_FROM}>`,
            to: agent.email,
            subject: `👤 Вам назначен тикет #${ticket.ticket_number}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                        .ticket-number { background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; display: inline-block; margin-top: 10px; font-size: 14px; }
                        .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
                        .ticket-info { background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; }
                        .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
                        .info-row:last-child { border-bottom: none; }
                        .info-label { font-weight: 600; color: #6b7280; }
                        .info-value { color: #111827; }
                        .btn { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.25); }
                        .footer { text-align: center; margin-top: 30px; padding: 20px; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>👤 Новое назначение</h1>
                            <div class="ticket-number">#${ticket.ticket_number}</div>
                        </div>
                        <div class="content">
                            <p>Здравствуйте, <strong>${agent.name}</strong>!</p>
                            <p>Вам назначен новый тикет для обработки:</p>

                            <div class="ticket-info">
                                <div class="info-row">
                                    <span class="info-label">Тикет:</span>
                                    <span class="info-value"><strong>#${ticket.ticket_number}</strong></span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Тема:</span>
                                    <span class="info-value">${ticket.subject}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Клиент:</span>
                                    <span class="info-value">${customer.name}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Приоритет:</span>
                                    <span class="info-value">${getPriorityInfo(ticket.priority).emoji} ${getPriorityInfo(ticket.priority).label}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Категория:</span>
                                    <span class="info-value">${getCategoryInfo(ticket.category).emoji} ${getCategoryInfo(ticket.category).label}</span>
                                </div>
                            </div>

                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${ticketUrl}" class="btn">Открыть тикет</a>
                            </div>
                        </div>
                        <div class="footer">
                            <p>Это автоматическое уведомление от системы Corporate Chat Support</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transport.sendMail(mailOptions);
        console.log(`[Support Email] Ticket assigned email sent to ${agent.email}:`, info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[Support Email] Failed to send ticket assigned email:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendTicketCreatedEmail,
    sendTicketReplyEmail,
    sendTicketStatusChangedEmail,
    sendTicketAssignedEmail
};
