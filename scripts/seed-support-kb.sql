-- Seed Knowledge Base with sample articles
-- Run: psql -U postgres -d corporate_chat -p 5433 -f scripts/seed-support-kb.sql

-- Insert/update categories
INSERT INTO kb_categories (name, slug, description, icon, sort_order, is_visible)
VALUES
    ('Getting Started', 'getting-started', 'Основы работы с системой', '🚀', 1, true),
    ('Account & Settings', 'account-settings', 'Управление аккаунтом', '⚙️', 2, true),
    ('Troubleshooting', 'troubleshooting', 'Решение проблем', '🔧', 3, true),
    ('FAQ', 'faq', 'Часто задаваемые вопросы', '❓', 4, true)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    is_visible = EXCLUDED.is_visible;

-- Get category IDs and admin user
DO $$
DECLARE
    cat_getting_started INTEGER;
    cat_account INTEGER;
    cat_troubleshooting INTEGER;
    cat_faq INTEGER;
    admin_user_id INTEGER;
BEGIN
    -- Get category IDs
    SELECT id INTO cat_getting_started FROM kb_categories WHERE slug = 'getting-started';
    SELECT id INTO cat_account FROM kb_categories WHERE slug = 'account-settings';
    SELECT id INTO cat_troubleshooting FROM kb_categories WHERE slug = 'troubleshooting';
    SELECT id INTO cat_faq FROM kb_categories WHERE slug = 'faq';

    -- Get first admin user (or NULL if none exists)
    SELECT id INTO admin_user_id FROM users WHERE role = 'admin' LIMIT 1;

    -- Insert sample articles
    INSERT INTO kb_articles (title, slug, summary, content, category_id, status, is_featured, view_count, helpful_count, created_by)
    VALUES
        (
            'Как сбросить пароль',
            'password-reset-guide',
            'Пошаговая инструкция по сбросу пароля',
            E'# Сброс пароля\n\n## Способ 1: Через форму входа\n\n1. Перейдите на страницу входа\n2. Нажмите "Забыли пароль?"\n3. Введите ваш email\n4. Проверьте почту и перейдите по ссылке\n5. Введите новый пароль\n\n## Способ 2: Обратитесь к администратору\n\nЕсли у вас нет доступа к email, обратитесь к администратору системы.',
            cat_account,
            'published',
            true,
            125,
            42,
            admin_user_id
        ),
        (
            'Начало работы с системой',
            'getting-started-guide',
            'Первые шаги в корпоративном чате',
            E'# Начало работы\n\n## Вход в систему\n\nИспользуйте ваши учетные данные для входа на странице https://chat.gyda.ru\n\n## Создание первого чата\n\n1. Нажмите кнопку "+" в списке чатов\n2. Выберите участников\n3. Введите название чата\n4. Нажмите "Создать"\n\n## Отправка сообщений\n\nВведите текст в поле внизу экрана и нажмите Enter или кнопку отправки.',
            cat_getting_started,
            'published',
            true,
            256,
            89,
            admin_user_id
        ),
        (
            'Проблемы со входом',
            'login-issues',
            'Решение проблем с входом в систему',
            E'# Не могу войти в систему\n\n## Проверьте:\n\n1. **Правильность email** - убедитесь что вводите корректный адрес\n2. **Правильность пароля** - проверьте Caps Lock\n3. **Интернет соединение** - убедитесь что есть связь\n\n## Если проблема сохраняется:\n\n- Очистите кеш браузера\n- Попробуйте другой браузер\n- Обратитесь в техподдержку',
            cat_troubleshooting,
            'published',
            false,
            78,
            23,
            admin_user_id
        ),
        (
            'Как добавить участника в чат',
            'add-chat-participant',
            'Инструкция по добавлению новых участников',
            E'# Добавление участников\n\n## Шаги:\n\n1. Откройте нужный чат\n2. Нажмите на название чата вверху\n3. Выберите "Участники"\n4. Нажмите "Добавить участника"\n5. Выберите пользователя из списка\n6. Нажмите "Добавить"\n\n## Примечание\n\nВы должны быть администратором чата чтобы добавлять участников.',
            cat_getting_started,
            'published',
            false,
            143,
            51,
            admin_user_id
        ),
        (
            'Часто задаваемые вопросы',
            'faq-general',
            'Ответы на популярные вопросы',
            E'# FAQ\n\n## Можно ли удалить отправленное сообщение?\n\nДа, в течение 5 минут после отправки нажмите на сообщение и выберите "Удалить".\n\n## Как включить уведомления?\n\nПерейдите в Настройки → Уведомления и включите нужные опции.\n\n## Можно ли работать оффлайн?\n\nНет, для работы требуется интернет соединение.\n\n## Есть ли мобильное приложение?\n\nСистема работает через браузер на всех устройствах.',
            cat_faq,
            'published',
            false,
            312,
            127,
            admin_user_id
        )
    ON CONFLICT (slug) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP,
        view_count = EXCLUDED.view_count;

END $$;

-- Show inserted articles
SELECT id, title, slug, category_id, status, view_count
FROM kb_articles
ORDER BY created_at DESC
LIMIT 10;
