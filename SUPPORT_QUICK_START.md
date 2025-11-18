# ⚡ Support System - Quick Start

## 🎯 В двух словах

Полная система технической поддержки уровня WhatsApp/Telegram/Slack:
- 🎫 Ticketing System с SLA
- 🤖 AI Chatbot для автоответов
- 📚 Knowledge Base для self-service
- 📊 Analytics Dashboard

---

## 🚀 Запуск за 5 минут

### 1. Установка (1 минута)

```bash
# Запустить setup script
node scripts/setup-support-system.js
```

**Что создаётся:**
- ✅ Database tables (16 таблиц)
- ✅ Support Team "General Support"
- ✅ KB Categories (4 категории)
- ✅ Sample KB Articles (5 статей)
- ✅ Canned Responses (10 шаблонов)
- ✅ SLA Policies (3 политики)

### 2. Интеграция (2 минуты)

**routes/api.js:**
```javascript
const supportRoutes = require('./support');
router.use('/support', supportRoutes);
```

**Restart server:**
```bash
pm2 restart corporate-chat
```

### 3. Тест (2 минуты)

**Создать тикет:**
```bash
curl -X POST http://localhost:3000/api/support/tickets \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Test support ticket",
    "description": "Testing the new support system",
    "priority": "normal",
    "category": "technical"
  }'
```

**Проверить KB:**
```bash
curl http://localhost:3000/api/support/kb/articles
```

---

## 📖 Основные API Endpoints

### Tickets

```bash
# Create ticket
POST /api/support/tickets
{
    "subject": "Cannot login",
    "description": "Getting 401 error",
    "priority": "high",  # low, normal, high, urgent, critical
    "category": "technical"  # technical, billing, feature_request, bug, other
}

# List my tickets
GET /api/support/tickets

# Get ticket details
GET /api/support/tickets/123

# Add message
POST /api/support/tickets/123/messages
{
    "content": "I tried that but...",
    "is_internal": false
}

# Update status (admin)
PATCH /api/support/tickets/123/status
{
    "status": "resolved"  # new, open, in_progress, resolved, closed
}

# Rate ticket
POST /api/support/tickets/123/rating
{
    "rating": 5,  # 1-5
    "feedback": "Great support!"
}
```

### Knowledge Base

```bash
# Get all articles
GET /api/support/kb/articles
GET /api/support/kb/articles?category=troubleshooting
GET /api/support/kb/articles?search=password

# Get article
GET /api/support/kb/articles/password-reset-guide

# Get categories
GET /api/support/kb/categories
```

### Chatbot (in code)

```javascript
const chatbot = require('./utils/supportChatbot');

// Process user message
const response = await chatbot.processMessage(
    userId,
    sessionId,
    "Забыл пароль"
);

// Response:
{
    message: "Для сброса пароля...",
    suggestions: ["📖 Читать статью", "✅ Создать тикет"],
    kb_article: {...},
    intent: "password_reset",
    confidence: 0.95
}
```

### Analytics (admin)

```bash
# Get stats
GET /api/support/stats?period=7d  # or 30d

# Returns:
{
    total_tickets: 157,
    avg_first_response_minutes: 45,
    avg_resolution_minutes: 320,
    csat: { avg_rating: 4.6 },
    sla: { compliance_rate: "86.4" }
}
```

---

## 🎨 Ticket Workflow

```
Customer creates ticket
        ↓
[NEW] ──→ Auto-assigned to agent
        ↓
[OPEN] ──→ Agent responds (First Response SLA)
        ↓
[IN_PROGRESS] ──→ Working on solution
        ↓
[WAITING_CUSTOMER] ←──→ Need more info
        ↓
[RESOLVED] ──→ Solution provided
        ↓
Customer rates ⭐⭐⭐⭐⭐
        ↓
[CLOSED] ──→ Done!
```

---

## ⏱️ SLA По умолчанию

| Priority  | First Response | Resolution |
|-----------|----------------|------------|
| Critical  | 15 min         | 4 hours    |
| Urgent    | 30 min         | 8 hours    |
| High      | 1 hour         | 24 hours   |
| Normal    | 2 hours        | 48 hours   |
| Low       | 4 hours        | 72 hours   |

---

## 🤖 AI Chatbot - Поддерживаемые интенты

| Intent | Пример запроса | Действие |
|--------|----------------|----------|
| `password_reset` | "Забыл пароль" | Инструкция + KB статья |
| `login_problem` | "Не могу войти" | Troubleshooting steps |
| `file_upload` | "Ошибка загрузки файла" | Проверка размера/формата |
| `slow_performance` | "Медленно работает" | Очистка кэша |
| `bug_report` | "Ошибка в системе" | Создать тикет |
| `request_human` | "Хочу с оператором" | Эскалация на агента |

**Расширить бота:**

```javascript
// В utils/supportChatbot.js добавить:
this.intentPatterns.new_intent = {
    patterns: [/ваш паттерн/i],
    responses: ['Ваш ответ'],
    kb_article_slug: 'article-slug',  // optional
    create_ticket: true,               // optional
    escalate: true                     // optional
};
```

---

## 👥 Настройка Support Team

