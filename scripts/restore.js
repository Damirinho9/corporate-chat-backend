// scripts/restore.js
// Скрипт восстановления из резервных копий

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const execAsync = promisify(exec);

// Конфигурация
const CONFIG = {
  BACKUP_DIR: process.env.BACKUP_DIR || './backups',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || '5432',
  DB_NAME: process.env.DB_NAME || 'corporate_chat',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD,
  UPLOADS_DIR: process.env.UPLOAD_DIR || './uploads',
};

/**
 * Спрашивает пользователя подтверждение
 */
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question + ' (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Получает список доступных бэкапов
 */
async function listAvailableBackups() {
  try {
    const files = await fs.readdir(CONFIG.BACKUP_DIR);

    // Группируем бэкапы по метаданным
    const metadataFiles = files.filter(f => f.startsWith('backup-metadata-') && f.endsWith('.json'));

    const backups = [];
    for (const metaFile of metadataFiles) {
      const metaPath = path.join(CONFIG.BACKUP_DIR, metaFile);
      const metaContent = await fs.readFile(metaPath, 'utf8');
      const metadata = JSON.parse(metaContent);

      // Проверяем существование файлов бэкапа
      const dbExists = metadata.database ?
        await fs.access(path.join(CONFIG.BACKUP_DIR, metadata.database)).then(() => true).catch(() => false) : false;
      const filesExists = metadata.files ?
        await fs.access(path.join(CONFIG.BACKUP_DIR, metadata.files)).then(() => true).catch(() => false) : false;

      backups.push({
        metadata,
        metadataFile: metaFile,
        dbExists,
        filesExists,
      });
    }

    // Сортируем по дате (новые первые)
    backups.sort((a, b) => new Date(b.metadata.timestamp) - new Date(a.metadata.timestamp));

    return backups;
  } catch (error) {
    console.error('❌ Failed to list backups:', error.message);
    return [];
  }
}

/**
 * Восстанавливает базу данных из бэкапа
 */
async function restoreDatabase(backupFilename) {
  const backupPath = path.join(CONFIG.BACKUP_DIR, backupFilename);

  console.log(`📦 Restoring database from: ${backupFilename}`);

  try {
    // Распаковываем если gzip
    let sqlFile = backupPath;
    if (backupFilename.endsWith('.gz')) {
      console.log('📂 Decompressing backup...');
      await execAsync(`gunzip -k -f "${backupPath}"`);
      sqlFile = backupPath.replace('.gz', '');
    }

    // Восстанавливаем БД
    console.log('💾 Restoring database...');
    const restoreCmd = `PGPASSWORD="${CONFIG.DB_PASSWORD}" psql \
      -h ${CONFIG.DB_HOST} \
      -p ${CONFIG.DB_PORT} \
      -U ${CONFIG.DB_USER} \
      -d ${CONFIG.DB_NAME} \
      -f "${sqlFile}"`;

    await execAsync(restoreCmd);

    // Удаляем временный распакованный файл
    if (sqlFile !== backupPath) {
      await fs.unlink(sqlFile).catch(() => {});
    }

    console.log('✅ Database restored successfully');
    return true;
  } catch (error) {
    console.error('❌ Database restore failed:', error.message);
    throw error;
  }
}

/**
 * Восстанавливает файлы из бэкапа
 */
async function restoreFiles(backupFilename) {
  const backupPath = path.join(CONFIG.BACKUP_DIR, backupFilename);

  console.log(`📦 Restoring files from: ${backupFilename}`);

  try {
    // Удаляем существующую директорию uploads
    console.log('🗑️  Removing existing uploads directory...');
    await execAsync(`rm -rf "${CONFIG.UPLOADS_DIR}"`).catch(() => {});

    // Распаковываем архив
    console.log('📂 Extracting files...');
    const parentDir = path.dirname(CONFIG.UPLOADS_DIR);
    await execAsync(`tar -xzf "${backupPath}" -C "${parentDir}"`);

    console.log('✅ Files restored successfully');
    return true;
  } catch (error) {
    console.error('❌ Files restore failed:', error.message);
    throw error;
  }
}

