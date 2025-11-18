// Performance metrics collector
const os = require('os');
const { createLogger } = require('./logger');

const logger = createLogger('metrics');

class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        byMethod: {},
        byStatus: {},
        byEndpoint: {},
      },
      performance: {
        responseTimes: [],
        slowRequests: [],
        errors: [],
      },
      system: {
        startTime: Date.now(),
        lastCollected: null,
      },
      database: {
        queries: 0,
        slowQueries: 0,
        errors: 0,
        totalDuration: 0,
      },
      websocket: {
        connections: 0,
        messages: 0,
        errors: 0,
      },
    };

    // Circular buffer for response times (keep last 1000)
    this.maxResponseTimes = 1000;
    this.maxSlowRequests = 100;
    this.maxErrors = 100;

    // Start periodic collection
    this.startPeriodicCollection();
  }

  // Record HTTP request
  recordRequest(method, endpoint, statusCode, duration, error = null) {
    this.metrics.requests.total++;

    // By method
    this.metrics.requests.byMethod[method] = (this.metrics.requests.byMethod[method] || 0) + 1;

    // By status code
    this.metrics.requests.byStatus[statusCode] = (this.metrics.requests.byStatus[statusCode] || 0) + 1;

    // By endpoint (simplified, remove IDs)
    const simplifiedEndpoint = this.simplifyEndpoint(endpoint);
    this.metrics.requests.byEndpoint[simplifiedEndpoint] = (this.metrics.requests.byEndpoint[simplifiedEndpoint] || 0) + 1;

    // Response time
    this.metrics.performance.responseTimes.push({
      timestamp: Date.now(),
      duration,
      endpoint: simplifiedEndpoint,
      statusCode,
    });

    // Trim array if too large
    if (this.metrics.performance.responseTimes.length > this.maxResponseTimes) {
      this.metrics.performance.responseTimes = this.metrics.performance.responseTimes.slice(-this.maxResponseTimes);
    }

    // Slow request (> 1s)
    if (duration > 1000) {
      this.metrics.performance.slowRequests.push({
        timestamp: Date.now(),
        duration,
        method,
        endpoint: simplifiedEndpoint,
        statusCode,
      });

      if (this.metrics.performance.slowRequests.length > this.maxSlowRequests) {
        this.metrics.performance.slowRequests = this.metrics.performance.slowRequests.slice(-this.maxSlowRequests);
      }
    }

    // Error
    if (error || statusCode >= 500) {
      this.metrics.performance.errors.push({
        timestamp: Date.now(),
        method,
        endpoint: simplifiedEndpoint,
        statusCode,
        error: error ? error.message : 'Unknown error',
      });

      if (this.metrics.performance.errors.length > this.maxErrors) {
        this.metrics.performance.errors = this.metrics.performance.errors.slice(-this.maxErrors);
      }
    }
  }

  // Simplify endpoint (remove IDs, UUIDs, etc.)
  simplifyEndpoint(endpoint) {
    return endpoint
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
      .replace(/\?.*$/, '');
  }

  // Record database query
  recordDbQuery(duration, error = null) {
    this.metrics.database.queries++;
    this.metrics.database.totalDuration += duration;

    if (duration > 1000) {
      this.metrics.database.slowQueries++;
    }

    if (error) {
      this.metrics.database.errors++;
    }
  }

  // Record WebSocket event
  recordWebSocket(event, data = {}) {
    switch (event) {
      case 'connection':
        this.metrics.websocket.connections++;
        break;
      case 'message':
        this.metrics.websocket.messages++;
        break;
      case 'error':
        this.metrics.websocket.errors++;
        break;
    }
  }

  // Get current metrics snapshot
  getMetrics() {
    const now = Date.now();
    const uptime = Math.floor((now - this.metrics.system.startTime) / 1000);

    // Calculate response time statistics
    const recentResponseTimes = this.metrics.performance.responseTimes
      .filter(r => now - r.timestamp < 5 * 60 * 1000) // Last 5 minutes
      .map(r => r.duration);

    const avgResponseTime = recentResponseTimes.length > 0
      ? Math.round(recentResponseTimes.reduce((a, b) => a + b, 0) / recentResponseTimes.length)
      : 0;

    const p50 = this.percentile(recentResponseTimes, 50);
    const p95 = this.percentile(recentResponseTimes, 95);
    const p99 = this.percentile(recentResponseTimes, 99);

    // System metrics
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: new Date().toISOString(),
      uptime,
      requests: {
        total: this.metrics.requests.total,
        byMethod: this.metrics.requests.byMethod,
        byStatus: this.metrics.requests.byStatus,
        topEndpoints: this.getTopEndpoints(10),
      },
      performance: {
        avgResponseTime,
        p50,
        p95,
        p99,
        recentSlowRequests: this.metrics.performance.slowRequests.slice(-10),
        recentErrors: this.metrics.performance.errors.slice(-10),
      },
      database: {
        queries: this.metrics.database.queries,
        slowQueries: this.metrics.database.slowQueries,
        errors: this.metrics.database.errors,
        avgQueryTime: this.metrics.database.queries > 0
          ? Math.round(this.metrics.database.totalDuration / this.metrics.database.queries)
          : 0,
      },
      websocket: this.metrics.websocket,
      system: {
        uptime,
        memory: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        },
        cpu: {
          user: Math.round(cpuUsage.user / 1000),
          system: Math.round(cpuUsage.system / 1000),
        },
        loadAverage: os.loadavg(),
      },
    };
  }

  // Get top endpoints by request count
  getTopEndpoints(limit = 10) {
    return Object.entries(this.metrics.requests.byEndpoint)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([endpoint, count]) => ({ endpoint, count }));
  }

  // Calculate percentile
  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return Math.round(sorted[index] || 0);
  }

  // Start periodic metrics collection
  startPeriodicCollection() {
    // Log metrics every 5 minutes
    this.collectionInterval = setInterval(() => {
      const metrics = this.getMetrics();
      this.metrics.system.lastCollected = Date.now();

      logger.info('Periodic metrics collection', {
        requests: metrics.requests.total,
        avgResponseTime: metrics.performance.avgResponseTime,
        p95: metrics.performance.p95,
        dbQueries: metrics.database.queries,
        slowQueries: metrics.database.slowQueries,
        errors: metrics.performance.recentErrors.length,
      });

      // Detect anomalies
      this.detectAnomalies(metrics);
    }, 5 * 60 * 1000); // 5 minutes

    logger.info('Metrics collector started');
  }

  // Detect anomalies and send alerts
  detectAnomalies(metrics) {
    const telegramAlert = require('./telegramAlert');

    // High error rate
    const errorRate = metrics.performance.recentErrors.length / Math.max(1, metrics.requests.total) * 100;
    if (errorRate > 5) {
      telegramAlert.sendWarning(
        'High Error Rate Detected',
        `Error rate: ${errorRate.toFixed(2)}%\nRecent errors: ${metrics.performance.recentErrors.length}`
      );
    }

    // Slow response time
    if (metrics.performance.p95 > 3000) {
      telegramAlert.sendWarning(
        'Slow Response Time',
        `P95 response time: ${metrics.performance.p95}ms\nP99: ${metrics.performance.p99}ms`
      );
    }

    // High database query time
    if (metrics.database.slowQueries > 10) {
      telegramAlert.sendWarning(
        'Slow Database Queries',
        `Slow queries: ${metrics.database.slowQueries}\nAvg query time: ${metrics.database.avgQueryTime}ms`
      );
    }
  }

  // Stop metrics collection
  stop() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      logger.info('Metrics collector stopped');
    }
  }

  // Reset metrics
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        byMethod: {},
        byStatus: {},
        byEndpoint: {},
      },
      performance: {
        responseTimes: [],
        slowRequests: [],
        errors: [],
      },
      system: {
        startTime: Date.now(),
        lastCollected: null,
      },
      database: {
        queries: 0,
        slowQueries: 0,
        errors: 0,
        totalDuration: 0,
      },
      websocket: {
        connections: 0,
        messages: 0,
        errors: 0,
      },
    };
    logger.info('Metrics reset');
  }
}

// Create singleton instance
const metricsCollector = new MetricsCollector();

// Graceful shutdown
process.on('SIGTERM', () => {
  metricsCollector.stop();
});

process.on('SIGINT', () => {
  metricsCollector.stop();
});

module.exports = metricsCollector;
