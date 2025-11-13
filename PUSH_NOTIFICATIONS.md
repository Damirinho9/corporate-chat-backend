# Push-уведомления в Corporate Chat

## Обзор

Система push-уведомлений реализована с использованием Web Push API и Service Workers. Уведомления отправляются пользователям о:
- Новых сообщениях в чатах
- Упоминаниях (@username)
- Личных сообщениях

## Архитектура

### Backend
- **routes/push.js** - API endpoints для управления подписками и настройками
- **utils/pushNotifications.js** - Утилита для отправки push-уведомлений
- **Базы данных:**
  - `push_subscriptions` - хранение подписок пользователей
  - `notification_settings` - настройки уведомлений пользователя
  - `notification_logs` - логи отправленных уведомлений

### Frontend
- **public/service-worker.js** - Service Worker для обработки push-событий
- **public/manifest.json** - Web App Manifest для PWA

## Установка и настройка

### 1. Установка зависимостей

```bash
npm install web-push
```

### 2. Генерация VAPID ключей

VAPID ключи уже сгенерированы и добавлены в `.env.example`. Для production генерируйте новые:

```bash
node -e "const webpush = require('web-push'); const vapidKeys = webpush.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey); console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);"
```

### 3. Настройка переменных окружения

Добавьте в `.env`:

```env
VAPID_PUBLIC_KEY=ваш_публичный_ключ
VAPID_PRIVATE_KEY=ваш_приватный_ключ
VAPID_SUBJECT=mailto:admin@yourdomain.com
```

## API Endpoints

### Получить публичный VAPID ключ
```
GET /api/push/vapid-public-key
Authorization: Bearer <token>

Response:
{
  "publicKey": "BDUxpvrAZJV6Kz7..."
}
```

### Подписаться на уведомления
```
POST /api/push/subscribe
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BKx...",
    "auth": "abc..."
  }
}

Response:
{
  "success": true,
  "message": "Successfully subscribed to push notifications"
}
```

### Отписаться от уведомлений
```
POST /api/push/unsubscribe
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}

Response:
{
  "success": true,
  "message": "Successfully unsubscribed from push notifications"
}
```

### Получить настройки уведомлений
```
GET /api/push/settings
Authorization: Bearer <token>

Response:
{
  "id": 1,
  "user_id": 5,
  "enabled": true,
  "new_messages": true,
  "mentions": true,
  "direct_messages": true,
  "group_messages": true,
  "sound": true,
  "created_at": "2025-01-01T00:00:00.000Z",
  "updated_at": "2025-01-01T00:00:00.000Z"
}
```

### Обновить настройки уведомлений
```
PUT /api/push/settings
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "enabled": true,
  "mentions": true,
  "sound": false
}

Response:
{
  "id": 1,
  "user_id": 5,
  "enabled": true,
  "new_messages": true,
  "mentions": true,
  "direct_messages": true,
  "group_messages": true,
  "sound": false,
  ...
}
```

### Отправить тестовое уведомление
```
POST /api/push/test
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Test notification sent to 2 subscription(s)",
  "successCount": 2,
  "failCount": 0
}
```

### Получить список подписок
```
GET /api/push/subscriptions
Authorization: Bearer <token>

Response:
[
  {
    "id": 1,
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "user_agent": "Mozilla/5.0...",
    "is_active": true,
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z"
  }
]
```

### Получить количество непрочитанных сообщений (для badge)
```
GET /api/push/unread-count
Authorization: Bearer <token>

Response:
{
  "count": 5
}
```

## Интеграция на клиенте

### 1. Регистрация Service Worker

```javascript
// Регистрация Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(registration => {
      console.log('Service Worker registered:', registration);
    })
    .catch(error => {
      console.error('Service Worker registration failed:', error);
    });
}
```

### 2. Запрос разрешения на уведомления

```javascript
async function requestNotificationPermission() {
  const permission = await Notification.requestPermission();

  if (permission === 'granted') {
    console.log('Notification permission granted');
    await subscribeToPushNotifications();
  } else {
    console.log('Notification permission denied');
  }
}
```

### 3. Подписка на push-уведомления

