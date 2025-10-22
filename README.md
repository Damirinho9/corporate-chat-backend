# Corporate Chat Backend

Полноценный backend для корпоративного чата с иерархической системой доступа, real-time коммуникацией через WebSocket, JWT аутентификацией и PostgreSQL базой данных.

## 🚀 Основные возможности

### ✅ Реализовано (Production-ready)

#### 1. Backend и База данных
- ✅ Node.js + Express.js сервер
- ✅ PostgreSQL база данных с оптимизированной схемой
- ✅ Пул соединений для производительности
- ✅ Транзакции для целостности данных
- ✅ Индексы для быстрых запросов

#### 2. Безопасность
- ✅ Хеширование паролей (bcrypt с 12 раундами)
- ✅ JWT токены для аутентификации
- ✅ Refresh tokens для обновления сессий
- ✅ Helmet для защиты HTTP заголовков
- ✅ CORS настроен правильно
- ✅ Rate limiting (защита от спама и брутфорса)
- ✅ Валидация всех входных данных
- ✅ Защита от SQL-инъекций (parameterized queries)
- ✅ Защита от XSS атак
- ✅ Сессии с автоматическим таймаутом

#### 3. Real-time коммуникация
- ✅ WebSocket через Socket.io
- ✅ Мгновенная доставка сообщений
- ✅ Статусы "онлайн/оффлайн"
- ✅ Индикатор "печатает..."
- ✅ Автоматические уведомления о новых сообщениях
- ✅ Real-time обновление чатов

#### 4. Масштабируемость
- ✅ Пагинация сообщений (ленивая загрузка)
- ✅ Оптимизация запросов к БД
- ✅ Индексы на всех важных полях
- ✅ Эффективные JOIN запросы
- ✅ Подготовка для горизонтального масштабирования

#### 5. API Features
- ✅ RESTful API architecture
- ✅ Иерархические права доступа
- ✅ CRUD операции для всех сущностей
- ✅ Поиск по сообщениям
- ✅ Статистика и аналитика
- ✅ Редактирование и удаление сообщений
- ✅ Управление пользователями
- ✅ Управление чатами

## 📋 Требования

- Node.js >= 14.0.0
- PostgreSQL >= 12.0
- npm или yarn

## 🛠️ Установка

### 1. Клонирование и установка зависимостей

```bash
# Установка зависимостей
npm install
```

### 2. Настройка PostgreSQL

```bash
# Войти в PostgreSQL
sudo -u postgres psql

# Создать базу данных
CREATE DATABASE corporate_chat;

# Создать пользователя (опционально)
CREATE USER chat_admin WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE corporate_chat TO chat_admin;

# Выйти
\q
```

### 3. Инициализация схемы базы данных

```bash
# Выполнить SQL скрипт для создания таблиц
psql -U postgres -d corporate_chat -f database/schema.sql

# Или если создали пользователя:
psql -U chat_admin -d corporate_chat -f database/schema.sql
```

### 4. Настройка переменных окружения

```bash
# Скопировать пример конфигурации
cp .env.example .env

# Отредактировать .env и установить свои значения
nano .env
```

**Важно!** Обязательно измените следующие значения в `.env`:

```env
# Сгенерируйте надежные секретные ключи (минимум 32 символа)
JWT_SECRET=your_very_long_random_secret_key_here_min_32_chars
JWT_REFRESH_SECRET=your_another_very_long_random_key_here

# Настройте подключение к базе данных
DB_PASSWORD=your_postgres_password

# Укажите origin вашего фронтенда
CORS_ORIGIN=http://localhost:8080
```

**Генерация секретных ключей:**

```bash
# В Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Или онлайн:
# https://www.random.org/strings/
```

### 5. Заполнение демо-данными

```bash
# Создать демо-пользователей и чаты
node database/seed.js
```

## 🚀 Запуск

### Development режим

```bash
npm run dev
```

Сервер запустится с автоперезагрузкой при изменении файлов (nodemon).

### Production режим

```bash
npm start
```

## 📡 API Endpoints

### Authentication

```
POST /api/auth/register       - Регистрация пользователя (admin only)
POST /api/auth/login          - Вход в систему
POST /api/auth/refresh        - Обновление токена
GET  /api/auth/profile        - Получить профиль
PUT  /api/auth/change-password - Сменить пароль
```

### Users

