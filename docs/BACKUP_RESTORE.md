# Система резервного копирования и восстановления

## 📦 Обзор

Полная система защиты production данных с автоматическим резервным копированием базы данных, файлов и настроек.

### Что сохраняется в бэкапах:
- ✅ **База данных PostgreSQL** (все таблицы):
  - Пользователи и их права
  - Отделы
  - Чаты и участники
  - Сообщения
  - Файлы (метаданные)
  - Права доступа
  - История удалений
  - Логи администратора
- ✅ **Файлы (uploads/)**:
  - Загруженные файлы
  - Миниатюры изображений
  - Аватары пользователей

## 🚀 Быстрый старт

### 1. Настройка автоматических бэкапов

Добавьте в `.env`:

```bash
# Включить автоматические бэкапы
BACKUP_ENABLED=true

# Директория для хранения бэкапов
BACKUP_DIR=./backups

# Сколько дней хранить бэкапы (старые удаляются автоматически)
BACKUP_KEEP_DAYS=7

# Интервал между бэкапами в часах
BACKUP_INTERVAL_HOURS=24
```

### 2. Ручной бэкап

```bash
# Через npm
npm run backup

# Или через bash скрипт
./scripts/backup.sh backup

# Или напрямую через Node.js
node scripts/backup.js
```

### 3. Просмотр доступных бэкапов

```bash
npm run backup:list
# или
./scripts/backup.sh list
```

### 4. Восстановление из бэкапа

```bash
# Интерактивный режим (показывает список бэкапов)
npm run restore

# Показать только список без восстановления
npm run restore:list
```

## 🔧 Конфигурация

### Переменные окружения (.env)

```bash
# === Backup Configuration ===
BACKUP_ENABLED=true              # Включить/выключить автоматические бэкапы
BACKUP_DIR=./backups             # Директория для бэкапов
BACKUP_KEEP_DAYS=7               # Хранить бэкапы N дней
BACKUP_INTERVAL_HOURS=24         # Интервал между бэкапами (часы)

# === Database Configuration (используется для бэкапа) ===
DB_HOST=localhost
DB_PORT=5432
DB_NAME=corporate_chat
DB_USER=postgres
DB_PASSWORD=your_password

# === File Upload ===
UPLOAD_DIR=./uploads             # Директория с файлами для бэкапа
```

## 📅 Автоматические бэкапы

### Настройка через systemd timer (Linux)

1. Создайте service файл `/etc/systemd/system/chat-backup.service`:

```ini
[Unit]
Description=Corporate Chat Backup Service

[Service]
Type=oneshot
User=www-data
WorkingDirectory=/path/to/corporate-chat-backend
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node scripts/backup.js

[Install]
WantedBy=multi-user.target
```

2. Создайте timer файл `/etc/systemd/system/chat-backup.timer`:

```ini
[Unit]
Description=Corporate Chat Backup Timer

[Timer]
OnCalendar=daily
OnCalendar=03:00
Persistent=true

[Install]
WantedBy=timers.target
```

3. Активируйте:

```bash
sudo systemctl enable chat-backup.timer
sudo systemctl start chat-backup.timer
sudo systemctl status chat-backup.timer
```

### Настройка через cron

Добавьте в crontab:

```bash
crontab -e

# Бэкап каждый день в 3:00 ночи
0 3 * * * cd /path/to/corporate-chat-backend && ./scripts/backup.sh backup >> /var/log/chat-backup.log 2>&1

# Или каждые 6 часов
0 */6 * * * cd /path/to/corporate-chat-backend && ./scripts/backup.sh backup >> /var/log/chat-backup.log 2>&1
```

## 🖥️ Ручное управление из админ-панели

### API Endpoints

**Запустить бэкап вручную:**
```http
POST /api/admin/backup
Authorization: Bearer <admin_token>
```

**Получить список бэкапов:**
```http
GET /api/admin/backups
Authorization: Bearer <admin_token>
```

