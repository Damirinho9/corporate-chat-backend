-- Добавление invite_token для пригласительных ссылок на звонки
ALTER TABLE calls ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64) UNIQUE;

-- Индекс для быстрого поиска по invite_token
CREATE INDEX IF NOT EXISTS idx_calls_invite_token ON calls(invite_token);

-- Комментарий
COMMENT ON COLUMN calls.invite_token IS 'Unique token for invite links to join the call';
