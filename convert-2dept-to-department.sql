-- ================================================
-- Конвертация чата "2 отдел" из group в department
-- ================================================

BEGIN;

-- Показываем текущее состояние
SELECT 'Before conversion:' as info;
SELECT id, name, type, department FROM chats WHERE name = '2 отдел';

-- Конвертируем group -> department и устанавливаем department поле
UPDATE chats
SET type = 'department',
    department = '2 отдел'
WHERE id = 2 AND name = '2 отдел' AND type = 'group';

-- Показываем результат
SELECT 'After conversion:' as info;
SELECT id, name, type, department FROM chats WHERE name = '2 отдел';

-- Проверяем все чаты отделов
SELECT 'All department chats:' as info;
SELECT id, name, type, department,
       (SELECT COUNT(*) FROM chat_participants WHERE chat_id = chats.id) as participants
FROM chats
WHERE type = 'department'
ORDER BY id;

COMMIT;

-- Для отмены вместо COMMIT используйте:
-- ROLLBACK;
