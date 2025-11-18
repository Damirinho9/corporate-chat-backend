require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('../config/database');

const USERS = [
  {
    username: 'admin',
    name: 'Главный администратор',
    role: 'admin',
    department: null,
    password: '9Jmnd&ok5hWG',
    isActive: true,
  },
  {
    username: 'rop1',
    name: 'Виктор РОП 4 отдел',
    role: 'rop',
    department: '4 отдел',
    password: 'mYHsF#GkuZhF',
    isActive: true,
  },
  {
    username: 'rop2',
    name: 'Наталья Ерофеева РОП 2 отдел',
    role: 'rop',
    department: '2 отдел',
    password: 'GC##!DC$by_Y',
    isActive: true,
  },
  {
    username: 'rop3',
    name: 'РОП 3',
    role: 'rop',
    department: '3 отдел',
    password: 'LxF39kSFV73r',
    isActive: true,
  },
  {
    username: 'op1a',
    name: 'Оператор 1А',
    role: 'operator',
    department: '4 отдел',
    password: '88roSxd_UiLH',
    isActive: true,
  },
  {
    username: 'op1b',
    name: 'Оператор 1Б',
    role: 'operator',
    department: '4 отдел',
    password: 'pc#KrNCoi#Zw',
    isActive: true,
  },
  {
    username: 'op2a',
    name: 'Оператор 2А',
    role: 'operator',
    department: '2 отдел',
    password: 'NHR$mMohWx5@',
    isActive: true,
  },
  {
    username: 'op3a',
    name: 'Оператор 3А',
    role: 'operator',
    department: '3 отдел',
    password: '(jgcLe2jNwEp',
    isActive: true,
  },
  {
    username: 'assist1',
    name: 'Ассистент 1',
    role: 'assistant',
    department: null,
    password: 'Xf6DSC^qjXQ+',
    isActive: true,
  },
  {
    username: 'assist2',
    name: 'Ассистент 2',
    role: 'assistant',
    department: null,
    password: 'Qaf4Ez8x(*&5',
    isActive: true,
  },
  {
    username: 'Александр',
    name: 'Александр',
    role: 'assistant',
    department: null,
    password: 'TempPass123!',
    isActive: true,
  },
];

const DEPARTMENT_CHATS = [
  { name: '2 отдел', department: '2 отдел', members: ['rop2', 'op2a'] },
  { name: '3 отдел', department: '3 отдел', members: ['rop3', 'op3a'] },
  { name: '4 отдел', department: '4 отдел', members: ['rop1', 'op1a', 'op1b'] },
];

function buildPlaceholders(rowSize, rowCount) {
  return Array.from({ length: rowCount }, (_, rowIdx) => {
    const start = rowIdx * rowSize + 1;
    const placeholders = Array.from({ length: rowSize }, (_, colIdx) => `$${start + colIdx}`);
    return `(${placeholders.join(', ')})`;
  }).join(', ');
}

async function bulkInsert(table, columns, rows, returning = '') {
  if (!rows.length) {
    return { rows: [], rowCount: 0 };
  }
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${buildPlaceholders(columns.length, rows.length)}` +
    (returning ? ` RETURNING ${returning}` : '');
  const values = rows.flat();
  return query(sql, values);
}

async function restoreSnapshot() {
  console.log('📦 Restoring production snapshot data...');
  await query('SELECT 1');

  try {
    await query('BEGIN');

    await query(`
      TRUNCATE admin_logs, message_deletion_history, reactions, mentions, files, messages,
        chat_participants, chats, users RESTART IDENTITY CASCADE
    `);

    console.log('🧹 Cleared existing records');

    const userRows = [];
    for (const user of USERS) {
      const hash = await bcrypt.hash(user.password, 10);
      userRows.push([
        user.username,
        hash,
        user.password,
        user.name,
        user.role,
        user.department,
        user.isActive,
      ]);
    }

    const insertedUsers = await bulkInsert(
      'users',
      ['username', 'password_hash', 'initial_password', 'name', 'role', 'department', 'is_active'],
      userRows,
      'id, username'
    );

    const userIdMap = new Map(insertedUsers.rows.map((row) => [row.username, row.id]));
    console.log('👥 Inserted users:', Array.from(userIdMap.keys()).join(', '));

    const chatsToInsert = DEPARTMENT_CHATS.map((chat) => [chat.name, 'department', chat.department, userIdMap.get(chat.members[0])]);
    const insertedChats = await bulkInsert(
      'chats',
      ['name', 'type', 'department', 'created_by'],
      chatsToInsert,
      'id, name'
    );

    const chatIdMap = new Map(insertedChats.rows.map((row) => [row.name, row.id]));

    const participantsRows = [];
    for (const chat of DEPARTMENT_CHATS) {
      const chatId = chatIdMap.get(chat.name);
      for (const username of chat.members) {
        const userId = userIdMap.get(username);
        if (!userId) {
          throw new Error(`Не найден пользователь ${username} для чата ${chat.name}`);
        }
        participantsRows.push([chatId, userId]);
      }
    }

    await bulkInsert('chat_participants', ['chat_id', 'user_id'], participantsRows);

    console.log('💬 Department chats created:', Array.from(chatIdMap.keys()).join(', '));

    const welcomeMessages = [];
    for (const chat of DEPARTMENT_CHATS) {
      const chatId = chatIdMap.get(chat.name);
      const ownerId = userIdMap.get(chat.members[0]);
      welcomeMessages.push([chatId, ownerId, `Добро пожаловать в ${chat.name}!`]);
    }

    await bulkInsert('messages', ['chat_id', 'user_id', 'content'], welcomeMessages);

    await query('COMMIT');

    console.log('\n✅ Snapshot restored successfully.');
    console.log('🔑 Credentials:');
    USERS.forEach((user) => {
      console.log(`  - ${user.username}: ${user.password}`);
    });
  } catch (error) {
    await query('ROLLBACK');
    console.error('❌ Failed to restore snapshot:', error.message);
    throw error;
  } finally {
    if (process.env.NODE_ENV !== 'test' && process.env.USE_IN_MEMORY_DB !== 'true') {
      try { await pool.end(); } catch (err) { /* ignore */ }
    }
  }
}

if (require.main === module) {
  restoreSnapshot()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = restoreSnapshot;
