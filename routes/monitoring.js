// Monitoring API endpoints
const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');
const errorTracker = require('../utils/errorTracker');
const metricsCollector = require('../utils/metricsCollector');
const { createLogger } = require('../utils/logger');

const logger = createLogger('monitoring-api');

// All monitoring endpoints require admin authentication
router.use(verifyAdmin);

// Get error statistics
router.get('/errors/stats', async (req, res) => {
  try {
    const timeRange = req.query.range || '24 hours';
    const stats = await errorTracker.getErrorStats(timeRange);
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get error stats', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve error statistics' });
  }
});

// Get recent errors
router.get('/errors/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const errors = await errorTracker.getRecentErrors(limit, offset);
    res.json(errors);
  } catch (error) {
    logger.error('Failed to get recent errors', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve recent errors' });
  }
});

// Get errors by type
router.get('/errors/type/:type', async (req, res) => {
  try {
    const errorType = req.params.type;
    const limit = parseInt(req.query.limit) || 50;
    const errors = await errorTracker.getErrorsByType(errorType, limit);
    res.json(errors);
  } catch (error) {
    logger.error('Failed to get errors by type', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve errors by type' });
  }
});

// Get error trends
router.get('/errors/trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const trends = await errorTracker.getErrorTrends(days);
    res.json(trends);
  } catch (error) {
    logger.error('Failed to get error trends', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve error trends' });
  }
});

// Resolve error
router.post('/errors/:id/resolve', async (req, res) => {
  try {
    const errorId = parseInt(req.params.id);
    const resolvedBy = req.user.id;
    const notes = req.body.notes || null;

    const success = await errorTracker.resolveError(errorId, resolvedBy, notes);

    if (success) {
      res.json({ success: true, message: 'Error marked as resolved' });
    } else {
      res.status(500).json({ error: 'Failed to resolve error' });
    }
  } catch (error) {
    logger.error('Failed to resolve error', { error: error.message });
    res.status(500).json({ error: 'Failed to resolve error' });
  }
});

// Get performance metrics
router.get('/metrics', (req, res) => {
  try {
    const metrics = metricsCollector.getMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get metrics', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

// Reset metrics
router.post('/metrics/reset', (req, res) => {
  try {
    metricsCollector.reset();
    res.json({ success: true, message: 'Metrics reset successfully' });
  } catch (error) {
    logger.error('Failed to reset metrics', { error: error.message });
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
});

// Get monitoring dashboard data (combined)
router.get('/dashboard', async (req, res) => {
  try {
    const [errorStats, metrics] = await Promise.all([
      errorTracker.getErrorStats('24 hours'),
      Promise.resolve(metricsCollector.getMetrics()),
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      errors: errorStats,
      performance: metrics,
    });
  } catch (error) {
    logger.error('Failed to get dashboard data', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve dashboard data' });
  }
});

module.exports = router;
