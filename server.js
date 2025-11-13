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

    // ==================== PUSH NOTIFICATIONS TABLES ====================
    await runOptionalQuery(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, 'Created push_subscriptions table');

    await runOptionalQuery(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT true,
        new_messages BOOLEAN DEFAULT true,
        mentions BOOLEAN DEFAULT true,
        direct_messages BOOLEAN DEFAULT true,
        group_messages BOOLEAN DEFAULT true,
        sound BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, 'Created notification_settings table');

    await runOptionalQuery(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        notification_type VARCHAR(50) NOT NULL,
        title TEXT,
        body TEXT,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN DEFAULT true,
        error_message TEXT
      )
    `, 'Created notification_logs table');

    // Индексы для push notifications
    const pushNotificationIndexes = [
      `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active)`,
      `CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON notification_logs(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON notification_logs(sent_at DESC)`
    ];

    for (const sql of pushNotificationIndexes) {
      await runOptionalQuery(sql);
    }

    // ==================== VIDEO/AUDIO CALLS TABLES ====================
    await runOptionalQuery(`
      CREATE TABLE IF NOT EXISTS calls (
        id SERIAL PRIMARY KEY,
        room_name VARCHAR(255) NOT NULL UNIQUE,
        call_type VARCHAR(20) NOT NULL CHECK (call_type IN ('audio', 'video', 'screen')),
        call_mode VARCHAR(20) NOT NULL CHECK (call_mode IN ('direct', 'group')),
        initiated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ongoing', 'ended', 'missed', 'declined')),
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        duration INTEGER,
        recording_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, 'Created calls table');

    await runOptionalQuery(`
      CREATE TABLE IF NOT EXISTS call_participants (
        id SERIAL PRIMARY KEY,
        call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP,
        left_at TIMESTAMP,
        duration INTEGER,
        status VARCHAR(20) DEFAULT 'invited' CHECK (status IN ('invited', 'ringing', 'joined', 'left', 'declined', 'missed')),
        is_moderator BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(call_id, user_id)
      )
    `, 'Created call_participants table');

    await runOptionalQuery(`
      CREATE TABLE IF NOT EXISTS call_events (
        id SERIAL PRIMARY KEY,
        call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(50) NOT NULL,
        event_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, 'Created call_events table');

    // Индексы для calls
    const callsIndexes = [
      `CREATE INDEX IF NOT EXISTS idx_calls_room_name ON calls(room_name)`,
      `CREATE INDEX IF NOT EXISTS idx_calls_initiated_by ON calls(initiated_by)`,
      `CREATE INDEX IF NOT EXISTS idx_calls_chat_id ON calls(chat_id)`,
      `CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)`,
      `CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_call_participants_call_id ON call_participants(call_id)`,
      `CREATE INDEX IF NOT EXISTS idx_call_participants_user_id ON call_participants(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_call_participants_status ON call_participants(status)`,
      `CREATE INDEX IF NOT EXISTS idx_call_events_call_id ON call_events(call_id)`,
      `CREATE INDEX IF NOT EXISTS idx_call_events_created_at ON call_events(created_at DESC)`
    ];

    for (const sql of callsIndexes) {
      await runOptionalQuery(sql);
    }

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
