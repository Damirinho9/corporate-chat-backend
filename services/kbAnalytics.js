// ==================== KNOWLEDGE BASE ANALYTICS SERVICE ====================
// Tracks KB usage, effectiveness, and content gaps
const { query } = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('kb-analytics');

class KBAnalyticsService {
    /**
     * Track article view
     */
    async trackArticleView(articleId, userId = null, searchQuery = null) {
        try {
            await query(`
                INSERT INTO kb_article_views (
                    article_id,
                    user_id,
                    search_query,
                    viewed_at
                ) VALUES ($1, $2, $3, NOW())
            `, [articleId, userId, searchQuery]);
        } catch (error) {
            logger.error('Failed to track article view', { error: error.message });
        }
    }

    /**
     * Track search query
     */
    async trackSearch(searchQuery, userId = null, resultsCount = 0) {
        try {
            await query(`
                INSERT INTO kb_search_queries (
                    query,
                    user_id,
                    results_count,
                    searched_at
                ) VALUES ($1, $2, $3, NOW())
            `, [searchQuery.toLowerCase().trim(), userId, resultsCount]);
        } catch (error) {
            logger.error('Failed to track search', { error: error.message });
        }
    }

    /**
     * Get article performance metrics
     */
    async getArticlePerformance(options = {}) {
        const { period = 30, sortBy = 'views', sortOrder = 'DESC', limit = 50 } = options;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);

        const result = await query(`
            SELECT
                a.id,
                a.title,
                a.category,
                a.is_published,
                a.created_at,
                a.updated_at,
                COUNT(DISTINCT v.id) as total_views,
                COUNT(DISTINCT v.id) FILTER (WHERE v.viewed_at >= $1) as recent_views,
                COUNT(DISTINCT v.user_id) as unique_visitors,
                AVG(r.rating)::numeric(3,2) as avg_rating,
                COUNT(r.id) as total_ratings,
                COUNT(r.id) FILTER (WHERE r.rating >= 4) as helpful_count,
                COUNT(r.id) FILTER (WHERE r.rating <= 2) as unhelpful_count,
                CASE
                    WHEN COUNT(r.id) > 0
                    THEN ROUND((COUNT(r.id) FILTER (WHERE r.rating >= 4)::numeric / COUNT(r.id)) * 100, 1)
                    ELSE NULL
                END as helpfulness_percentage,
                MAX(v.viewed_at) as last_viewed
            FROM kb_articles a
            LEFT JOIN kb_article_views v ON a.id = v.article_id
            LEFT JOIN kb_article_ratings r ON a.id = r.article_id
            GROUP BY a.id
            ORDER BY ${sortBy === 'rating' ? 'avg_rating' : sortBy === 'views' ? 'recent_views' : 'total_views'} ${sortOrder}
            LIMIT $2
        `, [cutoffDate, limit]);

