# Architecture

## Назначение

Корпоративный чат для внутренней коммуникации компании с поддержкой real-time сообщений, видеозвонков (Jitsi), системой тикетов поддержки и управлением правами доступа.

## Стек

- **Язык**: Node.js (JavaScript)
- **Фреймворк**: Express.js
- **База данных**: PostgreSQL
- **Real-time**: Socket.io
- **Аутентификация**: JWT (bcryptjs)
- **Push уведомления**: Web Push API (web-push)
- **Видеозвонки**: Jitsi Meet integration
- **Процесс-менеджмент**: PM2
- **Тесты**: Jest (30+ тестов)

## Структура

```
corporate-chat-backend/
├── config/           # Конфигурация (database, permissions)
├── controllers/      # Бизнес-логика (auth, chat, user, support, push, etc.)
├── routes/           # API endpoints
├── socket/           # WebSocket handlers (real-time, support)
├── middleware/       # Auth, permissions, file upload, rate limiting
├── utils/            # Вспомогательные утилиты (logger, email, automation)
├── database/
│   ├── migrations/   # SQL миграции
│   └── seed.js       # Начальные данные
├── public/           # Frontend (index.html, admin-panel.html)
├── scripts/          # Утилиты (backup, диагностика)
└── tests/            # Тесты (auth, chat, support, permissions)
```

## Ключевые модули

### Аутентификация и пользователи
- **authController** — регистрация, логин, JWT токены
- **userController** — CRUD пользователей, статистика
- **middleware/auth** — проверка токенов, роли (admin, rop, assistant, operator, employee)

### Чаты и сообщения
- **chatController** — создание чатов (direct, group, department), управление участниками
- **messageController** — отправка/редактирование/удаление сообщений, реакции, пересылка
- **socket/socketHandler** — real-time доставка сообщений, статус "онлайн", typing indicators

### Отделы и права доступа
- **departmentController** — управление отделами
- **permissionsController** — матрица прав (кто что может делать)
- **config/permissionsMatrix** — определение прав для каждой роли

### Файлы
- **fileController** — загрузка/удаление файлов, статистика
- **middleware/fileUpload** — multer, валидация типов и размеров

### Система поддержки (Support/Troubleshooting)
- **routes/support** — тикеты, назначение, SLA, автоматизация
- **routes/support-analytics** — аналитика по тикетам
- **socket/supportHandler** — real-time уведомления по тикетам
- **utils/autoAssignment** — автоназначение тикетов на агентов
- **utils/workflowAutomation** — правила автоматизации (эскалация, напоминания)

**Таблицы БД**:
- `support_tickets` — основная таблица тикетов
- `ticket_messages` — сообщения в тикетах
- `ticket_status_history` — история изменений статуса
- `support_teams` — команды поддержки
- `support_team_members` — участники команд
- `support_automation_rules` — правила автоматизации
- `support_metrics_reports` — метрики и отчёты

### Звонки (Calls)
- **routes/calls** — история звонков
- **Jitsi integration** — видеоконференции (клиент-сайд интеграция в frontend)

**Таблицы БД**:
- `calls` — информация о звонках
- `call_participants` — участники звонков
- `call_events` — события во время звонков

### Push уведомления
- **pushController** — подписка на push, отправка уведомлений
- **public/sw.js** — Service Worker для обработки push

**Таблицы БД**:
- `push_subscriptions` — подписки пользователей
- `notification_settings` — настройки уведомлений
- `notification_logs` — логи отправленных уведомлений

### Боты и вебхуки
- **routes/bots** — управление ботами
- **routes/webhooks** — вебхуки для внешних интеграций
- **routes/botApi** — API для ботов (отправка/получение сообщений)

### Аналитика
- **routes/analytics** — общая аналитика (сообщения, активность, пользователи)
- **routes/phase5-analytics** — расширенная аналитика

### Опросы
- **routes/polls** — создание и управление опросами в чатах

### Регистрация
- **routes/registration** — заявки на регистрацию с email-подтверждением

## Потоки данных

### 1. Отправка сообщения
```
Client → POST /api/chats/:chatId/messages
  → messageController.sendMessage
    → DB: INSERT INTO messages
    → socket.emit('new_message') к участникам чата
    → pushController.sendNewMessageNotification (если пользователь офлайн)
```

### 2. Создание тикета поддержки
```
Client → POST /api/support/tickets
  → supportController.createTicket
    → DB: INSERT INTO support_tickets
    → autoAssignment.assignTicket (автоназначение агенту)
    → sendTicketCreatedEmail (email уведомление)
    → socket.emit('ticket_created')
```

### 3. Видеозвонок
```
Client → открывает Jitsi iframe с room_name
  → Параллельно: POST /api/calls (логирование звонка)
    → DB: INSERT INTO calls, call_participants
```

## Безопасность

- **JWT токены** с expiry
- **bcryptjs** для хеширования паролей
- **Rate limiting** — 1000 req/15min
- **CORS** настройки
- **Helmet.js** для HTTP заголовков
- **File upload limits** — 10MB, валидация MIME-типов
- **SQL injection protection** — параметризованные запросы через pg

## Deployment

- **PM2** для управления процессом
- **PostgreSQL** на порту 5433
- **Nginx** reverse proxy (HTTPS)
- **Backup** — автоматический бэкап БД (scripts/backup.js)

## Мониторинг

- **Logger** (winston) — структурированное логирование
- **Metrics collector** — подсчёт запросов, ошибок, медленных запросов
- **SLA monitor** — отслеживание нарушений SLA для тикетов
- **Health checks** — `/api/health`, `/` endpoints

## Критичные зоны

⚠️ **Не трогать без обсуждения**:
- `middleware/auth.js` — аутентификация и авторизация
- `config/permissionsMatrix.js` — матрица прав доступа
- `socket/socketHandler.js` — real-time логика
- `controllers/authController.js` — логин/регистрация
- Database migrations — всегда через новую миграцию, не править старые

## Известные ограничения

- Нет E2E шифрования (намеренно, для корпоративного использования)
- Опросы — базовая реализация, без сложной логики
- Аналитика — частично реализована, некоторые endpoints возвращают 404
