-- ================================================
-- VIDEO/AUDIO CALLS TABLES
-- ================================================

-- Таблица для звонков
CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    room_name VARCHAR(255) NOT NULL UNIQUE,
    call_type VARCHAR(20) NOT NULL CHECK (call_type IN ('audio', 'video', 'screen')),
    call_mode VARCHAR(20) NOT NULL CHECK (call_mode IN ('direct', 'group')),
    initiated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ongoing', 'ended', 'missed', 'declined')),
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration INTEGER, -- в секундах
    recording_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица для участников звонка
CREATE TABLE IF NOT EXISTS call_participants (
    id SERIAL PRIMARY KEY,
    call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP,
    left_at TIMESTAMP,
    duration INTEGER, -- время участия в секундах
    status VARCHAR(20) DEFAULT 'invited' CHECK (status IN ('invited', 'ringing', 'joined', 'left', 'declined', 'missed')),
    is_moderator BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(call_id, user_id)
);

-- Таблица для событий звонка (для аудита)
CREATE TABLE IF NOT EXISTS call_events (
    id SERIAL PRIMARY KEY,
    call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- 'started', 'joined', 'left', 'ended', 'recording_started', etc.
    event_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_calls_room_name ON calls(room_name);
CREATE INDEX IF NOT EXISTS idx_calls_initiated_by ON calls(initiated_by);
CREATE INDEX IF NOT EXISTS idx_calls_chat_id ON calls(chat_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_participants_call_id ON call_participants(call_id);
CREATE INDEX IF NOT EXISTS idx_call_participants_user_id ON call_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_call_participants_status ON call_participants(status);

CREATE INDEX IF NOT EXISTS idx_call_events_call_id ON call_events(call_id);
CREATE INDEX IF NOT EXISTS idx_call_events_created_at ON call_events(created_at DESC);

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION update_calls_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_calls_updated_at
    BEFORE UPDATE ON calls
    FOR EACH ROW
    EXECUTE FUNCTION update_calls_updated_at();

-- Функция для автоматического расчета длительности звонка
CREATE OR REPLACE FUNCTION calculate_call_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_call_duration
    BEFORE UPDATE ON calls
    FOR EACH ROW
    WHEN (OLD.ended_at IS DISTINCT FROM NEW.ended_at)
    EXECUTE FUNCTION calculate_call_duration();

-- Функция для автоматического расчета длительности участия
CREATE OR REPLACE FUNCTION calculate_participant_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.left_at IS NOT NULL AND NEW.joined_at IS NOT NULL THEN
        NEW.duration = EXTRACT(EPOCH FROM (NEW.left_at - NEW.joined_at))::INTEGER;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_participant_duration
    BEFORE UPDATE ON call_participants
    FOR EACH ROW
    WHEN (OLD.left_at IS DISTINCT FROM NEW.left_at)
    EXECUTE FUNCTION calculate_participant_duration();

-- Комментарии
COMMENT ON TABLE calls IS 'Хранит информацию о видео/аудио звонках';
COMMENT ON TABLE call_participants IS 'Участники звонков и их статусы';
COMMENT ON TABLE call_events IS 'Лог событий звонков для аудита';

COMMENT ON COLUMN calls.room_name IS 'Уникальное имя комнаты для Jitsi Meet';
COMMENT ON COLUMN calls.call_type IS 'Тип звонка: audio, video, screen';
COMMENT ON COLUMN calls.call_mode IS 'Режим: direct (1-на-1) или group';
COMMENT ON COLUMN calls.status IS 'Статус звонка: pending, ongoing, ended, missed, declined';
COMMENT ON COLUMN calls.duration IS 'Длительность звонка в секундах';
