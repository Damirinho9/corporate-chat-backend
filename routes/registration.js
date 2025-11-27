const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { sendRegistrationRequestToAdmin, sendApprovalToUser, sendRejectionToUser } = require('../utils/emailService');
const { logAdminAction } = require('../utils/adminLogger');

const PASSWORD_LENGTH = 12;

/**
 * Generate secure random password
 */
function generateSecurePassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+';
    const bytes = crypto.randomBytes(PASSWORD_LENGTH);
    let password = '';
    for (let i = 0; i < PASSWORD_LENGTH; i++) {
        password += alphabet[bytes[i] % alphabet.length];
    }
    return password;
}

/**
 * Generate username from full name (transliteration)
 */
function generateUsername(fullName) {
    const translitMap = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };

    const parts = fullName.trim().split(/\s+/);
    let username = '';

    if (parts.length >= 2) {
        // LastName + First letter of FirstName
        const lastName = parts[0].toLowerCase();
        const firstLetter = parts[1][0].toLowerCase();

        username = lastName + firstLetter;
    } else {
        username = parts[0].toLowerCase();
    }

    // Transliterate
    username = username
        .split('')
        .map(char => translitMap[char] || char)
        .join('')
        .replace(/[^a-z0-9]/g, '');

    return username || 'user';
}

/**
 * POST /api/registration/submit
 * Submit registration request
 */
router.post('/submit',
    [
        body('email').isEmail().normalizeEmail(),
        body('full_name').trim().isLength({ min: 2, max: 255 }),
        body('role').isIn(['assistant', 'rop', 'operator', 'employee']),
        body('department').optional({ nullable: true }).trim()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, full_name, role, department } = req.body;

            // Check if email already exists in users
            const existingUser = await query(
                'SELECT id FROM users WHERE email = $1',
                [email]
            );

            if (existingUser.rows.length > 0) {
                return res.status(409).json({
                    error: 'Пользователь с таким email уже существует'
                });
            }

            // Check if there's a pending request with this email
            const existingRequest = await query(
                'SELECT id, status FROM registration_requests WHERE email = $1',
                [email]
            );

            if (existingRequest.rows.length > 0) {
                const status = existingRequest.rows[0].status;
                if (status === 'pending') {
                    return res.status(409).json({
                        error: 'Заявка с таким email уже ожидает рассмотрения'
                    });
                } else if (status === 'approved') {
                    return res.status(409).json({
                        error: 'Заявка с таким email уже была одобрена'
                    });
                }
                // If rejected, allow to submit again
            }

            // Generate username from full name
            let username = generateUsername(full_name);

            // Make username unique by adding numbers if needed
            let usernameExists = true;
            let counter = 1;
            let finalUsername = username;

            while (usernameExists) {
                const check = await query(
                    'SELECT id FROM users WHERE username = $1',
                    [finalUsername]
                );

                if (check.rows.length === 0) {
                    usernameExists = false;
                } else {
                    finalUsername = username + counter;
                    counter++;
                }
            }

            username = finalUsername;

            // Generate password
            const generatedPassword = generateSecurePassword();
            const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
            const passwordHash = await bcrypt.hash(generatedPassword, saltRounds);

            // Generate approval token
            const approvalToken = crypto.randomBytes(32).toString('hex');

            // Validate department requirement
            if (['rop', 'operator', 'employee'].includes(role)) {
                if (!department || department.trim() === '') {
                    return res.status(400).json({
                        error: 'Отдел обязателен для данной роли'
                    });
                }
            }

            // Delete old rejected requests for this email
            await query(
                'DELETE FROM registration_requests WHERE email = $1 AND status = $2',
                [email, 'rejected']
            );

            // Insert registration request
            const result = await query(
                `INSERT INTO registration_requests
                (email, full_name, username, password_hash, generated_password, role, department, approval_token, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id, email, full_name, username, generated_password, role, department, created_at, approval_token`,
                [email, full_name, username, passwordHash, generatedPassword, role, department || null, approvalToken, 'pending']
            );

            const request = result.rows[0];

            // Send email to admin
            await sendRegistrationRequestToAdmin(request);

            res.status(201).json({
                success: true,
                message: 'Заявка на регистрацию отправлена. Ожидайте подтверждения администратора.',
                request: {
                    email: request.email,
                    full_name: request.full_name,
                    username: request.username,
                    role: request.role,
                    department: request.department
                }
            });

        } catch (error) {
            console.error('Registration submission error:', error);
            res.status(500).json({
                error: 'Не удалось отправить заявку на регистрацию'
            });
        }
    }
);

