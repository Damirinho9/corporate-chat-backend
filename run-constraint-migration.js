const { query } = require('./config/database');

async function removeConstraint() {
    try {
        console.log('Removing check_department constraint...');

        await query('ALTER TABLE users DROP CONSTRAINT IF EXISTS check_department');

        console.log('✅ Successfully removed check_department constraint!');
        console.log('Users can now be added to any department.');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error removing constraint:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

removeConstraint();
