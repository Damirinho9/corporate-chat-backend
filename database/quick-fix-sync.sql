-- ================================================
-- БЫСТРОЕ ИСПРАВЛЕНИЕ: Синхронизация названий
-- ================================================
-- Этот скрипт синхронизирует названия чатов с отделами
-- Запустите его, если не хотите делать полную миграцию

BEGIN;

-- Показываем текущее состояние
SELECT 'BEFORE:' as status, id, name, type, department
FROM chats
WHERE type = 'department'
ORDER BY id;

-- Синхронизируем: делаем название чата = названию отдела
UPDATE chats
SET name = department,
    updated_at = CURRENT_TIMESTAMP
WHERE type = 'department'
  AND department IS NOT NULL
  AND name != department;

-- Показываем результат
SELECT 'AFTER:' as status, id, name, type, department
FROM chats
WHERE type = 'department'
ORDER BY id;

-- Показываем пользователей для проверки
SELECT 'USERS:' as status, department, COUNT(*) as user_count
FROM users
WHERE department IS NOT NULL
GROUP BY department
ORDER BY department;

COMMIT;

-- Готово! Теперь названия синхронизированы