        return result.rows.map(row => ({
            id: row.id,
            title: row.title,
            category: row.category,
            isPublished: row.is_published,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            metrics: {
                totalViews: parseInt(row.total_views) || 0,
                recentViews: parseInt(row.recent_views) || 0,
                uniqueVisitors: parseInt(row.unique_visitors) || 0,
                avgRating: row.avg_rating ? parseFloat(row.avg_rating) : null,
                totalRatings: parseInt(row.total_ratings) || 0,
                helpfulCount: parseInt(row.helpful_count) || 0,
                unhelpfulCount: parseInt(row.unhelpful_count) || 0,
                helpfulnessPercentage: row.helpfulness_percentage ? parseFloat(row.helpfulness_percentage) : null,
                lastViewed: row.last_viewed
            }
        }));
    }

    /**
     * Get search analytics
     */
    async getSearchAnalytics(options = {}) {
        const { period = 30, limit = 100 } = options;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);

        // Top searches
        const topSearches = await query(`
            SELECT
                query,
                COUNT(*) as search_count,
                AVG(results_count)::numeric(10,1) as avg_results,
                COUNT(*) FILTER (WHERE results_count = 0) as no_results_count,
                MAX(searched_at) as last_searched
            FROM kb_search_queries
            WHERE searched_at >= $1
            GROUP BY query
            ORDER BY search_count DESC
            LIMIT $2
        `, [cutoffDate, limit]);

        // Search misses (queries with no results)
        const searchMisses = await query(`
            SELECT
                query,
                COUNT(*) as miss_count,
                MAX(searched_at) as last_searched
            FROM kb_search_queries
            WHERE searched_at >= $1
                AND results_count = 0
            GROUP BY query
            ORDER BY miss_count DESC
            LIMIT 50
        `, [cutoffDate]);

        // Search effectiveness
        const effectiveness = await query(`
            SELECT
                COUNT(*) as total_searches,
                COUNT(*) FILTER (WHERE results_count > 0) as successful_searches,
                COUNT(*) FILTER (WHERE results_count = 0) as failed_searches,
                ROUND(
                    (COUNT(*) FILTER (WHERE results_count > 0)::numeric / NULLIF(COUNT(*), 0)) * 100, 2
                ) as success_rate,
                AVG(results_count)::numeric(10,1) as avg_results_per_search
            FROM kb_search_queries
            WHERE searched_at >= $1
        `, [cutoffDate]);

        return {
            topSearches: topSearches.rows.map(row => ({
                query: row.query,
                searchCount: parseInt(row.search_count),
                avgResults: parseFloat(row.avg_results) || 0,
                noResultsCount: parseInt(row.no_results_count) || 0,
                lastSearched: row.last_searched
            })),
            searchMisses: searchMisses.rows.map(row => ({
                query: row.query,
                missCount: parseInt(row.miss_count),
                lastSearched: row.last_searched
            })),
            effectiveness: {
                totalSearches: parseInt(effectiveness.rows[0].total_searches) || 0,
                successfulSearches: parseInt(effectiveness.rows[0].successful_searches) || 0,
                failedSearches: parseInt(effectiveness.rows[0].failed_searches) || 0,
                successRate: parseFloat(effectiveness.rows[0].success_rate) || 0,
                avgResultsPerSearch: parseFloat(effectiveness.rows[0].avg_results_per_search) || 0
            }
        };
    }

    /**
     * Identify content gaps
     */
    async identifyContentGaps(options = {}) {
        const { period = 30, minSearchCount = 5 } = options;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);

        // Find frequent searches with no results
        const gaps = await query(`
            SELECT
                query,
                COUNT(*) as search_count,
                MAX(searched_at) as last_searched,
                ARRAY_AGG(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as user_ids
            FROM kb_search_queries
            WHERE searched_at >= $1
                AND results_count = 0
            GROUP BY query
            HAVING COUNT(*) >= $2
            ORDER BY search_count DESC
            LIMIT 50
        `, [cutoffDate, minSearchCount]);

        // Analyze ticket subjects for topics not in KB
        const ticketTopics = await query(`
            SELECT
                LOWER(subject) as subject_lower,
                category,
                COUNT(*) as ticket_count
            FROM support_tickets
            WHERE created_at >= $1
                AND status IN ('resolved', 'closed')
            GROUP BY LOWER(subject), category
            HAVING COUNT(*) >= 3
            ORDER BY ticket_count DESC
            LIMIT 50
        `, [cutoffDate]);

        return {
            searchGaps: gaps.rows.map(row => ({
                query: row.query,
                searchCount: parseInt(row.search_count),
                lastSearched: row.last_searched,
                affectedUsers: row.user_ids ? row.user_ids.length : 0,
                recommendation: 'Create KB article for this topic'
            })),
            ticketGaps: ticketTopics.rows.map(row => ({
                subject: row.subject_lower,
                category: row.category,
                ticketCount: parseInt(row.ticket_count),
                recommendation: 'Consider creating KB article to reduce similar tickets'
            }))
        };
    }

    /**
     * Get outdated articles
     */
    async getOutdatedArticles(options = {}) {
        const { daysOld = 90, minViews = 10 } = options;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await query(`
            SELECT
                a.id,
                a.title,
                a.category,
                a.updated_at,
                a.created_at,
                EXTRACT(DAY FROM NOW() - a.updated_at) as days_since_update,
                COUNT(v.id) as total_views,
                AVG(r.rating)::numeric(3,2) as avg_rating,
                COUNT(r.id) FILTER (WHERE r.rating <= 2) as poor_ratings_count
            FROM kb_articles a
            LEFT JOIN kb_article_views v ON a.id = v.article_id
            LEFT JOIN kb_article_ratings r ON a.id = r.article_id
            WHERE a.updated_at < $1
                AND a.is_published = true
            GROUP BY a.id
            HAVING COUNT(v.id) >= $2
            ORDER BY a.updated_at ASC
            LIMIT 100
        `, [cutoffDate, minViews]);

        return result.rows.map(row => ({
            id: row.id,
            title: row.title,
            category: row.category,
            updatedAt: row.updated_at,
            createdAt: row.created_at,
            daysSinceUpdate: parseInt(row.days_since_update),
            totalViews: parseInt(row.total_views),
            avgRating: row.avg_rating ? parseFloat(row.avg_rating) : null,
            poorRatingsCount: parseInt(row.poor_ratings_count) || 0,
            needsReview: parseInt(row.days_since_update) > 180 || parseInt(row.poor_ratings_count) > 5
        }));
    }

    /**
     * Get dashboard summary
     */
    async getDashboardSummary(period = 30) {
        const [performance, searchData, gaps, outdated] = await Promise.all([
            this.getArticlePerformance({ period, limit: 10 }),
            this.getSearchAnalytics({ period }),
            this.identifyContentGaps({ period }),
            this.getOutdatedArticles({ daysOld: 90 })
        ]);

        // Calculate overall stats
        const totalArticles = await query(`SELECT COUNT(*) FROM kb_articles WHERE is_published = true`);
        const avgRating = await query(`
            SELECT AVG(rating)::numeric(3,2) as avg
            FROM kb_article_ratings
            WHERE created_at >= NOW() - INTERVAL '${period} days'
        `);

        return {
            overview: {
                totalArticles: parseInt(totalArticles.rows[0].count),
                avgRating: avgRating.rows[0].avg ? parseFloat(avgRating.rows[0].avg) : null,
                searchSuccessRate: searchData.effectiveness.successRate,
                articlesNeedingUpdate: outdated.filter(a => a.needsReview).length
            },
            topArticles: performance.slice(0, 10),
            searchAnalytics: searchData,
            contentGaps: {
                total: gaps.searchGaps.length + gaps.ticketGaps.length,
                topGaps: [...gaps.searchGaps.slice(0, 5), ...gaps.ticketGaps.slice(0, 5)]
            },
            outdatedArticles: outdated.filter(a => a.needsReview).slice(0, 10)
        };
    }

    /**
     * Get article suggestions based on tickets
     */
    async getSuggestedArticles(period = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);

        // Find common ticket patterns
        const result = await query(`
            WITH ticket_keywords AS (
                SELECT
                    category,
                    LOWER(REGEXP_REPLACE(subject, '[^a-zA-Z0-9\s]', '', 'g')) as cleaned_subject,
                    COUNT(*) as ticket_count
                FROM support_tickets
                WHERE created_at >= $1
                    AND status IN ('resolved', 'closed')
                GROUP BY category, cleaned_subject
                HAVING COUNT(*) >= 3
            )
            SELECT
                category,
                cleaned_subject,
                ticket_count
            FROM ticket_keywords
            ORDER BY ticket_count DESC
            LIMIT 20
        `, [cutoffDate]);

        return result.rows.map(row => ({
            suggestedTitle: row.cleaned_subject,
            category: row.category,
            ticketCount: parseInt(row.ticket_count),
            priority: parseInt(row.ticket_count) >= 10 ? 'high' : 'medium',
            estimatedImpact: `Could reduce ${row.ticket_count} tickets per ${period} days`
        }));
    }
}

// Export singleton instance
module.exports = new KBAnalyticsService();
