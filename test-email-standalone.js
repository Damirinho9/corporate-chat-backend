// Standalone script to test email alerts
// Run: node test-email-standalone.js

require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('📧 Testing Email Alert System\n');
console.log('Configuration:');
console.log('  SMTP Host:', process.env.SMTP_HOST);
console.log('  SMTP Port:', process.env.SMTP_PORT);
console.log('  SMTP From:', process.env.SMTP_FROM);
console.log('  Alert Email:', process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL);
console.log('');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Test error email HTML
const errorHtml = `
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
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-test {
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
    .success {
      background-color: #e8f5e9;
      border-left: 4px solid #4caf50;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
      color: #2e7d32;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="alert-icon">🚨</div>
      <h1>Тестовое письмо - Система мониторинга</h1>
    </div>

    <div class="success">
      <strong>✅ Поздравляем!</strong><br>
      Система email алертов Corporate Chat успешно настроена и работает!
    </div>

    <table class="info-table">
      <tr>
        <td>Окружение:</td>
        <td><span class="badge badge-test">ТЕСТ</span></td>
      </tr>
      <tr>
        <td>Сервер:</td>
        <td>test-server</td>
      </tr>
      <tr>
        <td>Время:</td>
        <td>${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' })}</td>
      </tr>
      <tr>
        <td>Correlation ID:</td>
        <td><code>TEST-${Date.now()}</code></td>
      </tr>
    </table>

    <h3>Пример ошибки:</h3>
    <div class="error-message">
      <strong>TestError:</strong> Это тестовая ошибка для демонстрации формата email алертов
    </div>

    <h3>Пример Stack Trace:</h3>
    <div class="stack-trace">TestError: Это тестовая ошибка для демонстрации формата email алертов
    at testFunction (/app/test.js:42:15)
    at handleRequest (/app/server.js:123:20)
    at Layer.handle [as handle_request] (/node_modules/express/lib/router/layer.js:95:5)
    at next (/node_modules/express/lib/router/route.js:144:13)</div>

    <h3>Что дальше?</h3>
    <p>Система мониторинга полностью настроена и включает:</p>
    <ul>
      <li>🔍 Winston структурированное логирование</li>
      <li>💓 Health Check endpoints</li>
      <li>🔗 Request tracing с Correlation IDs</li>
      <li>📧 Email алерты на ошибки 5xx</li>
      <li>📊 Performance monitoring</li>
      <li>📝 Error tracking в базе данных</li>
      <li>⚠️ Автоматические предупреждения (высокая нагрузка, медленные запросы)</li>
    </ul>

    <div style="text-align: center;">
      <a href="${process.env.APP_URL || 'https://chat.gyda.ru'}/admin" class="btn">Открыть админ-панель</a>
    </div>

    <div class="footer">
      <p><strong>Corporate Chat Monitoring System</strong></p>
      <p>Это тестовое автоматическое уведомление</p>
      <p>Email алерты настроены на: <strong>${process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL}</strong></p>
    </div>
  </div>
</body>
</html>
`;

async function sendTestEmail() {
  try {
    console.log('Отправка тестового письма...');

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL,
      subject: '🎉 Тест: Система мониторинга Corporate Chat успешно настроена!',
      html: errorHtml,
    });

    console.log('✅ Письмо успешно отправлено!');
    console.log('   Message ID:', info.messageId);
    console.log('   Recipient:', process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL);
    console.log('');
    console.log('📬 Проверьте почту (включая папку "Спам")!');
    console.log('');
    console.log('Если письмо пришло, значит система email алертов работает корректно.');
    console.log('При ошибках на production сервере вы будете получать такие же письма автоматически.');

  } catch (error) {
    console.error('❌ Ошибка при отправке письма:');
    console.error('   ', error.message);
    console.error('');
    console.error('Проверьте настройки SMTP в .env файле:');
    console.error('   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
  }
}

// Run test
sendTestEmail().then(() => {
  console.log('');
  console.log('Тест завершен.');
  process.exit(0);
}).catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
