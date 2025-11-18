// Error tracking and analytics system
const { query } = require('../config/database');
const { createLogger } = require('./logger');

const logger = createLogger('error-tracker');

class ErrorTracker {
  constructor() {
    this.initializeDatabase();
  }

  // Initialize error tracking table
  async initializeDatabase() {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS error_logs (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMPTZ DEFAULT NOW(),
          error_type VARCHAR(255),
          error_message TEXT,
          stack_trace TEXT,
          correlation_id VARCHAR(255),
          method VARCHAR(10),
          url TEXT,
          status_code INTEGER,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          ip_address VARCHAR(45),
          user_agent TEXT,
          context JSONB,
          resolved BOOLEAN DEFAULT FALSE,
          resolved_at TIMESTAMPTZ,
          resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
      `);

      logger.info('Error tracking database initialized');
    } catch (error) {
      logger.error('Failed to initialize error tracking database', { error: error.message });
    }
  }

  // Log an error
  async logError(error, context = {}) {
    try {
      const result = await query(`
        INSERT INTO error_logs (
          error_type,
          error_message,
          stack_trace,
          correlation_id,
          method,
          url,
          status_code,
          user_id,
          ip_address,
          user_agent,
          context
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        error.name || 'Error',
        error.message,
        error.stack,
        context.correlationId || null,
        context.method || null,
        context.url || null,
        context.statusCode || null,
        context.userId || null,
        context.ip || null,
        context.userAgent || null,
        JSON.stringify(context.extra || {}),
      ]);

      logger.debug('Error logged to database', { errorId: result.rows[0].id });
      return result.rows[0].id;
    } catch (err) {
      logger.error('Failed to log error to database', { error: err.message });
      return null;
    }
  }

  // Get recent errors
  async getRecentErrors(limit = 50, offset = 0) {
    try {
      const result = await query(`
        SELECT
          e.*,
          u.username as user_name,
          r.username as resolved_by_name
        FROM error_logs e
        LEFT JOIN users u ON e.user_id = u.id
        LEFT JOIN users r ON e.resolved_by = r.id
        ORDER BY e.timestamp DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      return result.rows;
    } catch (error) {
      logger.error('Failed to get recent errors', { error: error.message });
      return [];
    }
  }

  // Get error statistics
  async getErrorStats(timeRange = '24 hours') {
    try {
      const result = await query(`
        SELECT
          COUNT(*) as total_errors,
          COUNT(*) FILTER (WHERE resolved = true) as resolved_errors,
          COUNT(*) FILTER (WHERE resolved = false) as unresolved_errors,
          COUNT(DISTINCT error_type) as unique_error_types,
          COUNT(DISTINCT user_id) as affected_users
        FROM error_logs
        WHERE timestamp > NOW() - INTERVAL '${timeRange}'
      `);

      const topErrors = await query(`
        SELECT
          error_type,
          error_message,
          COUNT(*) as count,
          MAX(timestamp) as last_occurrence
        FROM error_logs
        WHERE timestamp > NOW() - INTERVAL '${timeRange}'
        GROUP BY error_type, error_message
        ORDER BY count DESC
        LIMIT 10
      `);

      const errorsByHour = await query(`
        SELECT
          DATE_TRUNC('hour', timestamp) as hour,
          COUNT(*) as count
        FROM error_logs
        WHERE timestamp > NOW() - INTERVAL '${timeRange}'
        GROUP BY hour
        ORDER BY hour DESC
      `);

      return {
        summary: result.rows[0],
        topErrors: topErrors.rows,
        errorsByHour: errorsByHour.rows,
      };
    } catch (error) {
      logger.error('Failed to get error statistics', { error: error.message });
      return null;
    }
  }

  // Get errors by type
  async getErrorsByType(errorType, limit = 50) {
    try {
      const result = await query(`
        SELECT
          e.*,
          u.username as user_name
        FROM error_logs e
        LEFT JOIN users u ON e.user_id = u.id
        WHERE e.error_type = $1
        ORDER BY e.timestamp DESC
        LIMIT $2
      `, [errorType, limit]);

      return result.rows;
    } catch (error) {
      logger.error('Failed to get errors by type', { error: error.message });
      return [];
    }
  }

  // Mark error as resolved
  async resolveError(errorId, resolvedBy, notes = null) {
    try {
      await query(`
        UPDATE error_logs
        SET
          resolved = true,
          resolved_at = NOW(),
          resolved_by = $1,
          notes = $2
        WHERE id = $3
      `, [resolvedBy, notes, errorId]);

      logger.info('Error marked as resolved', { errorId, resolvedBy });
      return true;
    } catch (error) {
      logger.error('Failed to resolve error', { error: error.message, errorId });
      return false;
    }
  }

  // Get error trends
  async getErrorTrends(days = 7) {
    try {
      const result = await query(`
        SELECT
          DATE(timestamp) as date,
          COUNT(*) as total_errors,
          COUNT(DISTINCT error_type) as unique_errors,
          AVG(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) * 100 as server_error_rate
        FROM error_logs
        WHERE timestamp > NOW() - INTERVAL '${days} days'
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `);

      return result.rows;
    } catch (error) {
      logger.error('Failed to get error trends', { error: error.message });
      return [];
    }
  }

  // Clean up old resolved errors
  async cleanupOldErrors(daysToKeep = 30) {
    try {
      const result = await query(`
        DELETE FROM error_logs
        WHERE resolved = true
        AND resolved_at < NOW() - INTERVAL '${daysToKeep} days'
      `);

      logger.info('Old resolved errors cleaned up', { deleted: result.rowCount });
      return result.rowCount;
    } catch (error) {
      logger.error('Failed to cleanup old errors', { error: error.message });
      return 0;
    }
  }
}

// Create singleton instance
const errorTracker = new ErrorTracker();

module.exports = errorTracker;
