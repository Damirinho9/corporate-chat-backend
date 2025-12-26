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
        DB_NAME: 'corporate_chat',
        DB_PORT: 5433,
        DB_SSL: false,
        CORS_ORIGIN: '*',
        JWT_SECRET: 'supersecretkey123',
        TOKEN_EXPIRES_IN: '30d',
        INIT_DB_ON_BOOT: false
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        DB_HOST: 'localhost',
        DB_USER: 'postgres',
        DB_PASSWORD: '12345',
        DB_NAME: 'corporate_chat',
        DB_PORT: 5433,
        DB_SSL: false,
        CORS_ORIGIN: '*',
        JWT_SECRET: 'supersecretkey123',
        TOKEN_EXPIRES_IN: '30d',
        INIT_DB_ON_BOOT: false
      }
    }
  ]
};
