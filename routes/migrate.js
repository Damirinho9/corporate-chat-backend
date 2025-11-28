// routes/migrate.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { pool, query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

/**
 * POST /api/migrate/012
 * Run migration 012 - Create calls tables
 * Admin only
 */
router.post('/012', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        console.log('Running migration 012: Create calls tables...');

        // Read migration file
        const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '012_create_calls_tables.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Execute migration
        await pool.query(sql);

        console.log('✅ Migration 012 completed successfully!');

        res.json({
            success: true,
            message: 'Migration 012 completed successfully',
            tables: ['calls', 'call_participants']
        });
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        res.status(500).json({
            success: false,
            error: 'Migration failed',
            details: error.message
        });
    }
});

module.exports = router;
