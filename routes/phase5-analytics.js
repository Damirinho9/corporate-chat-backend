// ==================== PHASE 5: CONTINUOUS OPTIMIZATION ROUTES ====================
// API routes for metrics reporting, KB analytics, and chatbot training
const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { createLogger } = require('../utils/logger');

const metricsReporting = require('../services/metricsReporting');
const kbAnalytics = require('../services/kbAnalytics');
const chatbotAnalytics = require('../services/chatbotAnalytics');

const logger = createLogger('phase5-analytics-api');

// ==================== METRICS REPORTING ====================

/**
 * GET /api/phase5/metrics/reports
 * Get metrics report history
 */
router.get('/metrics/reports', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { type, limit = 10 } = req.query;

        const reports = await metricsReporting.getReportHistory({
            type,
            limit: parseInt(limit)
        });

        res.json({ success: true, reports });
    } catch (error) {
        logger.error('Failed to get report history', { error: error.message });
        res.status(500).json({ error: 'Failed to get report history' });
    }
});

/**
 * POST /api/phase5/metrics/generate
 * Generate ad-hoc metrics report
 */
router.post('/metrics/generate', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30, emails = [] } = req.body;

        const report = await metricsReporting.generateCustomReport(
            parseInt(period),
            emails
        );

        res.json({
            success: true,
            message: 'Report generated successfully',
            reportId: report.reportId
        });
    } catch (error) {
        logger.error('Failed to generate report', { error: error.message });
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// ==================== KB ANALYTICS ====================

/**
 * GET /api/phase5/kb/performance
 * Get KB article performance metrics
 */
router.get('/kb/performance', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30, sortBy = 'views', sortOrder = 'DESC', limit = 50 } = req.query;

        const articles = await kbAnalytics.getArticlePerformance({
            period: parseInt(period),
            sortBy,
            sortOrder,
            limit: parseInt(limit)
        });

        res.json({ success: true, articles, period_days: parseInt(period) });
    } catch (error) {
        logger.error('Failed to get article performance', { error: error.message });
        res.status(500).json({ error: 'Failed to get article performance' });
    }
});

/**
 * GET /api/phase5/kb/search-analytics
 * Get search analytics and effectiveness
 */
router.get('/kb/search-analytics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30, limit = 100 } = req.query;

        const analytics = await kbAnalytics.getSearchAnalytics({
            period: parseInt(period),
            limit: parseInt(limit)
        });

        res.json({ success: true, ...analytics, period_days: parseInt(period) });
    } catch (error) {
        logger.error('Failed to get search analytics', { error: error.message });
        res.status(500).json({ error: 'Failed to get search analytics' });
    }
});

/**
 * GET /api/phase5/kb/content-gaps
 * Identify content gaps
 */
router.get('/kb/content-gaps', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30, minSearchCount = 5 } = req.query;

        const gaps = await kbAnalytics.identifyContentGaps({
            period: parseInt(period),
            minSearchCount: parseInt(minSearchCount)
        });

        res.json({ success: true, ...gaps, period_days: parseInt(period) });
    } catch (error) {
        logger.error('Failed to identify content gaps', { error: error.message });
        res.status(500).json({ error: 'Failed to identify content gaps' });
    }
});

/**
 * GET /api/phase5/kb/outdated
 * Get outdated articles needing review
 */
router.get('/kb/outdated', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { daysOld = 90, minViews = 10 } = req.query;

        const articles = await kbAnalytics.getOutdatedArticles({
            daysOld: parseInt(daysOld),
            minViews: parseInt(minViews)
        });

        res.json({
            success: true,
            articles,
            needsReview: articles.filter(a => a.needsReview).length
        });
    } catch (error) {
        logger.error('Failed to get outdated articles', { error: error.message });
        res.status(500).json({ error: 'Failed to get outdated articles' });
    }
});

/**
 * GET /api/phase5/kb/dashboard
 * Get KB analytics dashboard summary
 */
router.get('/kb/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30 } = req.query;

        const summary = await kbAnalytics.getDashboardSummary(parseInt(period));

        res.json({ success: true, ...summary, period_days: parseInt(period) });
    } catch (error) {
        logger.error('Failed to get KB dashboard', { error: error.message });
        res.status(500).json({ error: 'Failed to get KB dashboard' });
    }
});

/**
 * GET /api/phase5/kb/suggestions
 * Get suggested new articles based on tickets
 */
router.get('/kb/suggestions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30 } = req.query;

        const suggestions = await kbAnalytics.getSuggestedArticles(parseInt(period));

        res.json({ success: true, suggestions, period_days: parseInt(period) });
    } catch (error) {
        logger.error('Failed to get KB suggestions', { error: error.message });
        res.status(500).json({ error: 'Failed to get KB suggestions' });
    }
});

/**
 * POST /api/phase5/kb/track-view
 * Track KB article view (can be called from frontend)
 */
