#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
    console.log('🔧 Setting up PostgreSQL database...\n');

    // Connect to postgres database to create our app database
    const adminClient = new Client({
        host: '127.0.0.1',
        port: 5432,
        database: 'postgres',
        user: 'postgres'
    });

    try {
        await adminClient.connect();
        console.log('✅ Connected to PostgreSQL\n');

        // Create database
        try {
            await adminClient.query('CREATE DATABASE corporate_chat');
            console.log('✅ Created database: corporate_chat\n');
        } catch (err) {
            if (err.code === '42P04') {
                console.log('ℹ️  Database corporate_chat already exists\n');
            } else {
                throw err;
            }
        }

        await adminClient.end();

        // Now connect to corporate_chat database and run schema
        const appClient = new Client({
            host: '127.0.0.1',
            port: 5432,
            database: 'corporate_chat',
            user: 'postgres'
        });

        await appClient.connect();
        console.log('✅ Connected to corporate_chat database\n');

        // Read and execute schema
        const schemaPath = path.join(__dirname, 'database/schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await appClient.query(schema);
            console.log('✅ Applied schema.sql\n');
        }

        // Apply migrations
        const migrationsDir = path.join(__dirname, 'database/migrations');
        if (fs.existsSync(migrationsDir)) {
            const migrations = fs.readdirSync(migrationsDir)
                .filter(f => f.endsWith('.sql'))
                .sort();

            for (const migration of migrations) {
                console.log(`   Applying ${migration}...`);
                const sql = fs.readFileSync(path.join(migrationsDir, migration), 'utf8');
                try {
                    await appClient.query(sql);
                    console.log(`   ✅ ${migration}`);
                } catch (err) {
                    console.log(`   ⚠️  ${migration}: ${err.message}`);
                }
            }
            console.log('\n✅ Applied migrations\n');
        }

        await appClient.end();

        console.log('✨ Database setup complete!\n');
        console.log('Next steps:');
        console.log('  1. Run: npm run seed');
        console.log('  2. Run: npm start\n');

    } catch (error) {
        console.error('❌ Error setting up database:', error.message);
        process.exit(1);
    }
}

setupDatabase();
