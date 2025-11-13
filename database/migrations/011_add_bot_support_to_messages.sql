-- Add bot support to messages table

-- Add columns for bot messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS is_bot_message BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bot_id INTEGER REFERENCES bots(id) ON DELETE SET NULL;

-- Create index for bot messages
CREATE INDEX IF NOT EXISTS idx_messages_bot_id ON messages(bot_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_bot_message ON messages(is_bot_message);

-- Update constraint: either user_id or bot_id must be set
-- (We'll handle this in application logic)

COMMENT ON COLUMN messages.is_bot_message IS 'True if message was sent by a bot';
COMMENT ON COLUMN messages.bot_id IS 'ID of bot that sent this message (if applicable)';