router.post('/kb/track-view', authenticateToken, async (req, res) => {
    try {
        const { articleId, searchQuery } = req.body;
        const userId = req.user?.id || null;

        await kbAnalytics.trackArticleView(articleId, userId, searchQuery);

        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to track article view', { error: error.message });
        res.status(500).json({ error: 'Failed to track article view' });
    }
});

/**
 * POST /api/phase5/kb/track-search
 * Track KB search query
 */
router.post('/kb/track-search', authenticateToken, async (req, res) => {
    try {
        const { query, resultsCount } = req.body;
        const userId = req.user?.id || null;

        await kbAnalytics.trackSearch(query, userId, resultsCount);

        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to track search', { error: error.message });
        res.status(500).json({ error: 'Failed to track search' });
    }
});

// ==================== CHATBOT TRAINING ANALYTICS ====================

/**
 * GET /api/phase5/chatbot/unresolved
 * Get unresolved conversations needing review
 */
router.get('/chatbot/unresolved', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30, minMessages = 2, limit = 100 } = req.query;

        const conversations = await chatbotAnalytics.getUnresolvedConversations({
            period: parseInt(period),
            minMessages: parseInt(minMessages),
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            conversations,
            total: conversations.length,
            period_days: parseInt(period)
        });
    } catch (error) {
        logger.error('Failed to get unresolved conversations', { error: error.message });
        res.status(500).json({ error: 'Failed to get unresolved conversations' });
    }
});

/**
 * GET /api/phase5/chatbot/intent-analysis
 * Get intent confidence analysis
 */
router.get('/chatbot/intent-analysis', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30 } = req.query;

        const analysis = await chatbotAnalytics.getIntentAnalysis({
            period: parseInt(period)
        });

        res.json({
            success: true,
            intents: analysis,
            needsTraining: analysis.filter(i => i.needsTraining).length,
            period_days: parseInt(period)
        });
    } catch (error) {
        logger.error('Failed to get intent analysis', { error: error.message });
        res.status(500).json({ error: 'Failed to get intent analysis' });
    }
});

/**
 * GET /api/phase5/chatbot/unhandled-queries
 * Get common unhandled queries
 */
router.get('/chatbot/unhandled-queries', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30, limit = 50 } = req.query;

        const queries = await chatbotAnalytics.getUnhandledQueries({
            period: parseInt(period),
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            queries,
            total: queries.length,
            period_days: parseInt(period)
        });
    } catch (error) {
        logger.error('Failed to get unhandled queries', { error: error.message });
        res.status(500).json({ error: 'Failed to get unhandled queries' });
    }
});

/**
 * GET /api/phase5/chatbot/effectiveness
 * Get chatbot effectiveness metrics
 */
router.get('/chatbot/effectiveness', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30 } = req.query;

        const metrics = await chatbotAnalytics.getEffectivenessMetrics(parseInt(period));

        res.json({
            success: true,
            ...metrics,
            period_days: parseInt(period)
        });
    } catch (error) {
        logger.error('Failed to get effectiveness metrics', { error: error.message });
        res.status(500).json({ error: 'Failed to get effectiveness metrics' });
    }
});

/**
 * GET /api/phase5/chatbot/training-quality
 * Get training data quality analysis
 */
router.get('/chatbot/training-quality', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const quality = await chatbotAnalytics.getTrainingDataQuality();

        res.json({ success: true, ...quality });
    } catch (error) {
        logger.error('Failed to get training quality', { error: error.message });
        res.status(500).json({ error: 'Failed to get training quality' });
    }
});

/**
 * GET /api/phase5/chatbot/suggested-intents
 * Get suggested new intents
 */
router.get('/chatbot/suggested-intents', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30, minFrequency = 5 } = req.query;

        const suggestions = await chatbotAnalytics.getSuggestedIntents({
            period: parseInt(period),
            minFrequency: parseInt(minFrequency)
        });

        res.json({
            success: true,
            suggestions,
            total: suggestions.length,
            period_days: parseInt(period)
        });
    } catch (error) {
        logger.error('Failed to get suggested intents', { error: error.message });
        res.status(500).json({ error: 'Failed to get suggested intents' });
    }
});

/**
 * GET /api/phase5/chatbot/dashboard
 * Get chatbot training dashboard summary
 */
router.get('/chatbot/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { period = 30 } = req.query;

        const summary = await chatbotAnalytics.getDashboardSummary(parseInt(period));

        res.json({ success: true, ...summary, period_days: parseInt(period) });
    } catch (error) {
        logger.error('Failed to get chatbot dashboard', { error: error.message });
        res.status(500).json({ error: 'Failed to get chatbot dashboard' });
    }
});

/**
 * GET /api/phase5/chatbot/export-training/:intent
 * Export training data for an intent
 */
router.get('/chatbot/export-training/:intent', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { intent } = req.params;

        const trainingData = await chatbotAnalytics.exportIntentTrainingData(intent);

        res.json({
            success: true,
            intent,
            trainingData,
            count: trainingData.length
        });
    } catch (error) {
        logger.error('Failed to export training data', { error: error.message });
        res.status(500).json({ error: 'Failed to export training data' });
    }
});

module.exports = router;