Ответ:
```json
{
  "backups": [
    {
      "timestamp": "2025-11-12T10:30:00.000Z",
      "date": "12.11.2025, 10:30:00",
      "database": "db-backup-2025-11-12T10-30-00-000Z.sql.gz",
      "files": "files-backup-2025-11-12T10-30-00-000Z.tar.gz",
      "dbSizeMB": "15.42",
      "filesSizeMB": "234.56"
    }
  ],
  "config": {
    "enabled": true,
    "interval": "24",
    "retention": "7",
    "directory": "./backups"
  }
}
```

## 🔄 Процесс восстановления

### Интерактивное восстановление

```bash
npm run restore
```

Скрипт покажет список доступных бэкапов:

```
📋 Available backups:

1. 12.11.2025, 15:30:45
   Database: ✅ db-backup-2025-11-12T15-30-45-123Z.sql.gz
   Files: ✅ files-backup-2025-11-12T15-30-45-123Z.tar.gz

2. 11.11.2025, 15:30:22
   Database: ✅ db-backup-2025-11-11T15-30-22-456Z.sql.gz
   Files: ✅ files-backup-2025-11-11T15-30-22-456Z.tar.gz

Select backup number to restore (or 0 to cancel):
```

### Восстановление конкретного бэкапа

```bash
node scripts/restore.js db-backup-2025-11-12.sql.gz files-backup-2025-11-12.tar.gz
```

### ⚠️ ВАЖНО при восстановлении:

1. **Останавливайте приложение** перед восстановлением:
   ```bash
   # Docker
   docker-compose down

   # или PM2
   pm2 stop chat-backend
   ```

2. **Восстановление ПЕРЕЗАПИШЕТ все текущие данные**

3. После восстановления **перезапустите приложение**:
   ```bash
   # Docker
   docker-compose up -d

   # или PM2
   pm2 start chat-backend
   ```

## 📂 Структура бэкапов

```
backups/
├── db-backup-2025-11-12T15-30-45-123Z.sql.gz       # БД (сжатый SQL дамп)
├── files-backup-2025-11-12T15-30-45-123Z.tar.gz   # Файлы (tar архив)
├── backup-metadata-2025-11-12T15-30-45-123Z.json  # Метаданные
├── db-backup-2025-11-11T15-30-22-456Z.sql.gz
├── files-backup-2025-11-11T15-30-22-456Z.tar.gz
└── backup-metadata-2025-11-11T15-30-22-456Z.json
```

### Формат метаданных

```json
{
  "timestamp": "2025-11-12T15:30:45.123Z",
  "date": "12.11.2025, 15:30:45",
  "database": "db-backup-2025-11-12T15-30-45-123Z.sql.gz",
  "files": "files-backup-2025-11-12T15-30-45-123Z.tar.gz",
  "config": {
    "db_name": "corporate_chat",
    "db_host": "localhost"
  }
}
```

## 🧪 Тестирование системы бэкапов

### 1. Проверка зависимостей

```bash
npm run backup:check
```

Должны быть установлены:
- `postgresql-client` (pg_dump, psql)
- `gzip`
- `tar`

На Ubuntu/Debian:
```bash
sudo apt-get install postgresql-client gzip tar
```

### 2. Тестовый бэкап

```bash
npm run backup
```

Проверьте логи:
```bash
cat logs/app.log | grep Backup
```

### 3. Проверка созданных файлов

```bash
ls -lh backups/
```

### 4. Тестовое восстановление (на dev окружении!)

```bash
npm run restore
```

## 🚨 Восстановление после катастрофы

### Сценарий: Потеря доступа к серверу

1. **Регулярно копируйте бэкапы на внешнее хранилище:**

```bash
# Синхронизация на удаленный сервер
rsync -avz --delete ./backups/ user@backup-server:/backups/corporate-chat/

# Или в S3 (если используете AWS)
aws s3 sync ./backups/ s3://my-backup-bucket/corporate-chat/
```

