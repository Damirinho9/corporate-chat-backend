// Enterprise-level structured logging system
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log levels with priorities
const levels = {
  critical: 0,
  error: 1,
  warn: 2,
  info: 3,
  http: 4,
  debug: 5,
};

// Colors for console output
const colors = {
  critical: 'red bold',
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Custom format for console (human-readable)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, context, correlationId, duration, ...meta }) => {
    let log = `[${timestamp}] ${level}`;

    if (context) log += ` [${context}]`;
    if (correlationId) log += ` [${correlationId}]`;

    log += `: ${message}`;

    if (duration !== undefined) log += ` (${duration}ms)`;

    // Add extra metadata
    const metaKeys = Object.keys(meta);
    if (metaKeys.length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }

    return log;
  })
);

// JSON format for files (machine-readable)
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the base logger
const baseLogger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: {
    service: 'corporate-chat',
    environment: process.env.NODE_ENV || 'development',
    hostname: require('os').hostname(),
  },
  transports: [
    // Console transport (development-friendly)
    new winston.transports.Console({
      format: consoleFormat,
    }),

    // Error log file (JSON, errors only)
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: jsonFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true,
    }),

    // Combined log file (JSON, all logs)
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: jsonFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true,
    }),

    // Performance log file (for metrics)
    new winston.transports.File({
      filename: path.join(logsDir, 'performance.log'),
      level: 'http',
      format: jsonFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
  ],

  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: jsonFormat,
    }),
  ],

  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: jsonFormat,
    }),
  ],
});

// Logger class with context support
class Logger {
  constructor(context = 'app') {
    this.context = context;
  }

  // Core logging methods
  critical(message, meta = {}) {
    baseLogger.log('critical', message, { ...meta, context: this.context });
  }

  error(message, meta = {}) {
    baseLogger.log('error', message, { ...meta, context: this.context });
  }

  warn(message, meta = {}) {
    baseLogger.log('warn', message, { ...meta, context: this.context });
  }

  info(message, meta = {}) {
    baseLogger.log('info', message, { ...meta, context: this.context });
  }

  http(message, meta = {}) {
    baseLogger.log('http', message, { ...meta, context: this.context });
  }

  debug(message, meta = {}) {
    baseLogger.log('debug', message, { ...meta, context: this.context });
  }

  // Specialized logging helpers

  // HTTP request logging
  logRequest(req, res, duration) {
    this.http(`${req.method} ${req.originalUrl || req.url}`, {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration,
      correlationId: req.correlationId,
      userId: req.user?.id,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
    });
  }

  // Database query logging
  logQuery(query, duration, error = null) {
    const meta = {
      query: query.text || query,
      params: query.values ? '[REDACTED]' : undefined,
      duration,
    };

    if (error) {
      this.error(`Database query failed: ${error.message}`, {
        ...meta,
        error: error.message,
        stack: error.stack,
      });
    } else if (duration > 1000) {
      this.warn(`Slow database query detected`, meta);
    } else {
      this.debug(`Database query executed`, meta);
    }
  }

  // WebSocket event logging
  logWebSocket(event, data = {}) {
    this.debug(`WebSocket ${event}`, {
      event,
      userId: data.userId,
      socketId: data.socketId,
      ...data,
    });
  }

  // Email sending logging
  logEmail(to, subject, status, error = null) {
    const meta = {
      to,
      subject,
      status,
    };

    if (error) {
      this.error(`Email sending failed: ${error.message}`, {
        ...meta,
        error: error.message,
        stack: error.stack,
      });
    } else {
      this.info(`Email sent successfully`, meta);
    }
  }

  // Authentication event logging
  logAuth(event, userId, details = {}) {
    this.info(`Auth: ${event}`, {
      event,
      userId,
      ...details,
    });
  }

  // Security event logging (always logged, even in production)
  logSecurity(event, severity, details = {}) {
    const level = severity === 'critical' ? 'critical' : 'warn';
    this[level](`Security: ${event}`, {
      event,
      severity,
      ...details,
    });
  }

  // Performance metrics logging
  logMetric(metric, value, unit = 'ms', tags = {}) {
    this.http(`Metric: ${metric}`, {
      metric,
      value,
      unit,
      ...tags,
    });
  }

  // Business event logging
  logEvent(event, data = {}) {
    this.info(`Event: ${event}`, {
      event,
      ...data,
    });
  }
}

// Create default logger instance
const defaultLogger = new Logger('app');

// Factory function to create context-specific loggers
function createLogger(context) {
  return new Logger(context);
}

// Morgan stream for HTTP logging
const morganStream = {
  write: (message) => {
    defaultLogger.http(message.trim());
  },
};

// Export logger
module.exports = {
  // Main logger instance
  logger: defaultLogger,

  // Factory function
  createLogger,

  // Morgan stream for Express
  stream: morganStream,

  // Direct access to methods for convenience
  critical: (...args) => defaultLogger.critical(...args),
  error: (...args) => defaultLogger.error(...args),
  warn: (...args) => defaultLogger.warn(...args),
  info: (...args) => defaultLogger.info(...args),
  http: (...args) => defaultLogger.http(...args),
  debug: (...args) => defaultLogger.debug(...args),

  // Specialized helpers
  logRequest: (...args) => defaultLogger.logRequest(...args),
  logQuery: (...args) => defaultLogger.logQuery(...args),
  logWebSocket: (...args) => defaultLogger.logWebSocket(...args),
  logEmail: (...args) => defaultLogger.logEmail(...args),
  logAuth: (...args) => defaultLogger.logAuth(...args),
  logSecurity: (...args) => defaultLogger.logSecurity(...args),
  logMetric: (...args) => defaultLogger.logMetric(...args),
  logEvent: (...args) => defaultLogger.logEvent(...args),
};
