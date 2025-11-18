-- Migration: Create polls tables
-- Description: Add support for polls/surveys in chats

-- Create polls table
CREATE TABLE IF NOT EXISTS polls (
    id SERIAL PRIMARY KEY,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL, -- [{"text": "Option 1", "votes": 0}, {"text": "Option 2", "votes": 0}]
    multiple_choice BOOLEAN DEFAULT false,
    anonymous BOOLEAN DEFAULT false,
    closed BOOLEAN DEFAULT false,
    closes_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create poll_votes table
CREATE TABLE IF NOT EXISTS poll_votes (
    id SERIAL PRIMARY KEY,
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_indices INTEGER[] NOT NULL, -- Array of selected option indices (for multiple choice)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(poll_id, user_id) -- One vote per user per poll
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_polls_message_id ON polls(message_id);
CREATE INDEX IF NOT EXISTS idx_polls_chat_id ON polls(chat_id);
CREATE INDEX IF NOT EXISTS idx_polls_created_by ON polls(created_by);
CREATE INDEX IF NOT EXISTS idx_polls_closed ON polls(closed);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON poll_votes(user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_poll_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poll_updated_at_trigger
    BEFORE UPDATE ON polls
    FOR EACH ROW
    EXECUTE FUNCTION update_poll_updated_at();

-- Comments
COMMENT ON TABLE polls IS 'Polls/surveys in chats - can be created by admins and department heads (ROP)';
COMMENT ON TABLE poll_votes IS 'User votes for polls';
COMMENT ON COLUMN polls.options IS 'JSON array of poll options with vote counts';
COMMENT ON COLUMN polls.multiple_choice IS 'Allow multiple selections';
COMMENT ON COLUMN polls.anonymous IS 'Hide who voted for what';
COMMENT ON COLUMN poll_votes.option_indices IS 'Array of selected option indices (0-based)';
