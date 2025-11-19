require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('../config/database');

/**
 * Универсальный батч-вставщик.
 * Пример: await bulkInsert('users',['username','password_hash'], [['a','x'], ['b','y']], 'id,username')
 */
async function bulkInsert(table, columns, rows, returning = '') {
  if (!rows.length) return { rows: [], rowCount: 0 };
  const perRow = columns.length;
  const values = rows.flat();
  const placeholders = rows
    .map((_, ri) => '(' + Array.from({ length: perRow }, (_, ci) => `$${ri * perRow + ci + 1}`).join(',') + ')')
    .join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}` + (returning ? ` RETURNING ${returning}` : '');
  return query(sql, values);
}

async function seedDatabase() {
  console.log('🌱 Seeding database with demo users (NEW ROLES)...');

  // Пароли
  const adminPassword = await bcrypt.hash('admin123', 10);
  const userPassword  = await bcrypt.hash('pass123', 10);
  console.log('✅ Passwords hashed successfully');

  // Подключение к БД берётся из config/database.js через .env
  await query('SELECT 1');
  console.log('✅ Database connected successfully');

  try {
    await query('BEGIN');

    // Чистим таблицы аккуратно и сбрасываем идентификаторы
    await query('TRUNCATE admin_logs, message_deletion_history, reactions, mentions, files, messages, chat_participants, chats, users RESTART IDENTITY CASCADE');
    console.log('✅ Cleared existing data');

    // 1) Пользователи
    // CONSTRAINT: admin/assistant must have NULL department, rop/operator/employee must have NOT NULL
    const userRows = [
      // username, password_hash, initial_password, name, role, department, is_active
      ['admin',        adminPassword, 'admin123', 'Главный администратор',      'admin',     null,       true],
      ['assistant1',   userPassword,  'pass123',  'Ассистент Анна',             'assistant', null,       true],
      ['assistant2',   userPassword,  'pass123',  'Ассистент Борис',            'assistant', null,       true],
      ['rop_otdel2',   userPassword,  'pass123',  'РОП 2 отдел - Виктор',       'rop',       '2 отдел',  true],
      ['rop_otdel3',   userPassword,  'pass123',  'РОП 3 отдел - Галина',       'rop',       '3 отдел',  true],
      ['operator1',    userPassword,  'pass123',  'Оператор 2 отдел - Дмитрий', 'operator',  '2 отдел',  true],
      ['operator2',    userPassword,  'pass123',  'Оператор 2 отдел - Елена',   'operator',  '2 отдел',  true],
      ['operator3',    userPassword,  'pass123',  'Оператор 3 отдел - Жанна',   'operator',  '3 отдел',  true],
      ['employee1',    userPassword,  'pass123',  'Сотрудник 4 отдел - Иван',   'employee',  '4 отдел',  true],
      ['employee2',    userPassword,  'pass123',  'Сотрудник 4 отдел - Мария',  'employee',  '4 отдел',  true],
    ];
    const usersResult = await bulkInsert(
      'users',
      ['username','password_hash','initial_password','name','role','department','is_active'],
      userRows,
      'id, username'
    );
    console.log('✅ Inserted demo users');

    // Достаём id по username в удобную мапу
    const byUsername = {};
    for (const r of usersResult.rows) byUsername[r.username] = r.id;

    const adminId        = byUsername['admin'];
    const assistant1Id   = byUsername['assistant1'];
    const assistant2Id   = byUsername['assistant2'];
    const ropOtdel2Id    = byUsername['rop_otdel2'];
    const ropOtdel3Id    = byUsername['rop_otdel3'];
    const operator1Id    = byUsername['operator1'];
    const operator2Id    = byUsername['operator2'];
    const operator3Id    = byUsername['operator3'];
    const employee1Id    = byUsername['employee1'];
    const employee2Id    = byUsername['employee2'];

    // 2) Чаты
    const chatRows = [
      // name,            type,        department,   created_by
      ['Руководство',     'group',     null,         adminId],
      ['Ассистенты',      'group',     null,         assistant1Id],
      // ВАЖНО: для чатов отделов name должен совпадать с department для синхронизации!
      ['2 отдел',         'department','2 отдел',    ropOtdel2Id],
      ['3 отдел',         'department','3 отдел',    ropOtdel3Id],
      ['4 отдел',         'department','4 отдел',    employee1Id],
      [null,              'direct',    null,         adminId],        // админ + ассистент1
      [null,              'direct',    null,         ropOtdel2Id],    // роп 2 отдел + оператор1
      [null,              'direct',    null,         assistant1Id],   // ассистент1 + оператор1
    ];
    const chatsResult = await bulkInsert(
      'chats',
      ['name','type','department','created_by'],
      chatRows,
      'id, name, type'
    );
    console.log('✅ Created chats');

    // Имена чатов по порядку вставки
    const managementChatId = chatsResult.rows[0].id;
    const assistantsChatId = chatsResult.rows[1].id;
    const otdel2ChatId     = chatsResult.rows[2].id;
    const otdel3ChatId     = chatsResult.rows[3].id;
    const otdel4ChatId     = chatsResult.rows[4].id;
    const directChat1Id    = chatsResult.rows[5].id;
    const directChat2Id    = chatsResult.rows[6].id;
    const directChat3Id    = chatsResult.rows[7].id;

    // 3) Участники чатов
    const participants = [
      // Руководство: админ + два РОПа
      [managementChatId, adminId],
      [managementChatId, ropOtdel2Id],
      [managementChatId, ropOtdel3Id],

      // Ассистенты: оба ассистента
      [assistantsChatId, assistant1Id],
      [assistantsChatId, assistant2Id],

      // 2 отдел: РОП + два оператора
      [otdel2ChatId, ropOtdel2Id],
      [otdel2ChatId, operator1Id],
      [otdel2ChatId, operator2Id],

      // 3 отдел: РОП + оператор
      [otdel3ChatId, ropOtdel3Id],
      [otdel3ChatId, operator3Id],

      // 4 отдел: два сотрудника
      [otdel4ChatId, employee1Id],
      [otdel4ChatId, employee2Id],

      // Direct 1: админ + ассистент1
      [directChat1Id, adminId],
      [directChat1Id, assistant1Id],

      // Direct 2: РОП 2 отдел + оператор1
      [directChat2Id, ropOtdel2Id],
      [directChat2Id, operator1Id],

      // Direct 3: ассистент1 + оператор1
      [directChat3Id, assistant1Id],
      [directChat3Id, operator1Id],
    ];
    await bulkInsert('chat_participants', ['chat_id','user_id'], participants);
    console.log('✅ Added chat participants');

    // 4) Приветственные сообщения
    const messages = [
      // management
      [managementChatId, adminId,      'Добро пожаловать в корпоративный чат! 👋'],
      [managementChatId, ropOtdel2Id,  'Привет, руководство! Готовы к работе.'],
      // assistants
      [assistantsChatId, assistant1Id, 'Здравствуйте, ассистенты! Это общий чат для всех помощников.'],
      // 2 отдел
      [otdel2ChatId,     ropOtdel2Id,  '2 отдел, приветствую! Начинаем работу.'],
      [otdel2ChatId,     operator1Id,  'Здравствуйте! Готов к задачам.'],
      // 3 отдел
      [otdel3ChatId,     ropOtdel3Id,  '3 отдел на связи!'],
      // 4 отдел
      [otdel4ChatId,     employee1Id,  '4 отдел готов помочь!'],
      // direct 1
      [directChat1Id,    adminId,      'Привет! Как дела?'],
      [directChat1Id,    assistant1Id, 'Отлично, спасибо!'],
    ];
    await bulkInsert('messages', ['chat_id','user_id','content'], messages);
    console.log('✅ Added welcome messages');

    await query('COMMIT');

    console.log('\n✅ Database seeded successfully!\n');
    console.log('👑 admin / admin123');
    console.log('👔 assistant1 / pass123, assistant2 / pass123');
    console.log('📊 rop_otdel2 / pass123 (2 отдел), rop_otdel3 / pass123 (3 отдел)');
    console.log('💼 operator1 / pass123, operator2 / pass123 (2 отдел), operator3 / pass123 (3 отдел)');
    console.log('👨‍💻 employee1 / pass123, employee2 / pass123 (4 отдел)\n');
  } catch (e) {
    await query('ROLLBACK');
    console.error('❌ Error seeding database:', e);
    throw e;
  } finally {
    if (process.env.NODE_ENV !== 'test' && process.env.USE_IN_MEMORY_DB !== 'true') {
      try { await pool.end(); } catch {}
    }
  }
}

// Прямой запуск
if (require.main === module) {
  seedDatabase()
    .then(() => { console.log('✅ Seeding complete!'); process.exit(0); })
    .catch(() => { process.exit(1); });
}

module.exports = seedDatabase;
