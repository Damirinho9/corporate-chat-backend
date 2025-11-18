#!/usr/bin/env node

/**
 * Support System Setup Script
 * Автоматическая настройка системы технической поддержки
 *
 * Usage: node scripts/setup-support-system.js
 */

require('dotenv').config();
const { query } = require('../config/database');
const fs = require('fs');
const path = require('path');

const logger = {
    info: (msg) => console.log(`✅ ${msg}`),
    warn: (msg) => console.log(`⚠️  ${msg}`),
    error: (msg) => console.error(`❌ ${msg}`),
    section: (msg) => console.log(`\n${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}`)
};

async function runSetup() {
    try {
        logger.section('🚀 Support System Setup');

        // Step 1: Apply migration
        logger.info('Step 1: Applying database migration...');
        await applyMigration();

        // Step 2: Create default support team
        logger.info('Step 2: Creating default support team...');
        const teamId = await createDefaultTeam();

        // Step 3: Setup KB categories
        logger.info('Step 3: Setting up Knowledge Base categories...');
        await setupKBCategories();

        // Step 4: Add sample KB articles
        logger.info('Step 4: Adding sample KB articles...');
        await addSampleArticles();

        // Step 5: Add canned responses
        logger.info('Step 5: Adding canned responses...');
        await addCannedResponses();

        // Step 6: Setup SLA policies
        logger.info('Step 6: Setting up SLA policies...');
        await setupSLAPolicies();

        // Step 7: Verify installation
        logger.info('Step 7: Verifying installation...');
        await verifyInstallation();

        logger.section('✅ Support System Setup Complete!');

        console.log(`
📊 Summary:
   - Support Team ID: ${teamId}
   - KB Categories: 4
   - Sample Articles: 5
   - Canned Responses: 10
   - SLA Policies: 3

🚀 Next Steps:
   1. Add agents to support team:
      POST /api/support/teams/${teamId}/members

   2. Configure routes in routes/api.js:
      const supportRoutes = require('./support');
      router.use('/support', supportRoutes);

   3. Test creating a ticket:
      POST /api/support/tickets

   4. Read the guide:
      cat SUPPORT_SYSTEM_GUIDE.md

Happy supporting! 🎉
        `);

    } catch (error) {
        logger.error(`Setup failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

async function applyMigration() {
    const migrationPath = path.join(__dirname, '../database/migrations/016_create_support_system.sql');

    if (!fs.existsSync(migrationPath)) {
        throw new Error('Migration file not found: ' + migrationPath);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Split by statement and execute
    const statements = sql
        .split(/;\s*$/m)
        .filter(s => s.trim() && !s.trim().startsWith('--'));

    for (const statement of statements) {
        try {
            await query(statement);
        } catch (error) {
            // Ignore "already exists" errors
            if (!error.message.includes('already exists')) {
                throw error;
            }
        }
    }

    logger.info('Migration applied successfully');
}

async function createDefaultTeam() {
    const result = await query(
        `INSERT INTO support_teams (name, description, email, sla_first_response_minutes, sla_resolution_hours)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
            'General Support',
            'Default support team for all customer inquiries',
            process.env.SUPPORT_EMAIL || 'support@corporate.com',
            30, // 30 minutes first response
            24  // 24 hours resolution
        ]
    );

    const teamId = result.rows[0]?.id || 1;
    logger.info(`Support team created with ID: ${teamId}`);
    return teamId;
}

async function setupKBCategories() {
    const categories = [
        {
            name: 'Getting Started',
            slug: 'getting-started',
            description: 'Основы работы с системой для новых пользователей',
            icon: '🚀',
            sort_order: 1
        },
        {
            name: 'Account & Settings',
            slug: 'account-settings',
            description: 'Управление аккаунтом и настройками',
            icon: '⚙️',
            sort_order: 2
        },
        {
            name: 'Troubleshooting',
            slug: 'troubleshooting',
            description: 'Решение распространённых проблем',
            icon: '🔧',
            sort_order: 3
        },
        {
            name: 'FAQ',
            slug: 'faq',
            description: 'Часто задаваемые вопросы',
            icon: '❓',
            sort_order: 4
        }
    ];

    for (const cat of categories) {
        await query(
            `INSERT INTO kb_categories (name, slug, description, icon, sort_order)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (slug) DO NOTHING`,
            [cat.name, cat.slug, cat.description, cat.icon, cat.sort_order]
        );
    }

    logger.info(`${categories.length} KB categories created`);
}

