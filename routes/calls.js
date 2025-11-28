// routes/calls.js
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Defensive: ensure required call tables and columns exist even if migrations/startup scripts
// were skipped in the current environment.
let ensureSchemaPromise = null;

async function ensureCallSchema() {
    if (!ensureSchemaPromise) {
        ensureSchemaPromise = (async () => {
            const statements = [
                // calls
                `CREATE TABLE IF NOT EXISTS calls (
                    id SERIAL PRIMARY KEY,
                    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                    room_name VARCHAR(255) NOT NULL,
                    type VARCHAR(20) DEFAULT 'video',
                    initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'active',
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ended_at TIMESTAMP,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )`,
                // add/align columns if table exists with legacy schema
                `ALTER TABLE calls ADD COLUMN IF NOT EXISTS chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE`,
                `ALTER TABLE calls ALTER COLUMN chat_id DROP NOT NULL`,
                `ALTER TABLE calls ADD COLUMN IF NOT EXISTS room_name VARCHAR(255)`,
                `ALTER TABLE calls ADD COLUMN IF NOT EXISTS type VARCHAR(20)`,
                `ALTER TABLE calls ADD COLUMN IF NOT EXISTS initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL`,
                `ALTER TABLE calls ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`,
                `ALTER TABLE calls ALTER COLUMN status SET DEFAULT 'active'`,
                `ALTER TABLE calls ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
                `ALTER TABLE calls ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP`,
                `ALTER TABLE calls ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`,
                `ALTER TABLE calls ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`,
                `ALTER TABLE calls ALTER COLUMN type SET DEFAULT 'video'`,
                // call_participants
                `CREATE TABLE IF NOT EXISTS call_participants (
                    id SERIAL PRIMARY KEY,
                    call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    status VARCHAR(20) NOT NULL DEFAULT 'invited',
                    joined_at TIMESTAMP,
                    left_at TIMESTAMP,
                    duration INTEGER DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )`,
                `ALTER TABLE call_participants ADD COLUMN IF NOT EXISTS call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE`,
                `ALTER TABLE call_participants ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`,
                `ALTER TABLE call_participants ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'invited'`,
                `ALTER TABLE call_participants ALTER COLUMN status SET DEFAULT 'invited'`,
                `ALTER TABLE call_participants ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP`,
                `ALTER TABLE call_participants ADD COLUMN IF NOT EXISTS left_at TIMESTAMP`,
                `ALTER TABLE call_participants ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0`,
                `ALTER TABLE call_participants ALTER COLUMN duration SET DEFAULT 0`,
                `ALTER TABLE call_participants ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`,
                `ALTER TABLE call_participants ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`,
                // call_events
                `CREATE TABLE IF NOT EXISTS call_events (
                    id SERIAL PRIMARY KEY,
                    call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
                    event_type VARCHAR(50) NOT NULL,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    metadata JSONB,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )`,
                `ALTER TABLE call_events ADD COLUMN IF NOT EXISTS call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE`,
                `ALTER TABLE call_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(50)`,
                `ALTER TABLE call_events ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`,
                `ALTER TABLE call_events ADD COLUMN IF NOT EXISTS metadata JSONB`,
                `ALTER TABLE call_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`,
                `ALTER TABLE call_events ALTER COLUMN event_type SET NOT NULL`,
                `ALTER TABLE call_events ALTER COLUMN call_id SET NOT NULL`,
                `CREATE INDEX IF NOT EXISTS idx_calls_chat_id ON calls(chat_id)`,
                `CREATE INDEX IF NOT EXISTS idx_calls_initiated_by ON calls(initiated_by)`,
                `CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)`,
                `CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC)`,
                `CREATE INDEX IF NOT EXISTS idx_call_participants_call_id ON call_participants(call_id)`,
                `CREATE INDEX IF NOT EXISTS idx_call_participants_user_id ON call_participants(user_id)`,
                `CREATE INDEX IF NOT EXISTS idx_call_participants_status ON call_participants(status)`,
                `CREATE INDEX IF NOT EXISTS idx_call_events_call_id ON call_events(call_id)`,
                `CREATE INDEX IF NOT EXISTS idx_call_events_event_type ON call_events(event_type)`
            ];

            for (const sql of statements) {
                try {
                    await query(sql);
                } catch (error) {
                    console.warn('Call schema ensure skipped:', error.message || error);
                }
            }
        })();
    }

    return ensureSchemaPromise;
}

/**
 * GET /api/calls/history/all
 * Get call history for current user
 */
router.get('/history/all', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await query(`
            SELECT
                c.*,
                u.name as initiated_by_name,
                u.username as initiated_by_username,
                ch.name as chat_name,
                (
                    SELECT json_agg(json_build_object(
                        'user_id', cp.user_id,
                        'user_name', u2.name,
                        'status', cp.status,
                        'joined_at', cp.joined_at,
                        'left_at', cp.left_at,
                        'duration', cp.duration
                    ))
                    FROM call_participants cp
                    JOIN users u2 ON cp.user_id = u2.id
                    WHERE cp.call_id = c.id
                ) as participants
            FROM calls c
            LEFT JOIN users u ON c.initiated_by = u.id
            LEFT JOIN chats ch ON c.chat_id = ch.id
            WHERE c.id IN (
                SELECT DISTINCT call_id
                FROM call_participants
                WHERE user_id = $1
            )
            OR c.initiated_by = $1
            ORDER BY c.created_at DESC
            LIMIT 100
        `, [userId]);

        res.json({ calls: result.rows });
    } catch (error) {
        console.error('Get call history error:', error);
        res.status(500).json({ error: 'Failed to load call history' });
    }
});

/**
 * POST /api/calls
 * Create a new call log
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        await ensureCallSchema();

        const { chat_id, room_name, type } = req.body;
        const userId = req.user.id;

        if (!chat_id || !room_name) {
            return res.status(400).json({ error: 'chat_id and room_name are required' });
        }

        const result = await query(`
            INSERT INTO calls (chat_id, room_name, type, initiated_by, status, created_at)
            VALUES ($1, $2, $3, $4, 'active', NOW())
            RETURNING *
        `, [chat_id, room_name, type || 'video', userId]);

        const callId = result.rows[0].id;

        // Add initiator as participant
        await query(`
            INSERT INTO call_participants (call_id, user_id, status, joined_at)
            VALUES ($1, $2, 'joined', NOW())
        `, [callId, userId]);

        res.json({ call: result.rows[0] });
    } catch (error) {
        console.error('Create call error:', error);
        res.status(500).json({ error: 'Failed to create call', detail: error.message });
    }
});

/**
 * GET /api/calls/:id
 * Get call details
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const result = await query(`
            SELECT
                c.*,
                u.name as initiated_by_name,
                ch.name as chat_name
            FROM calls c
            LEFT JOIN users u ON c.initiated_by = u.id
            LEFT JOIN chats ch ON c.chat_id = ch.id
            WHERE c.id = $1
            AND (
                c.id IN (
                    SELECT call_id FROM call_participants WHERE user_id = $2
                )
                OR c.initiated_by = $2
            )
        `, [id, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Call not found' });
        }

        res.json({ call: result.rows[0] });
    } catch (error) {
        console.error('Get call error:', error);
        res.status(500).json({ error: 'Failed to get call details' });
    }
});

module.exports = router;
