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
const { initWebPush } = require('./controllers/pushController');
const apiRoutes = require('./routes/api');

const { createLogger } = require('./utils/logger');
const logger = createLogger('server');

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

// Initialize Web Push notifications
initWebPush();

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
// Support system routes (must be before /api to avoid route conflicts)
const healthRoutes = require('./routes/health');
const supportRoutes = require('./routes/support');
const supportAnalyticsRoutes = require('./routes/support-analytics');
const phase5AnalyticsRoutes = require('./routes/phase5-analytics');

app.use('/api/support', supportRoutes);
app.use('/api/support/analytics', supportAnalyticsRoutes);
app.use('/api/phase5', phase5AnalyticsRoutes);

// General API routes (must be after specific routes like /api/support)
app.use('/api', apiRoutes);
app.use('/api', healthRoutes);

const publicDir = path.join(__dirname, 'public');
const indexPath = path.join(publicDir, 'index.html');

// Раздача статики
app.use(express.static(publicDir));

// 🔧 Админ-панель по короткому пути /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-panel.html'));
});

// Явно обрабатываем favicon и service worker, чтобы избежать лишних проксирований
app.get('/favicon.ico', (req, res, next) => {
  const faviconPath = path.join(publicDir, 'favicon.ico');
  if (fs.existsSync(faviconPath)) {
    return res.sendFile(faviconPath);
  }
  return next();
});

app.get('/service-worker.js', (req, res, next) => {
  const swPath = path.join(publicDir, 'service-worker.js');
  if (fs.existsSync(swPath)) {
    return res.sendFile(swPath);
  }
  return next();
});

