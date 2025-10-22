const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { pool, query } = require('./config/database');
const { initializeSocket } = require('./socket/socketHandler');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const io = initializeSocket(server);

// ==================== MIDDLEWARE ====================
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
  message: { error: 'Too many requests' }
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

app.get('/', (req, res) => {
  res.json({ 
    message: 'Corporate Chat API', 
    version: '1.0.0',
    status: 'running'
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ==================== DATABASE INIT ====================
const fs = require('fs');
const path = require('path');

const initDatabase = async () => {
  try {
    console.log('🔍 Checking database state...');
    
    // Проверяем наличие таблицы users
    const result = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    const tableExists = result.rows[0].exists;

    if (!tableExists) {
      console.log('📦 Initializing database schema...');

      // Читаем и выполняем schema.sql
      const schemaPath = path.join(__dirname, 'database/schema.sql');
      
      if (!fs.existsSync(schemaPath)) {
        console.error('❌ schema.sql not found!');
        return;
      }

      const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
      
      // Выполняем SQL построчно, игнорируя комментарии
      const statements = schemaSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement) {
          await query(statement);
        }
      }

      console.log('✅ Database schema created!');

      // Запускаем seed только если есть файл
      const seedPath = path.join(__dirname, 'database/seed.js');
      if (fs.existsSync(seedPath)) {
        console.log('🌱 Seeding database...');
        const seedModule = require('./database/seed');
        
        // Если seed это функция, вызываем её
        if (typeof seedModule === 'function') {
          await seedModule();
        }
        
        console.log('✅ Database seeded!');
      }
    } else {
      console.log('ℹ️ Database already initialized.');
    }
  } catch (error) {
    console.error('⚠️ Database init error:', error.message);
    console.error(error);
    // Не падаем, даём серверу запуститься
  }
};

// ==================== SERVER STARTUP ====================
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Важно для Docker/Render

const startServer = async () => {
  try {
    console.log('🔌 Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection established');

    // Инициализируем БД
    await initDatabase();

    // Запускаем сервер
    server.listen(PORT, HOST, () => {
      console.log('');
      console.log('╔════════════════════════════════════════════╗');
      console.log('║     Corporate Chat Backend Server         ║');
      console.log('╚════════════════════════════════════════════╝');
      console.log('');
      console.log(`🚀 Server running on ${HOST}:${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Health: http://localhost:${PORT}/api/health`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
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
    console.error('⚠️ Forcing shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the server
startServer();

module.exports = { app, server, io };

const path = require("path");

// Раздаём фронт из папки public
app.use(express.static(path.join(__dirname, "public")));

// Главная страница
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});