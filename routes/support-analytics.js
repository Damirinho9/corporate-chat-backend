// ==================== SUPPORT ANALYTICS API ====================
// Advanced analytics endpoints for support system
const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { createLogger } = require('../utils/logger');
const supportAnalytics = require('../services/supportAnalytics');

const logger = createLogger('support-analytics-api');

/**
 * GET /api/support/analytics/agents
 * Get agent performance metrics
 */
router.get('/agents', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            period = 30,
            agentId,
            sortBy = 'tickets_resolved',
            sortOrder = 'DESC'
        } = req.query;

        const agents = await supportAnalytics.getAgentPerformance({
            period: parseInt(period),
            agentId: agentId ? parseInt(agentId) : null,
            sortBy,
            sortOrder
        });

        res.json({
            success: true,
            agents,
            period_days: parseInt(period)
        });

    } catch (error) {
        logger.error('Failed to get agent analytics', { error: error.message });
        res.status(500).json({ error: 'Failed to get agent analytics' });
    }
});

/**
 * GET /api/support/analytics/trends
 * Get ticket trends over time
 */
router.get('/trends', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            period = 30,
            groupBy = 'day'
        } = req.query;

        const trends = await supportAnalytics.getTicketTrends({
            period: parseInt(period),
            groupBy
        });

        res.json({
            success: true,
            trends,
            period_days: parseInt(period),
            group_by: groupBy
        });

    } catch (error) {
        logger.error('Failed to get ticket trends', { error: error.message });
        res.status(500).json({ error: 'Failed to get ticket trends' });
    }
});

/**
 * GET /api/support/analytics/categories
 * Get category distribution and performance
 */
router.get('/categories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30 } = req.query;

        const categories = await supportAnalytics.getCategoryAnalytics({
            period: parseInt(period)
        });

        res.json({
            success: true,
            categories,
            period_days: parseInt(period)
        });

    } catch (error) {
        logger.error('Failed to get category analytics', { error: error.message });
        res.status(500).json({ error: 'Failed to get category analytics' });
    }
});

/**
 * GET /api/support/analytics/csat
 * Get Customer Satisfaction analytics
 */
router.get('/csat', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30 } = req.query;

        const csat = await supportAnalytics.getCSATAnalytics({
            period: parseInt(period)
        });

        res.json({
            success: true,
            ...csat,
            period_days: parseInt(period)
        });

    } catch (error) {
        logger.error('Failed to get CSAT analytics', { error: error.message });
        res.status(500).json({ error: 'Failed to get CSAT analytics' });
    }
});

/**
 * GET /api/support/analytics/dashboard
 * Get comprehensive dashboard data
 */
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 7 } = req.query;

        const dashboard = await supportAnalytics.getDashboardData({
            period: parseInt(period)
        });

        res.json({
            success: true,
            dashboard
        });

    } catch (error) {
        logger.error('Failed to get dashboard data', { error: error.message });
        res.status(500).json({ error: 'Failed to get dashboard data' });
    }
});

module.exports = router;
