# Развертывание на Beget (chat.gyda.ru)

## Предварительные требования на Beget

1. **Node.js приложение** (включено в тарифе)
2. **PostgreSQL база данных** (создать через панель управления)
3. **SSL сертификат** (Let's Encrypt - бесплатно)
4. **SSH доступ** (для загрузки файлов)

---

## Шаг 1: Подготовка базы данных на Beget

1. Войдите в панель управления Beget
2. Перейдите в раздел **"MySQL и PostgreSQL"**
3. Создайте новую базу данных PostgreSQL:
   - Имя БД: `corporate_chat` (или другое)
   - Пользователь: создайте нового
   - Пароль: сохраните его

4. Запомните данные подключения:
   ```
   Host: localhost (или указанный хост)
   Port: 5432
   Database: ваше_имя_бд
   User: ваш_пользователь
   Password: ваш_пароль
   ```

---

## Шаг 2: Настройка окружения

1. Создайте файл `.env` в корне проекта со следующим содержимым:

```env
# Server Configuration
NODE_ENV=production
PORT=3000

# Database Configuration (заполните своими данными с Beget)
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DATABASE_NAME

# JWT Configuration
JWT_SECRET=ваш_очень_длинный_случайный_секретный_ключ_минимум_32_символа
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=другой_длинный_случайный_ключ_для_refresh_token
JWT_REFRESH_EXPIRES_IN=7d

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGIN=https://chat.gyda.ru

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# Backup
BACKUP_DIR=./backups
BACKUP_KEEP_DAYS=7
AUTO_BACKUP=true
BACKUP_HOUR=3
BACKUP_INTERVAL_HOURS=24

# Logging
LOG_QUERIES=false
ENABLE_VIRUS_SCAN=false
```

**ВАЖНО:** Замените `USER`, `PASSWORD`, `DATABASE_NAME` на реальные данные из панели Beget!

---

## Шаг 3: Загрузка файлов на сервер

### Вариант A: Через Git (рекомендуется)

```bash
# На сервере Beget (через SSH)
cd ~/
git clone https://github.com/Damirinho9/corporate-chat-backend.git
cd corporate-chat-backend
git checkout claude/fix-department-constraint-error-011CUtZUCdctYjUTCafCKnTw
```

### Вариант B: Через FTP/SFTP

1. Используйте FileZilla или другой FTP-клиент
2. Подключитесь к серверу Beget
3. Загрузите все файлы проекта в папку приложения

---

## Шаг 4: Установка зависимостей и инициализация БД

```bash
# Установка пакетов
npm install --production

# Создание структуры БД
node setup-db.js

# Запуск миграций
node database/migrate.js 010_fix_department_constraint.sql
```

---

## Шаг 5: Настройка Node.js приложения в панели Beget

1. Войдите в панель управления Beget
2. Перейдите в раздел **"Node.js"**
3. Создайте новое приложение:
   - **Корневая папка**: `/home/USER/corporate-chat-backend` (замените USER)
   - **Точка входа**: `server.js`
   - **Режим**: `Production`
   - **Переменные окружения**: добавьте из файла `.env`

4. Нажмите **"Создать"** и **"Запустить"**

---

## Шаг 6: Настройка домена

1. В панели Beget перейдите в **"Сайты и домены"**
2. Добавьте домен `chat.gyda.ru`
3. Настройте **проксирование** на Node.js приложение:
   - Перейдите в настройки домена
   - В разделе **"Node.js"** выберите ваше приложение
   - Порт: `3000` (или тот что указали в .env)

4. Включите **SSL (Let's Encrypt)**:
   - В настройках домена нажмите "SSL"
   - Выберите "Let's Encrypt"
   - Подтвердите выпуск сертификата

---

## Шаг 7: Проверка работы

1. Откройте браузер и перейдите на `https://chat.gyda.ru`
2. Вы должны увидеть страницу авторизации
3. Войдите с учетными данными администратора

**Логин по умолчанию:**
- Username: `admin`
- Password: `admin123` (измените сразу после входа!)

---

## Обслуживание и обновление

### Просмотр логов
```bash
# На сервере
cd ~/corporate-chat-backend
tail -f logs/app.log  # если логи настроены
```

### Обновление кода
```bash
git pull origin claude/fix-department-constraint-error-011CUtZUCdctYjUTCafCKnTw
npm install --production
# Перезапустите приложение через панель Beget
```

### Резервное копирование БД
```bash
# Создайте cron задачу в панели Beget
pg_dump DATABASE_NAME > backup_$(date +%Y%m%d).sql
```

---

## Решение проблем

### Приложение не запускается
1. Проверьте логи в панели Beget
2. Убедитесь что `.env` файл создан и содержит правильные данные
3. Проверьте подключение к БД

### База данных не подключается
1. Проверьте `DATABASE_URL` в `.env`
2. Убедитесь что PostgreSQL запущен
3. Проверьте права пользователя БД

### SSL не работает
1. Дождитесь выпуска сертификата (может занять до 15 минут)
2. Проверьте что домен правильно указывает на сервер Beget (DNS)

---

## Безопасность

⚠️ **ВАЖНО после развертывания:**

1. Измените пароль администратора
2. Создайте длинные случайные ключи для JWT_SECRET
3. Убедитесь что `.env` файл не доступен публично
4. Настройте регулярное резервное копирование

---

## Контакты для поддержки

- GitHub Issues: https://github.com/Damirinho9/corporate-chat-backend/issues
- Документация Beget: https://beget.com/ru/kb
