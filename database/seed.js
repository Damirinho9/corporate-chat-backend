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
    await query('TRUNCATE admin_logs, reactions, mentions, files, messages, chat_participants, chats, users RESTART IDENTITY CASCADE');
    console.log('✅ Cleared existing data');

    // 1) Пользователи
    const userRows = [
      // username, password_hash, initial_password, name, role, department, is_active
      ['admin',        adminPassword, 'admin123', 'Главный администратор',      'admin',     null,       true],
      ['assistant1',   userPassword,  'pass123',  'Ассистент Анна',             'assistant', null,       true],
      ['assistant2',   userPassword,  'pass123',  'Ассистент Борис',            'assistant', null,       true],
      ['rop_sales',    userPassword,  'pass123',  'РОП Sales - Виктор',         'rop',       'Sales',    true],
      ['rop_marketing',userPassword,  'pass123',  'РОП Marketing - Галина',     'rop',       'Marketing',true],
      ['operator1',    userPassword,  'pass123',  'Оператор Sales - Дмитрий',   'operator',  'Sales',    true],
      ['operator2',    userPassword,  'pass123',  'Оператор Sales - Елена',     'operator',  'Sales',    true],
      ['operator3',    userPassword,  'pass123',  'Оператор Marketing - Жанна', 'operator',  'Marketing',true],
      ['employee1',    userPassword,  'pass123',  'Сотрудник IT - Иван',        'employee',  'IT',       true],
      ['employee2',    userPassword,  'pass123',  'Сотрудник IT - Мария',       'employee',  'IT',       true],
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
    const ropSalesId     = byUsername['rop_sales'];
    const ropMarketingId = byUsername['rop_marketing'];
    const operator1Id    = byUsername['operator1'];
    const operator2Id    = byUsername['operator2'];
    const operator3Id    = byUsername['operator3'];
    const employee1Id    = byUsername['employee1'];
    const employee2Id    = byUsername['employee2'];

    // 2) Чаты
    const chatRows = [
      // name,            type,        department, created_by
      ['Руководство',     'group',     null,       adminId],
      ['Все ассистенты',  'group',     null,       adminId],
      // ВАЖНО: для чатов отделов name должен совпадать с department для синхронизации!
      ['Sales',           'department','Sales',    ropSalesId],
      ['Marketing',       'department','Marketing',ropMarketingId],
      ['IT',              'department','IT',       employee1Id],
      [null,              'direct',    null,       adminId],        // админ + ассистент1
      [null,              'direct',    null,       ropSalesId],     // роп sales + оператор1
      [null,              'direct',    null,       assistant1Id],   // ассистент1 + оператор1
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
    const salesChatId      = chatsResult.rows[2].id;
    const marketingChatId  = chatsResult.rows[3].id;
    const itChatId         = chatsResult.rows[4].id;
    const directChat1Id    = chatsResult.rows[5].id;
    const directChat2Id    = chatsResult.rows[6].id;
    const directChat3Id    = chatsResult.rows[7].id;

    // 3) Участники чатов
    const participants = [
      // Руководство: админ + два РОПа
      [managementChatId, adminId],
      [managementChatId, ropSalesId],
      [managementChatId, ropMarketingId],

      // Все ассистенты: админ + оба ассистента
      [assistantsChatId, adminId],
      [assistantsChatId, assistant1Id],
      [assistantsChatId, assistant2Id],

      // Отдел продаж: РОП + два оператора Sales
      [salesChatId, ropSalesId],
      [salesChatId, operator1Id],
      [salesChatId, operator2Id],

      // Отдел маркетинга: РОП + оператор Marketing
      [marketingChatId, ropMarketingId],
      [marketingChatId, operator3Id],

      // Отдел IT: два сотрудника
      [itChatId, employee1Id],
      [itChatId, employee2Id],

      // Direct 1: админ + ассистент1
      [directChat1Id, adminId],
      [directChat1Id, assistant1Id],

      // Direct 2: РОП Sales + оператор1
      [directChat2Id, ropSalesId],
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
      [managementChatId, adminId,     'Добро пожаловать в корпоративный чат! 👋'],
      [managementChatId, ropSalesId,  'Привет, руководство! Готовы к работе.'],
      // assistants
      [assistantsChatId, assistant1Id,'Здравствуйте, ассистенты! Это общий чат для всех помощников.'],
      // sales
      [salesChatId,      ropSalesId,  'Отдел продаж, приветствую! Начинаем работу.'],
      [salesChatId,      operator1Id, 'Здравствуйте! Готов к задачам.'],
      // marketing
      [marketingChatId,  ropMarketingId, 'Отдел маркетинга на связи!'],
      // IT
      [itChatId,         employee1Id, 'IT отдел готов помочь с технической поддержкой!'],
      // direct 1
      [directChat1Id,    adminId,     'Привет! Как дела?'],
      [directChat1Id,    assistant1Id,'Отлично, спасибо!'],
    ];
    await bulkInsert('messages', ['chat_id','user_id','content'], messages);
    console.log('✅ Added welcome messages');

    await query('COMMIT');

    console.log('\n✅ Database seeded successfully!\n');
    console.log('👑 admin / admin123');
    console.log('👔 assistant1 / pass123, assistant2 / pass123');
    console.log('📊 rop_sales / pass123, rop_marketing / pass123');
    console.log('💼 operator1 / pass123, operator2 / pass123, operator3 / pass123');
    console.log('👨‍💻 employee1 / pass123, employee2 / pass123\n');
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
