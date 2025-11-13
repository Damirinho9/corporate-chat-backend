// public/service-worker.js
// Service Worker для обработки push-уведомлений

const CACHE_NAME = 'corporate-chat-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache.filter(url => {
          // Кэшируем только существующие файлы
          return fetch(url, { method: 'HEAD' })
            .then(response => response.ok)
            .catch(() => false);
        }));
      })
      .catch(err => console.log('[Service Worker] Cache failed:', err))
  );
  self.skipWaiting();
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch - стратегия Network First
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Клонируем ответ
        const responseToCache = response.clone();

        // Кэшируем новый ответ
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // Если сеть недоступна, пытаемся получить из кэша
        return caches.match(event.request);
      })
  );
});

// ==================== PUSH NOTIFICATION HANDLER ====================
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);

  let notificationData = {
    title: 'Новое сообщение',
    body: 'У вас новое сообщение в Corporate Chat',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: 'default',
    data: {}
  };

  // Парсим данные уведомления
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        tag: data.tag || notificationData.tag,
        data: data.data || {},
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || []
      };
    } catch (e) {
      console.error('[Service Worker] Error parsing push data:', e);
      notificationData.body = event.data.text();
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    tag: notificationData.tag,
    data: notificationData.data,
    requireInteraction: notificationData.requireInteraction,
    actions: notificationData.actions,
    vibrate: [200, 100, 200],
    timestamp: Date.now()
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// ==================== NOTIFICATION CLICK HANDLER ====================
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event);

  event.notification.close();

  // Обработка действий в уведомлении
  if (event.action) {
    console.log('[Service Worker] Notification action:', event.action);
    // Можно добавить обработку различных действий
    // например, 'reply', 'mute', etc.
  }

  // Открываем или фокусируемся на окне чата
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const notificationData = event.notification.data;

        // Формируем URL для перехода
        let urlToOpen = '/';
        if (notificationData && notificationData.chatId) {
          urlToOpen = `/chat/${notificationData.chatId}`;
        } else if (notificationData && notificationData.url) {
          urlToOpen = notificationData.url;
        }

        // Проверяем, есть ли уже открытое окно
        for (let client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // Если окно уже открыто, фокусируемся на нём и переходим на нужный чат
            return client.focus().then(() => {
              if ('navigate' in client) {
                return client.navigate(urlToOpen);
              }
            });
          }
        }

        // Если окна нет, открываем новое
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// ==================== NOTIFICATION CLOSE HANDLER ====================
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification closed:', event.notification.tag);

  // Можно отправить аналитику о закрытии уведомления
  const notificationData = event.notification.data;
  if (notificationData && notificationData.trackClose) {
    // Отправляем событие о закрытии
    fetch('/api/push/analytics/close', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tag: event.notification.tag,
        timestamp: Date.now()
      })
    }).catch(err => console.error('[Service Worker] Failed to track close:', err));
  }
});

// ==================== BACKGROUND SYNC ====================
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);

  if (event.tag === 'sync-messages') {
    event.waitUntil(
      // Синхронизация непрочитанных сообщений
      fetch('/api/messages/unread')
        .then(response => response.json())
        .then(data => {
          console.log('[Service Worker] Synced messages:', data);
        })
        .catch(err => console.error('[Service Worker] Sync failed:', err))
    );
  }
});

// ==================== MESSAGE HANDLER ====================
// Обработка сообщений от клиента
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache => cache.addAll(event.data.urls))
    );
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
    );
  }

  // Отправляем ответ клиенту
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage({
      type: 'ACK',
      message: 'Message received by service worker'
    });
  }
});

console.log('[Service Worker] Loaded successfully');
