# Инструкция по настройке опросов

## Проблема
API опросов возвращает 404, потому что таблицы базы данных еще не созданы.

## Решение

### Вариант 1: Применить миграцию через psql (Рекомендуется)

```bash
# Если вы знаете данные для подключения к БД:
psql -h localhost -U your_user -d your_database -f database/migrations/012_create_polls.sql

# Или если используется локальный PostgreSQL:
sudo -u postgres psql your_database -f database/migrations/012_create_polls.sql
```

### Вариант 2: Применить через Node.js с переменными окружения

```bash
# Установите переменные окружения (замените на свои данные):
export DB_NAME=your_database
export DB_USER=your_user
export DB_PASSWORD=your_password
export DB_HOST=localhost
export DB_PORT=5432

# Запустите скрипт:
node apply-polls-migration.js
```

### Вариант 3: Использовать переменные окружения из PM2

```bash
# Если PM2 уже имеет правильные переменные окружения:
pm2 restart corporate-chat --update-env
pm2 exec 'node apply-polls-migration.js'
```

### Вариант 4: Применить миграцию вручную через SQL

Подключитесь к базе данных и выполните SQL из файла `database/migrations/012_create_polls.sql`:

```sql
-- Скопируйте содержимое файла database/migrations/012_create_polls.sql
-- и выполните в вашем PostgreSQL клиенте
```

## Проверка

После применения миграции проверьте, что таблицы созданы:

```bash
# Подключитесь к БД и выполните:
psql -h localhost -U your_user -d your_database -c "\dt polls*"
```

Должны быть созданы две таблицы:
- `polls` - таблица опросов
- `poll_votes` - таблица голосов

## После применения миграции

1. Перезапустите сервер (если еще не сделали):
   ```bash
   pm2 restart corporate-chat
   ```

2. Проверьте в браузере - опросы должны работать!

3. API эндпоинты, которые должны работать:
   - `POST /api/polls` - создать опрос
   - `GET /api/polls/:id` - получить опрос
   - `POST /api/polls/:id/vote` - проголосовать
   - `POST /api/polls/:id/close` - закрыть опрос

## Устранение проблем

Если опросы все еще не работают:

1. **Проверьте логи сервера:**
   ```bash
   pm2 logs corporate-chat
   ```

2. **Проверьте наличие таблиц в БД:**
   ```bash
   psql -h localhost -U your_user -d your_database -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'poll%';"
   ```

3. **Проверьте, что роуты подключены:**
   Откройте `routes/api.js` и убедитесь, что есть строка:
   ```javascript
   router.use('/polls', pollsRoutes);
   ```

4. **Проверьте права пользователя:**
   Только администраторы и ROP могут создавать опросы.
   Проверьте роль пользователя в таблице `users`.
