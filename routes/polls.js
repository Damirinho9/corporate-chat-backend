const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// Check if user can create polls (admin or ROP in their department)
async function canCreatePoll(userId, chatId) {
    try {
        const userResult = await query(
            'SELECT role, department FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const user = userResult.rows[0];

        // Admins can create polls anywhere
        if (user.role === 'admin') return true;

        // ROPs can create polls in their department chats
        if (user.role === 'rop') {
            const chatResult = await query(
                'SELECT type, department FROM chats WHERE id = $1',
                [chatId]
            );

            if (chatResult.rows.length === 0) return false;

            const chat = chatResult.rows[0];

            // ROP can create in department chats of their department
            if (chat.type === 'department' && chat.department === user.department) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Can create poll error:', error);
        return false;
    }
}

/**
 * POST /api/polls
 * Create a new poll
 */
router.post('/',
    authenticateToken,
    [
        body('chat_id').isInt().withMessage('Valid chat_id required'),
        body('question').trim().isLength({ min: 1, max: 500 }).withMessage('Question required (max 500 chars)'),
        body('options').isArray({ min: 2, max: 10 }).withMessage('2-10 options required'),
        body('options.*').trim().isLength({ min: 1, max: 200 }).withMessage('Each option max 200 chars'),
        body('multiple_choice').optional().isBoolean(),
        body('anonymous').optional().isBoolean(),
        body('closes_at').optional().isISO8601()
    ],
    validate,
    async (req, res) => {
        try {
            const { chat_id, question, options, multiple_choice, anonymous, closes_at } = req.body;
            const userId = req.user.userId;

            // Check permissions
            const canCreate = await canCreatePoll(userId, chat_id);
            if (!canCreate) {
                return res.status(403).json({
                    error: 'Only admins and department heads (ROP) can create polls'
                });
            }

            // Check if user is in chat
            const participantCheck = await query(
                'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
                [chat_id, userId]
            );

            if (participantCheck.rows.length === 0) {
                return res.status(403).json({ error: 'You are not a member of this chat' });
            }

            // Create poll options structure
            const pollOptions = options.map(text => ({ text, votes: 0 }));

            // Create message for poll
            const messageResult = await query(
                `INSERT INTO messages (chat_id, user_id, content, is_edited)
                 VALUES ($1, $2, $3, false)
                 RETURNING id`,
                [chat_id, userId, `📊 Опрос: ${question}`]
            );

            const messageId = messageResult.rows[0].id;

            // Create poll
            const pollResult = await query(
                `INSERT INTO polls (message_id, chat_id, created_by, question, options, multiple_choice, anonymous, closes_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [
                    messageId,
                    chat_id,
                    userId,
                    question,
                    JSON.stringify(pollOptions),
                    multiple_choice || false,
                    anonymous || false,
                    closes_at || null
                ]
            );

            const poll = pollResult.rows[0];

            // Get creator info
            const userInfo = await query(
                'SELECT name, username FROM users WHERE id = $1',
                [userId]
            );

            // Emit socket event
            if (req.app.get('io')) {
                const io = req.app.get('io');
                io.to(`chat_${chat_id}`).emit('new_poll', {
                    chatId: chat_id,
                    poll: {
                        ...poll,
                        creator_name: userInfo.rows[0]?.name || 'Unknown',
                        options: pollOptions
                    }
                });
            }

            res.status(201).json({
                poll: {
                    ...poll,
                    options: pollOptions,
                    creator_name: userInfo.rows[0]?.name || 'Unknown'
                }
            });

        } catch (error) {
            console.error('Create poll error:', error);
            res.status(500).json({ error: 'Failed to create poll' });
        }
    }
);

/**
 * POST /api/polls/:id/vote
 * Vote in a poll
 */
router.post('/:id/vote',
    authenticateToken,
    [
        param('id').isInt(),
        body('option_indices').isArray({ min: 1 }).withMessage('At least one option required'),
        body('option_indices.*').isInt({ min: 0 }).withMessage('Invalid option index')
    ],
    validate,
    async (req, res) => {
        try {
            const pollId = req.params.id;
            const { option_indices } = req.body;
            const userId = req.user.userId;

            // Get poll
            const pollResult = await query(
                'SELECT * FROM polls WHERE id = $1',
                [pollId]
            );

            if (pollResult.rows.length === 0) {
                return res.status(404).json({ error: 'Poll not found' });
            }

            const poll = pollResult.rows[0];

            // Check if poll is closed
            if (poll.closed) {
                return res.status(400).json({ error: 'Poll is closed' });
            }

            // Check if poll has expired
            if (poll.closes_at && new Date(poll.closes_at) < new Date()) {
                return res.status(400).json({ error: 'Poll has expired' });
            }

            // Check if user is in chat
            const participantCheck = await query(
                'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
                [poll.chat_id, userId]
            );

            if (participantCheck.rows.length === 0) {
                return res.status(403).json({ error: 'You are not a member of this chat' });
            }

            // Validate option indices
            const options = JSON.parse(poll.options);
            for (const index of option_indices) {
                if (index < 0 || index >= options.length) {
                    return res.status(400).json({ error: 'Invalid option index' });
                }
            }

            // Check multiple choice
            if (!poll.multiple_choice && option_indices.length > 1) {
                return res.status(400).json({ error: 'This poll allows only single choice' });
            }

            // Check if user already voted
            const existingVote = await query(
                'SELECT * FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
                [pollId, userId]
            );

            if (existingVote.rows.length > 0) {
                // Update vote
                await query(
                    'UPDATE poll_votes SET option_indices = $1 WHERE poll_id = $2 AND user_id = $3',
                    [option_indices, pollId, userId]
                );

                // Update vote counts in poll options
                await updatePollVoteCounts(pollId);
            } else {
                // Insert new vote
                await query(
                    'INSERT INTO poll_votes (poll_id, user_id, option_indices) VALUES ($1, $2, $3)',
                    [pollId, userId, option_indices]
                );

                // Update vote counts
                await updatePollVoteCounts(pollId);
            }

            // Get updated poll
            const updatedPoll = await getPollWithDetails(pollId, userId);

            // Emit socket event
            if (req.app.get('io')) {
                const io = req.app.get('io');
                io.to(`chat_${poll.chat_id}`).emit('poll_updated', {
                    chatId: poll.chat_id,
                    poll: updatedPoll
                });
            }

            res.json({ poll: updatedPoll });

        } catch (error) {
            console.error('Vote poll error:', error);
            res.status(500).json({ error: 'Failed to vote' });
        }
    }
);

/**
 * GET /api/polls/:id
 * Get poll details
 */
router.get('/:id',
    authenticateToken,
    [param('id').isInt()],
    validate,
    async (req, res) => {
        try {
            const pollId = req.params.id;
            const userId = req.user.userId;

            const poll = await getPollWithDetails(pollId, userId);

            if (!poll) {
                return res.status(404).json({ error: 'Poll not found' });
            }

            res.json({ poll });

        } catch (error) {
            console.error('Get poll error:', error);
            res.status(500).json({ error: 'Failed to get poll' });
        }
    }
);

/**
 * POST /api/polls/:id/close
 * Close a poll (admin, ROP, or creator)
 */
router.post('/:id/close',
    authenticateToken,
    [param('id').isInt()],
    validate,
    async (req, res) => {
        try {
            const pollId = req.params.id;
            const userId = req.user.userId;

            // Get poll
            const pollResult = await query(
                'SELECT p.*, u.role, u.department FROM polls p JOIN users u ON p.created_by = u.id WHERE p.id = $1',
                [pollId]
            );

            if (pollResult.rows.length === 0) {
                return res.status(404).json({ error: 'Poll not found' });
            }

            const poll = pollResult.rows[0];

            // Get current user info
            const userResult = await query(
                'SELECT role, department FROM users WHERE id = $1',
                [userId]
            );

            const currentUser = userResult.rows[0];

            // Check permissions: admin, creator, or ROP of same department
            const canClose = currentUser.role === 'admin' ||
                poll.created_by === userId ||
                (currentUser.role === 'rop' && currentUser.department === poll.department);

            if (!canClose) {
                return res.status(403).json({ error: 'You cannot close this poll' });
            }

            // Close poll
            await query('UPDATE polls SET closed = true WHERE id = $1', [pollId]);

            // Get updated poll
            const updatedPoll = await getPollWithDetails(pollId, userId);

            // Emit socket event
            if (req.app.get('io')) {
                const io = req.app.get('io');
                io.to(`chat_${poll.chat_id}`).emit('poll_closed', {
                    chatId: poll.chat_id,
                    poll: updatedPoll
                });
            }

            res.json({ poll: updatedPoll });

        } catch (error) {
            console.error('Close poll error:', error);
            res.status(500).json({ error: 'Failed to close poll' });
        }
    }
);

// Helper: Update vote counts in poll options
async function updatePollVoteCounts(pollId) {
    try {
        // Get all votes for this poll
        const votesResult = await query(
            'SELECT option_indices FROM poll_votes WHERE poll_id = $1',
            [pollId]
        );

        // Get poll
        const pollResult = await query('SELECT options FROM polls WHERE id = $1', [pollId]);
        const options = JSON.parse(pollResult.rows[0].options);

        // Reset votes
        options.forEach(opt => opt.votes = 0);

        // Count votes
        votesResult.rows.forEach(vote => {
            vote.option_indices.forEach(index => {
                if (options[index]) {
                    options[index].votes++;
                }
            });
        });

        // Update poll
        await query(
            'UPDATE polls SET options = $1 WHERE id = $2',
            [JSON.stringify(options), pollId]
        );

    } catch (error) {
        console.error('Update vote counts error:', error);
    }
}

// Helper: Get poll with full details
async function getPollWithDetails(pollId, userId) {
    try {
        const pollResult = await query(
            `SELECT p.*, u.name as creator_name, u.username as creator_username
             FROM polls p
             JOIN users u ON p.created_by = u.id
             WHERE p.id = $1`,
            [pollId]
        );

        if (pollResult.rows.length === 0) return null;

        const poll = pollResult.rows[0];

        // Get user's vote if exists
        const voteResult = await query(
            'SELECT option_indices FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
            [pollId, userId]
        );

        const userVote = voteResult.rows[0]?.option_indices || null;

        // Get total voters
        const votersResult = await query(
            'SELECT COUNT(DISTINCT user_id) as total FROM poll_votes WHERE poll_id = $1',
            [pollId]
        );

        const totalVoters = parseInt(votersResult.rows[0].total);

        // Get voter details if not anonymous
        let voters = null;
        if (!poll.anonymous) {
            const votersDetailResult = await query(
                `SELECT pv.option_indices, u.name, u.username
                 FROM poll_votes pv
                 JOIN users u ON pv.user_id = u.id
                 WHERE pv.poll_id = $1`,
                [pollId]
            );
            voters = votersDetailResult.rows;
        }

        return {
            ...poll,
            options: JSON.parse(poll.options),
            user_vote: userVote,
            total_voters: totalVoters,
            voters: voters
        };

    } catch (error) {
        console.error('Get poll with details error:', error);
        return null;
    }
}

module.exports = router;
