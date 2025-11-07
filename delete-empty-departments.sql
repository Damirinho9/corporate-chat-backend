-- ================================================
-- Удаление пустых тестовых отделов
-- ================================================

BEGIN;

-- Удаляем department-type чаты для пустых отделов
DELETE FROM chats
WHERE type = 'department'
  AND department IN ('Отдел 1', 'Отдел 2', 'Отдел 3')
  AND id NOT IN (
    SELECT DISTINCT chat_id
    FROM chat_participants
  );

-- Удаляем записи из таблицы departments
DELETE FROM departments
WHERE name IN ('Отдел 1', 'Отдел 2', 'Отдел 3')
  AND id NOT IN (
    SELECT DISTINCT d.id
    FROM departments d
    JOIN users u ON u.department = d.name
  );

-- Проверяем что удалено
SELECT 'Remaining departments:' as info;
SELECT name FROM departments ORDER BY name;

COMMIT;

-- Для отмены вместо COMMIT используйте:
-- ROLLBACK;
