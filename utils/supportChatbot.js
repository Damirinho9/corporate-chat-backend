// ==================== AI SUPPORT CHATBOT ====================
// Intelligent chatbot for automated customer support
const { query } = require('../config/database');
const { createLogger } = require('./logger');

const logger = createLogger('support-chatbot');

class SupportChatbot {
    constructor() {
        // Intent patterns (расширяемая база паттернов)
        this.intentPatterns = {
            greeting: {
                patterns: [
                    /привет/i, /здравствуй/i, /добрый\s+(день|вечер|утро)/i,
                    /hi/i, /hello/i, /hey/i
                ],
                responses: [
                    'Здравствуйте! Я виртуальный помощник поддержки. Чем могу помочь?',
                    'Привет! Рад помочь вам. Опишите вашу проблему.',
                    'Добрый день! Задайте ваш вопрос, и я постараюсь помочь.'
                ]
            },

            password_reset: {
                patterns: [
                    /забыл.*(пароль|password)/i,
                    /сброс.*пароль/i,
                    /восстан.*пароль/i,
                    /password.*reset/i,
                    /forgot.*password/i
                ],
                responses: [
                    'Для сброса пароля:\n1. Перейдите на страницу входа\n2. Нажмите "Забыли пароль?"\n3. Введите вашу почту\n4. Следуйте инструкциям в письме\n\nЕсли не получается, создам тикет для поддержки.'
                ],
                kb_article_slug: 'password-reset-guide'
            },

            login_problem: {
                patterns: [
                    /не могу войти/i,
                    /cannot login/i,
                    /ошибка.*вход/i,
                    /login.*error/i,
                    /не работает.*вход/i
                ],
                responses: [
                    'Проблемы со входом могут быть вызваны:\n1. Неверный пароль - попробуйте сбросить\n2. Заблокированный аккаунт - обратитесь к админу\n3. Проблемы с браузером - очистите кэш\n\nЧто именно происходит при попытке входа?'
                ]
            },

            file_upload: {
                patterns: [
                    /не могу.*загрузить.*файл/i,
                    /ошибка.*загрузк/i,
                    /cannot.*upload/i,
                    /file.*upload.*error/i
                ],
                responses: [
                    'Проблемы с загрузкой файлов:\n1. Проверьте размер (макс 10 МБ)\n2. Убедитесь в поддерживаемом формате\n3. Проверьте интернет-соединение\n\nКакой размер файла и формат?'
                ]
            },

            slow_performance: {
                patterns: [
                    /медленн/i,
                    /тормоз/i,
                    /долго.*загруж/i,
                    /slow/i,
                    /lag/i
                ],
                responses: [
                    'Если система работает медленно:\n1. Очистите кэш браузера (Ctrl+Shift+Del)\n2. Закройте лишние вкладки\n3. Попробуйте другой браузер\n4. Проверьте интернет-соединение\n\nЭто помогло?'
                ]
            },

            bug_report: {
                patterns: [
                    /ошибка/i,
                    /баг/i,
                    /не работает/i,
                    /bug/i,
                    /error/i,
                    /broken/i
                ],
                responses: [
                    'Опишите подробнее проблему:\n1. Что вы делали перед ошибкой?\n2. Какое сообщение об ошибке появилось?\n3. В каком разделе это произошло?\n\nЭто поможет быстрее решить проблему.'
                ],
                create_ticket: true,
                ticket_category: 'bug'
            },

            feature_request: {
                patterns: [
                    /хочу.*функци/i,
                    /добавьте/i,
                    /можно.*сделать/i,
                    /feature.*request/i,
                    /can you add/i
                ],
                responses: [
                    'Спасибо за предложение! Создам заявку на новую функцию.\n\nОпишите подробнее:\n1. Какая функция нужна?\n2. Зачем она нужна?\n3. Как это должно работать?'
                ],
                create_ticket: true,
                ticket_category: 'feature_request'
            },

            billing: {
                patterns: [
                    /оплата/i,
                    /счет/i,
                    /подписк/i,
                    /payment/i,
                    /billing/i,
                    /invoice/i
                ],
                responses: [
                    'Вопросы по оплате я перенаправлю специалисту.\n\nПожалуйста, уточните:\n1. Вопрос по текущему счету?\n2. Проблема с оплатой?\n3. Смена тарифа?'
                ],
                create_ticket: true,
                ticket_category: 'billing',
                escalate: true
            },

            request_human: {
                patterns: [
                    /хочу.*человек/i,
                    /оператор/i,
                    /живой.*сотрудник/i,
                    /talk.*human/i,
                    /real.*person/i,
                    /agent/i
                ],
                responses: [
                    'Конечно, сейчас создам тикет и переведу вас на оператора.\n\nОпишите кратко суть проблемы, чтобы оператор сразу мог помочь.'
                ],
                create_ticket: true,
                escalate: true
            },

            thanks: {
                patterns: [
                    /спасибо/i,
                    /thanks/i,
                    /thank you/i,
                    /благодар/i
                ],
                responses: [
                    'Рад был помочь! Обращайтесь, если появятся вопросы.',
                    'Всегда пожалуйста! Хорошего дня!',
                    'С удовольствием помог! Если что - я здесь.'
                ]
            },

            goodbye: {
                patterns: [
                    /пока/i,
                    /до свидания/i,
                    /bye/i,
                    /goodbye/i
                ],
                responses: [
                    'До свидания! Обращайтесь, если понадобится помощь.',
                    'Пока! Удачи!',
                    'Всего доброго!'
                ]
            }
        };
    }

