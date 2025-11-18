// Telegram alert system for error notifications
const https = require('https');
const { createLogger } = require('./logger');

const logger = createLogger('telegram-alert');

class TelegramAlert {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_ALERT_CHAT_ID;
    this.enabled = !!(this.botToken && this.chatId);
    this.rateLimitMap = new Map(); // Prevent spam
    this.rateLimitWindow = 5 * 60 * 1000; // 5 minutes
    this.maxAlertsPerWindow = 3; // Max 3 alerts per error type in 5 minutes

    if (!this.enabled) {
      logger.warn('Telegram alerts disabled: Missing TELEGRAM_BOT_TOKEN or TELEGRAM_ALERT_CHAT_ID');
    } else {
      logger.info('Telegram alerts enabled', {
        chatId: this.chatId.substring(0, 5) + '...',
      });
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

  // Send message to Telegram
  async sendMessage(text, options = {}) {
    if (!this.enabled) {
      logger.debug('Telegram alert skipped (disabled)');
      return false;
    }

    const payload = JSON.stringify({
      chat_id: this.chatId,
      text,
      parse_mode: options.parseMode || 'HTML',
      disable_web_page_preview: options.disablePreview !== false,
    });

    const requestOptions = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${this.botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            logger.debug('Telegram alert sent successfully');
            resolve(true);
          } else {
            logger.error('Telegram API error', {
              statusCode: res.statusCode,
              response: data,
            });
            resolve(false);
          }
        });
      });

      req.on('error', (error) => {
        logger.error('Failed to send Telegram alert', { error: error.message });
        resolve(false);
      });

      req.write(payload);
      req.end();
    });
  }

  // Format error for Telegram
  formatError(error, context = {}) {
    const env = process.env.NODE_ENV || 'development';
    const hostname = require('os').hostname();
    const timestamp = new Date().toISOString();

    let message = `🚨 <b>Error Alert</b>\n\n`;
    message += `<b>Environment:</b> ${env}\n`;
    message += `<b>Server:</b> ${hostname}\n`;
    message += `<b>Time:</b> ${timestamp}\n\n`;

    message += `<b>Error:</b> ${this.escapeHtml(error.message || 'Unknown error')}\n`;

    if (context.correlationId) {
      message += `<b>Correlation ID:</b> <code>${context.correlationId}</code>\n`;
    }

    if (context.url) {
      message += `<b>URL:</b> ${this.escapeHtml(context.url)}\n`;
    }

    if (context.method) {
      message += `<b>Method:</b> ${context.method}\n`;
    }

    if (context.userId) {
      message += `<b>User ID:</b> ${context.userId}\n`;
    }

    if (error.stack) {
      // Limit stack trace length
      const stackLines = error.stack.split('\n').slice(0, 5);
      message += `\n<b>Stack Trace:</b>\n<pre>${this.escapeHtml(stackLines.join('\n'))}</pre>`;
    }

    return message;
  }

  // Escape HTML for Telegram
  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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

      const message = this.formatError(error, context);
      return await this.sendMessage(message);
    } catch (err) {
      logger.error('Error sending Telegram alert', { error: err.message });
      return false;
    }
  }

  // Send critical alert (always sent, bypasses some rate limiting)
  async sendCriticalAlert(title, details = {}) {
    try {
      const env = process.env.NODE_ENV || 'development';
      const hostname = require('os').hostname();
      const timestamp = new Date().toISOString();

      let message = `🔥 <b>CRITICAL ALERT</b> 🔥\n\n`;
      message += `<b>${this.escapeHtml(title)}</b>\n\n`;
      message += `<b>Environment:</b> ${env}\n`;
      message += `<b>Server:</b> ${hostname}\n`;
      message += `<b>Time:</b> ${timestamp}\n\n`;

      // Add details
      for (const [key, value] of Object.entries(details)) {
        message += `<b>${key}:</b> ${this.escapeHtml(String(value))}\n`;
      }

      return await this.sendMessage(message);
    } catch (err) {
      logger.error('Error sending critical Telegram alert', { error: err.message });
      return false;
    }
  }

  // Send info notification
  async sendInfo(title, message) {
    try {
      const text = `ℹ️ <b>${this.escapeHtml(title)}</b>\n\n${this.escapeHtml(message)}`;
      return await this.sendMessage(text);
    } catch (err) {
      logger.error('Error sending Telegram info', { error: err.message });
      return false;
    }
  }

  // Send warning notification
  async sendWarning(title, message) {
    try {
      const text = `⚠️ <b>${this.escapeHtml(title)}</b>\n\n${this.escapeHtml(message)}`;
      return await this.sendMessage(text);
    } catch (err) {
      logger.error('Error sending Telegram warning', { error: err.message });
      return false;
    }
  }
}

// Create singleton instance
const telegramAlert = new TelegramAlert();

module.exports = telegramAlert;
