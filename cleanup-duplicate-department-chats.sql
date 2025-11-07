-- ================================================
-- Очистка дублирующихся чатов отделов
-- Удаляет старые group-type чаты, которые дублируют department-type
-- ================================================

BEGIN;

-- Показываем текущее состояние
SELECT 'Current state - Department chats:' as info;
SELECT id, name, type, department FROM chats WHERE type = 'department' ORDER BY id;

SELECT 'Current state - Group chats with department names:' as info;
SELECT id, name, type, department FROM chats
WHERE type = 'group'
  AND (name IN ('2 отдел', '3 отдел', '4 отдел', 'Ассистенты'))
ORDER BY id;

-- Удаляем старые group-type чаты отделов, которые теперь есть как department-type
-- Оставляем только настоящие групповые чаты (РОПы + Ассистенты и т.д.)
DELETE FROM chats
WHERE type = 'group'
  AND name IN (
    SELECT name FROM chats WHERE type = 'department'
  );

-- Показываем результат
SELECT 'After cleanup - All chats:' as info;
SELECT id, name, type, department,
       (SELECT COUNT(*) FROM chat_participants WHERE chat_id = chats.id) as participants
FROM chats
ORDER BY type, id;

COMMIT;

-- Для отмены вместо COMMIT используйте:
-- ROLLBACK;
