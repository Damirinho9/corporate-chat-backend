// ==================== CHATBOT TRAINING ANALYTICS SERVICE ====================
// Tracks chatbot performance and provides training recommendations
const { query } = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('chatbot-analytics');

class ChatbotAnalyticsService {
    /**
     * Get unresolved conversations that need review
     */
    async getUnresolvedConversations(options = {}) {
        const { period = 30, minMessages = 2, limit = 100 } = options;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);

        const result = await query(`
            WITH conversation_stats AS (
                SELECT
                    c.id as conversation_id,
                    c.created_at,
                    c.user_id,
                    u.name as user_name,
                    u.email as user_email,
                    COUNT(m.id) as message_count,
                    MAX(m.created_at) as last_message_at,
                    COUNT(m.id) FILTER (WHERE m.is_bot = false) as user_messages,
                    COUNT(m.id) FILTER (WHERE m.is_bot = true) as bot_messages,
                    BOOL_OR(m.metadata->>'intent' = 'unknown') as has_unknown_intent,
                    BOOL_OR(m.metadata->>'escalated' = 'true') as was_escalated,
                    ARRAY_AGG(DISTINCT m.metadata->>'intent') FILTER (WHERE m.metadata->>'intent' IS NOT NULL) as intents
                FROM chatbot_conversations c
                LEFT JOIN users u ON c.user_id = u.id
                LEFT JOIN chatbot_messages m ON c.id = m.conversation_id
                WHERE c.created_at >= $1
                GROUP BY c.id, c.created_at, c.user_id, u.name, u.email
            )
            SELECT *
            FROM conversation_stats
            WHERE message_count >= $2
                AND (has_unknown_intent = true OR was_escalated = true)
            ORDER BY created_at DESC
            LIMIT $3
        `, [cutoffDate, minMessages, limit]);

