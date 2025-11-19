// ==================== EMAIL SERVICE ====================
// Handles sending emails for notifications, reports, and alerts
const nodemailer = require('nodemailer');
const { createLogger } = require('../utils/logger');

const logger = createLogger('email-service');

class EmailService {
    constructor() {
        this.transporter = null;
        this.configured = false;
        this.initialize();
    }

    initialize() {
        // Check if email configuration is available
        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = process.env.SMTP_PORT;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        if (smtpHost && smtpUser && smtpPass) {
            try {
                this.transporter = nodemailer.createTransport({
                    host: smtpHost,
                    port: parseInt(smtpPort) || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: smtpUser,
                        pass: smtpPass
                    }
                });
                this.configured = true;
                logger.info('Email service configured successfully');
            } catch (error) {
                logger.error('Failed to configure email service', { error: error.message });
            }
        } else {
            logger.warn('Email service not configured - missing SMTP credentials');
        }
    }

    /**
     * Send an email
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email address
     * @param {string} options.subject - Email subject
     * @param {string} options.text - Plain text content
     * @param {string} options.html - HTML content
     * @returns {Promise<Object>} - Send result
     */
    async sendEmail(options) {
        if (!this.configured || !this.transporter) {
            logger.warn('Email not sent - service not configured', {
                to: options.to,
                subject: options.subject
            });
            return {
                success: false,
                error: 'Email service not configured',
                simulated: true
            };
        }

        try {
            const mailOptions = {
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: options.to,
                subject: options.subject,
                text: options.text,
                html: options.html
            };

            const result = await this.transporter.sendMail(mailOptions);
            logger.info('Email sent successfully', {
                to: options.to,
                subject: options.subject,
                messageId: result.messageId
            });

            return {
                success: true,
                messageId: result.messageId
            };
        } catch (error) {
            logger.error('Failed to send email', {
                to: options.to,
                subject: options.subject,
                error: error.message
            });
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send a metrics report email
     * @param {string} to - Recipient email
     * @param {string} reportType - Type of report (weekly, monthly, etc.)
     * @param {string} htmlContent - HTML content of the report
     */
    async sendMetricsReport(to, reportType, htmlContent) {
        const subject = `[Corporate Chat] ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Metrics Report`;

        return this.sendEmail({
            to,
            subject,
            text: `Please view this email in an HTML-compatible email client to see the ${reportType} metrics report.`,
            html: htmlContent
        });
    }

    /**
     * Send an alert email
     * @param {string} to - Recipient email
     * @param {string} alertType - Type of alert
     * @param {string} message - Alert message
     */
    async sendAlert(to, alertType, message) {
        const subject = `[Corporate Chat] Alert: ${alertType}`;

        return this.sendEmail({
            to,
            subject,
            text: message,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #e74c3c;">Alert: ${alertType}</h2>
                    <p>${message}</p>
                    <hr>
                    <small style="color: #666;">This is an automated alert from Corporate Chat.</small>
                </div>
            `
        });
    }

    /**
     * Check if email service is configured
     * @returns {boolean}
     */
    isConfigured() {
        return this.configured;
    }
}

// Export singleton instance
module.exports = new EmailService();
