-- ================================================
-- МИГРАЦИЯ: Создание таблицы departments с FK
-- ================================================

-- 1. Создаем таблицу departments
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Заполняем departments из существующих данных
INSERT INTO departments (name)
SELECT DISTINCT department
FROM users
WHERE department IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- 3. Создаем таблицу для связи department -> chat
CREATE TABLE IF NOT EXISTS department_chats (
    department_id INTEGER PRIMARY KEY REFERENCES departments(id) ON DELETE CASCADE,
    chat_id INTEGER UNIQUE NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Заполняем department_chats из существующих данных
INSERT INTO department_chats (department_id, chat_id)
SELECT d.id, c.id
FROM departments d
JOIN chats c ON c.type = 'department' AND c.department = d.name
ON CONFLICT (department_id) DO NOTHING;

-- 5. Создаем функцию для синхронизации названий при переименовании отдела
CREATE OR REPLACE FUNCTION sync_department_name()
RETURNS TRIGGER AS $$
BEGIN
    -- При переименовании отдела обновляем:
    -- 1. department в users
    UPDATE users
    SET department = NEW.name
    WHERE department = OLD.name;

    -- 2. department и name в chats
    UPDATE chats
    SET department = NEW.name,
        name = NEW.name,
        updated_at = CURRENT_TIMESTAMP
    WHERE department = OLD.name AND type = 'department';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Создаем триггер на обновление departments
DROP TRIGGER IF EXISTS sync_department_name_trigger ON departments;
CREATE TRIGGER sync_department_name_trigger
    AFTER UPDATE OF name ON departments
    FOR EACH ROW
    WHEN (OLD.name IS DISTINCT FROM NEW.name)
    EXECUTE FUNCTION sync_department_name();

-- 7. Создаем функцию для синхронизации при переименовании чата отдела
CREATE OR REPLACE FUNCTION sync_department_chat_name()
RETURNS TRIGGER AS $$
DECLARE
    dept_name VARCHAR(100);
BEGIN
    -- Если это чат отдела и меняется название
    IF NEW.type = 'department' AND OLD.name IS DISTINCT FROM NEW.name THEN
        -- Обновляем название отдела
        UPDATE departments
        SET name = NEW.name,
            updated_at = CURRENT_TIMESTAMP
        WHERE name = OLD.department;

        -- Обновляем department в chats
        NEW.department := NEW.name;

        -- Обновляем department у всех пользователей
        UPDATE users
        SET department = NEW.name
        WHERE department = OLD.department;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Создаем триггер на обновление chats
DROP TRIGGER IF EXISTS sync_department_chat_name_trigger ON chats;
CREATE TRIGGER sync_department_chat_name_trigger
    BEFORE UPDATE OF name ON chats
    FOR EACH ROW
    WHEN (OLD.name IS DISTINCT FROM NEW.name)
    EXECUTE FUNCTION sync_department_chat_name();

-- 9. Синхронизируем существующие данные
-- Обновляем названия чатов отделов чтобы они совпадали с названиями отделов
UPDATE chats c
SET name = d.name
FROM departments d
WHERE c.type = 'department'
  AND c.department = d.name
  AND c.name != d.name;

COMMENT ON TABLE departments IS 'Справочник отделов компании';
COMMENT ON TABLE department_chats IS 'Связь отдела с его чатом (1:1)';
COMMENT ON FUNCTION sync_department_name() IS 'Автоматически синхронизирует название отдела с чатами и пользователями';
COMMENT ON FUNCTION sync_department_chat_name() IS 'Автоматически синхронизирует название чата отдела с отделом и пользователями';
