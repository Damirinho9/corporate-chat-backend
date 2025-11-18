// Script to apply polls migration to database
const fs = require('fs');
const path = require('path');
const { query, pool } = require('./config/database');

async function applyPollsMigration() {
    try {
        console.log('🔧 Checking if polls tables exist...');

        // Check if polls table exists
        const tableCheck = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'polls'
            );
        `);

        if (tableCheck.rows[0].exists) {
            console.log('✅ Polls tables already exist!');

            // Show table structure
            const pollsInfo = await query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'polls'
                ORDER BY ordinal_position;
            `);

            console.log('\n📊 Polls table structure:');
            pollsInfo.rows.forEach(col => {
                console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(required)' : '(optional)'}`);
            });

            return;
        }

        console.log('📝 Reading migration file...');
        const migrationPath = path.join(__dirname, 'database', 'migrations', '012_create_polls.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('🚀 Applying migration...');
        await query(migrationSQL);

        console.log('✅ Migration applied successfully!');

        // Verify tables were created
        const verifyPolls = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'polls'
            );
        `);

        const verifyVotes = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'poll_votes'
            );
        `);

        if (verifyPolls.rows[0].exists && verifyVotes.rows[0].exists) {
            console.log('✅ Both polls and poll_votes tables created successfully!');
        } else {
            console.error('❌ Tables were not created properly');
        }

    } catch (error) {
        console.error('❌ Error applying migration:', error);
        console.error('Error details:', error.message);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}

// Run migration
applyPollsMigration();
