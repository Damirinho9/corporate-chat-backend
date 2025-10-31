# Настройка Nginx для корпоративного чата

## Проблема Mixed Content

Когда страница загружена по HTTPS, но API запросы идут на HTTP - браузер блокирует их.

**Ошибка:**
```
Mixed Content: The page at 'https://62.113.98.228/' was loaded over HTTPS,
but requested an insecure resource 'http://62.113.98.228:3000/api/auth/login'.
```

## Решение: Nginx как Reverse Proxy

### Шаг 1: Установка Nginx (если еще не установлен)

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx -y

# CentOS/RHEL
sudo yum install nginx -y

# Проверка установки
nginx -v
```

### Шаг 2: Копирование конфигурации

```bash
# Перейти в директорию проекта
cd /home/user/corporate-chat-backend

# Создать симлинк на конфиг
sudo ln -s $(pwd)/nginx.conf /etc/nginx/sites-available/corporate-chat
sudo ln -s /etc/nginx/sites-available/corporate-chat /etc/nginx/sites-enabled/

# Или для CentOS/RHEL (нет sites-enabled)
sudo cp nginx.conf /etc/nginx/conf.d/corporate-chat.conf
```

### Шаг 3: Настройка конфига под ваш сервер

Откройте `nginx.conf` и замените:
- `62.113.98.228` на ваш IP или домен
- `/home/user/corporate-chat-backend/public` на путь к вашей папке public

### Шаг 4: Тест конфигурации

```bash
# Проверить конфигурацию на ошибки
sudo nginx -t

# Если все OK, перезапустить Nginx
sudo systemctl restart nginx

# Проверить статус
sudo systemctl status nginx
```

### Шаг 5: Настройка файрвола

```bash
# Разрешить HTTP и HTTPS
sudo ufw allow 'Nginx Full'

# Или для firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### Шаг 6: Запуск Node.js сервера

```bash
# Убедитесь что Node.js сервер работает на порту 3000
cd /home/user/corporate-chat-backend
npm start

# Или через PM2 (рекомендуется для прода)
npm install -g pm2
pm2 start server.js --name corporate-chat
pm2 save
pm2 startup
```

## Проверка работы

### 1. Проверка Node.js сервера

```bash
curl http://localhost:3000/api/health
```

Должен вернуть JSON с status: healthy.

### 2. Проверка через Nginx

```bash
curl http://62.113.98.228/api/health
```

Должен вернуть тот же JSON.

### 3. Откройте браузер

```
http://62.113.98.228
```

Теперь Mixed Content не должно быть, так как все запросы идут через тот же домен без указания порта!

## Настройка HTTPS (опционально, но рекомендуется)

### Вариант 1: Let's Encrypt (бесплатный SSL)

```bash
# Установка Certbot
sudo apt install certbot python3-certbot-nginx -y

# Получить сертификат (замените на ваш домен)
sudo certbot --nginx -d yourdomain.com

# Certbot автоматически настроит Nginx для HTTPS
```

### Вариант 2: Самоподписанный сертификат (для тестирования)

```bash
# Создать самоподписанный сертификат
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/selfsigned.key \
  -out /etc/ssl/certs/selfsigned.crt

# Раскомментировать строки SSL в nginx.conf:
# ssl_certificate /etc/ssl/certs/selfsigned.crt;
# ssl_certificate_key /etc/ssl/private/selfsigned.key;

# Перезапустить Nginx
sudo systemctl restart nginx
```

### Вариант 3: Коммерческий SSL сертификат

Если у вас есть сертификат от провайдера:

```bash
# Скопируйте файлы сертификата
sudo cp certificate.crt /etc/ssl/certs/
sudo cp private.key /etc/ssl/private/

# Обновите пути в nginx.conf
# ssl_certificate /etc/ssl/certs/certificate.crt;
# ssl_certificate_key /etc/ssl/private/private.key;

# Перезапустить Nginx
sudo systemctl restart nginx
```

## Логи и отладка

### Просмотр логов Nginx

```bash
# Логи доступа
sudo tail -f /var/log/nginx/access.log

# Логи ошибок
sudo tail -f /var/log/nginx/error.log
```

### Просмотр логов Node.js

```bash
# Если запущен через PM2
pm2 logs corporate-chat

# Если запущен напрямую, смотрите stdout
```

### Проверка портов

```bash
# Проверить что Nginx слушает на 80 и 443
sudo netstat -tlnp | grep nginx

# Проверить что Node.js слушает на 3000
sudo netstat -tlnp | grep node
```

## Архитектура после настройки

```
Браузер (https://62.113.98.228)
         ↓
    Nginx (порт 80/443)
         ↓
    Node.js Server (порт 3000)
         ↓
    PostgreSQL (порт 5432)
```

Все запросы идут через один домен, Mixed Content исчезает!

## Решение проблем

### Ошибка "502 Bad Gateway"

```bash
# Проверьте что Node.js работает
curl http://localhost:3000/api/health

# Проверьте логи Nginx
sudo tail -f /var/log/nginx/error.log

# Перезапустите Node.js
pm2 restart corporate-chat
```

### Ошибка "Connection refused"

```bash
# Убедитесь что Node.js слушает на правильном порту
sudo netstat -tlnp | grep 3000

# Проверьте .env файл
cat .env | grep PORT
```

### Nginx не запускается

```bash
# Проверьте синтаксис конфига
sudo nginx -t

# Посмотрите детальные ошибки
sudo journalctl -xe | grep nginx
```

## Дополнительные рекомендации для прода

1. **Используйте PM2** для автозапуска Node.js:
   ```bash
   pm2 start server.js --name corporate-chat
   pm2 save
   pm2 startup
   ```

2. **Включите логирование в PM2**:
   ```bash
   pm2 install pm2-logrotate
   ```

3. **Настройте автоматическое обновление SSL**:
   ```bash
   sudo certbot renew --dry-run
   ```

4. **Добавьте мониторинг**:
   ```bash
   pm2 install pm2-server-monit
   ```

5. **Настройте rate limiting в Nginx** (уже есть в коде Express, но можно добавить и в Nginx)

## Готово!

После выполнения всех шагов ваш чат будет доступен по адресу:
- HTTP: `http://62.113.98.228`
- HTTPS: `https://62.113.98.228` (если настроили SSL)

Mixed Content больше не будет появляться! 🎉