    /**
     * Analyze user message and detect intent
     */
    async analyzeIntent(message) {
        const normalizedMessage = message.toLowerCase().trim();

        for (const [intent, config] of Object.entries(this.intentPatterns)) {
            for (const pattern of config.patterns) {
                if (pattern.test(normalizedMessage)) {
                    logger.info('Intent detected', { intent, message: message.substring(0, 50) });

                    return {
                        intent,
                        confidence: this.calculateConfidence(normalizedMessage, pattern),
                        config
                    };
                }
            }
        }

        return {
            intent: 'unknown',
            confidence: 0.0,
            config: null
        };
    }

    /**
     * Calculate confidence score (0.0 - 1.0)
     */
    calculateConfidence(message, pattern) {
        // Simple confidence calculation
        // In production, use ML model or more sophisticated NLP

        const match = message.match(pattern);
        if (!match) return 0.0;

        // Longer match = higher confidence
        const matchLength = match[0].length;
        const messageLength = message.length;

        const baseConfidence = Math.min(matchLength / messageLength, 1.0);

        // Exact word match boosts confidence
        const exactWordBoost = /\b/.test(pattern.source) ? 0.2 : 0;

        return Math.min(baseConfidence + exactWordBoost, 1.0);
    }

    /**
     * Generate response based on intent
     */
    async generateResponse(intent, config, conversationContext = {}) {
        if (!config || !config.responses) {
            return {
                message: 'Извините, не совсем понял ваш вопрос. Можете переформулировать или создать тикет для живого оператора?',
                suggestions: [
                    'Связаться с оператором',
                    'Посмотреть базу знаний',
                    'Часто задаваемые вопросы'
                ]
            };
        }

        // Random response from available options
        const response = config.responses[Math.floor(Math.random() * config.responses.length)];

        // Get related KB article if exists
        let kbArticle = null;
        if (config.kb_article_slug) {
            const articleResult = await query(
                `SELECT id, title, slug, summary
                 FROM kb_articles
                 WHERE slug = $1 AND status = 'published'`,
                [config.kb_article_slug]
            );

            if (articleResult.rows.length > 0) {
                kbArticle = articleResult.rows[0];
            }
        }

        // Build suggestions
        const suggestions = [];

        if (kbArticle) {
            suggestions.push(`📖 Читать: ${kbArticle.title}`);
        }

        if (config.create_ticket) {
            suggestions.push('✅ Создать тикет');
        }

        if (config.escalate) {
            suggestions.push('👤 Связаться с оператором');
        }

        return {
            message: response,
            suggestions,
            kb_article: kbArticle,
            should_create_ticket: config.create_ticket || false,
            should_escalate: config.escalate || false,
            ticket_category: config.ticket_category || 'other'
        };
    }

