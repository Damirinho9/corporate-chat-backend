require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('./config/database');

async function checkAdmin() {
  try {
    console.log('Checking admin user...\n');

    // Get admin user from database
    const result = await query(
      `SELECT id, username, password_hash, name, role, is_active, initial_password
       FROM users WHERE username = 'admin'`
    );

    if (result.rows.length === 0) {
      console.log('❌ Admin user not found in database!');
      await pool.end();
      return;
    }

    const admin = result.rows[0];
    console.log('Admin user found:');
    console.log('  ID:', admin.id);
    console.log('  Username:', admin.username);
    console.log('  Name:', admin.name);
    console.log('  Role:', admin.role);
    console.log('  Active:', admin.is_active);
    console.log('  Initial Password:', admin.initial_password);
    console.log('  Has Password Hash:', !!admin.password_hash);
    console.log('  Password Hash Length:', admin.password_hash?.length);
    console.log();

    // Test the password from production snapshot
    const testPassword = '9Jmnd&ok5hWG';
    console.log(`Testing password: "${testPassword}"`);

    const match = await bcrypt.compare(testPassword, admin.password_hash);
    console.log('Password matches:', match ? '✅ YES' : '❌ NO');

    if (!match) {
      console.log('\n⚠️  Password does not match!');
      console.log('This could mean:');
      console.log('1. The password was changed after the snapshot was created');
      console.log('2. The database was not properly seeded with production data');
      console.log('3. The password hash is corrupted');

      console.log('\nTrying default password "admin123"...');
      const defaultMatch = await bcrypt.compare('admin123', admin.password_hash);
      console.log('Default password matches:', defaultMatch ? '✅ YES' : '❌ NO');
    } else {
      console.log('\n✅ Admin login should work with password: 9Jmnd&ok5hWG');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAdmin();
