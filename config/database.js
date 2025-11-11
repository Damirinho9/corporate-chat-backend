const { Pool } = require('pg');

// Parse DATABASE_URL or build config from individual variables
let poolConfig;

if (process.env.DATABASE_URL) {
    // Parse the DATABASE_URL to ensure password is valid
    try {
        const url = new URL(process.env.DATABASE_URL);

        // Extract password and ensure it's a valid string
        let password = url.password || '';

        // Check for invalid password values that might appear as strings
        if (password === 'null' || password === 'undefined' || password === '') {
            console.error('ERROR: DATABASE_URL contains invalid or missing password');
            console.error('Password value:', password);
            throw new Error('Invalid database password in DATABASE_URL. Please check your environment variables.');
        }

        // Build explicit config to ensure all values are proper strings
        poolConfig = {
            host: url.hostname,
            port: parseInt(url.port) || 5432,
            database: url.pathname.slice(1), // Remove leading slash
            user: url.username,
            password: String(password), // Ensure it's a string
            ssl: process.env.NODE_ENV === 'production' ? {
                rejectUnauthorized: false
            } : false
        };

        console.log('Database config:', {
            host: poolConfig.host,
            port: poolConfig.port,
            database: poolConfig.database,
            user: poolConfig.user,
            passwordSet: !!poolConfig.password
        });
    } catch (err) {
        console.error('Error parsing DATABASE_URL:', err.message);
        console.error('DATABASE_URL format should be: postgresql://username:password@host:port/database');
        throw err;
    }
} else {
    // Fallback to individual environment variables
    const dbPassword = process.env.DB_PASSWORD;

    // Validate password
    if (!dbPassword || dbPassword === 'null' || dbPassword === 'undefined') {
        console.error('ERROR: DB_PASSWORD is not set or invalid');
        throw new Error('Invalid database password. Please set DB_PASSWORD environment variable.');
    }

    poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'corporate_chat',
        user: process.env.DB_USER || 'postgres',
        password: String(dbPassword),
        ssl: process.env.NODE_ENV === 'production' ? {
            rejectUnauthorized: false
        } : false
    };

    console.log('Database config (from env vars):', {
        host: poolConfig.host,
        port: poolConfig.port,
        database: poolConfig.database,
        user: poolConfig.user,
        passwordSet: !!poolConfig.password
    });
}

const pool = new Pool(poolConfig);

// Query helper
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Query error', { text, error: error.message });
        throw error;
    }
};

// Export both query and pool
module.exports = {
    query,
    pool
};
