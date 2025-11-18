-- ==================== SUPPORT SYSTEM MIGRATION ====================
-- Version: 016
-- Description: Comprehensive support system with tickets, knowledge base, AI chatbot
-- Author: Claude
-- Date: 2025-11-18

-- ==================== SUPPORT TICKETS ====================

-- Support tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    ticket_number VARCHAR(50) UNIQUE NOT NULL, -- Format: TICK-2025-00001

    -- Customer info
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),

    -- Ticket details
    subject VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100), -- technical, billing, feature_request, bug, other
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'critical')),
    status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'open', 'pending', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'escalated')),

    -- Assignment
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP,
    team_id INTEGER, -- support team assignment

    -- SLA tracking
    sla_due_date TIMESTAMP,
    first_response_at TIMESTAMP,
    first_response_time INTEGER, -- minutes
    resolution_time INTEGER, -- minutes
    breached_sla BOOLEAN DEFAULT FALSE,

    -- Channel
    channel VARCHAR(50) DEFAULT 'chat', -- chat, email, bot, phone, webhook
    source_url TEXT,

    -- Rating
    customer_rating INTEGER CHECK (customer_rating >= 1 AND customer_rating <= 5),
    customer_feedback TEXT,
    rated_at TIMESTAMP,

    -- Metadata
    tags VARCHAR(100)[],
    custom_fields JSONB,
    internal_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP,

    -- Relations
    parent_ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE SET NULL, -- for split tickets
    merged_into_ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE SET NULL
);

-- Ticket messages (conversation thread)
CREATE TABLE IF NOT EXISTS ticket_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,

    -- Author
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author_name VARCHAR(255),
    author_email VARCHAR(255),
    is_customer BOOLEAN DEFAULT FALSE,
    is_internal BOOLEAN DEFAULT FALSE, -- internal notes, not visible to customer

    -- Message content
    message_type VARCHAR(50) DEFAULT 'text', -- text, file, status_change, assignment, note
    content TEXT NOT NULL,

    -- Attachments
    attachments JSONB, -- array of {filename, url, size, type}

    -- AI metadata
    generated_by_ai BOOLEAN DEFAULT FALSE,
    ai_confidence DECIMAL(3,2),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP
);

