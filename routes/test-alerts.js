// Test endpoint for email alerts
const express = require('express');
const router = express.Router();
const emailAlert = require('../utils/emailAlert');
const { verifyAdmin } = require('../middleware/auth');
const { createLogger } = require('../utils/logger');

const logger = createLogger('test-alerts');

// All test endpoints require admin authentication
router.use(verifyAdmin);

// Test error alert
router.get('/test-error-alert', async (req, res) => {
  try {
    // Create a fake error
    const testError = new Error('Это тестовая ошибка для проверки email алертов');
    testError.name = 'TestError';
    testError.stack = `TestError: Это тестовая ошибка для проверки email алертов
    at testErrorAlert (/home/user/corporate-chat-backend/routes/test-alerts.js:18:25)
    at Layer.handle [as handle_request] (/home/user/corporate-chat-backend/node_modules/express/lib/router/layer.js:95:5)
    at next (/home/user/corporate-chat-backend/node_modules/express/lib/router/route.js:144:13)
    at Route.dispatch (/home/user/corporate-chat-backend/node_modules/express/lib/router/route.js:114:3)
    at Layer.handle [as handle_request] (/home/user/corporate-chat-backend/node_modules/express/lib/router/layer.js:95:5)`;

    // Send test error alert
    const sent = await emailAlert.sendErrorAlert(testError, {
      correlationId: `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      method: 'GET',
      url: '/api/test-alerts/test-error-alert',
      userId: req.user?.id,
      ip: req.ip || '127.0.0.1',
    });

    if (sent) {
      logger.info('Test error alert sent successfully', { user: req.user?.username });
      res.json({
        success: true,
        message: 'Тестовое письмо с ошибкой отправлено на ' + (process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL),
        type: 'error',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Не удалось отправить тестовое письмо. Проверьте настройки SMTP в логах.',
      });
    }
  } catch (error) {
    logger.error('Failed to send test error alert', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Test warning alert
router.get('/test-warning-alert', async (req, res) => {
  try {
    const sent = await emailAlert.sendWarning(
      'Тестовое предупреждение: Высокая нагрузка на сервер',
      'CPU нагрузка: 85%\nMemory: 3.2GB / 4GB (80%)\nАктивные подключения: 1500\n\nЭто тестовое предупреждение для проверки системы мониторинга.'
    );

    if (sent) {
      logger.info('Test warning alert sent successfully', { user: req.user?.username });
      res.json({
        success: true,
        message: 'Тестовое предупреждение отправлено на ' + (process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL),
        type: 'warning',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Не удалось отправить тестовое предупреждение',
      });
    }
  } catch (error) {
    logger.error('Failed to send test warning alert', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Test info alert
router.get('/test-info-alert', async (req, res) => {
  try {
    const sent = await emailAlert.sendInfo(
      'Тестовое информационное сообщение',
      'Система мониторинга Corporate Chat успешно запущена и работает корректно.\n\nВсе компоненты функционируют нормально:\n✅ Winston логирование\n✅ Health checks\n✅ Request tracing\n✅ Email алерты\n✅ Performance monitoring\n✅ Error tracking'
    );

    if (sent) {
      logger.info('Test info alert sent successfully', { user: req.user?.username });
      res.json({
        success: true,
        message: 'Тестовое информационное сообщение отправлено на ' + (process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL),
        type: 'info',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Не удалось отправить тестовое сообщение',
      });
    }
  } catch (error) {
    logger.error('Failed to send test info alert', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Test critical alert
router.get('/test-critical-alert', async (req, res) => {
  try {
    const sent = await emailAlert.sendCriticalAlert(
      'База данных недоступна',
      {
        'Причина': 'Connection timeout',
        'Последняя успешная проверка': '2 минуты назад',
        'Попытки переподключения': '5',
        'Статус': 'КРИТИЧНО',
        'Требуется действие': 'Немедленная проверка PostgreSQL сервера',
      }
    );

    if (sent) {
      logger.info('Test critical alert sent successfully', { user: req.user?.username });
      res.json({
        success: true,
        message: 'Тестовое критическое предупреждение отправлено на ' + (process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL),
        type: 'critical',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Не удалось отправить критическое предупреждение',
      });
    }
  } catch (error) {
    logger.error('Failed to send test critical alert', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Test all alerts at once
router.get('/test-all-alerts', async (req, res) => {
  try {
    const results = {
      error: false,
      warning: false,
      info: false,
      critical: false,
    };

    // Send error alert
    const testError = new Error('Тестовая ошибка - проверка всех типов алертов');
    testError.name = 'TestError';
    testError.stack = `TestError: Тестовая ошибка - проверка всех типов алертов
    at testAllAlerts (/home/user/corporate-chat-backend/routes/test-alerts.js:150:25)`;

    results.error = await emailAlert.sendErrorAlert(testError, {
      correlationId: `TEST-ALL-${Date.now()}`,
      method: 'GET',
      url: '/api/test-alerts/test-all-alerts',
      userId: req.user?.id,
    });

    // Small delay between emails
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Send warning
    results.warning = await emailAlert.sendWarning(
      'Тестовое предупреждение',
      'Медленное время отклика: P95 = 3500ms'
    );

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Send info
    results.info = await emailAlert.sendInfo(
      'Тестовое информационное сообщение',
      'Все системы работают нормально'
    );

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Send critical
    results.critical = await emailAlert.sendCriticalAlert(
      'Тестовое критическое предупреждение',
      { 'Тип теста': 'Проверка всех алертов', 'Статус': 'ТЕСТ' }
    );

    const allSent = Object.values(results).every(r => r === true);

    logger.info('All test alerts sent', { results, user: req.user?.username });

    res.json({
      success: allSent,
      message: allSent
        ? `Все 4 типа писем отправлены на ${process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL}. Проверьте почту (включая папку "Спам")!`
        : 'Некоторые письма не удалось отправить',
      results,
      recipient: process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL,
    });
  } catch (error) {
    logger.error('Failed to send test alerts', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get email alert configuration
router.get('/alert-config', (req, res) => {
  res.json({
    enabled: !!(process.env.SMTP_HOST && (process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL)),
    smtp: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      from: process.env.SMTP_FROM,
    },
    recipient: process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL,
    rateLimiting: {
      window: '5 minutes',
      maxAlerts: 3,
    },
  });
});

module.exports = router;
