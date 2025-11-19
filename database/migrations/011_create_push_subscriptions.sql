-- Migration: Create push subscriptions table for Web Push notifications
-- Run: psql -U postgres -d corporate_chat -f database/migrations/011_create_push_subscriptions.sql

-- Table to store push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Comment
COMMENT ON TABLE push_subscriptions IS 'Stores Web Push notification subscriptions for users';

-- Allow multiple subscriptions per user (different devices)
-- but only one subscription per endpoint
