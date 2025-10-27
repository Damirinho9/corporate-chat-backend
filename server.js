const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const { pool, query } = require('./config/database');
const { initializeSocket } = require('./socket/socketHandler');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const io = initializeSocket(server);
// ДОБАВЬТЕ ЭТИ ИМПОРТЫ В НАЧАЛО ФАЙЛА:
const { Logger, accessLogger, errorLogger } = require('./utils/logger');
const { scheduleBackups } = require('./scripts/backup');

const logger = new Logger('server');

// ДОБАВЬТЕ ПОСЛЕ ДРУГИХ MIDDLEWARE:
// Access logging
app.use(accessLogger);

// ДОБАВЬТЕ ПЕРЕД ФИНАЛЬНЫМ ERROR HANDLER:
// Error logging
app.use(errorLogger);

// ДОБАВЬТЕ В ФУНКЦИЮ startServer() ПОСЛЕ ЗАПУСКА СЕРВЕРА:
// Start automatic backups
scheduleBackups();

// Log startup
logger.info('Server started', {
    port: PORT,
    env: process.env.NODE_ENV
});

// ДОБАВЬТЕ ДЛЯ СТАТИЧЕСКИХ ФАЙЛОВ:
app.use('/uploads', express.static('uploads'));
// ==================== MIDDLEWARE ====================

// Trust proxy для Render (ВАЖНО!)
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ==================== ROUTES ====================
app.use('/api', apiRoutes);

// Раздача статики
app.use(express.static(path.join(__dirname, 'public')));

// Главная страница
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ 
      message: 'Corporate Chat API', 
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth/login',
        chats: '/api/chats'
      }
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ==================== DATABASE INIT ====================
const initDatabase = async () => {
  try {
    console.log('🔍 Checking database state...');
    
    // Проверка существования таблицы users
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    const tableExists = tableCheck.rows[0].exists;

    if (!tableExists) {
      console.log('📦 Initializing database schema...');

      const schemaPath = path.join(__dirname, 'database/schema.sql');
      
      if (!fs.existsSync(schemaPath)) {
        console.error('❌ schema.sql not found at:', schemaPath);
        return;
      }

      const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
      
      console.log('📝 Executing schema.sql...');
      await query(schemaSQL);
      console.log('✅ Database schema created!');

      // Запуск seed
      const seedPath = path.join(__dirname, 'database/seed.js');
      if (fs.existsSync(seedPath)) {
        console.log('🌱 Seeding database...');
        
        try {
          // Очистить кэш require для seed.js
          delete require.cache[require.resolve(seedPath)];
          
          const seedModule = require(seedPath);
          
          if (typeof seedModule === 'function') {
            await seedModule();
          } else {
            console.log('⚠️ Seed module is not a function');
          }
        } catch (seedError) {
          console.error('⚠️ Seed error:', seedError.message);
          // Продолжаем работу даже если seed не удался
        }
      }
    } else {
      console.log('ℹ️ Database already initialized.');
    }
  } catch (error) {
    console.error('⚠️ Database init error:', error.message);
    
    // Retry если ошибка "relation does not exist"
    if (error.code === '42P01') {
      console.log('🔄 Attempting to create schema...');
      try {
        const schemaPath = path.join(__dirname, 'database/schema.sql');
        if (fs.existsSync(schemaPath)) {
          const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
          await query(schemaSQL);
          console.log('✅ Schema created on retry!');
          
          const seedPath = path.join(__dirname, 'database/seed.js');
          if (fs.existsSync(seedPath)) {
            delete require.cache[require.resolve(seedPath)];
            const seedModule = require(seedPath);
            if (typeof seedModule === 'function') {
              await seedModule();
            }
          }
        }
      } catch (retryError) {
        console.error('❌ Retry failed:', retryError.message);
      }
    }
  }
};

// ==================== SERVER STARTUP ====================
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const startServer = async () => {
  try {
    console.log('🔌 Connecting to database...');
    
    // Проверка подключения
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully');
    console.log('✅ Database connection established');

    // Инициализация БД
    await initDatabase();

    // Запуск сервера
    server.listen(PORT, HOST, () => {
      console.log('');
      console.log('╔════════════════════════════════════════════╗');
      console.log('║     Corporate Chat Backend Server         ║');
      console.log('╚════════════════════════════════════════════╝');
      console.log('');
      console.log(`🚀 Server running on ${HOST}:${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 HTTPS: https://corporate-chat-backend.onrender.com`);
      console.log(`🏥 Health: /api/health`);
      console.log('');
      console.log('✅ Ready to accept connections!');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n⚠️ ${signal} received. Shutting down gracefully...`);
  
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    try {
      await pool.end();
      console.log('✅ Database connections closed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Форсированный выход через 10 секунд
  setTimeout(() => {
    console.error('⚠️ Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Обработчики сигналов
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('🔴 Uncaught Exception:', error);
  process.exit(1);
});

// Старт сервера
startServer();

module.exports = { app, server, io };