```
GET    /api/users                    - Все пользователи (admin)
GET    /api/users/:id                - Пользователь по ID
GET    /api/users/stats              - Статистика пользователей (admin)
GET    /api/users/role/:role         - Пользователи по роли
GET    /api/users/department/:dept   - Пользователи по отделу
PUT    /api/users/:id                - Обновить пользователя (admin)
DELETE /api/users/:id                - Удалить пользователя (admin)
POST   /api/users/:id/reset-password - Сбросить пароль (admin)
```

### Chats

```
GET    /api/chats                - Доступные чаты
GET    /api/chats/:id            - Чат по ID
POST   /api/chats/direct         - Создать личный чат
POST   /api/chats/group          - Создать групповой чат (admin)
POST   /api/chats/:id/participants - Добавить участника (admin)
DELETE /api/chats/:id/participants/:userId - Удалить участника (admin)
PUT    /api/chats/:id/read       - Отметить как прочитанное
DELETE /api/chats/:id            - Удалить чат (admin)
```

### Messages

```
GET    /api/chats/:id/messages           - Получить сообщения (с пагинацией)
POST   /api/chats/:id/messages           - Отправить сообщение
PUT    /api/messages/:id                 - Редактировать сообщение
DELETE /api/messages/:id                 - Удалить сообщение
GET    /api/chats/:id/messages/search    - Поиск по сообщениям
GET    /api/messages/all                 - Все сообщения (admin)
GET    /api/messages/stats               - Статистика сообщений (admin)
```

### Health

```
GET /api/health - Проверка работоспособности сервера
```

## 🔌 WebSocket Events

### Client -> Server

```javascript
// Подключение (требует токен)
io.connect('http://localhost:3000', {
    auth: { token: 'your_jwt_token' }
});

// События
socket.emit('send_message', { chatId, content });
socket.emit('typing_start', { chatId });
socket.emit('typing_stop', { chatId });
socket.emit('mark_as_read', { chatId });
socket.emit('edit_message', { messageId, content, chatId });
socket.emit('delete_message', { messageId, chatId });
socket.emit('join_chat', { chatId });
socket.emit('leave_chat', { chatId });
```

### Server -> Client

```javascript
// Получение событий
socket.on('new_message', (data) => { /* новое сообщение */ });
socket.on('user_typing', (data) => { /* пользователь печатает */ });
socket.on('user_stopped_typing', (data) => { /* перестал печатать */ });
socket.on('message_edited', (data) => { /* сообщение отредактировано */ });
socket.on('message_deleted', (data) => { /* сообщение удалено */ });
socket.on('message_read', (data) => { /* прочитано */ });
socket.on('user_online', (data) => { /* пользователь онлайн */ });
socket.on('user_offline', (data) => { /* пользователь оффлайн */ });
socket.on('error', (data) => { /* ошибка */ });
```

## 🔐 Демо-пользователи

После выполнения `node database/seed.js`:

| Логин | Пароль | Роль | Отдел |
|-------|--------|------|-------|
| admin | admin123 | Администратор | - |
| head_it | pass123 | Руководитель | IT |
| head_hr | pass123 | Руководитель | HR |
| dev1 | pass123 | Сотрудник | IT |
| dev2 | pass123 | Сотрудник | IT |
| hr1 | pass123 | Сотрудник | HR |

## 📊 Иерархия и права доступа

### Администраторы (admin)
- ✅ Видят все чаты и сообщения
- ✅ Могут писать всем в ЛС
- ✅ Могут создавать/удалять пользователей
- ✅ Могут создавать/удалять чаты
- ✅ Полный доступ ко всей системе

### Руководители отделов (head)
- ✅ Могут писать админам в ЛС
- ✅ Могут писать другим руководителям в ЛС
- ✅ Могут писать своим сотрудникам в ЛС
- ✅ Видят чаты своего отдела
- ✅ Могут писать в групповые чаты отдела
- ❌ Не могут видеть чаты других отделов

### Сотрудники (employee)
- ✅ Могут писать админам в ЛС
- ✅ Могут писать своему руководителю в ЛС
- ✅ Видят чаты своего отдела
- ❌ Не могут писать в групповые чаты
- ❌ Не могут писать друг другу в ЛС
- ❌ Не могут видеть чаты других отделов

## 🗄️ Структура базы данных

