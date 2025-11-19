# Система бэкапов Corporate Chat

## Быстрая настройка

### 1. Сделать скрипты исполняемыми
```bash
chmod +x ~/corporate-chat-backend/scripts/backup-db.sh
chmod +x ~/corporate-chat-backend/scripts/restore-db.sh
chmod +x ~/corporate-chat-backend/scripts/check-backups.sh
```

### 2. Настроить автоматический бэкап (cron)
```bash
# Бэкап каждый день в 3:00
(crontab -l 2>/dev/null; echo "0 3 * * * /home/damir/corporate-chat-backend/scripts/backup-db.sh") | crontab -

# Проверить
crontab -l
```

### 3. Создать первый бэкап вручную
```bash
~/corporate-chat-backend/scripts/backup-db.sh
```

## Использование

### Создать бэкап вручную
```bash
~/corporate-chat-backend/scripts/backup-db.sh
```

### Проверить состояние бэкапов
```bash
~/corporate-chat-backend/scripts/check-backups.sh
```

### Посмотреть доступные бэкапы
```bash
~/corporate-chat-backend/scripts/restore-db.sh --list
```

### Восстановить из бэкапа
```bash
# Интерактивный режим
~/corporate-chat-backend/scripts/restore-db.sh --interactive

# Или указать файл напрямую
~/corporate-chat-backend/scripts/restore-db.sh --restore /path/to/backup.sql.gz
```

## Структура бэкапов

```
backups/
├── daily/          # Последние 7 дней
├── weekly/         # Последние 4 недели (воскресенья)
├── monthly/        # Последние 3 месяца (1-е число)
└── backup.log      # Лог всех операций
```

## Политика хранения

- **Daily**: 7 дней
- **Weekly**: 4 недели (создаются по воскресеньям)
- **Monthly**: 3 месяца (создаются 1-го числа)

## Проверки

Скрипт бэкапа автоматически проверяет:
- Доступность базы данных
- Целостность gzip архива
- Наличие структуры таблиц в дампе
- Минимальный размер файла

## Восстановление

При восстановлении автоматически:
1. Создаётся бэкап текущего состояния
2. Останавливается приложение
3. Пересоздаётся база данных
4. Загружается дамп
5. Запускается приложение

## Логи

Все операции записываются в `backups/backup.log`

Просмотр последних записей:
```bash
tail -20 ~/corporate-chat-backend/backups/backup.log
```

## Мониторинг

Добавьте в cron ежедневную проверку:
```bash
# Проверка бэкапов каждый день в 9:00
(crontab -l 2>/dev/null; echo "0 9 * * * /home/damir/corporate-chat-backend/scripts/check-backups.sh > /dev/null") | crontab -
```

## Важно

1. **НЕ запускайте seed.js на проде** - он удаляет все данные
2. Регулярно проверяйте состояние бэкапов: `check-backups.sh`
3. Храните копии бэкапов в другом месте (облако, другой сервер)
