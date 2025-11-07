-- ================================================
-- Удаление дублирующихся group-чатов для отделов 3 и 4
-- ================================================

BEGIN;

-- Показываем что будем удалять
SELECT 'Chats to delete (old group-type duplicates):' as info;
SELECT id, name, type, department FROM chats WHERE id IN (1, 3);

-- Удаляем старые group-чаты, которые дублируют department-чаты
DELETE FROM chats WHERE id IN (1, 3);

-- Показываем результат - все чаты по типам
SELECT 'After deletion - Department chats:' as info;
SELECT id, name, type, department,
       (SELECT COUNT(*) FROM chat_participants WHERE chat_id = chats.id) as participants
FROM chats
WHERE type = 'department'
ORDER BY name;

SELECT 'After deletion - Group chats:' as info;
SELECT id, name, type, department,
       (SELECT COUNT(*) FROM chat_participants WHERE chat_id = chats.id) as participants
FROM chats
WHERE type = 'group'
ORDER BY name;

COMMIT;