```sql
-- Create team
INSERT INTO support_teams (name, email, sla_first_response_minutes, sla_resolution_hours)
VALUES ('Technical Support', 'tech@company.com', 30, 24);

-- Add members
INSERT INTO support_team_members (team_id, user_id, role, max_concurrent_tickets)
VALUES (1, 5, 'agent', 5);

-- Roles: 'agent', 'team_lead', 'manager'
```

---

## 📚 Добавить статью в KB

```sql
-- Create category (if needed)
INSERT INTO kb_categories (name, slug, description, icon)
VALUES ('Troubleshooting', 'troubleshooting', 'Common issues', '🔧');

-- Add article
INSERT INTO kb_articles (title, slug, content, summary, category_id, status, created_by)
VALUES (
    'Как сбросить пароль',
    'password-reset',
    'Полная инструкция с шагами...',
    'Пошаговое руководство',
    (SELECT id FROM kb_categories WHERE slug = 'troubleshooting'),
    'published',
    1  -- admin user id
);
```

---

## 💬 Canned Responses

**Использование:**

```sql
-- Get all canned responses
SELECT * FROM canned_responses WHERE is_public = true;

-- Use in reply:
SELECT content FROM canned_responses WHERE shortcut = '/welcome';
-- Returns: "Здравствуйте! Спасибо что обратились..."
```

**Добавить новый:**

```sql
INSERT INTO canned_responses (title, shortcut, content, category)
VALUES (
    'Password Reset',
    '/password',
    'Для сброса пароля: 1) ...',
    'technical'
);
```

---

## 📊 Мониторинг

### Текущая очередь

```sql
-- Tickets in queue
SELECT status, COUNT(*) as count
FROM support_tickets
WHERE status NOT IN ('resolved', 'closed')
GROUP BY status;

-- SLA at risk (due in 1 hour)
SELECT COUNT(*) as at_risk
FROM support_tickets
WHERE sla_due_date BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
  AND status NOT IN ('resolved', 'closed');
```

### Agent workload

```sql
SELECT
    u.name,
    COUNT(*) as active_tickets,
    AVG(first_response_time) as avg_response
FROM users u
JOIN support_tickets t ON u.id = t.assigned_to
WHERE t.status IN ('open', 'in_progress')
GROUP BY u.id, u.name;
```

### CSAT

```sql
SELECT
    AVG(customer_rating) as avg_rating,
    COUNT(*) as total_ratings,
    COUNT(CASE WHEN customer_rating >= 4 THEN 1 END) as positive
FROM support_tickets
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND customer_rating IS NOT NULL;
```

---

## 🎯 Best Practices

### Для агентов:

1. **Отвечайте быстро** - хотя бы "получили запрос, работаем"
2. **Используйте canned responses** - экономит время
3. **Обновляйте статус** - клиент видит прогресс
4. **Добавляйте в KB** - если вопрос повторяется
5. **Просите оценку** - улучшает метрики

### Для админов:

1. **Мониторьте SLA** - каждый день
2. **Балансируйте нагрузку** - равномерно между агентами
3. **Обновляйте KB** - минимум 1 раз в неделю
4. **Тренируйте бота** - добавляйте новые интенты
5. **Анализируйте метрики** - еженедельно

### Для разработчиков:

1. **Автоматизируйте** - создавайте automation rules
2. **Интегрируйте** - email, telegram, webhooks
3. **Оптимизируйте** - улучшайте производительность
4. **Расширяйте** - добавляйте новые функции
5. **Мониторьте** - errors, performance, uptime

---

## 🔧 Troubleshooting

### Тикет не создаётся

```bash
# Check DB connection
psql -U postgres -d corporate_chat -c "SELECT COUNT(*) FROM support_tickets;"

# Check logs
pm2 logs corporate-chat | grep support

# Verify migration applied
psql -U postgres -d corporate_chat -c "\dt support_*"
```

### Бот не отвечает

```javascript
// Test bot directly
const chatbot = require('./utils/supportChatbot');

(async () => {
    const response = await chatbot.processMessage(
        1,  // userId
        'test-session-123',
        'Забыл пароль'
    );
    console.log(response);
})();
```

### KB статьи не показываются

```sql
-- Check articles
SELECT id, title, status FROM kb_articles;

-- Check if published
UPDATE kb_articles SET status = 'published' WHERE status = 'draft';
```

---

## 📚 Дальнейшее чтение

- **Полный гайд:** `SUPPORT_SYSTEM_GUIDE.md`
- **Roadmap:** `SUPPORT_IMPLEMENTATION_ROADMAP.md`
- **Database schema:** `database/migrations/016_create_support_system.sql`
- **API routes:** `routes/support.js`
- **Chatbot:** `utils/supportChatbot.js`

---

## ✅ Checklist первого дня

- [ ] Запустить `setup-support-system.js`
- [ ] Добавить routes в `api.js`
- [ ] Создать support team
- [ ] Добавить себя как агента
- [ ] Создать тестовый тикет
- [ ] Ответить на тикет
- [ ] Проверить KB статьи
- [ ] Протестировать chatbot
- [ ] Проверить analytics
- [ ] Настроить email уведомления

---

## 🎉 Готово!

Теперь у вас работающая система поддержки!

**Next steps:**
1. Кастомизировать KB под вашу систему
2. Обучить команду
3. Запустить в production
4. Собирать feedback
5. Улучшать на основе метрик

**Happy supporting! 🚀**