```
users                  - Пользователи
├── id                 - ID (primary key)
├── username           - Логин (unique)
├── password_hash      - Хеш пароля (bcrypt)
├── name               - Полное имя
├── role               - Роль (admin/head/employee)
├── department         - Отдел (для head/employee)
├── is_active          - Активен ли аккаунт
└── last_seen          - Последняя активность

chats                  - Чаты
├── id                 - ID (primary key)
├── name               - Название (для группы/отдела)
├── type               - Тип (direct/group/department)
├── department         - Отдел (для department)
└── created_by         - Кто создал

chat_participants      - Участники чатов
├── chat_id            - ID чата
├── user_id            - ID пользователя
└── last_read_at       - Время последнего прочтения

messages               - Сообщения
├── id                 - ID (primary key)
├── chat_id            - ID чата
├── user_id            - ID отправителя
├── content            - Содержимое
├── is_edited          - Было ли отредактировано
├── is_deleted         - Удалено ли (soft delete)
└── created_at         - Время отправки
```

## 🔒 Безопасность

### Реализованные меры

1. **Аутентификация и авторизация**
   - JWT токены с коротким временем жизни (24ч)
   - Refresh tokens для обновления сессий (7 дней)
   - Проверка прав на каждый запрос
   - Автоматическая деактивация истекших токенов

2. **Защита паролей**
   - Bcrypt хеширование (12 раундов)
   - Никогда не храним пароли открыто
   - Валидация сложности паролей

3. **Защита от атак**
   - Rate limiting (100 запросов / 15 минут)
   - Stricter rate limiting для auth (5 попыток / 15 минут)
   - Helmet для защиты HTTP заголовков
   - CORS правильно настроен
   - Parameterized queries (защита от SQL-инъекций)
   - Валидация и санитизация всех входных данных

4. **Безопасность WebSocket**
   - Аутентификация через JWT при подключении
   - Проверка прав на каждое действие
   - Автоматическое отключение при истечении токена

## 📈 Производительность

### Оптимизации

- ✅ Пул соединений PostgreSQL (max 20)
- ✅ Индексы на всех часто запрашиваемых полях
- ✅ Пагинация всех списков
- ✅ Ленивая загрузка сообщений
- ✅ Эффективные JOIN запросы
- ✅ Кэширование на уровне БД (prepared statements)

### Рекомендации для Production

1. **Добавить Redis** для кэширования часто запрашиваемых данных
2. **Настроить CDN** для статических файлов
3. **Использовать PM2** для управления процессами
4. **Настроить Nginx** как reverse proxy
5. **Мониторинг** через Prometheus + Grafana

## 🚀 Деплой в Production

### 1. Настройка сервера

```bash
# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить PostgreSQL
sudo apt install postgresql postgresql-contrib

# Установить Node.js (через nvm рекомендуется)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Установить PM2 глобально
npm install -g pm2
```

### 2. Деплой приложения

```bash
# Клонировать репозиторий
git clone <your-repo-url>
cd corporate-chat-backend

# Установить зависимости
npm install --production

# Настроить .env для production
nano .env
# Установить NODE_ENV=production
# Использовать сильные секретные ключи
# Настроить правильный DB_HOST, DB_PASSWORD

# Инициализировать БД
psql -U postgres -d corporate_chat -f database/schema.sql
node database/seed.js

# Запустить с PM2
pm2 start server.js --name corporate-chat
pm2 save
pm2 startup
```

### 3. Настройка Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

### 4. SSL сертификат (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 🧪 Тестирование

### Тестирование API

```bash
# Проверка health
curl http://localhost:3000/api/health

# Вход в систему
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Получить чаты (с токеном)
curl http://localhost:3000/api/chats \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Тестирование WebSocket

```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
    auth: { token: 'YOUR_TOKEN' }
});

socket.on('connect', () => {
    console.log('Connected!');
    socket.emit('send_message', {
        chatId: 1,
        content: 'Test message'
    });
});

socket.on('new_message', (data) => {
    console.log('New message:', data);
});
```

## 📝 Логирование

В development режиме логируются:
- Все запросы к API
- SQL запросы с временем выполнения
- WebSocket события
- Ошибки

В production режиме:
- Только ошибки и важные события
- Рекомендуется настроить Winston или Bunyan

## 🔍 Мониторинг

Рекомендуемый стек для production:

1. **Prometheus** - сбор метрик
2. **Grafana** - визуализация
3. **Sentry** - трекинг ошибок
4. **PM2 Monitoring** - состояние процессов

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи: `pm2 logs corporate-chat`
2. Проверьте подключение к БД
3. Проверьте переменные окружения в `.env`
4. Убедитесь, что порт 3000 не занят

## 📜 Лицензия

ISC

## 🎉 Готово к Production!

Этот backend полностью готов к развертыванию в продакшен окружении с учетом всех требований безопасности, производительности и масштабируемости.
