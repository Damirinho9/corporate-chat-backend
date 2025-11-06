class InMemoryDatabase {
    constructor() {
        this.reset();
    }

    reset() {
        this.data = {
            users: [],
            chats: [],
            chat_participants: [],
            messages: [],
            files: [],
            reactions: [],
            mentions: [],
            admin_logs: []
        };
        this.sequences = {
            users: 1,
            chats: 1,
            messages: 1,
            files: 1,
            reactions: 1,
            mentions: 1,
            admin_logs: 1
        };
    }

    nextId(table) {
        const id = this.sequences[table] || 1;
        this.sequences[table] = id + 1;
        return id;
    }

    async query(text, params = []) {
        const normalized = text.replace(/\s+/g, ' ').trim();

        const toInt = (value) => (typeof value === 'number' ? value : Number(value));

        if (!normalized) {
            return { rows: [], rowCount: 0 };
        }

        if (normalized === 'SELECT 1') {
            return { rows: [{ '?column?': 1 }], rowCount: 1 };
        }

        if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
            return { rows: [], rowCount: 0 };
        }

        if (normalized.startsWith('TRUNCATE')) {
            this.reset();
            return { rows: [], rowCount: 0 };
        }

        if (normalized.startsWith('SELECT id FROM users WHERE username =')) {
            const username = params[0];
            const user = this.data.users.find(u => u.username === username);
            return { rows: user ? [{ id: user.id }] : [], rowCount: user ? 1 : 0 };
        }

        if (normalized.startsWith('SELECT id, department FROM users WHERE username =')) {
            const username = params[0];
            const user = this.data.users.find(u => u.username === username);
            return {
                rows: user ? [{ id: user.id, department: user.department || null }] : [],
                rowCount: user ? 1 : 0
            };
        }

        if (normalized.startsWith("SELECT id FROM chats WHERE type = 'department' AND department =")) {
            const department = params[0];
            const chat = this.data.chats.find(c => c.type === 'department' && c.department === department);
            return { rows: chat ? [{ id: chat.id }] : [], rowCount: chat ? 1 : 0 };
        }

        if (normalized.startsWith('SELECT id, initial_password, department FROM users WHERE username =')) {
            const username = params[0];
            const user = this.data.users.find(u => u.username === username);
            return {
                rows: user ? [{ id: user.id, initial_password: user.initial_password || null, department: user.department }] : [],
                rowCount: user ? 1 : 0
            };
        }

        if (normalized.startsWith('SELECT role FROM users WHERE id =')) {
            const id = toInt(params[0]);
            const user = this.data.users.find(u => u.id === id);
            return { rows: user ? [{ role: user.role }] : [], rowCount: user ? 1 : 0 };
        }

        if (normalized.startsWith('SELECT id, username, role, department, is_active FROM users WHERE id =')) {
            const id = toInt(params[0]);
            const user = this.data.users.find(u => u.id === id);
            return {
                rows: user ? [{
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    department: user.department || null,
                    is_active: user.is_active !== false
                }] : [],
                rowCount: user ? 1 : 0
            };
        }

        if (normalized.startsWith('SELECT id, role, department FROM users WHERE id =')) {
            const id = toInt(params[0]);
            const user = this.data.users.find(u => u.id === id);
            return {
                rows: user ? [{
                    id: user.id,
                    role: user.role,
                    department: user.department || null
                }] : [],
                rowCount: user ? 1 : 0
            };
        }

        if (normalized.startsWith('SELECT id, username, name FROM users WHERE id =')) {
            const id = toInt(params[0]);
            const user = this.data.users.find(u => u.id === id && u.is_active);
            return { rows: user ? [{ id: user.id, username: user.username, name: user.name }] : [], rowCount: user ? 1 : 0 };
        }

        if (normalized.startsWith('SELECT id, username, name, role, department, initial_password, is_active, created_at, last_seen FROM users ORDER BY created_at DESC')) {
            const users = [...this.data.users]
                .sort((a, b) => {
                    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                    return dateB - dateA;
                })
                .map(user => ({
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    department: user.department,
                    initial_password: user.initial_password || null,
                    is_active: user.is_active !== false,
                    created_at: user.created_at || null,
                    last_seen: user.last_seen || null
                }));

            return { rows: users, rowCount: users.length };
        }

        if (normalized.startsWith('SELECT id, username, name, role, department, initial_password, is_active, created_at, last_seen FROM users WHERE id =')) {
            const id = toInt(params[0]);
            const user = this.data.users.find(u => u.id === id);
            if (!user) {
                return { rows: [], rowCount: 0 };
            }

            return {
                rows: [{
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    department: user.department,
                    initial_password: user.initial_password || null,
                    is_active: user.is_active !== false,
                    created_at: user.created_at || null,
                    last_seen: user.last_seen || null
                }],
                rowCount: 1
            };
        }

        if (normalized.startsWith('SELECT id, username, name, role, department, initial_password, is_active, last_seen FROM users WHERE department =')) {
            const department = params[0];
            const users = this.data.users
                .filter(u => u.department === department && u.is_active !== false)
                .sort((a, b) => {
                    const roleCompare = String(a.role || '').localeCompare(String(b.role || ''));
                    if (roleCompare !== 0) {
                        return roleCompare;
                    }
                    return String(a.name || '').localeCompare(String(b.name || ''));
                })
                .map(user => ({
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    department: user.department,
                    initial_password: user.initial_password || null,
                    is_active: user.is_active !== false,
                    last_seen: user.last_seen || null
                }));

            return { rows: users, rowCount: users.length };
        }

        if (normalized.startsWith('SELECT id, username, name, role, department, initial_password, is_active, last_seen FROM users WHERE role =')) {
            const role = params[0];
            const users = this.data.users
                .filter(u => u.role === role && u.is_active !== false)
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                .map(user => ({
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    department: user.department,
                    initial_password: user.initial_password || null,
                    is_active: user.is_active !== false,
                    last_seen: user.last_seen || null
                }));

            return { rows: users, rowCount: users.length };
        }

        if (normalized.startsWith('SELECT cp.* FROM chat_participants cp JOIN chats c ON cp.chat_id = c.id WHERE cp.chat_id =')) {
            const chatId = toInt(params[0]);
            const userId = toInt(params[1]);
            const participants = this.data.chat_participants.filter(cp => cp.chat_id === chatId && cp.user_id === userId);
            return { rows: participants.map(p => ({ ...p })), rowCount: participants.length };
        }

        if (normalized.startsWith('SELECT 1 FROM chat_participants WHERE chat_id =')) {
            const chatId = toInt(params[0]);
            const userId = toInt(params[1]);
            const exists = this.data.chat_participants.some(cp => cp.chat_id === chatId && cp.user_id === userId);
            return { rows: exists ? [{ '?column?': 1 }] : [], rowCount: exists ? 1 : 0 };
        }

        if (normalized.startsWith('SELECT c.id FROM chats c JOIN chat_participants cp1')) {
            const senderId = toInt(params[0]);
            const receiverId = toInt(params[1]);
            const chat = this.data.chats.find(c => c.type === 'direct' && this.isParticipant(c.id, senderId) && this.isParticipant(c.id, receiverId));
            return { rows: chat ? [{ id: chat.id }] : [], rowCount: chat ? 1 : 0 };
        }

        if (normalized.startsWith('INSERT INTO users')) {
            return this.handleInsert('users', normalized, params);
        }

        if (normalized.startsWith('INSERT INTO chats')) {
            return this.handleInsert('chats', normalized, params);
        }

        if (normalized.startsWith('INSERT INTO chat_participants (chat_id, user_id) SELECT')) {
            return this.handleInsertChatParticipantsSelect(normalized, params);
        }

        if (normalized.startsWith('INSERT INTO chat_participants')) {
            return this.handleInsert('chat_participants', normalized, params);
        }

        if (normalized.startsWith('INSERT INTO messages')) {
            return this.handleInsert('messages', normalized, params);
        }

        if (normalized.startsWith('INSERT INTO files')) {
            return this.handleInsert('files', normalized, params);
        }

        if (normalized.startsWith('UPDATE users SET')) {
            return this.handleUpdateUsers(normalized, params);
        }

        if (normalized.startsWith('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id =')) {
            const chatId = toInt(params[0]);
            const chat = this.data.chats.find(c => c.id === chatId);
            if (chat) {
                chat.updated_at = new Date().toISOString();
            }
            return { rows: [], rowCount: chat ? 1 : 0 };
        }

        if (normalized.startsWith('UPDATE messages SET content =')) {
            return this.handleUpdateMessageContent(params);
        }

        if (normalized.startsWith('UPDATE messages SET created_at =')) {
            const timestamp = params[0];
            const messageId = toInt(params[1]);
            const message = this.data.messages.find(m => m.id === messageId);
            if (message) {
                message.created_at = timestamp;
            }
            return { rows: [], rowCount: message ? 1 : 0 };
        }

        if (normalized.startsWith('UPDATE files SET message_id =')) {
            const messageId = toInt(params[0]);
            const fileId = toInt(params[1]);
            const file = this.data.files.find(f => f.id === fileId);
            if (file) {
                file.message_id = messageId;
            }
            return { rows: [], rowCount: file ? 1 : 0 };
        }

        if (normalized.startsWith('DELETE FROM users WHERE id =')) {
            const userId = toInt(params[0]);
            const initialLength = this.data.users.length;
            this.data.users = this.data.users.filter(u => u.id !== userId);
            this.data.chat_participants = this.data.chat_participants.filter(cp => cp.user_id !== userId);
            this.data.messages = this.data.messages.filter(m => m.user_id !== userId);
            return { rows: [], rowCount: initialLength !== this.data.users.length ? 1 : 0 };
        }

        if (normalized.startsWith('SELECT m.id, m.content, m.created_at, m.updated_at')) {
            const chatId = toInt(params[0]);
            const messages = this.data.messages
                .filter(m => m.chat_id === chatId)
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            const result = messages.map(m => ({
                id: m.id,
                content: m.content,
                created_at: m.created_at,
                updated_at: m.updated_at,
                is_edited: Boolean(m.is_edited),
                reply_to_id: m.reply_to_id || null,
                forwarded_from_id: m.forwarded_from_id || null,
                user_id: m.user_id,
                user_name: this.userName(m.user_id),
                username: this.userUsername(m.user_id),
                file: m.file_id ? this.buildFilePayload(m.file_id) : null,
                reply_to: null,
                forwarded_from: null,
                reactions: null,
                mentions: null
            }));
            return { rows: result.reverse(), rowCount: result.length };
        }

        if (normalized.startsWith('SELECT id, user_id, chat_id, created_at, is_deleted FROM messages WHERE id =')) {
            const messageId = toInt(params[0]);
            const message = this.data.messages.find(m => m.id === messageId);
            if (!message) {
                return { rows: [], rowCount: 0 };
            }

            return {
                rows: [{
                    id: message.id,
                    user_id: message.user_id,
                    chat_id: message.chat_id,
                    created_at: message.created_at,
                    is_deleted: Boolean(message.is_deleted)
                }],
                rowCount: 1
            };
        }

        if (normalized.startsWith('SELECT m.id, m.chat_id, m.content, m.created_at, m.updated_at, m.is_edited')) {
            const messageId = toInt(params[0]);
            const message = this.data.messages.find(m => m.id === messageId);
            if (!message) {
                return { rows: [], rowCount: 0 };
            }

            const result = {
                id: message.id,
                chat_id: message.chat_id,
                content: message.content,
                created_at: message.created_at,
                updated_at: message.updated_at,
                is_edited: Boolean(message.is_edited),
                user_id: message.user_id,
                user_name: this.userName(message.user_id),
                username: this.userUsername(message.user_id),
                file: message.file_id ? this.buildFilePayload(message.file_id) : null,
                reply_to: null,
                forwarded_from: null,
                reactions: null,
                mentions: null
            };

            return { rows: [result], rowCount: 1 };
        }

        if (normalized.startsWith('SELECT m.id, m.content, m.created_at, m.user_id')) {
            const messageId = toInt(params[0]);
            const message = this.data.messages.find(m => m.id === messageId);
            if (!message) {
                return { rows: [], rowCount: 0 };
            }
            const result = {
                id: message.id,
                content: message.content,
                created_at: message.created_at,
                updated_at: message.updated_at,
                is_edited: Boolean(message.is_edited),
                user_id: message.user_id,
                user_name: this.userName(message.user_id),
                username: this.userUsername(message.user_id),
                file: message.file_id ? this.buildFilePayload(message.file_id) : null,
                reply_to: null,
                mentions: null
            };
            return { rows: [result], rowCount: 1 };
        }

        if (normalized.startsWith('SELECT json_build_object(') && normalized.includes('FROM messages m') && normalized.includes('WHERE m.chat_id = $1')) {
            const chatId = toInt(params[0]);
            const messages = this.data.messages.filter(m => m.chat_id === chatId);
            const result = messages.map(m => ({
                id: m.id,
                content: m.content,
                created_at: m.created_at,
                updated_at: m.updated_at,
                is_edited: Boolean(m.is_edited),
                reply_to_id: m.reply_to_id || null,
                forwarded_from_id: m.forwarded_from_id || null,
                user_id: m.user_id,
                user_name: this.userName(m.user_id),
                username: this.userUsername(m.user_id),
                file: m.file_id ? this.buildFilePayload(m.file_id) : null,
                reply_to: null,
                forwarded_from: null,
                reactions: null,
                mentions: null
            }));
            return { rows: result.reverse(), rowCount: result.length };
        }

        if (normalized.startsWith('SELECT can_send_direct_message')) {
            return { rows: [{ can_send: true }], rowCount: 1 };
        }

        if (normalized.startsWith('SELECT')) {
            console.warn('⚠️ Необработанный SELECT, возвращается пустой результат:', normalized);
            return { rows: [], rowCount: 0 };
        }

        console.warn('⚠️ Необработанный SQL запрос:', normalized);
        return { rows: [], rowCount: 0 };
    }

    handleInsert(table, normalized, params) {
        const insertMatch = normalized.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES (.+?)( RETURNING (.+))?$/i);
        if (!insertMatch) {
            console.warn('⚠️ Не удалось распарсить INSERT:', normalized);
            return { rows: [], rowCount: 0 };
        }

        const columns = insertMatch[2].split(',').map(c => c.trim());
        const valuesPart = insertMatch[3];
        const returning = insertMatch[5] ? insertMatch[5].split(',').map(c => c.trim()) : [];
        const returnAllColumns = returning.includes('*');

        const rowsToInsert = [];

        const rowMatches = valuesPart.match(/\(([^)]+)\)/g) || [];

        const resolveTokenValue = (token) => {
            const trimmed = token.trim();

            if (/^\$\d+$/.test(trimmed)) {
                const paramPosition = Number(trimmed.slice(1)) - 1;
                return params[paramPosition];
            }

            if (/^'.*'$/.test(trimmed)) {
                return trimmed.slice(1, -1);
            }

            if (trimmed.toUpperCase() === 'NULL') {
                return null;
            }

            if (/^\d+$/.test(trimmed)) {
                return Number(trimmed);
            }

            return trimmed;
        };

        rowMatches.forEach((rowExpression) => {
            const withoutParens = rowExpression.replace(/[()]/g, '');
            const valueTokens = withoutParens.split(',');

            if (valueTokens.length !== columns.length) {
                console.warn('⚠️ Количество значений не совпадает с количеством колонок для INSERT:', normalized);
                return;
            }

            const row = {};
            valueTokens.forEach((token, index) => {
                const column = columns[index];
                row[column] = resolveTokenValue(token);
            });

            rowsToInsert.push(row);
        });

        const insertedRows = [];

        rowsToInsert.forEach(row => {
            const entity = { ...row };
            if (table === 'users') {
                entity.id = this.nextId('users');
                entity.is_active = row.is_active !== false;
                entity.created_at = entity.updated_at = new Date().toISOString();
                this.data.users.push(entity);
            } else if (table === 'chats') {
                entity.id = this.nextId('chats');
                entity.name = entity.name === 'null' || entity.name === null ? null : entity.name;
                entity.created_at = entity.updated_at = new Date().toISOString();
                this.data.chats.push(entity);
            } else if (table === 'chat_participants') {
                entity.chat_id = Number(entity.chat_id);
                entity.user_id = Number(entity.user_id);
                this.data.chat_participants.push({ ...entity });
            } else if (table === 'messages') {
                entity.id = this.nextId('messages');
                entity.chat_id = Number(entity.chat_id);
                entity.user_id = Number(entity.user_id);
                entity.file_id = entity.file_id === undefined || entity.file_id === null
                    ? null
                    : Number(entity.file_id);
                const timestamp = new Date().toISOString();
                entity.created_at = timestamp;
                entity.updated_at = timestamp;
                entity.is_edited = Boolean(entity.is_edited);
                entity.is_deleted = Boolean(entity.is_deleted);
                this.data.messages.push(entity);
            } else if (table === 'files') {
                entity.id = this.nextId('files');
                entity.size_bytes = entity.size_bytes === undefined ? null : Number(entity.size_bytes);
                entity.uploaded_by = Number(entity.uploaded_by);
                entity.message_id = entity.message_id === undefined ? null : entity.message_id;
                entity.created_at = entity.created_at || new Date().toISOString();
                this.data.files.push(entity);
            } else if (table === 'admin_logs') {
                entity.id = this.nextId('admin_logs');
                this.data.admin_logs.push(entity);
            }

            if (returnAllColumns) {
                insertedRows.push({ ...entity });
            } else if (returning.length > 0) {
                const returnedRow = {};
                returning.forEach(column => {
                    returnedRow[column] = entity[column];
                });
                insertedRows.push(returnedRow);
            }
        });

        return {
            rows: returning.length > 0 ? insertedRows : [],
            rowCount: rowsToInsert.length
        };
    }

    handleUpdateUsers(normalized, params) {
        const userId = Number(params[params.length - 1]);
        const user = this.data.users.find(u => u.id === userId);

        if (!user) {
            return { rows: [], rowCount: 0 };
        }

        const setSegment = normalized.split('SET ')[1].split(' WHERE ')[0];
        const assignments = setSegment.split(',').map(part => part.trim());
        let paramIndex = 0;

        assignments.forEach((assignment) => {
            const [column] = assignment.split('=').map(part => part.trim());
            const value = params[paramIndex++];

            switch (column) {
                case 'username':
                    user.username = value;
                    break;
                case 'role':
                    user.role = value;
                    break;
                case 'department':
                    user.department = value === null || value === undefined ? null : value;
                    break;
                case 'name':
                    user.name = value;
                    break;
                case 'is_active':
                    user.is_active = value === false ? false : Boolean(value);
                    break;
                default:
                    break;
            }
        });

        user.updated_at = new Date().toISOString();

        const row = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            department: user.department || null,
            initial_password: user.initial_password || null,
            is_active: user.is_active !== false
        };

        return { rows: [row], rowCount: 1 };
    }

    handleUpdateMessageContent(params) {
        const content = params[0];
        const messageId = Number(params[1]);
        const message = this.data.messages.find(m => m.id === messageId);

        if (!message) {
            return { rows: [], rowCount: 0 };
        }

        message.content = content;
        message.is_edited = true;
        message.updated_at = new Date().toISOString();

        return { rows: [], rowCount: 1 };
    }

    handleInsertChatParticipantsSelect(normalized, params) {
        const insertedRows = [];

        if (normalized.includes('FROM chats c')) {
            const namesMatch = normalized.match(/WHERE c\.name IN \(([^)]+)\)/i);
            let targetNames = [];

            if (namesMatch) {
                targetNames = namesMatch[1]
                    .split(',')
                    .map(name => name.trim().replace(/^'|'$/g, ''))
                    .filter(Boolean);
            } else {
                const singleMatch = normalized.match(/WHERE c\.name = '([^']+)'/i);
                if (singleMatch) {
                    targetNames = [singleMatch[1]];
                }
            }

            const userId = Number(params[0]);
            targetNames.forEach(name => {
                const chat = this.data.chats.find(c => c.name === name);
                if (chat && !this.data.chat_participants.some(cp => cp.chat_id === chat.id && cp.user_id === userId)) {
                    this.data.chat_participants.push({ chat_id: chat.id, user_id: userId });
                    insertedRows.push({ chat_id: chat.id, user_id: userId });
                }
            });

            return { rows: insertedRows, rowCount: insertedRows.length };
        }

        const chatId = Number(params[0]);
        const userId = Number(params[1]);
        const exists = this.data.chat_participants.some(cp => cp.chat_id === chatId && cp.user_id === userId);

        if (!exists) {
            this.data.chat_participants.push({ chat_id: chatId, user_id: userId });
            return { rows: [], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
    }

    buildFilePayload(fileId) {
        const file = this.data.files.find(f => f.id === Number(fileId));
        if (!file) {
            return null;
        }
        const size = file.size_bytes !== undefined ? file.size_bytes : file.size;
        return {
            id: file.id,
            filename: file.original_filename || file.filename,
            size: size !== undefined ? size : null,
            mimeType: file.mime_type || null,
            type: file.mime_type || null,
            url: `/api/files/${file.id}`,
            thumbnailUrl: file.thumbnail_path ? `/api/files/${file.id}/thumbnail` : null,
            width: file.width || null,
            height: file.height || null
        };
    }

    isParticipant(chatId, userId) {
        return this.data.chat_participants.some(cp => cp.chat_id === chatId && cp.user_id === userId);
    }

    userName(userId) {
        const user = this.data.users.find(u => u.id === userId);
        return user ? user.name : null;
    }

    userUsername(userId) {
        const user = this.data.users.find(u => u.id === userId);
        return user ? user.username : null;
    }
}

const dbInstance = new InMemoryDatabase();

const pool = {
    async connect() {
        return {
            query: (text, params) => dbInstance.query(text, params),
            release() { /* noop */ }
        };
    },
    async end() { /* noop */ }
};

module.exports = {
    query: (text, params) => dbInstance.query(text, params),
    pool,
    __memoryDb: dbInstance
};