```javascript
async function subscribeToPushNotifications() {
  try {
    // Получаем публичный VAPID ключ с сервера
    const response = await fetch('/api/push/vapid-public-key', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    const { publicKey } = await response.json();

    // Получаем Service Worker registration
    const registration = await navigator.serviceWorker.ready;

    // Подписываемся на push-уведомления
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    // Отправляем подписку на сервер
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(subscription)
    });

    console.log('Successfully subscribed to push notifications');
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
  }
}

// Утилита для конвертации base64 в Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
```

### 4. Отписка от уведомлений

```javascript
async function unsubscribeFromPushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint
        })
      });

      await subscription.unsubscribe();
      console.log('Successfully unsubscribed from push notifications');
    }
  } catch (error) {
    console.error('Failed to unsubscribe from push notifications:', error);
  }
}
```

## Типы уведомлений

### 1. Новое сообщение в чате
- **Тип:** `new_message`, `direct_message`, `group_message`
- **Когда отправляется:** При получении нового сообщения офлайн пользователем
- **Содержимое:** Имя отправителя, название чата, превью сообщения

### 2. Упоминание (@username)
- **Тип:** `mention`
- **Когда отправляется:** Когда пользователя упоминают в сообщении
- **Содержимое:** Имя отправителя, название чата, превью сообщения
- **Особенность:** Требует взаимодействия пользователя (`requireInteraction: true`)

### 3. Тестовое уведомление
- **Тип:** `test`
- **Когда отправляется:** При запросе на `/api/push/test`
- **Содержимое:** Тестовое сообщение

## Настройки уведомлений

Каждый пользователь может настроить:
- **enabled** - Включить/выключить все уведомления
- **new_messages** - Уведомления о новых сообщениях
- **mentions** - Уведомления об упоминаниях
- **direct_messages** - Уведомления о личных сообщениях
- **group_messages** - Уведомления о групповых сообщениях
- **sound** - Звук уведомлений (обрабатывается на клиенте)

## Badge с непрочитанными сообщениями

Badge автоматически показывает количество непрочитанных сообщений:
- Обновляется при каждой отправке уведомления
- Можно получить актуальное значение через `/api/push/unread-count`
- Очищается автоматически при прочтении сообщений

## Безопасность

1. **VAPID аутентификация** - защищает от подделки уведомлений
2. **JWT токены** - все API endpoints требуют аутентификации
3. **Проверка владельца** - пользователь может управлять только своими подписками
4. **HTTPS** - обязательно для работы Service Workers и Web Push

## Мониторинг и логирование

Все отправленные уведомления логируются в таблицу `notification_logs`:
- Успешные и неуспешные отправки
- Тип уведомления
- Текст уведомления
- Сообщения об ошибках

Можно использовать для аналитики и отладки.

## Ограничения

1. **Требуется HTTPS** - Service Workers работают только через HTTPS (кроме localhost)
2. **Разрешение пользователя** - пользователь должен разрешить уведомления
3. **Браузерная поддержка** - не все браузеры поддерживают Web Push API
4. **Срок действия подписок** - подписки могут истекать, нужна переподписка
5. **Лимиты отправки** - некоторые браузеры ограничивают частоту уведомлений

## Тестирование

### 1. Тестовое уведомление через API
```bash
curl -X POST https://your-domain.com/api/push/test \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Проверка подписки
```bash
curl https://your-domain.com/api/push/subscriptions \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Проверка настроек
```bash
curl https://your-domain.com/api/push/settings \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Troubleshooting

### Уведомления не приходят

1. Проверьте, что VAPID ключи правильно настроены в `.env`
2. Убедитесь, что Service Worker зарегистрирован
3. Проверьте разрешения браузера на уведомления
4. Проверьте логи в таблице `notification_logs`
5. Убедитесь, что настройки уведомлений включены

### Подписка не сохраняется

1. Проверьте, что endpoint уникален
2. Убедитесь, что JWT токен валиден
3. Проверьте наличие таблиц в БД

### Service Worker не регистрируется

1. Убедитесь, что используется HTTPS или localhost
2. Проверьте путь к service-worker.js
3. Проверьте консоль браузера на ошибки

## Дополнительная информация

- [Web Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [VAPID](https://blog.mozilla.org/services/2016/08/23/sending-vapid-identified-webpush-notifications-via-mozillas-push-service/)
- [web-push library](https://github.com/web-push-libs/web-push)
