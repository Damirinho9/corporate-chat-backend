#!/usr/bin/env node

/**
 * Проверка окружения перед развертыванием в production
 * Запустите перед деплоем: node check-production-env.js
 */

require('dotenv').config();

const chalk = require('chalk') || {
    green: (text) => `✅ ${text}`,
    red: (text) => `❌ ${text}`,
    yellow: (text) => `⚠️  ${text}`,
    blue: (text) => `ℹ️  ${text}`
};

console.log('\n🔍 Проверка конфигурации для production...\n');

let errors = 0;
let warnings = 0;

// Проверка обязательных переменных
const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CORS_ORIGIN'
];

console.log('📋 Обязательные переменные окружения:\n');

required.forEach(key => {
    const value = process.env[key];
    if (!value) {
        console.log(chalk.red(`   ${key}: НЕ УСТАНОВЛЕНА`));
        errors++;
    } else if (value.includes('ЗАМЕНИТЕ') || value.includes('YOUR_')) {
        console.log(chalk.yellow(`   ${key}: ТРЕБУЕТ ЗАМЕНЫ`));
        warnings++;
    } else {
        const displayValue = key.includes('SECRET') || key.includes('PASSWORD') || key.includes('URL')
            ? '***'
            : value;
        console.log(chalk.green(`   ${key}: ${displayValue}`));
    }
});

// Проверка NODE_ENV
console.log('\n🔧 Режим работы:\n');
if (process.env.NODE_ENV !== 'production') {
    console.log(chalk.yellow(`   NODE_ENV: ${process.env.NODE_ENV || 'не установлена'} (должна быть 'production')`));
    warnings++;
} else {
    console.log(chalk.green(`   NODE_ENV: production`));
}

// Проверка безопасности JWT секретов
console.log('\n🔐 Безопасность:\n');

const jwtSecret = process.env.JWT_SECRET || '';
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || '';

if (jwtSecret.length < 32) {
    console.log(chalk.red(`   JWT_SECRET: слишком короткий (${jwtSecret.length} символов, минимум 32)`));
    errors++;
} else {
    console.log(chalk.green(`   JWT_SECRET: достаточной длины (${jwtSecret.length} символов)`));
}

if (jwtRefreshSecret.length < 32) {
    console.log(chalk.red(`   JWT_REFRESH_SECRET: слишком короткий (${jwtRefreshSecret.length} символов, минимум 32)`));
    errors++;
} else {
    console.log(chalk.green(`   JWT_REFRESH_SECRET: достаточной длины (${jwtRefreshSecret.length} символов)`));
}

if (jwtSecret === jwtRefreshSecret) {
    console.log(chalk.red(`   JWT секреты: ОДИНАКОВЫЕ (должны различаться!)`));
    errors++;
}

// Проверка DATABASE_URL
console.log('\n💾 База данных:\n');
const dbUrl = process.env.DATABASE_URL || '';
if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
    console.log(chalk.green(`   DATABASE_URL: локальное подключение`));
} else if (dbUrl.startsWith('postgresql://')) {
    console.log(chalk.green(`   DATABASE_URL: настроен`));
} else {
    console.log(chalk.red(`   DATABASE_URL: неверный формат`));
    errors++;
}

// Проверка CORS
console.log('\n🌐 CORS:\n');
const corsOrigin = process.env.CORS_ORIGIN || '';
if (corsOrigin.startsWith('https://chat.gyda.ru')) {
    console.log(chalk.green(`   CORS_ORIGIN: ${corsOrigin}`));
} else if (corsOrigin === '*') {
    console.log(chalk.yellow(`   CORS_ORIGIN: * (небезопасно для production!)`));
    warnings++;
} else {
    console.log(chalk.yellow(`   CORS_ORIGIN: ${corsOrigin || 'не установлен'}`));
    warnings++;
}

// Итоги
console.log('\n' + '='.repeat(50));
console.log('\n📊 Результаты проверки:\n');

if (errors === 0 && warnings === 0) {
    console.log(chalk.green('   ✅ Конфигурация готова к развертыванию!'));
    console.log('\n💡 Следующие шаги:');
    console.log('   1. Загрузите код на сервер');
    console.log('   2. Запустите: npm install --production');
    console.log('   3. Инициализируйте БД: node setup-db.js');
    console.log('   4. Запустите приложение\n');
    process.exit(0);
} else {
    if (errors > 0) {
        console.log(chalk.red(`   ❌ Найдено ошибок: ${errors}`));
    }
    if (warnings > 0) {
        console.log(chalk.yellow(`   ⚠️  Найдено предупреждений: ${warnings}`));
    }
    console.log('\n💡 Рекомендации:');
    console.log('   1. Исправьте все ошибки перед развертыванием');
    console.log('   2. Создайте .env файл на основе .env.production.example');
    console.log('   3. Сгенерируйте секретные ключи:');
    console.log('      node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');

    process.exit(errors > 0 ? 1 : 0);
}
