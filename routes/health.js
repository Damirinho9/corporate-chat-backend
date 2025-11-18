// Health Check endpoint with comprehensive diagnostics
const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const { query } = require('../database/connection');
const { createLogger } = require('../utils/logger');
const metricsCollector = require('../utils/metricsCollector');

const logger = createLogger('health');

// Store server start time
const serverStartTime = Date.now();

// Health check endpoint - no auth required
router.get('/health', async (req, res) => {
  const startTime = Date.now();
  const checks = {};

  try {
    // 1. Basic server health
    checks.server = {
      status: 'healthy',
      uptime: Math.floor((Date.now() - serverStartTime) / 1000), // seconds
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };

    // 2. Memory usage
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    checks.memory = {
      status: 'healthy',
      process: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
      },
      system: {
        total: `${Math.round(totalMem / 1024 / 1024)}MB`,
        free: `${Math.round(freeMem / 1024 / 1024)}MB`,
        used: `${Math.round((totalMem - freeMem) / 1024 / 1024)}MB`,
        usagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
    };

    // Warn if memory usage is high
    if (checks.memory.system.usagePercent > 90) {
      checks.memory.status = 'warning';
      checks.memory.message = 'System memory usage above 90%';
    }

    // 3. Database health
    try {
      const dbStart = Date.now();
      const result = await query('SELECT NOW() as current_time, version() as version');
      const dbDuration = Date.now() - dbStart;

      checks.database = {
        status: 'healthy',
        connected: true,
        responseTime: `${dbDuration}ms`,
        version: result.rows[0].version.split(' ')[1], // Extract version number
        serverTime: result.rows[0].current_time,
      };

      // Warn if database response is slow
      if (dbDuration > 1000) {
        checks.database.status = 'warning';
        checks.database.message = 'Database response time above 1s';
      }
    } catch (dbError) {
      checks.database = {
        status: 'unhealthy',
        connected: false,
        error: dbError.message,
      };
      logger.error('Database health check failed', { error: dbError.message });
    }

    // 4. Disk space
    try {
      const stats = fs.statfsSync(__dirname);
      const totalSpace = stats.blocks * stats.bsize;
      const freeSpace = stats.bfree * stats.bsize;
      const usedSpace = totalSpace - freeSpace;
      const usagePercent = Math.round((usedSpace / totalSpace) * 100);

      checks.disk = {
        status: 'healthy',
        total: `${Math.round(totalSpace / 1024 / 1024 / 1024)}GB`,
        free: `${Math.round(freeSpace / 1024 / 1024 / 1024)}GB`,
        used: `${Math.round(usedSpace / 1024 / 1024 / 1024)}GB`,
        usagePercent,
      };

      // Warn if disk usage is high
      if (usagePercent > 90) {
        checks.disk.status = 'warning';
        checks.disk.message = 'Disk usage above 90%';
      } else if (usagePercent > 95) {
        checks.disk.status = 'critical';
        checks.disk.message = 'Disk usage above 95%';
      }
    } catch (diskError) {
      checks.disk = {
        status: 'unknown',
        message: 'Unable to check disk space',
      };
    }

    // 5. CPU load
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;

    checks.cpu = {
      status: 'healthy',
      cores: cpuCount,
      loadAverage: {
        '1min': loadAvg[0].toFixed(2),
        '5min': loadAvg[1].toFixed(2),
        '15min': loadAvg[2].toFixed(2),
      },
      loadPercent: Math.round((loadAvg[0] / cpuCount) * 100),
    };

    // Warn if CPU load is high
    if (checks.cpu.loadPercent > 80) {
      checks.cpu.status = 'warning';
      checks.cpu.message = 'CPU load above 80%';
    }

    // 6. Environment
    checks.environment = {
      nodeEnv: process.env.NODE_ENV || 'development',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      pid: process.pid,
    };

    // Determine overall health status
    const allStatuses = Object.values(checks).map(check => check.status || 'unknown');
    let overallStatus = 'healthy';

    if (allStatuses.includes('unhealthy') || allStatuses.includes('critical')) {
      overallStatus = 'unhealthy';
    } else if (allStatuses.includes('warning')) {
      overallStatus = 'degraded';
    }

    const duration = Date.now() - startTime;

    // Response
    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      checks,
    };

    // Log health check
    logger.debug('Health check completed', { status: overallStatus, duration });

    // Return appropriate HTTP status code
    if (overallStatus === 'healthy') {
      res.json(response);
    } else if (overallStatus === 'degraded') {
      res.status(200).json(response); // Still operational
    } else {
      res.status(503).json(response); // Service unavailable
    }

  } catch (error) {
    logger.error('Health check error', { error: error.message, stack: error.stack });

    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      checks,
    });
  }
});

// Liveness probe - simple check that server is running
router.get('/health/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Readiness probe - check if server is ready to accept traffic
router.get('/health/ready', async (req, res) => {
  try {
    // Check database connectivity
    await query('SELECT 1');
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('Readiness check failed', { error: error.message });
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: 'Database not available',
    });
  }
});

// Detailed diagnostics endpoint (admin only)
router.get('/health/diagnostics', async (req, res) => {
  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      server: {
        uptime: process.uptime(),
        startTime: new Date(serverStartTime).toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        cwd: process.cwd(),
      },
      memory: {
        process: process.memoryUsage(),
        system: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
        },
      },
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model,
        speed: `${os.cpus()[0]?.speed}MHz`,
        loadAverage: os.loadavg(),
      },
      network: {
        hostname: os.hostname(),
        interfaces: Object.keys(os.networkInterfaces()),
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        logLevel: process.env.LOG_LEVEL,
        port: process.env.PORT,
      },
    };

    // Database statistics
    try {
      const dbStats = await query(`
        SELECT
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM messages) as total_messages,
          (SELECT COUNT(*) FROM chats) as total_chats,
          (SELECT pg_database_size(current_database())) as database_size
      `);

      diagnostics.database = {
        connected: true,
        stats: {
          totalUsers: dbStats.rows[0].total_users,
          totalMessages: dbStats.rows[0].total_messages,
          totalChats: dbStats.rows[0].total_chats,
          databaseSize: `${Math.round(dbStats.rows[0].database_size / 1024 / 1024)}MB`,
        },
      };
    } catch (dbError) {
      diagnostics.database = {
        connected: false,
        error: dbError.message,
      };
    }

    // Log file information
    try {
      const logsDir = '/home/user/corporate-chat-backend/logs';
      const logFiles = fs.readdirSync(logsDir);
      diagnostics.logs = {
        directory: logsDir,
        files: logFiles.map(file => {
          const stats = fs.statSync(`${logsDir}/${file}`);
          return {
            name: file,
            size: `${Math.round(stats.size / 1024)}KB`,
            modified: stats.mtime,
          };
        }),
      };
    } catch (logError) {
      diagnostics.logs = { error: 'Unable to read log directory' };
    }

    res.json(diagnostics);
  } catch (error) {
    logger.error('Diagnostics error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Performance metrics endpoint
router.get('/health/metrics', (req, res) => {
  try {
    const metrics = metricsCollector.getMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error('Metrics retrieval error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
