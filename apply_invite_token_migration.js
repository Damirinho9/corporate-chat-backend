require('dotenv').config();
const { query } = require('./config/database');
const fs = require('fs');

async function applyMigration() {
  try {
    console.log('Applying migration: add invite_token to calls...');

    const migration = fs.readFileSync('./database/migrations/009_add_invite_token_to_calls.sql', 'utf8');
    await query(migration);

    console.log('Migration applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();
