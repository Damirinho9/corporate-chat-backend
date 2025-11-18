// Request tracing middleware with correlation IDs
const crypto = require('crypto');
const { createLogger } = require('../utils/logger');
const emailAlert = require('../utils/emailAlert');
const metricsCollector = require('../utils/metricsCollector');
const errorTracker = require('../utils/errorTracker');

const logger = createLogger('tracing');

// Generate unique correlation ID
function generateCorrelationId() {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

// Request tracing middleware
function requestTracingMiddleware(req, res, next) {
  // Get or generate correlation ID
  const correlationId = req.headers['x-correlation-id'] ||
                        req.headers['x-request-id'] ||
                        generateCorrelationId();

  // Attach correlation ID to request
  req.correlationId = correlationId;

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  // Store start time
  req.startTime = Date.now();

  // Log incoming request
  logger.http(`→ ${req.method} ${req.originalUrl || req.url}`, {
    correlationId,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
  });

  // Intercept response to log completion
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function(data) {
    logResponse();
    return originalSend.call(this, data);
  };

  res.json = function(data) {
    logResponse();
    return originalJson.call(this, data);
  };

  function logResponse() {
    const duration = Date.now() - req.startTime;
    const statusCode = res.statusCode;

    // Record metrics
    metricsCollector.recordRequest(
      req.method,
      req.originalUrl || req.url,
      statusCode,
      duration
    );

    // Determine log level based on status code
    let logLevel = 'http';
    if (statusCode >= 500) {
      logLevel = 'error';
    } else if (statusCode >= 400) {
      logLevel = 'warn';
    }

    logger[logLevel](`← ${req.method} ${req.originalUrl || req.url} ${statusCode}`, {
      correlationId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      duration,
      userId: req.user?.id,
    });

    // Log slow requests
    if (duration > 1000) {
      logger.warn(`Slow request detected`, {
        correlationId,
        method: req.method,
        url: req.originalUrl || req.url,
        duration,
        threshold: '1000ms',
      });
    }
  }

  next();
}

// Error tracking middleware
function errorTrackingMiddleware(err, req, res, next) {
  const correlationId = req.correlationId || 'unknown';
  const duration = req.startTime ? Date.now() - req.startTime : null;

  logger.error(`Request failed: ${err.message}`, {
    correlationId,
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: err.statusCode || 500,
    error: err.message,
    stack: err.stack,
    duration,
    userId: req.user?.id,
  });

  // Log to error tracker database
  errorTracker.logError(err, {
    correlationId,
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: err.statusCode || 500,
    userId: req.user?.id,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  }).catch(trackErr => {
    logger.debug('Failed to track error in database', { error: trackErr.message });
  });

  // Send Email alert for server errors (5xx)
  if (!err.statusCode || err.statusCode >= 500) {
    emailAlert.sendErrorAlert(err, {
      correlationId,
      method: req.method,
      url: req.originalUrl || req.url,
      userId: req.user?.id,
      ip: req.ip || req.connection?.remoteAddress,
    }).catch(alertErr => {
      logger.debug('Failed to send email alert', { error: alertErr.message });
    });
  }

  // Add correlation ID to error response
  res.setHeader('X-Correlation-ID', correlationId);

  // Pass to next error handler
  next(err);
}

module.exports = {
  requestTracingMiddleware,
  errorTrackingMiddleware,
  generateCorrelationId,
};
