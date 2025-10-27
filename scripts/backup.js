// scripts/backup.js
const logger = require('../utils/logger');

function initBackup() {
  if (process.env.BACKUP_ENABLED !== 'true') {
    logger.info('Backup disabled - set BACKUP_ENABLED=true to enable');
    return;
  }
  // здесь может быть cron или pg_dump, пока no-op
  logger.info('Backup enabled - no-op stub running');
}

function backupNow() {
  logger.info('Manual backup requested - no-op stub');
  return Promise.resolve();
}

// совместимость со всеми вариантами импорта и вызова
module.exports = initBackup;
module.exports.initBackup = initBackup;
module.exports.backupNow = backupNow;