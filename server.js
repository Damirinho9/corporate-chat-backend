// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const { pool, query } = require('./config/database');
const { initializeSocket } = require('./socket/socketHandler');
const apiRoutes = require('./routes/api');

const Logger = require('./utils/logger');
const logger = new Logger('server');

// Инициализация бэкапа - это не middleware, вызываем напрямую и безопасно
try {
  const backup = require('./scripts/backup');
  if (typeof backup === 'function') backup();
  else if (backup && typeof backup.initBackup === 'function') backup.initBackup();
  else logger.info('Backup module loaded but no init function found');
} catch (e) {
  logger.warn('Backup module not loaded', e && e.message ? e.message : e);
}

const app = express();
const server = http.createServer(app);
const io = initializeSocket(server);

// ==================== MIDDLEWARE ====================
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
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 1000, // Увеличено до 1000 запросов (было 100)
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Пропускаем rate limiting для локальных запросов в dev режиме
    if (process.env.NODE_ENV === 'development') return true;
    return false;
  }
});
app.use('/api/', limiter);

// Статика для загруженных файлов
app.use('/uploads', express.static('uploads'));

// ==================== ROUTES ====================
app.use('/api', apiRoutes);

// Раздача статики
app.use(express.static(path.join(__dirname, 'public')));

// 🔧 Админ-панель по короткому пути /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-panel.html'));
});

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
      endpoints: { health: '/api/health', auth: '/api/auth/login', chats: '/api/chats' }
    });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler (должен быть последним)
app.use((err, req, res, next) => {
  logger.error('Unhandled error', err && err.stack ? err.stack : err);
  res.status(500).json({ error: err && err.message ? err.message : 'Internal server error' });
});

// ==================== DATABASE INIT ====================
const initDatabase = async () => {
  try {
    logger.info('Checking database state...');
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    const tableExists = tableCheck.rows[0].exists;

    if (!tableExists) {
      logger.info('Initializing database schema...');
      const schemaPath = path.join(__dirname, 'database/schema.sql');
      if (!fs.existsSync(schemaPath)) {
        logger.error('schema.sql not found at:', schemaPath);
        return;
      }

      const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
      await query(schemaSQL);
      logger.info('Database schema created');

      const seedPath = path.join(__dirname, 'database/seed.js');
      if (fs.existsSync(seedPath)) {
        logger.info('Seeding database...');
        try {
          delete require.cache[require.resolve(seedPath)];
          const seedModule = require(seedPath);
          if (typeof seedModule === 'function') {
            await seedModule();
          } else {
            logger.warn('Seed module is not a function');
          }
        } catch (seedError) {
          logger.warn('Seed error:', seedError.message || seedError);
        }
      }
    } else {
      logger.info('Database already initialized');
    }
  } catch (error) {
    logger.error('Database init error:', error.message || error);
    if (error.code === '42P01') {
      logger.info('Attempting to create schema on retry...');
      try {
        const schemaPath = path.join(__dirname, 'database/schema.sql');
        if (fs.existsSync(schemaPath)) {
          const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
          await query(schemaSQL);
          logger.info('Schema created on retry');

          const seedPath = path.join(__dirname, 'database/seed.js');
          if (fs.existsSync(seedPath)) {
            delete require.cache[require.resolve(seedPath)];
            const seedModule = require(seedPath);
            if (typeof seedModule === 'function') await seedModule();
          }
        }
      } catch (retryError) {
        logger.error('Retry failed:', retryError.message || retryError);
      }
    }
  }
};

// ==================== SERVER STARTUP ====================
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const startServer = async () => {
  try {
    logger.info('Connecting to database...');
    await pool.query('SELECT NOW()');
    logger.info('Database connected successfully');

    await initDatabase();

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
    logger.error('Failed to start server:', error && error.stack ? error.stack : error);
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
  setTimeout(() => {
    console.error('⚠️ Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('🔴 Uncaught Exception:', error);
  process.exit(1);
});

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = { app, server, io, startServer };
