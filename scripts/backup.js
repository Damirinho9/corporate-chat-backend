// scripts/backup.js
// Полноценная система резервного копирования для защиты production данных

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const execAsync = promisify(exec);

// Конфигурация из переменных окружения
const CONFIG = {
  BACKUP_ENABLED: process.env.BACKUP_ENABLED === 'true',
  BACKUP_DIR: process.env.BACKUP_DIR || './backups',
  BACKUP_KEEP_DAYS: parseInt(process.env.BACKUP_KEEP_DAYS || '7', 10),
  BACKUP_INTERVAL_HOURS: parseInt(process.env.BACKUP_INTERVAL_HOURS || '24', 10),

  // Database config
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || '5432',
  DB_NAME: process.env.DB_NAME || 'corporate_chat',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD,

  // Directories to backup
  UPLOADS_DIR: process.env.UPLOAD_DIR || './uploads',
};

/**
 * Создает директорию для бэкапов если её нет
 */
async function ensureBackupDir() {
  try {
    await fs.mkdir(CONFIG.BACKUP_DIR, { recursive: true });
    logger.info(`[Backup] Backup directory ready: ${CONFIG.BACKUP_DIR}`);
  } catch (error) {
    logger.error(`[Backup] Failed to create backup directory: ${error.message}`);
    throw error;
  }
}

/**
 * Создает резервную копию базы данных PostgreSQL
 */
