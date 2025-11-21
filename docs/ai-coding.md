# AI Coding Rules

## Базовые принципы

- **Любая задача начинается с краткого spec**: что, где, зачем, ограничения
- **Работать точечно**: одна задача — один модуль/функция
- **Не менять публичные API** и форматы данных без обсуждения
- **Не глушить ошибки** ради зелёных тестов
- **После изменений запускать check-команду**

## Перед началом работы

1. **Прочитай контекст**:
   - `docs/architecture.md` — структура проекта
   - Релевантные файлы в `controllers/`, `routes/`, `socket/`

2. **Построй план**:
   - Что меняем
   - Какие файлы затронуты
   - Как проверяем

3. **Работай точечно**:
   - Одна задача = один контроллер/роут/функция
   - Не делай "большую переделку" без явного запроса

## Ограничения

### ❌ Не делай без обсуждения

- Изменения в `middleware/auth.js` (аутентификация)
- Изменения в `config/permissionsMatrix.js` (права доступа)
- Изменения в `socket/socketHandler.js` (real-time логика)
- Изменения форматов API responses
- Изменения схемы БД (только через миграции!)
- Изменения в критичных контроллерах: `authController`, `userController`

### ✅ Можно делать свободно

- Добавление новых endpoints в существующие роуты
- Рефакторинг внутренней логики без смены контрактов
- Добавление/улучшение логирования
- Исправление багов в некритичных модулях
- Добавление тестов
- Обновление документации

## Работа с базой данных

- **Всегда используй миграции** для изменений схемы
- **Параметризованные запросы** — никаких строковых конкатенаций
- **Транзакции** для связанных операций
- **Индексы** для часто запрашиваемых полей

Пример новой миграции:
```sql
-- database/migrations/012_add_feature.sql
ALTER TABLE table_name ADD COLUMN new_field VARCHAR(255);
CREATE INDEX idx_table_new_field ON table_name(new_field);
```

## Работа с API

### Структура endpoint

```javascript
router.post('/path',
    authenticateToken,           // Всегда проверяем токен
    requireAdmin,                // Проверка роли если нужно
    [body('field').notEmpty()],  // Валидация через express-validator
    validate,                    // Middleware для обработки ошибок валидации
    controller.method
);
```

### Обработка ошибок

```javascript
try {
    const result = await query('SELECT ...', [params]);
    res.json({ data: result.rows });
} catch (error) {
    console.error('Descriptive error message:', error);
    res.status(500).json({ error: 'User-friendly message' });
}
```

## Работа с Socket.io

- **Не блокируй event loop** — длинные операции в async/await
- **Всегда проверяй авторизацию** в socket middleware
- **Emit только заинтересованным** — используй rooms/namespaces

```javascript
// Отправить конкретному пользователю
io.to(`user_${userId}`).emit('event', data);

// Отправить участникам чата
chatParticipants.forEach(userId => {
    io.to(`user_${userId}`).emit('event', data);
});
```

## Тестирование

- **Пиши тесты для новых функций**
- **Обнови тесты при изменении логики**
- **Не удаляй тесты** без причины

Запуск тестов:
```bash
npm test                    # Все тесты
npm test -- auth.test.js    # Конкретный файл
```

## Коммиты

Формат: `type: brief description`

Типы:
- `feat:` — новая функция
- `fix:` — исправление бага
- `refactor:` — рефакторинг без изменения функциональности
- `docs:` — обновление документации
- `test:` — добавление/изменение тестов
- `chore:` — административные изменения (зависимости, конфиг)

Примеры:
```
feat: Add webhook support for external integrations
fix: Resolve merge conflict in routes/api.js
docs: Update architecture.md with support system
```

## Порядок работы (AI Dev 2025)

1. **Spec** — сформулируй задачу
2. **Контекст** — прочитай docs/, релевантный код
3. **План** — опиши что меняешь и как проверяешь
4. **Изменения** — точечные правки
5. **Check** — запусти `npm test`
6. **Feedback** — анализируй ошибки, чини точечно
7. **Commit** — закоммить и запушить

## Типичные ошибки

### ❌ НЕ делай так:

```javascript
// Глушение ошибок
try { ... } catch (e) { /* пусто */ }

// Строковая конкатенация в SQL
const query = `SELECT * FROM users WHERE id = ${userId}`; // SQL injection!

// Синхронные операции в async контексте
const data = fs.readFileSync('file'); // блокирует event loop
```

### ✅ Делай так:

```javascript
// Логируй ошибки
try { ... } catch (error) {
    console.error('Context:', error);
    res.status(500).json({ error: 'Message' });
}

// Параметризованные запросы
const result = await query('SELECT * FROM users WHERE id = $1', [userId]);

// Асинхронные операции
const data = await fs.promises.readFile('file');
```

## Когда спрашивать пользователя

- Неясны требования или spec неполный
- Нужно изменить публичный API
- Нужно изменить схему БД
- Нужно изменить критичную зону (auth, permissions)
- Задача затрагивает несколько модулей
- Не уверен в правильности подхода

## Debugging

При ошибке:
1. Прочитай логи PM2: `pm2 logs corporate-chat --err`
2. Определи модуль/функцию где падает
3. Прочитай код этого модуля
4. Предложи минимальный фикс
5. Проверь что фикс не ломает тесты

## Полезные команды

```bash
# Запуск сервера
pm2 start server.js --name corporate-chat
pm2 restart corporate-chat
pm2 logs corporate-chat --lines 50

# Тесты
npm test

# БД
psql -p 5433 -U postgres -d corporate_chat

# Git
git status
git add .
git commit -m "type: message"
git push origin branch-name
```