/**
 * GET /api/registration/approve/:token
 * Approve registration request (accessed from email link)
 */
router.get('/approve/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // Find request by token
        const requestResult = await query(
            'SELECT * FROM registration_requests WHERE approval_token = $1 AND status = $2',
            [token, 'pending']
        );

        if (requestResult.rows.length === 0) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Ошибка</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .error { color: #f56565; }
                    </style>
                </head>
                <body>
                    <h1 class="error">❌ Ошибка</h1>
                    <p>Заявка не найдена или уже обработана.</p>
                </body>
                </html>
            `);
        }

        const request = requestResult.rows[0];

        // Create user account
        const userResult = await query(
            `INSERT INTO users (username, email, password_hash, initial_password, name, role, department)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, username, email, name, role, department`,
            [
                request.username,
                request.email,
                request.password_hash,
                request.generated_password,
                request.full_name,
                request.role,
                request.department
            ]
        );

        const newUser = userResult.rows[0];

        // Add user to appropriate chats based on role
        if (request.role === 'assistant') {
            await query(
                `INSERT INTO chat_participants (chat_id, user_id)
                 SELECT c.id, $1
                 FROM chats c
                 WHERE c.name = 'Все ассистенты'
                   AND NOT EXISTS (
                       SELECT 1 FROM chat_participants cp
                       WHERE cp.chat_id = c.id AND cp.user_id = $1
                 )`,
                [newUser.id]
            );
        } else if (request.role === 'rop') {
            if (request.department) {
                const deptChat = await query(
                    `SELECT id FROM chats WHERE type = 'department' AND department = $1`,
                    [request.department]
                );

                if (deptChat.rows.length > 0) {
                    await query(
                        `INSERT INTO chat_participants (chat_id, user_id)
                         SELECT $1, $2
                         WHERE NOT EXISTS (
                             SELECT 1 FROM chat_participants
                             WHERE chat_id = $1 AND user_id = $2
                         )`,
                        [deptChat.rows[0].id, newUser.id]
                    );
                }
            }

            await query(
                `INSERT INTO chat_participants (chat_id, user_id)
                 SELECT c.id, $1
                 FROM chats c
                 WHERE c.name = 'Руководство'
                   AND NOT EXISTS (
                       SELECT 1 FROM chat_participants cp
                       WHERE cp.chat_id = c.id AND cp.user_id = $1
                 )`,
                [newUser.id]
            );
        } else if (request.role === 'operator' || request.role === 'employee') {
            if (request.department) {
                const deptChat = await query(
                    `SELECT id FROM chats WHERE type = 'department' AND department = $1`,
                    [request.department]
                );

                if (deptChat.rows.length > 0) {
                    await query(
                        `INSERT INTO chat_participants (chat_id, user_id)
                         SELECT $1, $2
                         WHERE NOT EXISTS (
                             SELECT 1 FROM chat_participants
                             WHERE chat_id = $1 AND user_id = $2
                         )`,
                        [deptChat.rows[0].id, newUser.id]
                    );
                }
            }
        }

        // Update request status
        await query(
            'UPDATE registration_requests SET status = $1, approved_at = NOW() WHERE id = $2',
            ['approved', request.id]
        );

        // Send approval email to user
        await sendApprovalToUser(request);

        // Log admin action (we don't have user_id here, so we'll use NULL)
        await logAdminAction(1, 'approve_registration', {
            request_id: request.id,
            email: request.email,
            username: request.username,
            user_id: newUser.id
        });

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Заявка одобрена</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .success { color: #48bb78; }
                </style>
            </head>
            <body>
                <h1 class="success">✅ Заявка одобрена!</h1>
                <p>Пользователь ${request.full_name} (${request.email}) успешно зарегистрирован.</p>
                <p>На указанный email отправлено письмо с данными для входа.</p>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Approve registration error:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Ошибка</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .error { color: #f56565; }
                </style>
            </head>
            <body>
                <h1 class="error">❌ Ошибка</h1>
                <p>Не удалось одобрить заявку. Попробуйте еще раз.</p>
                <p style="color: #718096; font-size: 12px;">${error.message}</p>
            </body>
            </html>
        `);
    }
});

