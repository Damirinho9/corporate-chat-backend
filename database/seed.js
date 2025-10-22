const bcrypt = require('bcrypt');
const { query, pool } = require('../config/database');

async function seedDatabase() {
    console.log('🌱 Seeding database with demo users...');

    try {
        const saltRounds = 12;

        // Hash passwords for demo users
        const passwords = {
            admin: await bcrypt.hash('admin123', saltRounds),
            pass123: await bcrypt.hash('pass123', saltRounds)
        };

        console.log('✅ Passwords hashed successfully');

        // Clear existing data
        await query('DELETE FROM messages');
        await query('DELETE FROM chat_participants');
        await query('DELETE FROM chats');
        await query('DELETE FROM users');
        console.log('✅ Cleared existing data');

        // Insert users
        await query(`
            INSERT INTO users (username, password_hash, name, role, department) VALUES
                ('admin', $1, 'Главный администратор', 'admin', NULL),
                ('head_it', $2, 'Руководитель IT', 'head', 'IT'),
                ('head_hr', $2, 'Руководитель HR', 'head', 'HR'),
                ('dev1', $2, 'Разработчик Иван', 'employee', 'IT'),
                ('dev2', $2, 'Разработчик Мария', 'employee', 'IT'),
                ('hr1', $2, 'HR-менеджер Анна', 'employee', 'HR')
        `, [passwords.admin, passwords.pass123]);
        console.log('✅ Inserted demo users');

        // Insert chats
        await query(`
            INSERT INTO chats (name, type, department, created_by) VALUES
                ('Руководство', 'group', NULL, 1),
                ('Руководители', 'group', NULL, 1),
                ('IT отдел', 'department', 'IT', 2),
                ('HR отдел', 'department', 'HR', 3)
        `);
        console.log('✅ Created group chats');

        // Add participants to chats
        await query(`
            INSERT INTO chat_participants (chat_id, user_id) VALUES
                (1, 1),
                (2, 1), (2, 2), (2, 3),
                (3, 2), (3, 4), (3, 5),
                (4, 3), (4, 6)
        `);
        console.log('✅ Added participants to chats');

        // Insert some demo messages
        await query(`
            INSERT INTO messages (chat_id, user_id, content) VALUES
                (2, 1, 'Добрый день, коллеги! Напоминаю о встрече в 15:00'),
                (3, 2, 'Команда, не забудьте про code review до конца дня'),
                (3, 4, 'Понял, сделаю!'),
                (4, 3, 'Новый сотрудник выходит в понедельник')
        `);
        console.log('✅ Inserted demo messages');

        // Create some direct message chats
        await query(`
            INSERT INTO chats (type, created_by) VALUES
                ('direct', 1),
                ('direct', 2),
                ('direct', 3)
        `);
        console.log('✅ Created direct message chats');

        // Add participants to DM chats
        await query(`
            INSERT INTO chat_participants (chat_id, user_id) VALUES
                (5, 1), (5, 2),
                (6, 2), (6, 4),
                (7, 3), (7, 6)
        `);
        console.log('✅ Added participants to direct chats');

        console.log('');
        console.log('╔════════════════════════════════════════════╗');
        console.log('║     Database seeded successfully!         ║');
        console.log('╚════════════════════════════════════════════╝');
        console.log('');
        console.log('Demo users created:');
        console.log('  • admin / admin123 (Administrator)');
        console.log('  • head_it / pass123 (IT Head)');
        console.log('  • head_hr / pass123 (HR Head)');
        console.log('  • dev1 / pass123 (IT Employee)');
        console.log('  • dev2 / pass123 (IT Employee)');
        console.log('  • hr1 / pass123 (HR Employee)');
        console.log('');

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    seedDatabase().catch(error => {
        console.error('Failed to seed database:', error);
        process.exit(1);
    });
}

module.exports = seedDatabase;
