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
  origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`, { body: req.body });
    next();
  });
}

// ==================== ROUTES ====================
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Corporate Chat API', version: '1.0.0' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

// ==================== DATABASE INIT ====================
const fs = require('fs');
const path = require('path');

const initDatabase = async () => {
  try {
    const result = await query(`
      SELECT COUNT(*) 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    if (result.rows[0].count === '0') {
      console.log('📦 Initializing database...');

      const schemaSQL = fs.readFileSync(
        path.join(__dirname, 'database/schema.sql'),
        'utf8'
      );
      await query(schemaSQL);

      const seed = require('./database/seed');
      await seed();

      console.log('✅ Database initialized!');
    } else {
      console.log('ℹ️ Database already has tables, skipping init.');
    }
  } catch (error) {
    console.error('⚠️ Database init error:', error.message);
  }
};

// ==================== SERVER STARTUP ====================
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection established');

    await initDatabase(); // 👈 добавлено сюда

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
