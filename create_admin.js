require('dotenv').config();
const { query } = require('./config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

async function createAdminAndToken() {
  try {
    // Check if admin exists
    const check = await query('SELECT * FROM users WHERE username = $1', ['admin']);

    let userId;
    if (check.rows.length === 0) {
      // Create admin user
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const result = await query(
        'INSERT INTO users (username, password_hash, name, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        ['admin', hashedPassword, 'Administrator', 'admin', true]
      );
      userId = result.rows[0].id;
      console.log('✅ Admin user created with ID:', userId);
      console.log('   Username: admin');
      console.log('   Password: admin123');
    } else {
      userId = check.rows[0].id;
      console.log('✅ Admin user already exists with ID:', userId);
    }

    // Generate token
    const token = jwt.sign(
      { userId: userId, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('\n📝 Use this token in test_bots_system.js:');
    console.log('ADMIN_TOKEN=' + token);
    console.log('\n✅ Token valid for 24 hours');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createAdminAndToken();
