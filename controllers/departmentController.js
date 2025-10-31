const { query, pool } = require('../config/database');

// Получить все отделы со статистикой
const getAllDepartments = async (req, res) => {
    try {
        const result = await query(`
            SELECT
                d.name as department,
                COUNT(u.id) as user_count,
                COUNT(u.id) FILTER (WHERE u.role = 'rop') as rop_count,
                COUNT(u.id) FILTER (WHERE u.role = 'operator') as operator_count,
                json_agg(
                    json_build_object(
                        'id', u.id,
                        'name', u.name,
                        'role', u.role,
                        'username', u.username,
                        'is_active', u.is_active
                    ) ORDER BY
                        CASE u.role
                            WHEN 'rop' THEN 1
                            WHEN 'operator' THEN 2
                            ELSE 3
                        END,
                        u.name
                ) FILTER (WHERE u.id IS NOT NULL) as users
            FROM (
                SELECT DISTINCT department as name
                FROM users
                WHERE department IS NOT NULL
            ) d
            LEFT JOIN users u ON u.department = d.name AND u.is_active = true
            GROUP BY d.name
            ORDER BY d.name
        `);

        console.log('[getAllDepartments] SQL result.rows:', JSON.stringify(result.rows, null, 2));
        console.log('[getAllDepartments] Sending response:', JSON.stringify({ departments: result.rows }, null, 2));

        res.json({ departments: result.rows });
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
        const deptResult = await query(`
            SELECT
                d.name as department,
                json_agg(
                    json_build_object(
                        'id', u.id,
                        'name', u.name,
                        'role', u.role,
                        'username', u.username,
                        'is_active', u.is_active,
                        'last_seen', u.last_seen
                    ) ORDER BY
                        CASE u.role
                            WHEN 'rop' THEN 1
                            WHEN 'operator' THEN 2
                            ELSE 3
                        END,
                        u.name
                ) FILTER (WHERE u.id IS NOT NULL) as users
            FROM (
                SELECT DISTINCT department as name
                FROM users
                WHERE department IS NOT NULL
            ) d
            LEFT JOIN users u ON u.department = d.name AND u.is_active = true
            GROUP BY d.name
            ORDER BY d.name
        `);

        // Получаем ассистентов
        const assistResult = await query(`
            SELECT
                id, username, name, role, is_active, last_seen
            FROM users
            WHERE role = 'assistant' AND is_active = true
            ORDER BY name
        `);

        // Формируем структуру
        const structure = {
            departments: deptResult.rows,
            assistants: {
                name: 'Ассистенты',
                users: assistResult.rows
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

        // Проверяем, не существует ли отдел
        const existing = await query(
            'SELECT id FROM users WHERE department = $1 LIMIT 1',
            [name]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                error: 'Department already exists',
                code: 'DEPARTMENT_EXISTS'
            });
        }

        // Если указан руководитель, обновляем его
        if (headUserId) {
            await query(
                'UPDATE users SET department = $1, role = $2 WHERE id = $3',
                [name, 'rop', headUserId]
            );
        }

        res.json({
            message: 'Department created successfully',
            department: { name, headUserId }
        });
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

        // Проверяем, существует ли отдел
        const deptCheck = await query(
            'SELECT COUNT(*) as count FROM users WHERE department = $1',
            [departmentName]
        );

        if (deptCheck.rows[0].count === 0) {
            return res.status(404).json({
                error: 'Department not found',
                code: 'DEPT_NOT_FOUND'
            });
        }

        // Проверяем, не занято ли новое название
        const existingCheck = await query(
            'SELECT COUNT(*) as count FROM users WHERE department = $1',
            [trimmedNewName]
        );

        if (existingCheck.rows[0].count > 0 && departmentName !== trimmedNewName) {
            return res.status(400).json({
                error: 'Department with this name already exists',
                code: 'DEPT_EXISTS'
            });
        }

        // Используем транзакцию для атомарности
        await query('BEGIN');

        try {
            // 1. Обновляем department у всех пользователей отдела
            await query(
                'UPDATE users SET department = $1 WHERE department = $2',
                [trimmedNewName, departmentName]
            );

            console.log('[renameDepartment] Updated users.department');

            // 2. Обновляем department и name в чате отдела
            const chatUpdateResult = await query(
                `UPDATE chats
                 SET department = $1, name = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE type = 'department' AND department = $2
                 RETURNING id, name`,
                [trimmedNewName, departmentName]
            );

            console.log('[renameDepartment] Updated chat:', chatUpdateResult.rows[0]);

            await query('COMMIT');

            res.json({
                success: true,
                message: 'Department renamed successfully',
                oldName: departmentName,
                newName: trimmedNewName,
                updatedChat: chatUpdateResult.rows[0]
            });
        } catch (error) {
            await query('ROLLBACK');
            throw error;
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
