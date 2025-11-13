module.exports = {
  apps: [
    {
      name: 'corporate-chat',
      script: 'server.js',
      cwd: '/home/damir/corporate-chat-backend',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        DB_HOST: 'localhost',
        DB_USER: 'postgres',
        DB_PASSWORD: '12345',
        DB_NAME: 'chat_db',
        DB_PORT: 5432,
        DB_SSL: false,
        CORS_ORIGIN: '*',
        JWT_SECRET: 'supersecretkey123',
        TOKEN_EXPIRES_IN: '7d',
        INIT_DB_ON_BOOT: false,
        // Push Notifications (Web Push / VAPID)
        VAPID_PUBLIC_KEY: 'BDUxpvrAZJV6Kz7WThaACidffo64aw2eB49wX6ekzpGNk37qF5qk_NZ10CrNphNe6ySHkU80RWs6Rgs-3N4RgZU',
        VAPID_PRIVATE_KEY: 'rXbGEql7G-Y6MQjhLwyMs_VMoaVF9k8WPguESVdONbM',
        VAPID_SUBJECT: 'mailto:admin@corporate-chat.com',
        // Jitsi Meet Configuration (Video/Audio Calls)
        JITSI_DOMAIN: 'meet.jit.si',
        JITSI_APP_ID: 'corporate_chat',
        JITSI_APP_SECRET: 'your_jitsi_secret_change_in_production_min_32_chars',
        JITSI_USE_JWT: 'false'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        DB_HOST: 'localhost',
        DB_USER: 'postgres',
        DB_PASSWORD: '12345',
        DB_NAME: 'chat_db',
        DB_PORT: 5432,
        DB_SSL: false,
        CORS_ORIGIN: '*',
        JWT_SECRET: 'supersecretkey123',
        TOKEN_EXPIRES_IN: '7d',
        INIT_DB_ON_BOOT: false,
        // Push Notifications (Web Push / VAPID)
        VAPID_PUBLIC_KEY: 'BDUxpvrAZJV6Kz7WThaACidffo64aw2eB49wX6ekzpGNk37qF5qk_NZ10CrNphNe6ySHkU80RWs6Rgs-3N4RgZU',
        VAPID_PRIVATE_KEY: 'rXbGEql7G-Y6MQjhLwyMs_VMoaVF9k8WPguESVdONbM',
        VAPID_SUBJECT: 'mailto:admin@corporate-chat.com',
        // Jitsi Meet Configuration (Video/Audio Calls)
        JITSI_DOMAIN: 'meet.jit.si',
        JITSI_APP_ID: 'corporate_chat',
        JITSI_APP_SECRET: 'your_jitsi_secret_change_in_production_min_32_chars',
        JITSI_USE_JWT: 'false'
      }
    }
  ]
};