async function addSampleArticles() {
    const gettingStartedId = await getCategoryId('getting-started');
    const troubleshootingId = await getCategoryId('troubleshooting');
    const accountId = await getCategoryId('account-settings');

    const articles = [
        {
            title: 'Как начать работу с системой',
            slug: 'how-to-get-started',
            content: `# Как начать работу

Добро пожаловать в Corporate Chat!

## Шаг 1: Создайте аккаунт
1. Перейдите на страницу регистрации
2. Заполните форму
3. Подтвердите email

## Шаг 2: Настройте профиль
1. Загрузите фото
2. Укажите должность и отдел
3. Настройте уведомления

## Шаг 3: Начните общение
1. Найдите коллег в поиске
2. Создайте или присоединитесь к чатам
3. Отправьте первое сообщение

Готово! 🎉`,
            summary: 'Пошаговое руководство для новых пользователей',
            category_id: gettingStartedId,
            tags: ['getting-started', 'basics', 'tutorial']
        },
        {
            title: 'Как сбросить пароль',
            slug: 'password-reset-guide',
            content: `# Сброс пароля

## Способ 1: Через страницу входа

1. Перейдите на страницу входа
2. Нажмите "Забыли пароль?"
3. Введите вашу почту
4. Проверьте почту и перейдите по ссылке
5. Введите новый пароль

## Способ 2: Через админа

Если доступа к почте нет:
1. Свяжитесь с администратором
2. Предоставьте подтверждение личности
3. Админ сбросит пароль вручную

## Рекомендации по паролю

✅ Минимум 8 символов
✅ Буквы разных регистров
✅ Цифры и спецсимволы
❌ Не используйте простые пароли типа "123456"`,
            summary: 'Инструкция по сбросу пароля',
            category_id: accountId,
            tags: ['password', 'account', 'security']
        },
        {
            title: 'Проблемы со входом в систему',
            slug: 'login-troubleshooting',
            content: `# Решение проблем со входом

## Ошибка "Неверный пароль"

1. Проверьте раскладку клавиатуры (RU/EN)
2. Проверьте Caps Lock
3. Скопируйте пароль из менеджера паролей
4. Если не помогло - сбросьте пароль

## Ошибка "Аккаунт заблокирован"

Аккаунт блокируется после 5 неудачных попыток входа.

**Решение:**
1. Подождите 15 минут
2. Или обратитесь к администратору

## Ошибка "Сессия истекла"

Войдите заново. Сессия действует 24 часа.

## Другие проблемы

Свяжитесь с поддержкой через тикет.`,
            summary: 'Частые проблемы при входе и их решение',
            category_id: troubleshootingId,
            tags: ['login', 'troubleshooting', 'authentication']
        },
        {
            title: 'Как загрузить файл',
            slug: 'file-upload-guide',
            content: `# Загрузка файлов

## Поддерживаемые форматы

✅ Изображения: JPG, PNG, GIF, WEBP
✅ Документы: PDF, DOC, DOCX, XLS, XLSX
✅ Аудио: MP3, WAV, OGG, WEBM
✅ Видео: MP4, WEBM
✅ Архивы: ZIP, RAR

## Ограничения

- Максимальный размер: 10 МБ
- Файлы сканируются на вирусы

## Как загрузить

1. Нажмите на скрепку 📎 в чате
2. Выберите файл
3. Дождитесь загрузки
4. Добавьте подпись (опционально)
5. Отправьте

## Проблемы с загрузкой?

- Проверьте размер файла
- Проверьте формат
- Попробуйте сжать файл
- Проверьте интернет-соединение`,
            summary: 'Инструкция по загрузке файлов в чат',
            category_id: gettingStartedId,
            tags: ['files', 'upload', 'attachments']
        },
        {
            title: 'Медленная работа системы',
            slug: 'slow-performance-fix',
            content: `# Решение проблем с производительностью

## Быстрые решения

1. **Очистите кэш браузера**
   - Chrome: Ctrl+Shift+Del
   - Firefox: Ctrl+Shift+Del
   - Safari: Cmd+Opt+E

2. **Закройте лишние вкладки**
   - Держите открытыми только нужные

3. **Перезапустите браузер**
   - Закройте и откройте заново

4. **Попробуйте другой браузер**
   - Рекомендуем Chrome или Firefox

## Если не помогло

1. Проверьте скорость интернета на speedtest.net
2. Отключите расширения браузера
3. Обновите браузер до последней версии
4. Перезагрузите компьютер

## Системные требования

- RAM: минимум 4 ГБ
- Браузер: Chrome 90+, Firefox 88+
- Интернет: минимум 5 Мбит/с

Если проблема сохраняется - создайте тикет.`,
            summary: 'Как ускорить работу системы',
            category_id: troubleshootingId,
            tags: ['performance', 'slow', 'troubleshooting']
        }
    ];

    let count = 0;
    for (const article of articles) {
        const result = await query(
            `INSERT INTO kb_articles
             (title, slug, content, summary, category_id, tags, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, 'published', 1)
             ON CONFLICT (slug) DO NOTHING
             RETURNING id`,
            [article.title, article.slug, article.content, article.summary,
             article.category_id, article.tags]
        );

        if (result.rows.length > 0) count++;
    }

    logger.info(`${count} sample KB articles added`);
}

async function getCategoryId(slug) {
    const result = await query(
        'SELECT id FROM kb_categories WHERE slug = $1',
        [slug]
    );
    return result.rows[0]?.id || null;
}

