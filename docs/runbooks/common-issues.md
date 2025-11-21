# Common Issues

## Проблемы при запуске

### Сервер падает с "Logger is not a constructor"

**Причина**: Неправильный импорт logger

**Решение**:
```javascript
// ❌ Неправильно
const Logger = require('./utils/logger');
const logger = new Logger('context');

// ✅ Правильно
const { createLogger } = require('./utils/logger');
const logger = createLogger('context');
```

### 502 Bad Gateway при доступе к сайту

**Диагностика**:
```bash
pm2 status
pm2 logs corporate-chat --err
```

**Частые причины**:
1. Сервер не запустился — проверь логи ошибок
2. Неправильный порт в nginx конфиге
3. Ошибка в коде — проверь последний коммит

### База данных недоступна

**Диагностика**:
```bash
# Проверить статус PostgreSQL
sudo systemctl status postgresql

# Попробовать подключиться
psql -p 5433 -U postgres -d corporate_chat
```

**Решение**:
```bash
# Перезапустить PostgreSQL
sudo systemctl restart postgresql
```

## Проблемы с роутами

### 404 на существующий endpoint

**Причины**:
1. **Порядок подключения роутов** — специфичные роуты должны быть ДО общих

```javascript
// ❌ Неправильно
app.use('/api', apiRoutes);           // Перехватит все /api/*
app.use('/api/support', supportRoutes); // Никогда не выполнится

// ✅ Правильно
app.use('/api/support', supportRoutes); // Сначала специфичный
app.use('/api', apiRoutes);             // Потом общий
```

2. **Роут не подключен** — проверь `server.js` или `routes/api.js`

### Роут возвращает 401/403

**Причины**:
1. Нет токена в заголовке: `Authorization: Bearer <token>`
2. Недостаточно прав — проверь middleware (`requireAdmin`, `requireHead`, etc.)
3. Токен истёк — обнови токен через `/api/auth/login`

**Диагностика**:
```javascript
// В middleware/auth.js добавь временно
console.log('User:', req.user);
console.log('Required role:', 'admin');
```

## Проблемы с Socket.io

### Сообщения не доходят в real-time

**Диагностика**:
1. Проверь подключение в браузере (DevTools → Network → WS)
2. Проверь что пользователь в нужной room:
```javascript
// В socket/socketHandler.js
console.log('User rooms:', socket.rooms);
```

**Частые причины**:
- Не выполнен `socket.join('user_' + userId)`
- Неправильный room name при emit
- Пользователь отключился (проверь `connectedUsers` Map)

## Проблемы с push уведомлениями

### Подписка возвращает 500

**Причина**: Отсутствует колонка `last_used_at` в таблице

**Решение**:
```sql
ALTER TABLE push_subscriptions
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
```

### Push не приходят

**Диагностика**:
1. Проверь Service Worker зарегистрирован: DevTools → Application → Service Workers
2. Проверь подписку в БД:
```sql
SELECT * FROM push_subscriptions WHERE user_id = <your_user_id>;
```
3. Проверь VAPID ключи в `.env`

## Проблемы с тестами

### Тесты падают с "table doesn't exist"

**Причина**: Тестовая БД не инициализирована

**Решение**:
```bash
# Создать тестовую БД
psql -p 5433 -U postgres -c "CREATE DATABASE corporate_chat_test;"

# Запустить миграции
node database/init.js
```

### Тесты зависают

**Причина**: Не закрыты соединения с БД или Socket.io

**Решение**: Проверь что в afterAll есть cleanup:
```javascript
afterAll(async () => {
    await pool.end();
    io.close();
});
```

## Проблемы с миграциями

### Миграция не применяется

**Причина**: Нет автоматического запуска миграций

**Решение**: Применить вручную:
```bash
psql -p 5433 -U postgres -d corporate_chat -f database/migrations/012_new_migration.sql
```

### Откат миграции

**НЕТ автоматического отката**. Нужно писать миграцию для отката:
```sql
-- database/migrations/013_rollback_feature.sql
ALTER TABLE table_name DROP COLUMN field;
DROP INDEX idx_name;
```

## PM2 проблемы

### Сервер постоянно перезапускается

**Диагностика**:
```bash
pm2 logs corporate-chat --err
```

**Частые причины**:
1. Ошибка в коде (см. логи)
2. Порт уже занят
3. Недостаточно памяти

**Решение**:
```bash
# Остановить все PM2 процессы
pm2 delete all

# Проверить занятость порта
lsof -i :3000

# Запустить заново
pm2 start server.js --name corporate-chat
```

### Логи не пишутся

**Причина**: Проблема с winston logger

**Временное решение**: Используй `console.log` для дебага