/**
 * Интерактивное восстановление
 */
async function interactiveRestore() {
  console.log('🔍 Searching for available backups...\n');

  const backups = await listAvailableBackups();

  if (backups.length === 0) {
    console.log('❌ No backups found in:', CONFIG.BACKUP_DIR);
    return;
  }

  console.log('📋 Available backups:\n');
  backups.forEach((backup, index) => {
    console.log(`${index + 1}. ${backup.metadata.date}`);
    console.log(`   Database: ${backup.dbExists ? '✅ ' + backup.metadata.database : '❌ Missing'}`);
    console.log(`   Files: ${backup.filesExists ? '✅ ' + backup.metadata.files : '❌ Missing'}`);
    console.log('');
  });

  // Спрашиваем какой бэкап восстановить
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question('Select backup number to restore (or 0 to cancel): ', resolve);
  });

  rl.close();

  const selectedIndex = parseInt(answer, 10) - 1;

  if (selectedIndex < 0 || selectedIndex >= backups.length) {
    console.log('❌ Cancelled');
    return;
  }

  const selectedBackup = backups[selectedIndex];

  console.log(`\n⚠️  WARNING: This will OVERWRITE current data!`);
  console.log(`Selected backup: ${selectedBackup.metadata.date}\n`);

  const confirmed = await askConfirmation('Are you sure you want to restore this backup?');

  if (!confirmed) {
    console.log('❌ Cancelled');
    return;
  }

  console.log('\n🚀 Starting restore process...\n');

  try {
    // Восстанавливаем базу данных
    if (selectedBackup.dbExists) {
      await restoreDatabase(selectedBackup.metadata.database);
    } else {
      console.log('⏭️  Skipping database restore (file missing)');
    }

    // Восстанавливаем файлы
    if (selectedBackup.filesExists) {
      await restoreFiles(selectedBackup.metadata.files);
    } else {
      console.log('⏭️  Skipping files restore (archive missing)');
    }

    console.log('\n✅ Restore completed successfully!');
    console.log('💡 Restart your application to apply changes.');
  } catch (error) {
    console.error('\n❌ Restore failed:', error.message);
    process.exit(1);
  }
}

/**
 * Восстановление конкретного бэкапа по имени файла
 */
async function restoreSpecificBackup(dbBackupFile, filesBackupFile) {
  console.log('🚀 Starting restore process...\n');

  try {
    if (dbBackupFile) {
      await restoreDatabase(dbBackupFile);
    }

    if (filesBackupFile) {
      await restoreFiles(filesBackupFile);
    }

    console.log('\n✅ Restore completed successfully!');
  } catch (error) {
    console.error('\n❌ Restore failed:', error.message);
    process.exit(1);
  }
}

// CLI интерфейс
if (require.main === module) {
  require('dotenv').config();

  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Интерактивный режим
    interactiveRestore()
      .then(() => process.exit(0))
      .catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
      });
  } else if (args[0] === 'list') {
    // Показать список бэкапов
    listAvailableBackups()
      .then(backups => {
        if (backups.length === 0) {
          console.log('No backups found');
          return;
        }
        console.log('Available backups:');
        backups.forEach((backup, index) => {
          console.log(`${index + 1}. ${backup.metadata.date}`);
          console.log(`   DB: ${backup.metadata.database || 'N/A'}`);
          console.log(`   Files: ${backup.metadata.files || 'N/A'}`);
        });
      })
      .then(() => process.exit(0))
      .catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
      });
  } else {
    // Восстановление конкретных файлов
    const dbFile = args[0];
    const filesFile = args[1];

    restoreSpecificBackup(dbFile, filesFile)
      .then(() => process.exit(0))
      .catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
      });
  }
}

module.exports = {
  listAvailableBackups,
  restoreDatabase,
  restoreFiles,
  interactiveRestore,
};
