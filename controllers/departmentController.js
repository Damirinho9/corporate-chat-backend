const { query, pool } = require('../config/database');

const collator = new Intl.Collator('ru-RU');
const ROLE_SORT_ORDER = { rop: 0, operator: 1 };

const normalizeDepartmentName = (value) => {
    if (!value) {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
};

const sortDepartmentUsers = (users = []) => {
    return [...users].sort((a, b) => {
        const orderA = ROLE_SORT_ORDER[a.role] ?? 2;
        const orderB = ROLE_SORT_ORDER[b.role] ?? 2;
        if (orderA !== orderB) {
            return orderA - orderB;
        }
        const nameA = (a.name || a.username || '').toLowerCase();
        const nameB = (b.name || b.username || '').toLowerCase();
        return collator.compare(nameA, nameB);
    });
};

// Получить все отделы со статистикой
const getAllDepartments = async (req, res) => {
    try {
        // Получаем все отделы из таблицы departments
        const deptResult = await query(`
            SELECT name FROM departments ORDER BY name
        `);

        // Получаем всех пользователей с назначенными отделами
        const usersResult = await query(`
            SELECT id, username, name, role, department, is_active
            FROM users
            WHERE department IS NOT NULL
        `);

        const departmentMap = new Map();

        // Инициализируем все отделы из таблицы departments
        deptResult.rows.forEach((row) => {
            const normalizedName = normalizeDepartmentName(row.name);
            if (normalizedName) {
                departmentMap.set(normalizedName, {
                    department: normalizedName,
                    user_count: 0,
                    rop_count: 0,
                    operator_count: 0,
                    users: []
                });
            }
        });

        // Добавляем пользователей к отделам
        usersResult.rows.forEach((row) => {
            const normalizedName = normalizeDepartmentName(row.department);
            if (!normalizedName) {
                return;
            }

            // Создаем отдел, если его нет в departments (legacy данные)
            if (!departmentMap.has(normalizedName)) {
                departmentMap.set(normalizedName, {
                    department: normalizedName,
                    user_count: 0,
                    rop_count: 0,
                    operator_count: 0,
                    users: []
                });
            }

            if (row.is_active !== true) {
                return;
            }

            const bucket = departmentMap.get(normalizedName);
            bucket.user_count += 1;

            if (row.role === 'rop') {
                bucket.rop_count += 1;
            }

            if (row.role === 'operator') {
                bucket.operator_count += 1;
            }

            bucket.users.push({
                id: row.id,
                name: row.name,
                role: row.role,
                username: row.username,
                is_active: true
            });
        });

        const departments = Array.from(departmentMap.values())
            .map((entry) => ({
                department: entry.department,
                user_count: String(entry.user_count),
                rop_count: String(entry.rop_count),
                operator_count: String(entry.operator_count),
                users: sortDepartmentUsers(entry.users)
            }))
            .sort((a, b) => collator.compare(a.department, b.department));

        res.json({ departments });
    } catch (error) {
        console.error('Get departments error:', error);
        res.status(500).json({
            error: 'Failed to get departments',
            code: 'GET_DEPARTMENTS_ERROR'
        });
    }
};

// Получить пользователей отдела
const getDepartmentUsers = async (req, res) => {
    try {
        const { departmentName } = req.params;

        const result = await query(`
            SELECT
                id, username, name, role, department, is_active, last_seen, created_at
            FROM users
            WHERE department = $1
            ORDER BY
                CASE role
                    WHEN 'rop' THEN 1
                    WHEN 'operator' THEN 2
                    ELSE 3
                END,
                name
        `, [departmentName]);

        res.json({ users: result.rows });
    } catch (error) {
        console.error('Get department users error:', error);
        res.status(500).json({
            error: 'Failed to get department users',
            code: 'GET_DEPT_USERS_ERROR'
        });
    }
};

// Получить список ассистентов
const getAssistants = async (req, res) => {
    try {
        const result = await query(`
            SELECT
                id, username, name, role, is_active, last_seen, created_at
            FROM users
            WHERE role = 'assistant' AND is_active = true
            ORDER BY name
        `);

        res.json({ assistants: result.rows });
    } catch (error) {
        console.error('Get assistants error:', error);
        res.status(500).json({
            error: 'Failed to get assistants',
            code: 'GET_ASSISTANTS_ERROR'
        });
    }
};

// Получить структурированный список контактов (для UI)
const getContactsStructured = async (req, res) => {
    try {
        // Получаем все отделы с пользователями
        const usersResult = await query(`
            SELECT id, username, name, role, department, is_active, last_seen
            FROM users
        `);

        const departmentMap = new Map();
        const assistants = [];

        usersResult.rows.forEach((row) => {
            if (row.role === 'assistant' && row.is_active) {
                assistants.push({
                    id: row.id,
                    username: row.username,
                    name: row.name,
                    role: row.role,
                    is_active: row.is_active,
                    last_seen: row.last_seen
                });
            }

            const normalizedName = normalizeDepartmentName(row.department);
            if (!normalizedName || row.is_active !== true) {
                return;
            }

            if (!departmentMap.has(normalizedName)) {
                departmentMap.set(normalizedName, []);
            }

            departmentMap.get(normalizedName).push({
                id: row.id,
                name: row.name,
                role: row.role,
                username: row.username,
                is_active: true,
                last_seen: row.last_seen
            });
        });

        const departments = Array.from(departmentMap.entries())
            .map(([name, users]) => ({
                department: name,
                users: sortDepartmentUsers(users)
            }))
            .sort((a, b) => collator.compare(a.department, b.department));

        const structure = {
            departments,
            assistants: {
                name: 'Ассистенты',
                users: assistants.sort((a, b) => collator.compare(a.name || a.username || '', b.name || b.username || ''))
            }
        };

        res.json(structure);
    } catch (error) {
        console.error('Get contacts structured error:', error);
        res.status(500).json({
            error: 'Failed to get contacts',
            code: 'GET_CONTACTS_ERROR'
        });
    }
};

// Создать новый отдел (admin only)
const createDepartment = async (req, res) => {
    try {
        const { name, headUserId } = req.body;

        if (!name) {
            return res.status(400).json({
                error: 'Department name is required',
                code: 'MISSING_NAME'
            });
        }

        const trimmedName = name.trim();

        if (trimmedName.length === 0) {
            return res.status(400).json({
                error: 'Department name is required',
                code: 'MISSING_NAME'
            });
        }

        // Проверяем, не существует ли отдел
        const [existingUser, existingChat] = await Promise.all([
            query(
                'SELECT id FROM users WHERE department = $1 LIMIT 1',
                [trimmedName]
            ),
            query(
                `SELECT id FROM chats WHERE type = 'department' AND (department = $1 OR name = $1) LIMIT 1`,
                [trimmedName]
            )
        ]);

        if (existingUser.rows.length > 0 || existingChat.rows.length > 0) {
            return res.status(400).json({
                error: 'Department already exists',
                code: 'DEPARTMENT_EXISTS'
            });
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Создаём запись в таблице departments
            await client.query(
                `INSERT INTO departments (name) VALUES ($1)
                 ON CONFLICT (name) DO NOTHING`,
                [trimmedName]
            );

            // Создаём чат отдела заранее, чтобы гарантировать связь
            const chatResult = await client.query(
                `INSERT INTO chats (name, type, department, created_by)
                 VALUES ($1, 'department', $1, $2)
                 RETURNING id`,
                [trimmedName, headUserId || null]
            );

            const departmentChatId = chatResult.rows[0]?.id;

            // Если указан руководитель, обновляем его и добавляем в чат
            if (headUserId) {
                await client.query(
                    'UPDATE users SET department = $1, role = $2 WHERE id = $3',
                    [trimmedName, 'rop', headUserId]
                );

                if (departmentChatId) {
                    await client.query(
                        `INSERT INTO chat_participants (chat_id, user_id)
                         VALUES ($1, $2)
                         ON CONFLICT DO NOTHING`,
                        [departmentChatId, headUserId]
                    );
                }
            }

            await client.query('COMMIT');

            res.json({
                message: 'Department created successfully',
                department: { name: trimmedName, headUserId }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Create department error:', error);
        res.status(500).json({
            error: 'Failed to create department',
            code: 'CREATE_DEPT_ERROR'
        });
    }
};

// Назначить руководителя отдела (admin only)
const assignDepartmentHead = async (req, res) => {
    try {
        const { departmentName } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: 'User ID is required',
                code: 'MISSING_USER_ID'
            });
        }

        // Проверяем, существует ли пользователь
        const userCheck = await query(
            'SELECT id, role, department FROM users WHERE id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Снимаем роль РОП у текущего руководителя отдела
        await query(`
            UPDATE users
            SET role = CASE
                WHEN role = 'rop' THEN 'operator'
                ELSE role
            END
            WHERE department = $1 AND role = 'rop' AND id != $2
        `, [departmentName, userId]);

        // Назначаем нового руководителя
        await query(
            'UPDATE users SET department = $1, role = $2 WHERE id = $3',
            [departmentName, 'rop', userId]
        );

        res.json({
            message: 'Department head assigned successfully',
            userId,
            department: departmentName
        });
    } catch (error) {
        console.error('Assign head error:', error);
        res.status(500).json({
            error: 'Failed to assign department head',
            code: 'ASSIGN_HEAD_ERROR'
        });
    }
};

// Переместить пользователя в другой отдел (admin only)
const moveUserToDepartment = async (req, res) => {
    try {
        const { userId } = req.params;
        const { departmentName, role } = req.body;

        // Проверяем пользователя
        const userCheck = await query(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Обновляем отдел и роль (если указана)
        if (role) {
            await query(
                'UPDATE users SET department = $1, role = $2 WHERE id = $3',
                [departmentName, role, userId]
            );
        } else {
            await query(
                'UPDATE users SET department = $1 WHERE id = $2',
                [departmentName, userId]
            );
        }

        res.json({
            message: 'User moved successfully',
            userId,
            department: departmentName,
            role
        });
    } catch (error) {
        console.error('Move user error:', error);
        res.status(500).json({
            error: 'Failed to move user',
            code: 'MOVE_USER_ERROR'
        });
    }
};

// Добавить пользователя в отдел (admin/rop)
const addUserToDepartment = async (req, res) => {
    try {
        const { departmentName } = req.params;
        const { userId, role } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: 'User ID is required',
                code: 'MISSING_USER_ID'
            });
        }

        // Проверяем пользователя
        const userCheck = await query(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // РОП может добавлять только в свой отдел
        if (req.user.role === 'rop') {
            if (req.user.department !== departmentName) {
                return res.status(403).json({
                    error: 'ROPs can only add users to their own department',
                    code: 'PERMISSION_DENIED'
                });
            }
        }

        // Добавляем пользователя в отдел
        const updateRole = role || 'operator';
        await query(
            'UPDATE users SET department = $1, role = $2 WHERE id = $3',
            [departmentName, updateRole, userId]
        );

        res.json({
            message: 'User added to department successfully',
            userId,
            department: departmentName,
            role: updateRole
        });
    } catch (error) {
        console.error('Add user to department error:', error);
        res.status(500).json({
            error: 'Failed to add user to department',
            code: 'ADD_USER_ERROR'
        });
    }
};

// Удалить пользователя из отдела (admin only)
const removeUserFromDepartment = async (req, res) => {
    try {
        const { userId } = req.params;

        const userCheck = await query(
            'SELECT id, role FROM users WHERE id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Удаляем из отдела
        await query(
            'UPDATE users SET department = NULL WHERE id = $1',
            [userId]
        );

        res.json({
            message: 'User removed from department successfully',
            userId
        });
    } catch (error) {
        console.error('Remove user from department error:', error);
        res.status(500).json({
            error: 'Failed to remove user from department',
            code: 'REMOVE_USER_ERROR'
        });
    }
};

// Переименовать отдел (admin only) - синхронизирует название отдела и чата
const renameDepartment = async (req, res) => {
    try {
        const { departmentName } = req.params;
        const { newName } = req.body;

        console.log('[renameDepartment] Renaming department:', { from: departmentName, to: newName });

        if (!newName || newName.trim().length === 0) {
            return res.status(400).json({
                error: 'New department name is required',
                code: 'MISSING_NEW_NAME'
            });
        }

        const trimmedNewName = newName.trim();
        const normalizedCurrentName = departmentName.trim();

        // Проверяем, существует ли отдел (в чатах или у пользователей)
        const [departmentChat, deptUsers] = await Promise.all([
            query(
                `SELECT id, name, department FROM chats
                 WHERE type = 'department' AND (department = $1 OR name = $1)
                 LIMIT 1`,
                [normalizedCurrentName]
            ),
            query(
                'SELECT COUNT(*) as count FROM users WHERE department = $1',
                [normalizedCurrentName]
            )
        ]);

        if (departmentChat.rows.length === 0 && Number(deptUsers.rows[0].count) === 0) {
            return res.status(404).json({
                error: 'Department not found',
                code: 'DEPT_NOT_FOUND'
            });
        }

        // Проверяем, не занято ли новое название (в чатах или у пользователей)
        if (normalizedCurrentName !== trimmedNewName) {
            const [existingUser, existingChat] = await Promise.all([
                query(
                    'SELECT COUNT(*) as count FROM users WHERE department = $1',
                    [trimmedNewName]
                ),
                query(
                    `SELECT COUNT(*) as count FROM chats
                     WHERE type = 'department' AND (department = $1 OR name = $1)`,
                    [trimmedNewName]
                )
            ]);

            if (Number(existingUser.rows[0].count) > 0 || Number(existingChat.rows[0].count) > 0) {
                return res.status(400).json({
                    error: 'Department with this name already exists',
                    code: 'DEPT_EXISTS'
                });
            }
        }

        const client = await pool.connect();

        try {
            // Используем транзакцию для атомарности
            await client.query('BEGIN');

            // 1. Обновляем department у всех пользователей отдела
            await client.query(
                'UPDATE users SET department = $1 WHERE department = $2',
                [trimmedNewName, normalizedCurrentName]
            );

            console.log('[renameDepartment] Updated users.department');

            // 2. Обновляем или создаём чат отдела
            const chatUpdateResult = await client.query(
                `UPDATE chats
                 SET department = $1, name = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE type = 'department' AND (department = $2 OR name = $2)
                 RETURNING id, name`,
                [trimmedNewName, normalizedCurrentName]
            );

            let updatedChat = chatUpdateResult.rows[0];
            let createdNewChat = false;

            if (!updatedChat) {
                const insertResult = await client.query(
                    `INSERT INTO chats (name, type, department)
                     VALUES ($1, 'department', $1)
                     RETURNING id, name`,
                    [trimmedNewName]
                );
                updatedChat = insertResult.rows[0];
                createdNewChat = true;
            }

            if (createdNewChat) {
                await client.query(
                    `INSERT INTO chat_participants (chat_id, user_id)
                     SELECT $1, id FROM users WHERE department = $2
                     ON CONFLICT DO NOTHING`,
                    [updatedChat.id, trimmedNewName]
                );
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                message: 'Department renamed successfully',
                oldName: normalizedCurrentName,
                newName: trimmedNewName,
                updatedChat
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Rename department error:', error);
        res.status(500).json({
            error: 'Failed to rename department',
            code: 'RENAME_DEPT_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Получить статистику по отделам (admin only)
const getDepartmentStats = async (req, res) => {
    try {
        const result = await query(`
            SELECT
                department,
                COUNT(*) as total_users,
                COUNT(*) FILTER (WHERE role = 'rop') as rops,
                COUNT(*) FILTER (WHERE role = 'operator') as operators,
                COUNT(*) FILTER (WHERE is_active = true) as active_users,
                COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '5 minutes') as online_users
            FROM users
            WHERE department IS NOT NULL
            GROUP BY department
            ORDER BY department
        `);

        res.json({ stats: result.rows });
    } catch (error) {
        console.error('Get department stats error:', error);
        res.status(500).json({
            error: 'Failed to get department stats',
            code: 'GET_STATS_ERROR'
        });
    }
};

module.exports = {
    getAllDepartments,
    getDepartmentUsers,
    getAssistants,
    getContactsStructured,
    createDepartment,
    assignDepartmentHead,
    moveUserToDepartment,
    addUserToDepartment,
    removeUserFromDepartment,
    renameDepartment,
    getDepartmentStats
};