/**
 * GET /api/registration/reject/:token
 * Reject registration request (accessed from email link)
 */
router.get('/reject/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { reason } = req.query;

        // Find request by token
        const requestResult = await query(
            'SELECT * FROM registration_requests WHERE approval_token = $1 AND status = $2',
            [token, 'pending']
        );

        if (requestResult.rows.length === 0) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Ошибка</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .error { color: #f56565; }
                    </style>
                </head>
                <body>
                    <h1 class="error">❌ Ошибка</h1>
                    <p>Заявка не найдена или уже обработана.</p>
                </body>
                </html>
            `);
        }

        const request = requestResult.rows[0];

        // Update request status
        await query(
            'UPDATE registration_requests SET status = $1, rejection_reason = $2 WHERE id = $3',
            ['rejected', reason || 'Не указана', request.id]
        );

        // Send rejection email to user
        await sendRejectionToUser(request, reason);

        // Log admin action
        await logAdminAction(1, 'reject_registration', {
            request_id: request.id,
            email: request.email,
            username: request.username,
            reason: reason || 'Не указана'
        });

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Заявка отклонена</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .warning { color: #f56565; }
                </style>
            </head>
            <body>
                <h1 class="warning">❌ Заявка отклонена</h1>
                <p>Заявка пользователя ${request.full_name} (${request.email}) была отклонена.</p>
                <p>На указанный email отправлено уведомление.</p>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Reject registration error:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Ошибка</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .error { color: #f56565; }
                </style>
            </head>
            <body>
                <h1 class="error">❌ Ошибка</h1>
                <p>Не удалось отклонить заявку. Попробуйте еще раз.</p>
                <p style="color: #718096; font-size: 12px;">${error.message}</p>
            </body>
            </html>
        `);
    }
});

/**
 * GET /api/registration/requests
 * Get all registration requests (admin only)
 */
router.get('/requests', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { status } = req.query;

        let queryStr = `
            SELECT id, email, full_name, username, role, department, status, created_at, approved_at, rejection_reason
            FROM registration_requests
        `;

        const params = [];
        if (status) {
            queryStr += ' WHERE status = $1';
            params.push(status);
        }

        queryStr += ' ORDER BY created_at DESC';

        const result = await query(queryStr, params);

        res.json({ requests: result.rows });

    } catch (error) {
        console.error('Get registration requests error:', error);
        res.status(500).json({ error: 'Failed to get requests' });
    }
});

/**
 * GET /api/registration/departments
 * Get all available departments (public endpoint for registration form)
 */
router.get('/departments', async (req, res) => {
    try {
        const result = await query(`
            SELECT DISTINCT department
            FROM users
            WHERE department IS NOT NULL
            ORDER BY department
        `);

        const departments = result.rows.map(r => r.department);
        res.json({ departments });

    } catch (error) {
        console.error('Get departments error:', error);
        res.status(500).json({ error: 'Failed to get departments' });
    }
});

module.exports = router;