// Главная страница
app.get('/', (req, res) => {
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

// Фолбэк для SPA-маршрутов фронтенда: отдаём index.html для любых не-API GET запросов
app.get('*', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/uploads')) {
    return next();
  }

  const safePublicDir = path.resolve(publicDir);
  const cleanedPath = decodeURIComponent(req.path.replace(/^\//, ''));
  const requestedPath = path.join(safePublicDir, cleanedPath);
  const resolvedPath = path.resolve(requestedPath);

  // Не отдаём файлы вне /public даже при попытках обхода
  const isWithinPublic = resolvedPath.startsWith(safePublicDir + path.sep) || resolvedPath === safePublicDir;
  if (isWithinPublic && fs.existsSync(resolvedPath)) {
    try {
      const stat = fs.statSync(resolvedPath);
      if (stat.isFile()) {
        return res.sendFile(resolvedPath);
      }
    } catch (err) {
      logger.warn(`Static file lookup failed for ${resolvedPath}: ${err.message}`);
    }
  }

  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  return next();
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
async function runOptionalQuery(sql, description) {
  try {
    await query(sql);
    if (description) {
      logger.info(description);
    }
  } catch (error) {
    logger.warn(`Optional migration skipped: ${error.message || error}`);
  }
}

async function applyIncrementalSchemaUpdates() {
  try {
    logger.info('Applying incremental schema updates...');

    await runOptionalQuery(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS initial_password VARCHAR(255)`,
      'Ensured users.initial_password column'
    );

    await runOptionalQuery(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size_bytes INTEGER NOT NULL,
        path VARCHAR(500) NOT NULL,
        thumbnail_path VARCHAR(500),
        uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_id INTEGER,
        file_type VARCHAR(50) DEFAULT 'other',
        scan_status VARCHAR(20) DEFAULT 'pending',
        scan_result TEXT,
        width INTEGER,
        height INTEGER,
        duration INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const alterStatements = [
      `ALTER TABLE files ADD COLUMN IF NOT EXISTS thumbnail_path VARCHAR(500)`,
      `ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_by INTEGER`,
      `ALTER TABLE files ADD COLUMN IF NOT EXISTS message_id INTEGER`,
      `ALTER TABLE files ADD COLUMN IF NOT EXISTS file_type VARCHAR(50) DEFAULT 'other'`,
      `ALTER TABLE files ALTER COLUMN file_type SET DEFAULT 'other'`,
      `ALTER TABLE files ADD COLUMN IF NOT EXISTS scan_status VARCHAR(20) DEFAULT 'pending'`,
      `ALTER TABLE files ALTER COLUMN scan_status SET DEFAULT 'pending'`,
      `ALTER TABLE files ADD COLUMN IF NOT EXISTS scan_result TEXT`,
      `ALTER TABLE files ADD COLUMN IF NOT EXISTS width INTEGER`,
      `ALTER TABLE files ADD COLUMN IF NOT EXISTS height INTEGER`,
      `ALTER TABLE files ADD COLUMN IF NOT EXISTS duration INTEGER`
    ];

    for (const sql of alterStatements) {
      await runOptionalQuery(sql);
    }

    const indexStatements = [
      `CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by)`,
      `CREATE INDEX IF NOT EXISTS idx_files_message_id ON files(message_id)`,
      `CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type)`,
      `CREATE INDEX IF NOT EXISTS idx_files_scan_status ON files(scan_status)`
    ];

    for (const sql of indexStatements) {
      await runOptionalQuery(sql);
    }

    await runOptionalQuery(
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_id INTEGER`,
      'Ensured messages.file_id column'
    );
    await runOptionalQuery(
      `ALTER TABLE messages ALTER COLUMN content DROP NOT NULL`,
      'Allowed NULL message content for file attachments'
    );
    await runOptionalQuery(
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL`,
      'Ensured messages.reply_to_id column'
    );
    await runOptionalQuery(
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_id INTEGER REFERENCES messages(id) ON DELETE SET NULL`,
      'Ensured messages.forwarded_from_id column'
    );
    await runOptionalQuery(
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE`,
      'Ensured messages.is_edited column'
    );

    await runOptionalQuery(
      `CREATE INDEX IF NOT EXISTS idx_messages_file_id ON messages(file_id)`,
      'Ensured index on messages.file_id'
    );
    await runOptionalQuery(
      `CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id)`,
      'Ensured index on messages.reply_to_id'
    );
    await runOptionalQuery(
      `CREATE INDEX IF NOT EXISTS idx_messages_forwarded ON messages(forwarded_from_id)`,
      'Ensured index on messages.forwarded_from_id'
    );

    await runOptionalQuery(`
      CREATE TABLE IF NOT EXISTS reactions (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id, user_id)
      )
    `);

    await runOptionalQuery(`
      CREATE TABLE IF NOT EXISTS mentions (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id, user_id)
      )
    `);

    await runOptionalQuery(
      `CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id)`
    );
    await runOptionalQuery(
      `CREATE INDEX IF NOT EXISTS idx_reactions_user ON reactions(user_id)`
    );
    await runOptionalQuery(
      `CREATE INDEX IF NOT EXISTS idx_mentions_message ON mentions(message_id)`
    );
    await runOptionalQuery(
      `CREATE INDEX IF NOT EXISTS idx_mentions_user ON mentions(user_id)`
    );

    await runOptionalQuery(`
      CREATE TABLE IF NOT EXISTS message_deletion_history (
        id SERIAL PRIMARY KEY,
        message_id INTEGER,
        chat_id INTEGER NOT NULL,
        chat_name VARCHAR(255),
        chat_type VARCHAR(50),
        chat_department VARCHAR(255),
        deleted_message_user_id INTEGER,
        deleted_message_user_name VARCHAR(255),
        deleted_by_user_id INTEGER NOT NULL,
        deleted_by_user_name VARCHAR(255),
        deleted_by_role VARCHAR(50) NOT NULL,
        deletion_scope VARCHAR(50) NOT NULL,
        original_content TEXT,
        file_id INTEGER,
        deleted_message_created_at TIMESTAMP WITH TIME ZONE,
        deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const deletionAlterStatements = [
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS message_id INTEGER`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS chat_id INTEGER NOT NULL`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS chat_name VARCHAR(255)`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS chat_type VARCHAR(50)`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS chat_department VARCHAR(255)`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS deleted_message_user_id INTEGER`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS deleted_message_user_name VARCHAR(255)`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS deleted_by_user_id INTEGER NOT NULL`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS deleted_by_user_name VARCHAR(255)`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS deleted_by_role VARCHAR(50) NOT NULL`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS deletion_scope VARCHAR(50) NOT NULL DEFAULT 'self'`,
      `ALTER TABLE message_deletion_history ALTER COLUMN deletion_scope DROP DEFAULT`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS original_content TEXT`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS file_id INTEGER`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS deleted_message_created_at TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE message_deletion_history ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`
    ];

    for (const sql of deletionAlterStatements) {
      await runOptionalQuery(sql);
    }

    const deletionIndexes = [
      `CREATE INDEX IF NOT EXISTS idx_message_deletion_history_chat ON message_deletion_history(chat_id)`,
      `CREATE INDEX IF NOT EXISTS idx_message_deletion_history_deleted_by ON message_deletion_history(deleted_by_user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_message_deletion_history_deleted_at ON message_deletion_history(deleted_at DESC)`
    ];

    for (const sql of deletionIndexes) {
      await runOptionalQuery(sql);
    }

    await runOptionalQuery(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'files'::regclass AND conname = 'files_uploaded_by_fkey'
        ) THEN
          ALTER TABLE files
            ADD CONSTRAINT files_uploaded_by_fkey
            FOREIGN KEY (uploaded_by)
            REFERENCES users(id)
            ON DELETE CASCADE;
        END IF;
      END$$
    `);

    await runOptionalQuery(
      `ALTER TABLE files ALTER COLUMN uploaded_by SET NOT NULL`
    );

    await runOptionalQuery(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'files'::regclass AND conname = 'files_message_id_fkey'
        ) THEN
          ALTER TABLE files
            ADD CONSTRAINT files_message_id_fkey
            FOREIGN KEY (message_id)
            REFERENCES messages(id)
            ON DELETE CASCADE;
        END IF;
      END$$
    `);

    await runOptionalQuery(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'messages'::regclass AND conname = 'messages_file_id_fkey'
        ) THEN
          ALTER TABLE messages
            ADD CONSTRAINT messages_file_id_fkey
            FOREIGN KEY (file_id)
            REFERENCES files(id)
            ON DELETE SET NULL;
        END IF;
      END$$
    `);

    logger.info('Incremental schema updates complete');
  } catch (error) {
    logger.error('Failed to apply incremental schema updates:', error.message || error);
  }
}

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
      await applyIncrementalSchemaUpdates();
    } else {
      logger.info('Database already initialized');
      await applyIncrementalSchemaUpdates();
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
          await applyIncrementalSchemaUpdates();
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
  const maxAttempts = parseInt(process.env.DB_CONNECTION_RETRIES || '5', 10);
  const delayMs = parseInt(process.env.DB_CONNECTION_RETRY_DELAY_MS || '5000', 10);
  let serverStarted = false;

  const startHttpServer = () => {
    if (serverStarted) return;
    serverStarted = true;

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
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(`Connecting to database (attempt ${attempt}/${maxAttempts})...`);
      await pool.query('SELECT NOW()');
      logger.info('Database connected successfully');

      await initDatabase();

      startHttpServer();
      return; // Successful start, exit the retry loop
    } catch (error) {
      logger.error('Failed to start server:', error && error.stack ? error.stack : error);

      if (attempt === maxAttempts) {
        logger.error('Max DB connection attempts reached. Starting HTTP server without DB connection; API calls may fail until the database is available.');
        startHttpServer();
        return;
      }

      logger.info(`Retrying DB connection in ${delayMs / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
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