    /**
     * Process user message and generate chatbot response
     */
    async processMessage(userId, sessionId, message) {
        try {
            // Get or create conversation
            let conversation = await this.getConversation(sessionId);

            if (!conversation) {
                conversation = await this.createConversation(userId, sessionId);
            }

            // Save user message
            await this.saveMessage(conversation.id, false, message);

            // Analyze intent
            const { intent, confidence, config } = await this.analyzeIntent(message);

            // Update conversation with detected intent
            await query(
                `UPDATE chatbot_conversations
                 SET intent = $1, confidence_score = $2, last_message_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [intent, confidence, conversation.id]
            );

            // Generate response
            const botResponse = await this.generateResponse(intent, config, conversation);

            // Save bot message
            await this.saveMessage(
                conversation.id,
                true,
                botResponse.message,
                intent,
                confidence,
                botResponse.kb_article?.id
            );

            logger.info('Chatbot response generated', {
                userId,
                sessionId,
                intent,
                confidence
            });

            return {
                ...botResponse,
                intent,
                confidence,
                conversation_id: conversation.id
            };

        } catch (error) {
            logger.error('Failed to process chatbot message', {
                error: error.message,
                userId,
                sessionId
            });

            return {
                message: 'Извините, произошла ошибка. Попробуйте еще раз или создайте тикет.',
                suggestions: ['Создать тикет', 'Попробовать снова']
            };
        }
    }

    /**
     * Get existing conversation by session ID
     */
    async getConversation(sessionId) {
        const result = await query(
            'SELECT * FROM chatbot_conversations WHERE session_id = $1',
            [sessionId]
        );

        return result.rows.length > 0 ? result.rows[0] : null;
    }

    /**
     * Create new conversation
     */
    async createConversation(userId, sessionId, userAgent = null, ipAddress = null) {
        const result = await query(
            `INSERT INTO chatbot_conversations
            (user_id, session_id, user_agent, ip_address, status)
            VALUES ($1, $2, $3, $4, 'active')
            RETURNING *`,
            [userId, sessionId, userAgent, ipAddress]
        );

        return result.rows[0];
    }

    /**
     * Save message to conversation
     */
    async saveMessage(conversationId, isBot, message, intent = null, confidence = null, kbArticleId = null) {
        await query(
            `INSERT INTO chatbot_messages
            (conversation_id, is_bot, message, intent, confidence, matched_kb_article_id)
            VALUES ($1, $2, $3, $4, $5, $6)`,
            [conversationId, isBot, message, intent, confidence, kbArticleId]
        );
    }

    /**
     * Escalate conversation to human agent (create ticket)
     */
    async escalateToHuman(conversationId, userId) {
        try {
            // Get conversation history
            const messagesResult = await query(
                `SELECT * FROM chatbot_messages
                 WHERE conversation_id = $1
                 ORDER BY created_at ASC`,
                [conversationId]
            );

            const messages = messagesResult.rows;

            // Build description from conversation
            let description = 'Эскалация из чат-бота\n\n';
            description += '--- История диалога ---\n\n';

            for (const msg of messages) {
                const prefix = msg.is_bot ? '🤖 Бот:' : '👤 Пользователь:';
                description += `${prefix} ${msg.message}\n\n`;
            }

            // Get user info
            const userResult = await query(
                'SELECT name, email FROM users WHERE id = $1',
                [userId]
            );

            const user = userResult.rows[0];

            // Create ticket
            const ticketResult = await query(
                `INSERT INTO support_tickets
                (user_id, customer_name, customer_email, subject, description,
                 category, priority, status, channel)
                VALUES ($1, $2, $3, $4, $5, 'other', 'normal', 'new', 'bot')
                RETURNING *`,
                [userId, user.name, user.email,
                 'Запрос помощи от пользователя',
                 description]
            );

            const ticket = ticketResult.rows[0];

            // Update conversation
            await query(
                `UPDATE chatbot_conversations
                 SET status = 'escalated_to_human',
                     escalated_to_ticket_id = $1,
                     ended_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [ticket.id, conversationId]
            );

            logger.info('Chatbot conversation escalated to ticket', {
                conversationId,
                ticketId: ticket.id,
                ticketNumber: ticket.ticket_number
            });

            return ticket;

        } catch (error) {
            logger.error('Failed to escalate conversation', {
                error: error.message,
                conversationId
            });
            throw error;
        }
    }

    /**
     * Search knowledge base for relevant articles
     */
    async searchKnowledgeBase(query_text, limit = 5) {
        try {
            const result = await query(
                `SELECT id, title, slug, summary, view_count, helpful_count
                 FROM kb_articles
                 WHERE status = 'published'
                   AND (title ILIKE $1 OR content ILIKE $1 OR summary ILIKE $1)
                 ORDER BY
                   helpful_count DESC,
                   view_count DESC
                 LIMIT $2`,
                [`%${query_text}%`, limit]
            );

            return result.rows;

        } catch (error) {
            logger.error('Failed to search knowledge base', {
                error: error.message,
                query: query_text
            });
            return [];
        }
    }

    /**
     * Get chatbot analytics
     */
    async getAnalytics(daysAgo = 7) {
        try {
            const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

            const result = await query(
                `SELECT
                    COUNT(*) as total_conversations,
                    COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_by_bot,
                    COUNT(CASE WHEN status = 'escalated_to_human' THEN 1 END) as escalated,
                    AVG(confidence_score) as avg_confidence,
                    intent,
                    COUNT(*) as intent_count
                 FROM chatbot_conversations
                 WHERE started_at >= $1
                 GROUP BY intent`,
                [startDate]
            );

            return result.rows;

        } catch (error) {
            logger.error('Failed to get chatbot analytics', { error: error.message });
            return [];
        }
    }
}

module.exports = new SupportChatbot();
