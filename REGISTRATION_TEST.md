# 🧪 Инструкция по тестированию регистрации

## Шаг 1: Обновите код на сервере

```bash
cd ~/corporate-chat-backend
git pull origin claude/improve-polls-ui-from-push-notif-011CV5pfCkuVUJ1DfS5T5Zhk
pm2 restart corporate-chat
```

## Шаг 2: Проверьте страницу входа

1. Откройте: https://chat.gyda.ru
2. **Проверка:** Внизу должна быть видна кнопка "📝 Зарегистрироваться" с белым фоном и синим текстом
3. При наведении мыши кнопка должна немного подниматься

## Шаг 3: Протестируйте форму регистрации

1. Кликните "📝 Зарегистрироваться"
2. Откроется форма регистрации
3. **Заполните:**
   - Email: `test@example.com` (любой тестовый)
   - ФИО: `Иванов Иван Иванович`
   - Username: автоматически сгенерируется `ivanovi`
   - Пароль: автоматически сгенерируется
   - Роль: выберите `Сотрудник`
   - Отдел: выберите любой из списка

4. **Проверка полей:**
   - Username должен появиться автоматически после ввода ФИО
   - Пароль должен быть сгенерирован (12 символов)
   - Можно скопировать пароль кнопкой 📋
   - Можно сгенерировать новый пароль кнопкой 🔄

5. Нажмите "📨 Отправить заявку"

## Шаг 4: Проверьте email уведомление

1. Откройте почту `vaitmarket@ya.ru`
2. **Ожидается:** Письмо от Brevo с темой "🔔 Новая заявка на регистрацию"
3. В письме должны быть:
   - Email пользователя
   - ФИО
   - Username
   - Сгенерированный пароль
   - Роль и отдел
   - Кнопки "✅ Подтвердить" и "❌ Отклонить"

**Примечание:** Первое письмо может попасть в спам!

## Шаг 5: Проверьте админ-панель

1. Откройте: https://chat.gyda.ru/admin-panel.html
2. Войдите как администратор
3. Перейдите в раздел "📝 Заявки на регистрацию"
4. **Ожидается:** В таблице появилась новая заявка со статусом "⏳ Ожидает"

## Шаг 6: Подтвердите заявку

**Способ 1: Через email**
1. В письме кликните "✅ Подтвердить"
2. Откроется страница с подтверждением
3. Пользователь получит письмо с логином и паролем

**Способ 2: Через базу данных** (если email не работает)
```sql
-- Получить список заявок
SELECT id, email, full_name, status FROM registration_requests;

-- Пометить как одобренную вручную
UPDATE registration_requests SET status = 'approved', approved_at = NOW() WHERE email = 'test@example.com';

-- Создать пользователя вручную
INSERT INTO users (username, email, password_hash, initial_password, name, role, department)
SELECT username, email, password_hash, generated_password, full_name, role, department
FROM registration_requests WHERE email = 'test@example.com';
```

## Шаг 7: Проверьте вход

1. Откройте: https://chat.gyda.ru
2. Введите:
   - Логин: `test@example.com` (email из заявки)
   - Пароль: (из письма или сгенерированный)
3. **Ожидается:** Успешный вход в систему

## 🐛 Возможные проблемы

### Проблема: Email не приходит

**Решение 1:** Проверьте спам
**Решение 2:** Проверьте логи сервера
```bash
pm2 logs corporate-chat --lines 100 | grep -i email
```

**Решение 3:** Проверьте настройки Brevo
- Зайдите в https://app.brevo.com
- Проверьте, что email `vaitmarket@ya.ru` верифицирован

### Проблема: Ошибка "Access denied"

**Причина:** Nginx может блокировать /api/registration
**Решение:** Проверьте конфигурацию nginx
```bash
sudo nano /etc/nginx/sites-available/corporate-chat
# Убедитесь что есть:
location /api/ {
    proxy_pass http://localhost:3000;
    ...
}
```

### Проблема: Заявка создается, но email не отправляется

**Проверка:**
```bash
# Проверьте переменные окружения
cat ~/.env | grep SMTP
```

Должно быть:
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<your_brevo_login>
SMTP_PASS=<your_brevo_api_key>
ADMIN_EMAIL=vaitmarket@ya.ru
APP_URL=https://chat.gyda.ru
```

## ✅ Критерии успешного теста

- [x] Кнопка регистрации видна на странице входа
- [x] Форма регистрации открывается и работает
- [x] Username генерируется автоматически из ФИО
- [x] Пароль генерируется автоматически
- [x] Заявка сохраняется в базу данных
- [x] Заявка видна в админ-панели
- [x] Email приходит администратору (опционально)
- [x] Можно подтвердить заявку
- [x] Пользователь может войти после подтверждения

## 📊 Проверка данных в БД

```sql
-- Посмотреть все заявки
SELECT id, email, full_name, username, role, department, status, created_at
FROM registration_requests
ORDER BY created_at DESC;

-- Посмотреть созданных пользователей с email
SELECT id, username, email, name, role, department, created_at
FROM users
WHERE email IS NOT NULL
ORDER BY created_at DESC;
```