-- Ticket status history
CREATE TABLE IF NOT EXISTS ticket_status_history (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,

    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,

    reason TEXT,
    duration_in_status INTEGER, -- minutes spent in previous status

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== KNOWLEDGE BASE ====================

-- Knowledge base articles
CREATE TABLE IF NOT EXISTS kb_articles (
    id SERIAL PRIMARY KEY,

    -- Article info
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,

    -- Organization
    category_id INTEGER REFERENCES kb_categories(id) ON DELETE SET NULL,
    tags VARCHAR(100)[],

    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    is_featured BOOLEAN DEFAULT FALSE,

    -- Author
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Stats
    view_count INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,

    -- SEO
    meta_description TEXT,
    keywords VARCHAR(100)[],

    -- Versioning
    version INTEGER DEFAULT 1,
    previous_version_id INTEGER REFERENCES kb_articles(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP
);

-- KB categories
CREATE TABLE IF NOT EXISTS kb_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    parent_id INTEGER REFERENCES kb_categories(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    is_visible BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Article feedback
CREATE TABLE IF NOT EXISTS kb_article_feedback (
    id SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,

    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_helpful BOOLEAN NOT NULL,
    feedback_text TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== AI CHATBOT ====================

-- Chatbot conversations
CREATE TABLE IF NOT EXISTS chatbot_conversations (
    id SERIAL PRIMARY KEY,

    -- User
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255) UNIQUE NOT NULL,

    -- Conversation state
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'escalated_to_human', 'abandoned')),
    intent VARCHAR(100), -- greeting, question, complaint, request_human, etc.
    confidence_score DECIMAL(3,2),

    -- Resolution
    resolved_by_bot BOOLEAN DEFAULT FALSE,
    escalated_to_ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE SET NULL,

    -- Metadata
    user_agent TEXT,
    ip_address VARCHAR(45),
    language VARCHAR(10) DEFAULT 'ru',

    -- Timestamps
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

-- Chatbot messages
CREATE TABLE IF NOT EXISTS chatbot_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,

    -- Message
    is_bot BOOLEAN NOT NULL,
    message TEXT NOT NULL,

    -- AI metadata (for bot messages)
    intent VARCHAR(100),
    confidence DECIMAL(3,2),
    matched_kb_article_id INTEGER REFERENCES kb_articles(id) ON DELETE SET NULL,
    suggested_responses JSONB, -- array of quick replies

    -- User feedback (for bot messages)
    was_helpful BOOLEAN,
    feedback_text TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chatbot training data
CREATE TABLE IF NOT EXISTS chatbot_training_data (
    id SERIAL PRIMARY KEY,

    -- Training example
    intent VARCHAR(100) NOT NULL,
    user_message TEXT NOT NULL,
    bot_response TEXT NOT NULL,

    -- Source
    source VARCHAR(50), -- manual, from_conversation, from_ticket
    source_id INTEGER,

    -- Quality
    is_approved BOOLEAN DEFAULT FALSE,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Metadata
    language VARCHAR(10) DEFAULT 'ru',
    tags VARCHAR(100)[],

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== SUPPORT TEAMS ====================

-- Support teams
CREATE TABLE IF NOT EXISTS support_teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Team settings
    email VARCHAR(255),
    max_concurrent_tickets INTEGER DEFAULT 10,
    working_hours JSONB, -- {monday: {start: "09:00", end: "18:00"}, ...}
    timezone VARCHAR(50) DEFAULT 'Europe/Moscow',

    -- SLA
    sla_first_response_minutes INTEGER DEFAULT 60, -- 1 hour
    sla_resolution_hours INTEGER DEFAULT 24,

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team members
CREATE TABLE IF NOT EXISTS support_team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES support_teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    role VARCHAR(50) DEFAULT 'agent', -- agent, team_lead, manager
    is_active BOOLEAN DEFAULT TRUE,

    -- Capacity
    max_concurrent_tickets INTEGER DEFAULT 5,
    current_ticket_count INTEGER DEFAULT 0,

    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(team_id, user_id)
);

-- ==================== CANNED RESPONSES ====================

-- Pre-written responses for common questions
CREATE TABLE IF NOT EXISTS canned_responses (
    id SERIAL PRIMARY KEY,

    title VARCHAR(255) NOT NULL,
    shortcut VARCHAR(50) UNIQUE, -- e.g., "/greeting", "/status"
    content TEXT NOT NULL,

    -- Organization
    category VARCHAR(100),
    tags VARCHAR(100)[],

    -- Access control
    is_public BOOLEAN DEFAULT TRUE, -- available to all agents
    team_id INTEGER REFERENCES support_teams(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Stats
    usage_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== CUSTOMER SATISFACTION ====================

-- CSAT surveys
CREATE TABLE IF NOT EXISTS csat_surveys (
    id SERIAL PRIMARY KEY,

    ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Rating
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),

    -- Feedback
    what_went_well TEXT,
    what_to_improve TEXT,

    -- Metadata
    sent_at TIMESTAMP,
    responded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== SLA POLICIES ====================

-- SLA policies
CREATE TABLE IF NOT EXISTS sla_policies (
    id SERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Conditions (JSON rules engine)
    conditions JSONB, -- {priority: 'high', category: 'technical', ...}

    -- Targets (in minutes)
    first_response_target INTEGER NOT NULL, -- minutes
    resolution_target INTEGER NOT NULL, -- minutes

    -- Business hours
    apply_business_hours BOOLEAN DEFAULT TRUE,

    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0, -- higher priority = checked first

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== AUTOMATION RULES ====================

-- Automation rules (auto-assignment, auto-responses, escalations)
CREATE TABLE IF NOT EXISTS support_automation_rules (
    id SERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Trigger
    trigger_event VARCHAR(50) NOT NULL, -- ticket_created, ticket_updated, sla_breached, etc.
    conditions JSONB, -- when to execute

    -- Actions
    actions JSONB NOT NULL, -- [{type: 'assign', to_team: 1}, {type: 'add_tag', tag: 'urgent'}]

    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,

    -- Stats
    execution_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== INDEXES ====================

-- Support tickets indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_number ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_due ON support_tickets(sla_due_date);

-- Ticket messages indexes
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created ON ticket_messages(created_at DESC);

-- KB articles indexes
CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON kb_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_kb_articles_status ON kb_articles(status);
CREATE INDEX IF NOT EXISTS idx_kb_articles_slug ON kb_articles(slug);
CREATE INDEX IF NOT EXISTS idx_kb_articles_created ON kb_articles(created_at DESC);

-- Chatbot indexes
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_session ON chatbot_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_user ON chatbot_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_msg_conv ON chatbot_messages(conversation_id);

-- Teams indexes
CREATE INDEX IF NOT EXISTS idx_support_team_members_team ON support_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_support_team_members_user ON support_team_members(user_id);

-- ==================== FUNCTIONS ====================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_support_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS support_tickets_updated_at ON support_tickets;
CREATE TRIGGER support_tickets_updated_at
    BEFORE UPDATE ON support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_support_updated_at();

DROP TRIGGER IF EXISTS kb_articles_updated_at ON kb_articles;
CREATE TRIGGER kb_articles_updated_at
    BEFORE UPDATE ON kb_articles
    FOR EACH ROW
    EXECUTE FUNCTION update_support_updated_at();

-- Generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_number IS NULL THEN
        NEW.ticket_number := 'TICK-' ||
                            TO_CHAR(CURRENT_DATE, 'YYYY') || '-' ||
                            LPAD(NEXTVAL('support_tickets_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_tickets_generate_number ON support_tickets;
CREATE TRIGGER support_tickets_generate_number
    BEFORE INSERT ON support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION generate_ticket_number();

-- ==================== INITIAL DATA ====================

-- Default support team
INSERT INTO support_teams (name, description, email, sla_first_response_minutes, sla_resolution_hours)
VALUES ('General Support', 'Default support team for all tickets', 'support@corporate.com', 30, 24)
ON CONFLICT DO NOTHING;

-- Default KB categories
INSERT INTO kb_categories (name, slug, description, icon, sort_order)
VALUES
    ('Getting Started', 'getting-started', 'Основы работы с системой', '🚀', 1),
    ('Account & Settings', 'account-settings', 'Управление аккаунтом и настройками', '⚙️', 2),
    ('Troubleshooting', 'troubleshooting', 'Решение проблем', '🔧', 3),
    ('FAQ', 'faq', 'Часто задаваемые вопросы', '❓', 4)
ON CONFLICT DO NOTHING;

-- Default SLA policy
INSERT INTO sla_policies (name, description, first_response_target, resolution_target)
VALUES ('Standard SLA', 'Default SLA for all tickets', 60, 1440) -- 1 hour, 24 hours
ON CONFLICT DO NOTHING;

-- Sample canned responses
INSERT INTO canned_responses (title, shortcut, content, category)
VALUES
    ('Welcome', '/welcome', 'Здравствуйте! Спасибо что обратились в нашу поддержку. Чем могу помочь?', 'greeting'),
    ('Ticket Created', '/created', 'Ваш запрос зарегистрирован. Номер тикета: {{ticket_number}}. Мы ответим в течение {{sla_time}}.', 'status'),
    ('Issue Resolved', '/resolved', 'Ваша проблема решена. Пожалуйста, оцените качество поддержки.', 'closing')
ON CONFLICT DO NOTHING;

-- ==================== GRANTS ====================

-- Grant permissions (adjust based on your user roles)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO corporate_chat_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO corporate_chat_user;