        return result.rows.map(row => ({
            conversationId: row.conversation_id,
            createdAt: row.created_at,
            userId: row.user_id,
            userName: row.user_name,
            userEmail: row.user_email,
            messageCount: parseInt(row.message_count),
            userMessages: parseInt(row.user_messages),
            botMessages: parseInt(row.bot_messages),
            lastMessageAt: row.last_message_at,
            hasUnknownIntent: row.has_unknown_intent,
            wasEscalated: row.was_escalated,
            intents: row.intents || [],
            needsReview: true
        }));
    }

    /**
     * Get intent confidence analysis
     */
    async getIntentAnalysis(options = {}) {
        const { period = 30 } = options;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);

        const result = await query(`
            SELECT
                metadata->>'intent' as intent,
                COUNT(*) as message_count,
                AVG((metadata->>'confidence')::float)::numeric(5,3) as avg_confidence,
                MIN((metadata->>'confidence')::float) as min_confidence,
                MAX((metadata->>'confidence')::float) as max_confidence,
                COUNT(*) FILTER (WHERE (metadata->>'confidence')::float < 0.6) as low_confidence_count,
                COUNT(*) FILTER (WHERE (metadata->>'confidence')::float >= 0.8) as high_confidence_count
            FROM chatbot_messages
            WHERE created_at >= $1
                AND is_bot = false
                AND metadata->>'intent' IS NOT NULL
            GROUP BY metadata->>'intent'
            ORDER BY message_count DESC
        `, [cutoffDate]);

        return result.rows.map(row => ({
            intent: row.intent,
            messageCount: parseInt(row.message_count),
            avgConfidence: row.avg_confidence ? parseFloat(row.avg_confidence) : null,
            minConfidence: parseFloat(row.min_confidence),
            maxConfidence: parseFloat(row.max_confidence),
            lowConfidenceCount: parseInt(row.low_confidence_count) || 0,
            highConfidenceCount: parseInt(row.high_confidence_count) || 0,
            needsTraining: row.avg_confidence && parseFloat(row.avg_confidence) < 0.7
        }));
    }

    /**
     * Get common unhandled queries
     */
    async getUnhandledQueries(options = {}) {
        const { period = 30, limit = 50 } = options;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);

        const result = await query(`
            SELECT
                content,
                COUNT(*) as frequency,
                MAX(created_at) as last_seen,
                ARRAY_AGG(DISTINCT user_id) as user_ids
            FROM chatbot_messages
            WHERE created_at >= $1
                AND is_bot = false
                AND (
                    metadata->>'intent' = 'unknown'
                    OR metadata->>'confidence' IS NULL
                    OR (metadata->>'confidence')::float < 0.5
                )
            GROUP BY content
            HAVING COUNT(*) >= 2
            ORDER BY frequency DESC
            LIMIT $2
        `, [cutoffDate, limit]);

        return result.rows.map(row => ({
            query: row.content,
            frequency: parseInt(row.frequency),
            lastSeen: row.last_seen,
            affectedUsers: row.user_ids ? row.user_ids.length : 0,
            suggestedAction: 'Create new intent or add to existing intent training data'
        }));
    }

    /**
     * Get chatbot effectiveness metrics
     */
    async getEffectivenessMetrics(period = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);

        // Overall stats
        const overall = await query(`
            SELECT
                COUNT(DISTINCT c.id) as total_conversations,
                COUNT(DISTINCT c.id) FILTER (WHERE EXISTS (
                    SELECT 1 FROM chatbot_messages m
                    WHERE m.conversation_id = c.id AND m.metadata->>'escalated' = 'true'
                )) as escalated_conversations,
                COUNT(DISTINCT c.id) FILTER (WHERE EXISTS (
                    SELECT 1 FROM chatbot_messages m
                    WHERE m.conversation_id = c.id AND m.metadata->>'intent' = 'unknown'
                )) as conversations_with_unknown_intent,
                AVG(
                    (SELECT COUNT(*) FROM chatbot_messages m WHERE m.conversation_id = c.id)
                )::numeric(10,1) as avg_messages_per_conversation
            FROM chatbot_conversations c
            WHERE c.created_at >= $1
        `, [cutoffDate]);

        // Intent distribution
        const intents = await query(`
            SELECT
                metadata->>'intent' as intent,
                COUNT(*) as count
            FROM chatbot_messages
            WHERE created_at >= $1
                AND is_bot = false
                AND metadata->>'intent' IS NOT NULL
            GROUP BY metadata->>'intent'
            ORDER BY count DESC
        `, [cutoffDate]);

        // Resolution rate (conversations that didn't escalate)
        const stats = overall.rows[0];
        const totalConversations = parseInt(stats.total_conversations) || 0;
        const escalatedConversations = parseInt(stats.escalated_conversations) || 0;
        const resolutionRate = totalConversations > 0
            ? ((totalConversations - escalatedConversations) / totalConversations) * 100
            : 0;

        return {
            totalConversations,
            escalatedConversations,
            conversationsWithUnknownIntent: parseInt(stats.conversations_with_unknown_intent) || 0,
            avgMessagesPerConversation: parseFloat(stats.avg_messages_per_conversation) || 0,
            resolutionRate: resolutionRate.toFixed(2),
            intentDistribution: intents.rows.map(row => ({
                intent: row.intent,
                count: parseInt(row.count)
            }))
        };
    }

    /**
     * Get training data quality analysis
     */
    async getTrainingDataQuality() {
        // Check for intents with few examples
        const lowCoverage = await query(`
            SELECT
                metadata->>'intent' as intent,
                COUNT(DISTINCT content) as unique_examples
            FROM chatbot_messages
            WHERE is_bot = false
                AND metadata->>'intent' IS NOT NULL
                AND metadata->>'intent' != 'unknown'
            GROUP BY metadata->>'intent'
            HAVING COUNT(DISTINCT content) < 10
            ORDER BY unique_examples ASC
        `);

        // Check for intents with poor performance
        const poorPerformance = await query(`
            SELECT
                metadata->>'intent' as intent,
                AVG((metadata->>'confidence')::float)::numeric(5,3) as avg_confidence,
                COUNT(*) as message_count
            FROM chatbot_messages
            WHERE created_at >= NOW() - INTERVAL '30 days'
                AND is_bot = false
                AND metadata->>'intent' IS NOT NULL
                AND metadata->>'intent' != 'unknown'
            GROUP BY metadata->>'intent'
            HAVING AVG((metadata->>'confidence')::float) < 0.65
            ORDER BY avg_confidence ASC
        `);

        return {
            lowCoverageIntents: lowCoverage.rows.map(row => ({
                intent: row.intent,
                uniqueExamples: parseInt(row.unique_examples),
                recommendation: `Add more training examples (currently ${row.unique_examples}, recommended: 20+)`
            })),
            poorPerformingIntents: poorPerformance.rows.map(row => ({
                intent: row.intent,
                avgConfidence: parseFloat(row.avg_confidence),
                messageCount: parseInt(row.message_count),
                recommendation: 'Review and improve training data quality'
            }))
        };
    }

    /**
     * Get suggested new intents
     */
    async getSuggestedIntents(options = {}) {
        const { period = 30, minFrequency = 5 } = options;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);

        // Cluster similar unhandled queries
        const result = await query(`
            WITH unhandled_queries AS (
                SELECT
                    content,
                    COUNT(*) as frequency
                FROM chatbot_messages
                WHERE created_at >= $1
                    AND is_bot = false
                    AND (metadata->>'intent' = 'unknown' OR metadata->>'intent' IS NULL)
                GROUP BY content
                HAVING COUNT(*) >= $2
            )
            SELECT
                content,
                frequency
            FROM unhandled_queries
            ORDER BY frequency DESC
            LIMIT 20
        `, [cutoffDate, minFrequency]);

        return result.rows.map(row => ({
            suggestedQuery: row.content,
            frequency: parseInt(row.frequency),
            suggestedIntentName: this.generateIntentName(row.content),
            priority: parseInt(row.frequency) >= 10 ? 'high' : 'medium'
        }));
    }

    /**
     * Generate intent name from query
     */
    generateIntentName(query) {
        // Simple heuristic to suggest intent name
        const lowerQuery = query.toLowerCase();

        if (lowerQuery.includes('password') || lowerQuery.includes('login')) {
            return 'account_access';
        }
        if (lowerQuery.includes('payment') || lowerQuery.includes('billing')) {
            return 'billing_inquiry';
        }
        if (lowerQuery.includes('how to') || lowerQuery.includes('how do')) {
            return 'how_to_guide';
        }
        if (lowerQuery.includes('error') || lowerQuery.includes('not working')) {
            return 'technical_issue';
        }
        if (lowerQuery.includes('refund') || lowerQuery.includes('cancel')) {
            return 'refund_request';
        }

        return 'general_inquiry';
    }

    /**
     * Get dashboard summary
     */
    async getDashboardSummary(period = 30) {
        const [
            unresolvedConvs,
            intentAnalysis,
            unhandledQueries,
            effectiveness,
            trainingQuality,
            suggestedIntents
        ] = await Promise.all([
            this.getUnresolvedConversations({ period, limit: 10 }),
            this.getIntentAnalysis({ period }),
            this.getUnhandledQueries({ period, limit: 10 }),
            this.getEffectivenessMetrics(period),
            this.getTrainingDataQuality(),
            this.getSuggestedIntents({ period })
        ]);

        return {
            overview: {
                resolutionRate: parseFloat(effectiveness.resolutionRate),
                totalConversations: effectiveness.totalConversations,
                unresolvedCount: unresolvedConvs.length,
                lowConfidenceIntents: intentAnalysis.filter(i => i.needsTraining).length
            },
            unresolvedConversations: unresolvedConvs.slice(0, 5),
            intentHealth: intentAnalysis,
            topUnhandledQueries: unhandledQueries.slice(0, 10),
            trainingRecommendations: {
                lowCoverage: trainingQuality.lowCoverageIntents.length,
                poorPerformance: trainingQuality.poorPerformingIntents.length,
                suggestedNewIntents: suggestedIntents.length
            },
            actionItems: this.generateActionItems(
                unresolvedConvs,
                intentAnalysis,
                trainingQuality,
                suggestedIntents
            )
        };
    }

    /**
     * Generate actionable recommendations
     */
    generateActionItems(unresolved, intents, quality, suggested) {
        const items = [];

        if (unresolved.length > 10) {
            items.push({
                priority: 'high',
                category: 'conversations',
                message: `${unresolved.length} unresolved conversations need review`,
                action: 'Review conversations and add training data'
            });
        }

        const lowConfidence = intents.filter(i => i.needsTraining);
        if (lowConfidence.length > 0) {
            items.push({
                priority: 'medium',
                category: 'training',
                message: `${lowConfidence.length} intents have low confidence scores`,
                action: 'Improve training data for these intents'
            });
        }

        if (quality.lowCoverageIntents.length > 0) {
            items.push({
                priority: 'medium',
                category: 'coverage',
                message: `${quality.lowCoverageIntents.length} intents have insufficient training examples`,
                action: 'Add more diverse training examples'
            });
        }

        if (suggested.length >= 3) {
            items.push({
                priority: 'high',
                category: 'new_intents',
                message: `${suggested.length} potential new intents identified`,
                action: 'Review and create new intent categories'
            });
        }

        return items;
    }

    /**
     * Export training data for an intent
     */
    async exportIntentTrainingData(intent) {
        const result = await query(`
            SELECT
                content,
                metadata->>'confidence' as confidence,
                created_at
            FROM chatbot_messages
            WHERE is_bot = false
                AND metadata->>'intent' = $1
            ORDER BY created_at DESC
            LIMIT 1000
        `, [intent]);

        return result.rows.map(row => ({
            text: row.content,
            confidence: row.confidence ? parseFloat(row.confidence) : null,
            timestamp: row.created_at
        }));
    }
}

// Export singleton instance
module.exports = new ChatbotAnalyticsService();