async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `db-backup-${timestamp}.sql`;
  const filepath = path.join(CONFIG.BACKUP_DIR, filename);

  logger.info(`[Backup] Starting database backup: ${filename}`);

  try {
    // pg_dump с сжатием
    const pgDumpCmd = `PGPASSWORD="${CONFIG.DB_PASSWORD}" pg_dump \
      -h ${CONFIG.DB_HOST} \
      -p ${CONFIG.DB_PORT} \
      -U ${CONFIG.DB_USER} \
      -d ${CONFIG.DB_NAME} \
      --format=plain \
      --no-owner \
      --no-acl \
      --clean \
      --if-exists \
      -f "${filepath}"`;

    await execAsync(pgDumpCmd);

    // Сжимаем бэкап
    await execAsync(`gzip -f "${filepath}"`);
    const gzipFilepath = `${filepath}.gz`;

    const stats = await fs.stat(gzipFilepath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    logger.info(`[Backup] Database backup completed: ${filename}.gz (${sizeInMB} MB)`);
    return gzipFilepath;
  } catch (error) {
    logger.error(`[Backup] Database backup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Создает резервную копию файлов (uploads)
 */
async function backupFiles() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `files-backup-${timestamp}.tar.gz`;
  const filepath = path.join(CONFIG.BACKUP_DIR, filename);

  logger.info(`[Backup] Starting files backup: ${filename}`);

  try {
    // Проверяем существует ли директория uploads
    try {
      await fs.access(CONFIG.UPLOADS_DIR);
    } catch {
      logger.info(`[Backup] Uploads directory doesn't exist, skipping files backup`);
      return null;
    }

    // tar с сжатием
    const tarCmd = `tar -czf "${filepath}" -C "${path.dirname(CONFIG.UPLOADS_DIR)}" "${path.basename(CONFIG.UPLOADS_DIR)}"`;
    await execAsync(tarCmd);

    const stats = await fs.stat(filepath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    logger.info(`[Backup] Files backup completed: ${filename} (${sizeInMB} MB)`);
    return filepath;
  } catch (error) {
    logger.error(`[Backup] Files backup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Создает метаданные бэкапа в JSON формате
 */
async function createBackupMetadata(dbBackupPath, filesBackupPath) {
  const timestamp = new Date().toISOString();
  const metadata = {
    timestamp,
    date: new Date().toLocaleString('ru-RU'),
    database: dbBackupPath ? path.basename(dbBackupPath) : null,
    files: filesBackupPath ? path.basename(filesBackupPath) : null,
    config: {
      db_name: CONFIG.DB_NAME,
      db_host: CONFIG.DB_HOST,
    },
  };

  const metadataFilename = `backup-metadata-${timestamp.replace(/[:.]/g, '-')}.json`;
  const metadataPath = path.join(CONFIG.BACKUP_DIR, metadataFilename);

  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  logger.info(`[Backup] Metadata saved: ${metadataFilename}`);

  return metadataPath;
}

/**
 * Удаляет старые бэкапы старше BACKUP_KEEP_DAYS дней
 */
async function cleanupOldBackups() {
  logger.info(`[Backup] Cleaning up backups older than ${CONFIG.BACKUP_KEEP_DAYS} days`);

  try {
    const files = await fs.readdir(CONFIG.BACKUP_DIR);
    const now = Date.now();
    const maxAge = CONFIG.BACKUP_KEEP_DAYS * 24 * 60 * 60 * 1000; // в миллисекундах

    let deletedCount = 0;
    for (const file of files) {
      const filepath = path.join(CONFIG.BACKUP_DIR, file);
      const stats = await fs.stat(filepath);

      const age = now - stats.mtimeMs;
      if (age > maxAge) {
        await fs.unlink(filepath);
        deletedCount++;
        logger.info(`[Backup] Deleted old backup: ${file}`);
      }
    }

    logger.info(`[Backup] Cleanup completed: ${deletedCount} old backups removed`);
  } catch (error) {
    logger.error(`[Backup] Cleanup failed: ${error.message}`);
    // Не бросаем ошибку, cleanup не критичен
  }
}

/**
 * Выполняет полное резервное копирование
 */
async function performBackup() {
  logger.info('[Backup] === Starting full backup ===');
  const startTime = Date.now();

  try {
    await ensureBackupDir();

    // Бэкап базы данных
    const dbBackupPath = await backupDatabase();

    // Бэкап файлов
    const filesBackupPath = await backupFiles();

    // Сохраняем метаданные
    await createBackupMetadata(dbBackupPath, filesBackupPath);

    // Очистка старых бэкапов
    await cleanupOldBackups();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`[Backup] === Full backup completed in ${duration}s ===`);

    return { success: true, dbBackupPath, filesBackupPath };
  } catch (error) {
    logger.error(`[Backup] Full backup failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Инициализация системы автоматических бэкапов
 */
function initBackup() {
  if (!CONFIG.BACKUP_ENABLED) {
    logger.info('[Backup] Backup disabled - set BACKUP_ENABLED=true to enable');
    return;
  }

  logger.info('[Backup] Backup system enabled');
  logger.info(`[Backup] Backup interval: ${CONFIG.BACKUP_INTERVAL_HOURS} hours`);
  logger.info(`[Backup] Backup retention: ${CONFIG.BACKUP_KEEP_DAYS} days`);

  // Выполняем первый бэкап при старте (через 5 минут)
  setTimeout(() => {
    performBackup().catch(err => {
      logger.error(`[Backup] Initial backup failed: ${err.message}`);
    });
  }, 5 * 60 * 1000);

  // Настраиваем периодические бэкапы
  const intervalMs = CONFIG.BACKUP_INTERVAL_HOURS * 60 * 60 * 1000;
  setInterval(() => {
    performBackup().catch(err => {
      logger.error(`[Backup] Scheduled backup failed: ${err.message}`);
    });
  }, intervalMs);

  logger.info('[Backup] Backup scheduler started');
}

/**
 * Выполняет бэкап немедленно (для ручного вызова)
 */
async function backupNow() {
  logger.info('[Backup] Manual backup requested');
  return performBackup();
}

// Если запускается напрямую (node scripts/backup.js)
if (require.main === module) {
  require('dotenv').config();
  performBackup()
    .then(result => {
      if (result.success) {
        console.log('✅ Backup completed successfully');
        process.exit(0);
      } else {
        console.error('❌ Backup failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Backup error:', error.message);
      process.exit(1);
    });
}

module.exports = initBackup;
module.exports.initBackup = initBackup;
module.exports.backupNow = backupNow;
module.exports.performBackup = performBackup;
