module.exports = {
  apps: [
    {
      name: 'corporate-chat',
      script: 'server.js',
      cwd: '/root/corporate-chat-backend',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        DB_HOST: 'localhost',
        DB_USER: 'postgres',
        DB_PASS: '12345',
        DB_NAME: 'chat_db',
        DB_PORT: 5432,
        DB_SSL: false,
        CORS_ORIGIN: '*',
        JWT_SECRET: 'supersecretkey123',
        TOKEN_EXPIRES_IN: '7d',
        INIT_DB_ON_BOOT: false
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        DB_HOST: 'localhost',
        DB_USER: 'postgres',
        DB_PASS: '12345',
        DB_NAME: 'chat_db',
        DB_PORT: 5432,
        DB_SSL: false,
        CORS_ORIGIN: '*',
        JWT_SECRET: 'supersecretkey123',
        TOKEN_EXPIRES_IN: '7d',
        INIT_DB_ON_BOOT: false
      }
    }
  ]
};