async function addCannedResponses() {
    const responses = [
        {
            title: 'Welcome Message',
            shortcut: '/welcome',
            content: 'Здравствуйте! Спасибо что обратились в нашу поддержку. Чем могу помочь?',
            category: 'greeting'
        },
        {
            title: 'Ticket Created',
            shortcut: '/created',
            content: 'Ваш запрос зарегистрирован. Номер тикета: {{ticket_number}}. Мы ответим в течение {{sla_time}}.',
            category: 'status'
        },
        {
            title: 'Issue Resolved',
            shortcut: '/resolved',
            content: 'Ваша проблема решена. Пожалуйста, оцените качество поддержки и дайте обратную связь.',
            category: 'closing'
        },
        {
            title: 'Waiting for Info',
            shortcut: '/waiting',
            content: 'Для дальнейшей работы мне нужна дополнительная информация. Пожалуйста, предоставьте детали по запросу выше.',
            category: 'followup'
        },
        {
            title: 'Escalated to Team',
            shortcut: '/escalate',
            content: 'Ваш вопрос передан специалистам. Они ответят в ближайшее время.',
            category: 'status'
        },
        {
            title: 'Password Reset',
            shortcut: '/password',
            content: 'Для сброса пароля перейдите по ссылке на странице входа "Забыли пароль?" и следуйте инструкциям. Подробнее: [Как сбросить пароль](kb/password-reset-guide)',
            category: 'technical'
        },
        {
            title: 'Clear Cache',
            shortcut: '/cache',
            content: 'Попробуйте очистить кэш браузера (Ctrl+Shift+Del), затем перезапустите браузер. Это решит большинство проблем с загрузкой.',
            category: 'technical'
        },
        {
            title: 'Browser Update',
            shortcut: '/browser',
            content: 'Обновите браузер до последней версии. Мы рекомендуем Chrome или Firefox для лучшей совместимости.',
            category: 'technical'
        },
        {
            title: 'Thank You',
            shortcut: '/thanks',
            content: 'Благодарим за обратную связь! Если возникнут ещё вопросы - мы всегда на связи.',
            category: 'closing'
        },
        {
            title: 'Follow Up',
            shortcut: '/followup',
            content: 'Я проверил статус вашего запроса. Вот текущая ситуация...',
            category: 'followup'
        }
    ];

    let count = 0;
    for (const resp of responses) {
        const result = await query(
            `INSERT INTO canned_responses (title, shortcut, content, category, is_public)
             VALUES ($1, $2, $3, $4, true)
             ON CONFLICT (shortcut) DO NOTHING
             RETURNING id`,
            [resp.title, resp.shortcut, resp.content, resp.category]
        );

        if (result.rows.length > 0) count++;
    }

    logger.info(`${count} canned responses added`);
}

async function setupSLAPolicies() {
    const policies = [
        {
            name: 'Critical Priority SLA',
            description: 'SLA для критичных инцидентов',
            conditions: { priority: 'critical' },
            first_response_target: 15,  // 15 min
            resolution_target: 240,      // 4 hours
            priority: 100
        },
        {
            name: 'High Priority SLA',
            description: 'SLA для важных запросов',
            conditions: { priority: 'high' },
            first_response_target: 60,   // 1 hour
            resolution_target: 480,      // 8 hours
            priority: 90
        },
        {
            name: 'Standard SLA',
            description: 'Стандартный SLA для всех остальных',
            conditions: {},
            first_response_target: 120,  // 2 hours
            resolution_target: 1440,     // 24 hours
            priority: 10
        }
    ];

    let count = 0;
    for (const policy of policies) {
        const result = await query(
            `INSERT INTO sla_policies
             (name, description, conditions, first_response_target, resolution_target, priority, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, true)
             RETURNING id`,
            [policy.name, policy.description, JSON.stringify(policy.conditions),
             policy.first_response_target, policy.resolution_target, policy.priority]
        );

        if (result.rows.length > 0) count++;
    }

    logger.info(`${count} SLA policies created`);
}

async function verifyInstallation() {
    const checks = [
        { table: 'support_tickets', expected: 0 },
        { table: 'kb_categories', expected: 4 },
        { table: 'kb_articles', expected: 5 },
        { table: 'canned_responses', expected: 10 },
        { table: 'sla_policies', expected: 3 }
    ];

    let allGood = true;

    for (const check of checks) {
        const result = await query(`SELECT COUNT(*) as count FROM ${check.table}`);
        const count = parseInt(result.rows[0].count);

        if (count >= check.expected) {
            logger.info(`${check.table}: ${count} rows ✅`);
        } else {
            logger.warn(`${check.table}: ${count} rows (expected ${check.expected})`);
            allGood = false;
        }
    }

    if (!allGood) {
        logger.warn('Some checks failed. Review the logs above.');
    }

    return allGood;
}

// Run setup
runSetup().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
