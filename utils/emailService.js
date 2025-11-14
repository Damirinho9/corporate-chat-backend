const nodemailer = require('nodemailer');

// Email configuration from environment variables
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 465;
const EMAIL_CONFIG = {
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
        user: process.env.SMTP_USER || '9b9c23001@smtp-brevo.com',
        pass: process.env.SMTP_PASS
    }
};

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'vaitmarket@ya.ru';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Create transporter
let transporter = null;

function getTransporter() {
    if (!transporter) {
        if (!EMAIL_CONFIG.auth.pass) {
            console.warn('[Email] SMTP_PASS not configured. Email sending disabled.');
            return null;
        }
        console.log('[Email] Initializing SMTP transporter:', {
            host: EMAIL_CONFIG.host,
            port: EMAIL_CONFIG.port,
            secure: EMAIL_CONFIG.secure,
            user: EMAIL_CONFIG.auth.user,
            adminEmail: ADMIN_EMAIL,
            appUrl: APP_URL
        });
        transporter = nodemailer.createTransport(EMAIL_CONFIG);
    }
    return transporter;
}

/**
 * Send registration request to admin
 * @param {Object} request - Registration request data
 */
async function sendRegistrationRequestToAdmin(request) {
    const transport = getTransporter();
    if (!transport) {
        console.warn('[Email] Skipping email - transporter not configured');
        return { success: false, error: 'Email not configured' };
    }

    try {
        const approvalUrl = `${APP_URL}/api/registration/approve/${request.approval_token}`;
        const rejectUrl = `${APP_URL}/api/registration/reject/${request.approval_token}`;

        const mailOptions = {
            from: `"Corporate Chat" <${EMAIL_CONFIG.auth.user}>`,
            to: ADMIN_EMAIL,
            subject: '🔔 Новая заявка на регистрацию',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: #4299e1; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f7fafc; padding: 30px; border: 1px solid #e2e8f0; }
                        .info-row { margin: 15px 0; padding: 10px; background: white; border-left: 4px solid #4299e1; }
                        .info-label { font-weight: bold; color: #2d3748; }
                        .info-value { color: #4a5568; margin-top: 5px; }
                        .buttons { margin-top: 30px; text-align: center; }
                        .btn { display: inline-block; padding: 12px 30px; margin: 0 10px; text-decoration: none; border-radius: 6px; font-weight: bold; }
                        .btn-approve { background: #48bb78; color: white; }
                        .btn-reject { background: #f56565; color: white; }
                        .footer { text-align: center; margin-top: 20px; color: #718096; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h2>🔔 Новая заявка на регистрацию</h2>
                        </div>
                        <div class="content">
                            <p>Поступила новая заявка на регистрацию в системе Corporate Chat:</p>

                            <div class="info-row">
                                <div class="info-label">📧 Email (логин):</div>
                                <div class="info-value">${request.email}</div>
                            </div>

                            <div class="info-row">
                                <div class="info-label">👤 ФИО:</div>
                                <div class="info-value">${request.full_name}</div>
                            </div>

                            <div class="info-row">
                                <div class="info-label">🔑 Username:</div>
                                <div class="info-value">${request.username}</div>
                            </div>

                            <div class="info-row">
                                <div class="info-label">🔐 Пароль:</div>
                                <div class="info-value"><code>${request.generated_password}</code></div>
                            </div>

                            <div class="info-row">
                                <div class="info-label">👔 Роль:</div>
                                <div class="info-value">${getRoleDisplayName(request.role)}</div>
                            </div>

                            ${request.department ? `
                            <div class="info-row">
                                <div class="info-label">🏢 Отдел:</div>
                                <div class="info-value">${request.department}</div>
                            </div>
                            ` : ''}

                            <div class="info-row">
                                <div class="info-label">📅 Дата заявки:</div>
                                <div class="info-value">${new Date(request.created_at).toLocaleString('ru-RU')}</div>
                            </div>

                            <div class="buttons">
                                <a href="${approvalUrl}" class="btn btn-approve">✅ Подтвердить</a>
                                <a href="${rejectUrl}" class="btn btn-reject">❌ Отклонить</a>
                            </div>
                        </div>
                        <div class="footer">
                            <p>Это автоматическое уведомление от системы Corporate Chat</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transport.sendMail(mailOptions);
        console.log('[Email] Registration request sent to admin:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[Email] Failed to send registration request to admin:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send approval notification to user
 * @param {Object} request - Registration request data
 */
async function sendApprovalToUser(request) {
    const transport = getTransporter();
    if (!transport) {
        console.warn('[Email] Skipping email - transporter not configured');
        return { success: false, error: 'Email not configured' };
    }

    try {
        const loginUrl = `${APP_URL}`;

        const mailOptions = {
            from: `"Corporate Chat" <${EMAIL_CONFIG.auth.user}>`,
            to: request.email,
            subject: '✅ Ваша регистрация подтверждена',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: #48bb78; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f7fafc; padding: 30px; border: 1px solid #e2e8f0; }
                        .info-row { margin: 15px 0; padding: 10px; background: white; border-left: 4px solid #48bb78; }
                        .info-label { font-weight: bold; color: #2d3748; }
                        .info-value { color: #4a5568; margin-top: 5px; }
                        .btn-login { display: inline-block; padding: 12px 30px; background: #4299e1; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
                        .warning { background: #fef5e7; border-left: 4px solid #f39c12; padding: 15px; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 20px; color: #718096; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h2>✅ Регистрация подтверждена!</h2>
                        </div>
                        <div class="content">
                            <p>Здравствуйте, <strong>${request.full_name}</strong>!</p>
                            <p>Ваша заявка на регистрацию в системе Corporate Chat была одобрена администратором.</p>

                            <div class="warning">
                                <strong>⚠️ Важно!</strong> Сохраните эти данные в надежном месте. Это единственный раз, когда вы получите свой пароль.
                            </div>

                            <div class="info-row">
                                <div class="info-label">📧 Логин (Email):</div>
                                <div class="info-value">${request.email}</div>
                            </div>

                            <div class="info-row">
                                <div class="info-label">🔐 Пароль:</div>
                                <div class="info-value"><code style="font-size: 16px; font-weight: bold;">${request.generated_password}</code></div>
                            </div>

                            <div class="info-row">
                                <div class="info-label">👔 Роль:</div>
                                <div class="info-value">${getRoleDisplayName(request.role)}</div>
                            </div>

                            ${request.department ? `
                            <div class="info-row">
                                <div class="info-label">🏢 Отдел:</div>
                                <div class="info-value">${request.department}</div>
                            </div>
                            ` : ''}

                            <div style="text-align: center;">
                                <a href="${loginUrl}" class="btn-login">🔐 Войти в систему</a>
                            </div>

                            <p style="margin-top: 30px; color: #718096; font-size: 14px;">
                                После входа вы можете сменить пароль в настройках профиля.
                            </p>
                        </div>
                        <div class="footer">
                            <p>Это автоматическое уведомление от системы Corporate Chat</p>
                            <p>Если у вас возникли вопросы, обратитесь к администратору</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transport.sendMail(mailOptions);
        console.log('[Email] Approval sent to user:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[Email] Failed to send approval to user:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send rejection notification to user
 * @param {Object} request - Registration request data
 * @param {string} reason - Rejection reason
 */
async function sendRejectionToUser(request, reason) {
    const transport = getTransporter();
    if (!transport) {
        console.warn('[Email] Skipping email - transporter not configured');
        return { success: false, error: 'Email not configured' };
    }

    try {
        const mailOptions = {
            from: `"Corporate Chat" <${EMAIL_CONFIG.auth.user}>`,
            to: request.email,
            subject: '❌ Заявка на регистрацию отклонена',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: #f56565; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f7fafc; padding: 30px; border: 1px solid #e2e8f0; }
                        .reason { background: #fff5f5; border-left: 4px solid #f56565; padding: 15px; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 20px; color: #718096; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h2>❌ Заявка отклонена</h2>
                        </div>
                        <div class="content">
                            <p>Здравствуйте, <strong>${request.full_name}</strong>!</p>
                            <p>К сожалению, ваша заявка на регистрацию в системе Corporate Chat была отклонена администратором.</p>

                            ${reason ? `
                            <div class="reason">
                                <strong>Причина:</strong>
                                <p>${reason}</p>
                            </div>
                            ` : ''}

                            <p>Если у вас есть вопросы, пожалуйста, свяжитесь с администратором системы.</p>
                        </div>
                        <div class="footer">
                            <p>Это автоматическое уведомление от системы Corporate Chat</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transport.sendMail(mailOptions);
        console.log('[Email] Rejection sent to user:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[Email] Failed to send rejection to user:', error);
        return { success: false, error: error.message };
    }
}

function getRoleDisplayName(role) {
    const roleNames = {
        'admin': 'Администратор',
        'assistant': 'Ассистент',
        'rop': 'РОП',
        'operator': 'Оператор',
        'employee': 'Сотрудник'
    };
    return roleNames[role] || role;
}

module.exports = {
    sendRegistrationRequestToAdmin,
    sendApprovalToUser,
    sendRejectionToUser
};
