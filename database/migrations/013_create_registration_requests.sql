-- ================================================
-- МИГРАЦИЯ: Таблица заявок на регистрацию
-- Создаёт таблицу registration_requests для хранения заявок пользователей
-- ================================================

-- Таблица заявок на регистрацию
CREATE TABLE IF NOT EXISTS registration_requests (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    generated_password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    department VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    approval_token VARCHAR(255) NOT NULL UNIQUE,
    rejection_reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    rejected_at TIMESTAMP
);

-- Индексы для ускорения выборок
CREATE INDEX IF NOT EXISTS idx_registration_requests_email ON registration_requests(email);
CREATE INDEX IF NOT EXISTS idx_registration_requests_status ON registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_registration_requests_approval_token ON registration_requests(approval_token);
CREATE INDEX IF NOT EXISTS idx_registration_requests_created_at ON registration_requests(created_at DESC);

-- Комментарии к таблице и полям
COMMENT ON TABLE registration_requests IS 'Заявки пользователей на регистрацию в системе';
COMMENT ON COLUMN registration_requests.email IS 'Email пользователя (используется как логин)';
COMMENT ON COLUMN registration_requests.full_name IS 'Полное имя пользователя';
COMMENT ON COLUMN registration_requests.username IS 'Автоматически сгенерированный username';
COMMENT ON COLUMN registration_requests.password_hash IS 'Хэш сгенерированного пароля';
COMMENT ON COLUMN registration_requests.generated_password IS 'Сгенерированный пароль (для отправки пользователю)';
COMMENT ON COLUMN registration_requests.role IS 'Запрошенная роль (assistant, rop, operator, employee)';
COMMENT ON COLUMN registration_requests.department IS 'Отдел (обязателен для rop, operator, employee)';
COMMENT ON COLUMN registration_requests.status IS 'Статус заявки (pending, approved, rejected)';
COMMENT ON COLUMN registration_requests.approval_token IS 'Токен для подтверждения заявки администратором';
COMMENT ON COLUMN registration_requests.rejection_reason IS 'Причина отклонения заявки';