2. **На новом сервере:**

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/yourcompany/corporate-chat-backend.git
cd corporate-chat-backend

# 2. Установите зависимости
npm install

# 3. Настройте .env
cp .env.example .env
# Отредактируйте .env

# 4. Скопируйте бэкапы
rsync -avz user@backup-server:/backups/corporate-chat/ ./backups/

# 5. Восстановите данные
npm run restore

# 6. Запустите приложение
npm start
```

### Сценарий: Испорченная база данных

```bash
# 1. Остановите приложение
docker-compose down

# 2. Восстановите последний бэкап
npm run restore

# 3. Выберите последний рабочий бэкап
# 4. Перезапустите
docker-compose up -d
```

## 📊 Мониторинг бэкапов

### Логи бэкапов

Все операции логируются в:
- Console (stdout/stderr)
- `logs/app.log` (если используется winston logger)

### Проверка успешности бэкапов

```bash
# Последние логи бэкапов
grep "Backup" logs/app.log | tail -20

# Список последних бэкапов
npm run backup:list
```

### Алерты при сбое бэкапа

Добавьте мониторинг:

```bash
#!/bin/bash
# scripts/backup-check.sh

BACKUP_DIR="./backups"
MAX_AGE_HOURS=26  # Должен быть бэкап свежее 26 часов (при интервале 24ч)

LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/db-backup-*.gz 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "ERROR: No backups found!"
    # Отправить алерт (email, Telegram, Slack)
    exit 1
fi

AGE_HOURS=$(( ($(date +%s) - $(stat -c %Y "$LATEST_BACKUP")) / 3600 ))

if [ $AGE_HOURS -gt $MAX_AGE_HOURS ]; then
    echo "ERROR: Latest backup is too old ($AGE_HOURS hours)"
    # Отправить алерт
    exit 1
fi

echo "OK: Latest backup is $AGE_HOURS hours old"
```

Добавьте в cron:
```bash
0 4 * * * /path/to/corporate-chat-backend/scripts/backup-check.sh
```

## 💾 Рекомендации по хранению

### Development:
- Локальные бэкапы: 3-7 дней
- Интервал: 24 часа

### Production:
- **Локальные бэкапы:** 7-14 дней (быстрое восстановление)
- **Удаленные бэкапы:** 30-90 дней (защита от катастроф)
- **Интервал:** 6-12 часов
- **Место хранения:**
  - Локально на сервере
  - Удаленный сервер (rsync)
  - Облако (S3, Google Cloud Storage)
  - NAS/SAN

### Расчет объема хранилища

```bash
# Размер БД
psql -U postgres -d corporate_chat -c "SELECT pg_size_pretty(pg_database_size('corporate_chat'));"

# Размер файлов
du -sh uploads/

# Пример расчета:
# БД: 50 MB
# Файлы: 500 MB
# Сжатие: ~70%
# Бэкап: ~385 MB
# За 7 дней: ~2.7 GB
# За 30 дней: ~11.6 GB
```

## 🔐 Безопасность бэкапов

1. **Права доступа:**
```bash
chmod 700 backups/
chmod 600 backups/*
```

2. **Шифрование (опционально):**
```bash
# Зашифровать бэкап
gpg --symmetric --cipher-algo AES256 backups/db-backup-*.sql.gz

# Расшифровать
gpg --decrypt backups/db-backup-*.sql.gz.gpg > db-backup.sql.gz
```

3. **Храните пароль БД в безопасности:**
   - Используйте `.env` с правами 600
   - Не коммитьте `.env` в git
   - Используйте secrets manager в production

## 📞 Поддержка

При проблемах с бэкапами:

1. Проверьте логи: `grep Backup logs/app.log`
2. Проверьте права доступа: `ls -la backups/`
3. Проверьте место на диске: `df -h`
4. Проверьте зависимости: `npm run backup:check`

---

**Версия документации:** 1.0
**Последнее обновление:** 12.11.2025
