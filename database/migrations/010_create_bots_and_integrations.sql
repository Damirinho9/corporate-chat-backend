-- Migration: Create bots and integrations system
-- This enables bot creation, webhooks, and external integrations

-- ==================== BOTS TABLE ====================
CREATE TABLE IF NOT EXISTS bots (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    api_token VARCHAR(128) UNIQUE NOT NULL,
    avatar_url VARCHAR(512),
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bots_username ON bots(username);
CREATE INDEX idx_bots_api_token ON bots(api_token);
CREATE INDEX idx_bots_is_active ON bots(is_active);

COMMENT ON TABLE bots IS 'Bot accounts for automations and integrations';
COMMENT ON COLUMN bots.api_token IS 'Authentication token for bot API calls';

-- ==================== BOT PERMISSIONS ====================
CREATE TABLE IF NOT EXISTS bot_permissions (
    id SERIAL PRIMARY KEY,
    bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
    permission_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bot_id, permission_type, resource_type, resource_id)
);

CREATE INDEX idx_bot_permissions_bot_id ON bot_permissions(bot_id);

COMMENT ON TABLE bot_permissions IS 'Granular permissions for bots';
COMMENT ON COLUMN bot_permissions.permission_type IS 'e.g., read_messages, send_messages, manage_chats';
COMMENT ON COLUMN bot_permissions.resource_type IS 'e.g., chat, user, file';

-- ==================== WEBHOOKS ====================
CREATE TABLE IF NOT EXISTS webhooks (
    id SERIAL PRIMARY KEY,
    bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(512) NOT NULL,
    secret VARCHAR(128),
    events TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    headers JSONB DEFAULT '{}',
    retry_config JSONB DEFAULT '{"max_retries": 3, "retry_delay": 1000}',
    last_triggered_at TIMESTAMP,
    last_status VARCHAR(50),
    total_calls INTEGER DEFAULT 0,
    failed_calls INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhooks_bot_id ON webhooks(bot_id);
CREATE INDEX idx_webhooks_is_active ON webhooks(is_active);

COMMENT ON TABLE webhooks IS 'Webhook endpoints for external integrations';
COMMENT ON COLUMN webhooks.events IS 'Array of event types to trigger webhook';
COMMENT ON COLUMN webhooks.secret IS 'Secret for HMAC signature verification';

-- ==================== BOT COMMANDS ====================
CREATE TABLE IF NOT EXISTS bot_commands (
    id SERIAL PRIMARY KEY,
    bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
    command VARCHAR(100) NOT NULL,
    description TEXT,
    handler_type VARCHAR(50) NOT NULL DEFAULT 'webhook',
    handler_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bot_id, command)
);

CREATE INDEX idx_bot_commands_bot_id ON bot_commands(bot_id);
CREATE INDEX idx_bot_commands_command ON bot_commands(command);

COMMENT ON TABLE bot_commands IS 'Commands that bots can respond to';
COMMENT ON COLUMN bot_commands.handler_type IS 'webhook, internal, or custom';

-- ==================== INTEGRATIONS ====================
CREATE TABLE IF NOT EXISTS integrations (
    id SERIAL PRIMARY KEY,
    bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
    integration_type VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    config JSONB DEFAULT '{}',
    credentials JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP,
    sync_status VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_integrations_bot_id ON integrations(bot_id);
CREATE INDEX idx_integrations_type ON integrations(integration_type);
CREATE INDEX idx_integrations_is_active ON integrations(is_active);

COMMENT ON TABLE integrations IS 'External service integrations (calendar, CRM, tasks)';
COMMENT ON COLUMN integrations.integration_type IS 'calendar, jira, trello, crm, custom';
COMMENT ON COLUMN integrations.credentials IS 'Encrypted credentials for external services';

-- ==================== BOT MESSAGES ====================
CREATE TABLE IF NOT EXISTS bot_messages (
    id SERIAL PRIMARY KEY,
    bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
    chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    command VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bot_messages_bot_id ON bot_messages(bot_id);
CREATE INDEX idx_bot_messages_chat_id ON bot_messages(chat_id);
CREATE INDEX idx_bot_messages_message_id ON bot_messages(message_id);

COMMENT ON TABLE bot_messages IS 'History of messages sent by bots';

-- ==================== WEBHOOK LOGS ====================
CREATE TABLE IF NOT EXISTS webhook_logs (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB,
    request_headers JSONB,
    response_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
CREATE INDEX idx_webhook_logs_created_at ON webhook_logs(created_at);

COMMENT ON TABLE webhook_logs IS 'Audit log for webhook calls';

-- ==================== FUNCTIONS ====================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER trigger_bots_updated_at
    BEFORE UPDATE ON bots
    FOR EACH ROW
    EXECUTE FUNCTION update_bots_updated_at();

CREATE TRIGGER trigger_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_bots_updated_at();

CREATE TRIGGER trigger_bot_commands_updated_at
    BEFORE UPDATE ON bot_commands
    FOR EACH ROW
    EXECUTE FUNCTION update_bots_updated_at();

CREATE TRIGGER trigger_integrations_updated_at
    BEFORE UPDATE ON integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_bots_updated_at();
