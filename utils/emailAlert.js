// Email alert system for error notifications
const nodemailer = require('nodemailer');
const { createLogger } = require('./logger');

const logger = createLogger('email-alert');

class EmailAlert {
  constructor() {
    this.alertEmail = process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL;
    this.fromEmail = process.env.SMTP_FROM;
    this.enabled = !!(this.alertEmail && process.env.SMTP_HOST);
    this.rateLimitMap = new Map(); // Prevent spam
    this.rateLimitWindow = 5 * 60 * 1000; // 5 minutes
    this.maxAlertsPerWindow = 3; // Max 3 alerts per error type in 5 minutes

    // Create transporter
    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      logger.info('Email alerts enabled', {
        alertEmail: this.alertEmail,
        smtp: process.env.SMTP_HOST,
      });
    } else {
      logger.warn('Email alerts disabled: Missing configuration');
    }
  }

  // Check if we should send alert (rate limiting)
  shouldSendAlert(errorKey) {
    if (!this.rateLimitMap.has(errorKey)) {
      this.rateLimitMap.set(errorKey, []);
    }

    const now = Date.now();
    const alerts = this.rateLimitMap.get(errorKey);

    // Remove old alerts outside the window
    const recentAlerts = alerts.filter(time => now - time < this.rateLimitWindow);
    this.rateLimitMap.set(errorKey, recentAlerts);

    // Check if we've exceeded the limit
    if (recentAlerts.length >= this.maxAlertsPerWindow) {
      logger.debug('Alert rate limit exceeded', { errorKey, count: recentAlerts.length });
      return false;
    }

    // Add current alert
    recentAlerts.push(now);
    this.rateLimitMap.set(errorKey, recentAlerts);

    return true;
  }

  // Format error as HTML email
  formatErrorEmail(error, context = {}) {
    const env = process.env.NODE_ENV || 'development';
    const hostname = require('os').hostname();
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' });
    const appUrl = process.env.APP_URL || 'https://chat.gyda.ru';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px 8px 0 0;
      margin: -30px -30px 30px -30px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .alert-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .info-table td {
      padding: 10px;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-table td:first-child {
      font-weight: 600;
      color: #666;
      width: 180px;
    }
    .error-message {
      background-color: #fee;
      border-left: 4px solid #f44336;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      color: #c62828;
      word-wrap: break-word;
    }
    .stack-trace {
      background-color: #f5f5f5;
      border: 1px solid #ddd;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #555;
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: 400px;
      overflow-y: auto;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-error {
      background-color: #ffebee;
      color: #c62828;
    }
    .badge-prod {
      background-color: #fff3e0;
      color: #e65100;
    }
    .badge-dev {
      background-color: #e3f2fd;
      color: #1565c0;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 12px;
      color: #999;
      text-align: center;
    }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 4px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="alert-icon">🚨</div>
      <h1>Ошибка в системе</h1>
    </div>

    <table class="info-table">
      <tr>
        <td>Окружение:</td>
        <td>
          <span class="badge ${env === 'production' ? 'badge-prod' : 'badge-dev'}">
            ${env}
          </span>
        </td>
      </tr>
      <tr>
        <td>Сервер:</td>
        <td>${hostname}</td>
      </tr>
      <tr>
        <td>Время:</td>
        <td>${timestamp}</td>
      </tr>
      ${context.correlationId ? `
      <tr>
        <td>Correlation ID:</td>
        <td><code>${context.correlationId}</code></td>
      </tr>
      ` : ''}
      ${context.url ? `
      <tr>
        <td>URL:</td>
        <td><code>${context.method || 'GET'} ${context.url}</code></td>
      </tr>
      ` : ''}
      ${context.userId ? `
      <tr>
        <td>User ID:</td>
        <td>${context.userId}</td>
      </tr>
      ` : ''}
      ${context.ip ? `
      <tr>
        <td>IP адрес:</td>
        <td>${context.ip}</td>
      </tr>
      ` : ''}
    </table>

    <h3>Сообщение об ошибке:</h3>
    <div class="error-message">
      <strong>${error.name || 'Error'}:</strong> ${this.escapeHtml(error.message || 'Unknown error')}
    </div>

    ${error.stack ? `
    <h3>Stack Trace:</h3>
    <div class="stack-trace">${this.escapeHtml(error.stack)}</div>
    ` : ''}

    <div style="text-align: center;">
      <a href="${appUrl}/admin" class="btn">Открыть админ-панель</a>
    </div>

    <div class="footer">
      <p>Это автоматическое уведомление из системы мониторинга Corporate Chat</p>
      <p>Чтобы изменить настройки алертов, обратитесь к администратору</p>
    </div>
  </div>
</body>
</html>
    `;

    return html;
  }

  // Escape HTML
  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  // Send email
  async sendEmail(subject, html) {
    if (!this.enabled) {
      logger.debug('Email alert skipped (disabled)');
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.fromEmail,
        to: this.alertEmail,
        subject,
        html,
      });

      logger.debug('Email alert sent successfully', { messageId: info.messageId });
      return true;
    } catch (error) {
      logger.error('Failed to send email alert', { error: error.message });
      return false;
    }
  }

  // Send error alert
  async sendErrorAlert(error, context = {}) {
    try {
      // Create unique error key for rate limiting
      const errorKey = `${error.name}-${error.message}-${context.url || 'unknown'}`;

      // Check rate limit
      if (!this.shouldSendAlert(errorKey)) {
        logger.debug('Alert suppressed due to rate limit', { errorKey });
        return false;
      }

      const subject = `🚨 Ошибка в Corporate Chat: ${error.message.substring(0, 50)}${error.message.length > 50 ? '...' : ''}`;
      const html = this.formatErrorEmail(error, context);

      return await this.sendEmail(subject, html);
    } catch (err) {
      logger.error('Error sending email alert', { error: err.message });
      return false;
    }
  }

  // Send critical alert (always sent, bypasses some rate limiting)
  async sendCriticalAlert(title, details = {}) {
    try {
      const env = process.env.NODE_ENV || 'development';
      const hostname = require('os').hostname();
      const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' });

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #d32f2f 0%, #c62828 100%);
      color: white;
      padding: 20px;
      border-radius: 8px 8px 0 0;
      margin: -30px -30px 30px -30px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .alert-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .info-table td {
      padding: 10px;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-table td:first-child {
      font-weight: 600;
      color: #666;
      width: 180px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="alert-icon">🔥</div>
      <h1>КРИТИЧЕСКОЕ ПРЕДУПРЕЖДЕНИЕ</h1>
    </div>

    <h2>${this.escapeHtml(title)}</h2>

    <table class="info-table">
      <tr>
        <td>Окружение:</td>
        <td>${env}</td>
      </tr>
      <tr>
        <td>Сервер:</td>
        <td>${hostname}</td>
      </tr>
      <tr>
        <td>Время:</td>
        <td>${timestamp}</td>
      </tr>
      ${Object.entries(details).map(([key, value]) => `
      <tr>
        <td>${this.escapeHtml(key)}:</td>
        <td>${this.escapeHtml(String(value))}</td>
      </tr>
      `).join('')}
    </table>

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999; text-align: center;">
      <p>Это критическое автоматическое уведомление из системы мониторинга Corporate Chat</p>
    </div>
  </div>
</body>
</html>
      `;

      const subject = `🔥 КРИТИЧЕСКОЕ: ${title}`;
      return await this.sendEmail(subject, html);
    } catch (err) {
      logger.error('Error sending critical email alert', { error: err.message });
      return false;
    }
  }

  // Send info notification
  async sendInfo(title, message) {
    try {
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>ℹ️ ${this.escapeHtml(title)}</h2>
    </div>
    <p>${this.escapeHtml(message)}</p>
  </div>
</body>
</html>
      `;

      const subject = `ℹ️ ${title}`;
      return await this.sendEmail(subject, html);
    } catch (err) {
      logger.error('Error sending info email', { error: err.message });
      return false;
    }
  }

  // Send warning notification
  async sendWarning(title, message) {
    try {
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #f57c00 0%, #ef6c00 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>⚠️ ${this.escapeHtml(title)}</h2>
    </div>
    <p>${this.escapeHtml(message)}</p>
  </div>
</body>
</html>
      `;

      const subject = `⚠️ ${title}`;
      return await this.sendEmail(subject, html);
    } catch (err) {
      logger.error('Error sending warning email', { error: err.message });
      return false;
    }
  }
}

// Create singleton instance
const emailAlert = new EmailAlert();

module.exports = emailAlert;
