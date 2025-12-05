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
            admin_logs: [],
            message_deletion_history: [],
            calls: [],
            call_participants: [],
            call_events: []
        };
        this.sequences = {
            users: 1,
            chats: 1,
            messages: 1,
            files: 1,
            reactions: 1,
            mentions: 1,
            admin_logs: 1,
            message_deletion_history: 1,
            calls: 1,
            call_participants: 1,
            call_events: 1
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
        const normalizeDepartment = (value) => {
            if (!value) {
                return null;
            }
            const trimmed = String(value).trim();
            return trimmed.length ? trimmed : null;
        };

        if (!normalized) {
            return { rows: [], rowCount: 0 };
        }

        if (normalized === 'SELECT 1') {
            return { rows: [{ '?column?': 1 }], rowCount: 1 };
        }

        if (normalized.startsWith("SELECT to_regclass('public.message_deletion_history')")) {
            const tableName = Array.isArray(this.data.message_deletion_history)
                ? 'message_deletion_history'
                : null;

            return {
                rows: [{ table_name: tableName }],
                rowCount: 1
            };
        }

        if (normalized.startsWith("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'message_deletion_history'")) {
            const columns = [
                'id',
                'message_id',
                'chat_id',
                'chat_name',
                'chat_type',
                'chat_department',
                'deleted_message_user_id',
                'deleted_message_user_name',
                'deleted_by_user_id',
                'deleted_by_user_name',
                'deleted_by_role',
                'deletion_scope',
                'original_content',
                'file_id',
                'deleted_message_created_at',
                'deleted_at'
            ];

            return {
                rows: columns.map((name) => ({ column_name: name })),
                rowCount: columns.length
            };
        }

        if (normalized.startsWith("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chats'")) {
            const columns = ['id', 'name', 'type', 'department', 'created_by', 'is_archived', 'created_at', 'updated_at'];
            return {
                rows: columns.map((name) => ({ column_name: name })),
                rowCount: columns.length
            };
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

        if (normalized.startsWith('SELECT department, type FROM chats WHERE id =')) {
            const chatId = toInt(params[0]);
            const chat = this.data.chats.find(c => c.id === chatId);
            return {
                rows: chat ? [{ department: chat.department || null, type: chat.type || null }] : [],
                rowCount: chat ? 1 : 0
            };
        }

        if (normalized.startsWith('SELECT id, type, department, name FROM chats WHERE id =')) {
            const chatId = toInt(params[0]);
            const chat = this.data.chats.find(c => c.id === chatId);
            return {
                rows: chat ? [{
                    id: chat.id,
                    type: chat.type || 'group',
                    department: chat.department || null,
                    name: chat.name || null
                }] : [],
                rowCount: chat ? 1 : 0
            };
        }

        if (normalized.startsWith("SELECT id FROM chats WHERE type = 'department' AND department =")) {
            const department = params[0];
            const chat = this.data.chats.find(c => c.type === 'department' && c.department === department);
            return { rows: chat ? [{ id: chat.id }] : [], rowCount: chat ? 1 : 0 };
        }

        if (normalized.startsWith('SELECT COUNT(*)::int AS count FROM chats')) {
            return { rows: [{ count: this.data.chats.length }], rowCount: 1 };
        }

        if (normalized.startsWith('SELECT COUNT(DISTINCT chat_id)::int AS count FROM chat_participants WHERE user_id =')) {
            const userId = toInt(params[0]);
            const count = new Set(this.data.chat_participants.filter(cp => cp.user_id === userId).map(cp => cp.chat_id)).size;
            return { rows: [{ count }], rowCount: 1 };
        }

        if (normalized.startsWith("SELECT id FROM chats WHERE department = '")) {
            const match = normalized.match(/SELECT id FROM chats WHERE department = '([^']+)'(?: LIMIT 1)?/i);
            const department = match ? match[1] : null;
            const chat = department ? this.data.chats.find(c => c.department === department) : null;
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

        if (normalized.startsWith('SELECT role FROM users WHERE id =') || normalized.startsWith('SELECT role FROM users WHERE id=$')) {
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

        if (normalized.startsWith('SELECT id, username, name, role, department, is_active FROM users WHERE department IS NOT NULL')) {
            const rows = this.data.users
                .filter(u => normalizeDepartment(u.department))
                .map(u => ({
                    id: u.id,
                    username: u.username,
                    name: u.name,
                    role: u.role,
                    department: u.department,
                    is_active: u.is_active !== false
                }));

            return {
                rows,
                rowCount: rows.length
            };
        }

        if (normalized.startsWith('SELECT id, username, name, role, department, is_active, last_seen FROM users')) {
            const rows = this.data.users.map(u => ({
                id: u.id,
                username: u.username,
                name: u.name,
                role: u.role,
                department: u.department,
                is_active: u.is_active !== false,
                last_seen: u.last_seen || null
            }));

            return {
                rows,
                rowCount: rows.length
            };
        }

        if (normalized.startsWith('SELECT u.id, u.name, u.username, u.role AS user_role, u.department FROM chat_participants cp JOIN users u ON cp.user_id = u.id WHERE cp.chat_id =')) {
            const chatId = toInt(params[0]);
            const participants = this.data.chat_participants
                .filter(cp => cp.chat_id === chatId)
                .map(cp => {
                    const user = this.data.users.find(u => u.id === cp.user_id);
                    return user ? {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        user_role: user.role,
                        department: user.department
                    } : null;
                })
                .filter(Boolean)
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            return {
                rows: participants,
                rowCount: participants.length
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

        if (normalized.startsWith('SELECT c.id, c.name, c.type, c.department, cp.last_read_at, c.updated_at')) {
            return this.handleGetUserChats(normalized, params);
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

        if (normalized.startsWith('INSERT INTO message_deletion_history')) {
            return this.handleInsert('message_deletion_history', normalized, params);
        }

        if (normalized.startsWith('INSERT INTO calls')) {
            return this.handleInsert('calls', normalized, params);
        }

        if (normalized.startsWith('INSERT INTO call_participants')) {
            return this.handleInsert('call_participants', normalized, params);
        }

        if (normalized.startsWith('INSERT INTO call_events')) {
            return this.handleInsert('call_events', normalized, params);
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

        if (normalized.startsWith('DELETE FROM messages WHERE id =')) {
            const messageId = toInt(params[0]);
            const initialLength = this.data.messages.length;
            this.data.messages = this.data.messages.filter(m => m.id !== messageId);
            return { rows: [], rowCount: initialLength !== this.data.messages.length ? 1 : 0 };
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

        if (normalized.startsWith("SELECT m.user_id, m.file_id, m.chat_id, m.created_at, c.type AS chat_type, c.department AS chat_department FROM messages m JOIN chats c ON m.chat_id = c.id WHERE m.id =")) {
            const messageId = toInt(params[0]);
            const message = this.data.messages.find(m => m.id === messageId);
            if (!message) {
                return { rows: [], rowCount: 0 };
            }

            const chat = this.data.chats.find(c => c.id === message.chat_id) || {};
            return {
                rows: [{
                    user_id: message.user_id,
                    file_id: message.file_id || null,
                    chat_id: message.chat_id,
                    created_at: message.created_at || null,
                    chat_type: chat.type || null,
                    chat_department: chat.department || null
                }],
                rowCount: 1
            };
        }

        if (normalized.startsWith("SELECT m.id, m.user_id FROM messages m JOIN chats c ON m.chat_id = c.id WHERE c.type = 'department' AND c.department = $1 AND m.user_id <> $2 ORDER BY m.id LIMIT 1")) {
            const department = params[0];
            const excludeUserId = toInt(params[1]);
            const matches = this.data.messages
                .filter(m => {
                    const chat = this.data.chats.find(c => c.id === m.chat_id);
                    return chat && chat.type === 'department' && chat.department === department && m.user_id !== excludeUserId;
                })
                .sort((a, b) => a.id - b.id);

            if (!matches.length) {
                return { rows: [], rowCount: 0 };
            }

            const message = matches[0];
            return {
                rows: [{ id: message.id, user_id: message.user_id }],
                rowCount: 1
            };
        }

        if (normalized.startsWith("SELECT c.id FROM chats c JOIN chat_participants cp ON cp.chat_id = c.id WHERE cp.user_id = $1 AND c.type = 'department' LIMIT 1")) {
            const userId = toInt(params[0]);
            const participant = this.data.chat_participants.find(cp => cp.user_id === userId);
            if (!participant) {
                return { rows: [], rowCount: 0 };
            }

            const chat = this.data.chats.find(c => c.id === participant.chat_id && c.type === 'department');
            return {
                rows: chat ? [{ id: chat.id }] : [],
                rowCount: chat ? 1 : 0
            };
        }

        if (normalized.startsWith("SELECT m.id FROM messages m JOIN chats c ON m.chat_id = c.id WHERE c.type = 'department' AND c.department <> $1 ORDER BY m.id LIMIT 1")) {
            const department = params[0];
            const matches = this.data.messages
                .filter(m => {
                    const chat = this.data.chats.find(c => c.id === m.chat_id);
                    return chat && chat.type === 'department' && chat.department !== department;
                })
                .sort((a, b) => a.id - b.id);

            if (!matches.length) {
                return { rows: [], rowCount: 0 };
            }

            return { rows: [{ id: matches[0].id }], rowCount: 1 };
        }

        if (normalized.startsWith('SELECT user_id, chat_id, created_at FROM messages WHERE id =')) {
            const messageId = toInt(params[0]);
            const message = this.data.messages.find(m => m.id === messageId);

            if (!message) {
                return { rows: [], rowCount: 0 };
            }

            return {
                rows: [{
                    user_id: message.user_id,
                    chat_id: message.chat_id,
                    created_at: message.created_at
                }],
                rowCount: 1
            };
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

        if (normalized.startsWith('SELECT id FROM messages WHERE id =')) {
            const messageId = toInt(params[0]);
            const message = this.data.messages.find(m => m.id === messageId);
            return { rows: message ? [{ id: message.id }] : [], rowCount: message ? 1 : 0 };
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

        if (normalized.startsWith('SELECT h.id, h.message_id') && normalized.includes('FROM message_deletion_history')) {
            let paramIndex = 0;
            let filterChatId = null;
            let filterDepartment = null;

            if (normalized.includes('WHERE h.chat_id =')) {
                filterChatId = Number(params[paramIndex++]);
            }

            if (normalized.includes('COALESCE(c.department, h.chat_department) =')) {
                filterDepartment = params[paramIndex++];
            }

            const limit = Number(params[paramIndex++]) || 50;
            const offset = Number(params[paramIndex++]) || 0;

            const sortedHistory = [...this.data.message_deletion_history]
                .sort((a, b) => new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0));

            let filtered = sortedHistory;

            if (filterChatId) {
                filtered = filtered.filter(entry => entry.chat_id === filterChatId);
            }

            if (filterDepartment !== null && filterDepartment !== undefined) {
                filtered = filtered.filter(entry => {
                    const chat = this.data.chats.find(c => c.id === entry.chat_id);
                    const department = (chat && (chat.department || null)) ?? (entry.chat_department || null);
                    return department === filterDepartment;
                });
            }

            const sliced = filtered.slice(offset, offset + limit).map(entry => {
                const chat = this.data.chats.find(c => c.id === entry.chat_id) || null;
                return {
                    id: entry.id,
                    message_id: entry.message_id,
                    chat_id: entry.chat_id,
                    stored_deleted_message_user_id: entry.deleted_message_user_id ?? null,
                    stored_deleted_message_user_name: entry.deleted_message_user_name || null,
                    deleted_by_user_id: entry.deleted_by_user_id,
                    deleted_by_user_name: entry.deleted_by_user_name,
                    deleted_by_role: entry.deleted_by_role,
                    deletion_scope: entry.deletion_scope,
                    stored_original_content: entry.original_content || null,
                    stored_file_id: entry.file_id ?? null,
                    stored_deleted_message_created_at: entry.deleted_message_created_at || null,
                    stored_chat_name: entry.chat_name || null,
                    stored_chat_type: entry.chat_type || null,
                    stored_chat_department: entry.chat_department || null,
                    deleted_at: entry.deleted_at,
                    chat_name_current: chat ? (chat.name || null) : null,
                    chat_type_current: chat ? (chat.type || null) : null,
                    chat_department_current: chat ? (chat.department || null) : null
                };
            });

            return { rows: sliced, rowCount: sliced.length };
        }

        if (normalized.startsWith('SELECT m.user_id, m.file_id, m.chat_id, m.content, m.created_at, c.name AS chat_name')) {
            const messageId = toInt(params[0]);
            const message = this.data.messages.find(m => m.id === messageId);
            if (!message) {
                return { rows: [], rowCount: 0 };
            }

            const chat = this.data.chats.find(c => c.id === message.chat_id) || {};
            const user = this.data.users.find(u => u.id === message.user_id) || {};

            return {
                rows: [{
                    user_id: message.user_id,
                    file_id: message.file_id || null,
                    chat_id: message.chat_id,
                    content: message.content || null,
                    created_at: message.created_at || new Date().toISOString(),
                    chat_name: chat.name || null,
                    chat_type: chat.type || null,
                    chat_department: chat.department || null,
                    author_name: user.name || null
                }],
                rowCount: 1
            };
        }

        if (normalized.startsWith('SELECT chat_id FROM messages WHERE id =')) {
            const messageId = toInt(params[0]);
            const message = this.data.messages.find(m => m.id === messageId);
            return {
                rows: message ? [{ chat_id: message.chat_id }] : [],
                rowCount: message ? 1 : 0
            };
        }

        if (normalized.startsWith('SELECT can_send_direct_message')) {
            return { rows: [{ can_send: true }], rowCount: 1 };
        }

        // ============================================================
        // CALLS SYSTEM QUERIES
        // ============================================================

        // SELECT id, name FROM users WHERE username = $1
        if (normalized.startsWith('SELECT id, name FROM users WHERE username =')) {
            const username = params[0];
            const user = this.data.users.find(u => u.username === username);
            return {
                rows: user ? [{ id: user.id, name: user.name }] : [],
                rowCount: user ? 1 : 0
            };
        }

        // SELECT name FROM users WHERE id = $1
        if (normalized.startsWith('SELECT name FROM users WHERE id =')) {
            const userId = toInt(params[0]);
            const user = this.data.users.find(u => u.id === userId);
            return {
                rows: user ? [{ name: user.name }] : [],
                rowCount: user ? 1 : 0
            };
        }

        // SELECT * FROM calls WHERE chat_id = $1 AND status = 'ringing'
        if (normalized.includes("SELECT * FROM calls WHERE chat_id =") && normalized.includes("AND status = 'ringing'")) {
            const chatId = toInt(params[0]);
            const calls = this.data.calls.filter(c =>
                c.chat_id === chatId && c.status === 'ringing'
            );
            return {
                rows: calls,
                rowCount: calls.length
            };
        }

        // SELECT * FROM calls WHERE chat_id = $1 AND status IN ('ringing', 'ongoing')
        if (normalized.includes("SELECT id FROM calls WHERE chat_id =") && normalized.includes("AND status IN ('ringing', 'ongoing')")) {
            const chatId = toInt(params[0]);
            const calls = this.data.calls.filter(c =>
                c.chat_id === chatId && (c.status === 'ringing' || c.status === 'ongoing')
            );
            return {
                rows: calls.map(c => ({ id: c.id })),
                rowCount: calls.length
            };
        }

        // SELECT * FROM calls WHERE id = $1
        if (normalized.startsWith('SELECT * FROM calls WHERE id =')) {
            const callId = toInt(params[0]);
            const call = this.data.calls.find(c => c.id === callId);
            return {
                rows: call ? [call] : [],
                rowCount: call ? 1 : 0
            };
        }

        // SELECT status, started_at FROM calls WHERE id = $1
        if (normalized.startsWith('SELECT status, started_at FROM calls WHERE id =')) {
            const callId = toInt(params[0]);
            const call = this.data.calls.find(c => c.id === callId);
            return {
                rows: call ? [{ status: call.status, started_at: call.started_at }] : [],
                rowCount: call ? 1 : 0
            };
        }

        // SELECT status FROM calls WHERE id = $1
        if (normalized.startsWith('SELECT status FROM calls WHERE id =')) {
            const callId = toInt(params[0]);
            const call = this.data.calls.find(c => c.id === callId);
            return {
                rows: call ? [{ status: call.status }] : [],
                rowCount: call ? 1 : 0
            };
        }

        // SELECT EXTRACT(EPOCH FROM (ended_at - started_at)) as duration FROM calls WHERE id = $1
        if (normalized.includes('EXTRACT(EPOCH FROM (ended_at - started_at)) as duration')) {
            const callId = toInt(params[0]);
            const call = this.data.calls.find(c => c.id === callId);
            if (!call || !call.started_at || !call.ended_at) {
                return { rows: [{ duration: 0 }], rowCount: 1 };
            }
            const duration = (new Date(call.ended_at) - new Date(call.started_at)) / 1000;
            return {
                rows: [{ duration }],
                rowCount: 1
            };
        }

        // SELECT * FROM call_participants WHERE call_id = $1 AND user_id = $2
        if (normalized.startsWith('SELECT * FROM call_participants WHERE call_id =')) {
            const callId = toInt(params[0]);
            const userId = toInt(params[1]);
            const participant = this.data.call_participants.find(
                p => p.call_id === callId && p.user_id === userId
            );
            return {
                rows: participant ? [participant] : [],
                rowCount: participant ? 1 : 0
            };
        }

        // SELECT * FROM call_events WHERE call_id = $1 AND event_type = $2
        if (normalized.startsWith('SELECT * FROM call_events WHERE call_id =') && normalized.includes('AND event_type =')) {
            const callId = toInt(params[0]);
            const eventType = params[1];
            const events = this.data.call_events.filter(
                e => e.call_id === callId && e.event_type === eventType
            );
            return {
                rows: events,
                rowCount: events.length
            };
        }

        // SELECT metadata FROM call_events WHERE call_id = $1 AND event_type = $2
        if (normalized.startsWith('SELECT metadata FROM call_events WHERE call_id =')) {
            const callId = toInt(params[0]);
            const eventType = params[1];
            const events = this.data.call_events.filter(
                e => e.call_id === callId && e.event_type === eventType
            );
            return {
                rows: events.map(e => ({ metadata: e.metadata })),
                rowCount: events.length
            };
        }

        // SELECT event_type, COUNT(*) as count FROM call_events GROUP BY event_type
        if (normalized.includes('SELECT event_type, COUNT(*) as count FROM call_events GROUP BY event_type')) {
            const eventCounts = {};
            this.data.call_events.forEach(e => {
                eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
            });
            const rows = Object.entries(eventCounts).map(([event_type, count]) => ({
                event_type,
                count: String(count)
            }));
            return {
                rows,
                rowCount: rows.length
            };
        }

        // SELECT COUNT(*) FROM calls
        if (normalized === 'SELECT COUNT(*) FROM calls') {
            return {
                rows: [{ count: String(this.data.calls.length) }],
                rowCount: 1
            };
        }

        // SELECT COUNT(*) FROM call_participants
        if (normalized === 'SELECT COUNT(*) FROM call_participants') {
            return {
                rows: [{ count: String(this.data.call_participants.length) }],
                rowCount: 1
            };
        }

        // SELECT COUNT(*) FROM call_events
        if (normalized === 'SELECT COUNT(*) FROM call_events') {
            return {
                rows: [{ count: String(this.data.call_events.length) }],
                rowCount: 1
            };
        }

        // Check orphan events
        if (normalized.includes('SELECT COUNT(*) FROM call_events ce LEFT JOIN calls c ON c.id = ce.call_id WHERE c.id IS NULL')) {
            const orphans = this.data.call_events.filter(e => {
                return !this.data.calls.some(c => c.id === e.call_id);
            });
            return {
                rows: [{ count: String(orphans.length) }],
                rowCount: 1
            };
        }

        // Check orphan participants
        if (normalized.includes('SELECT COUNT(*) FROM call_participants cp LEFT JOIN calls c ON c.id = cp.call_id WHERE c.id IS NULL')) {
            const orphans = this.data.call_participants.filter(p => {
                return !this.data.calls.some(c => c.id === p.call_id);
            });
            return {
                rows: [{ count: String(orphans.length) }],
                rowCount: 1
            };
        }

        // UPDATE calls SET status = $1 WHERE id = $2
        if (normalized.startsWith('UPDATE calls SET status =') && !normalized.includes('started_at')) {
            const status = params[0];
            const callId = toInt(params[1]);
            const call = this.data.calls.find(c => c.id === callId);
            if (call) {
                call.status = status;
            }
            return { rows: [], rowCount: call ? 1 : 0 };
        }

        // UPDATE calls SET status = $1, started_at = NOW() WHERE id = $2
        if (normalized.startsWith('UPDATE calls SET status =') && normalized.includes('started_at')) {
            const status = params[0];
            const callId = toInt(params[1]);
            const call = this.data.calls.find(c => c.id === callId);
            if (call) {
                call.status = status;
                call.started_at = new Date().toISOString();
            }
            return { rows: [], rowCount: call ? 1 : 0 };
        }

        // UPDATE calls SET status = $1, ended_at = NOW() WHERE id = $2
        if (normalized.startsWith('UPDATE calls SET status =') && normalized.includes('ended_at')) {
            const status = params[0];
            const callId = toInt(params[1]);
            const call = this.data.calls.find(c => c.id === callId);
            if (call) {
                call.status = status;
                call.ended_at = new Date().toISOString();
            }
            return { rows: [], rowCount: call ? 1 : 0 };
        }

        // SELECT u.id, u.name FROM chat_participants cp JOIN users u ON u.id = cp.user_id WHERE cp.chat_id = $1 AND u.id != $2
        if (normalized.includes('SELECT u.id, u.name FROM chat_participants cp JOIN users u ON u.id = cp.user_id WHERE cp.chat_id =') && normalized.includes('AND u.id !=')) {
            const chatId = toInt(params[0]);
            const excludeUserId = toInt(params[1]);
            const participants = this.data.chat_participants
                .filter(cp => cp.chat_id === chatId)
                .map(cp => {
                    const user = this.data.users.find(u => u.id === cp.user_id && u.id !== excludeUserId);
                    return user ? { id: user.id, name: user.name } : null;
                })
                .filter(Boolean);
            return {
                rows: participants,
                rowCount: participants.length
            };
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
            } else if (table === 'message_deletion_history') {
                entity.id = this.nextId('message_deletion_history');
                entity.chat_id = Number(entity.chat_id);
                entity.deleted_by_user_id = Number(entity.deleted_by_user_id);
                if (entity.deleted_message_user_id !== undefined && entity.deleted_message_user_id !== null) {
                    entity.deleted_message_user_id = Number(entity.deleted_message_user_id);
                } else {
                    entity.deleted_message_user_id = null;
                }
                entity.file_id = entity.file_id === undefined || entity.file_id === null
                    ? null
                    : Number(entity.file_id);
                entity.deleted_message_created_at = entity.deleted_message_created_at || null;
                entity.deleted_at = entity.deleted_at || new Date().toISOString();
                this.data.message_deletion_history.push(entity);
            } else if (table === 'calls') {
                entity.id = this.nextId('calls');
                entity.chat_id = Number(entity.chat_id);
                entity.initiated_by = Number(entity.initiated_by);
                entity.created_at = entity.created_at || new Date().toISOString();
                entity.started_at = entity.started_at || null;
                entity.ended_at = entity.ended_at || null;
                this.data.calls.push(entity);
            } else if (table === 'call_participants') {
                entity.call_id = Number(entity.call_id);
                entity.user_id = Number(entity.user_id);
                entity.joined_at = entity.joined_at || new Date().toISOString();
                entity.left_at = entity.left_at || null;
                this.data.call_participants.push(entity);
            } else if (table === 'call_events') {
                entity.id = this.nextId('call_events');
                entity.call_id = Number(entity.call_id);
                entity.user_id = entity.user_id ? Number(entity.user_id) : null;
                entity.created_at = entity.created_at || new Date().toISOString();
                if (typeof entity.metadata === 'string') {
                    try {
                        entity.metadata = JSON.parse(entity.metadata);
                    } catch (e) {
                        entity.metadata = null;
                    }
                }
                this.data.call_events.push(entity);
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

    handleGetUserChats(normalized, params) {
        const userId = Number(params[0]);
        const limit = params[1] !== undefined ? Number(params[1]) : 50;
        const offset = params[2] !== undefined ? Number(params[2]) : 0;
        const restrictedToParticipant = normalized.includes('WHERE cp.user_id = $1');

        const chats = restrictedToParticipant
            ? this.data.chats.filter(chat => this.isParticipant(chat.id, userId))
            : [...this.data.chats];

        const sorted = chats
            .slice()
            .sort((a, b) => {
                const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
                const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
                return dateB - dateA;
            });

        const paginated = sorted.slice(offset, offset + limit);
        const rows = paginated.map(chat => this.buildChatSummary(chat, userId));
        return { rows, rowCount: rows.length };
    }

    buildChatSummary(chat, currentUserId) {
        const participantRecord = this.data.chat_participants.find(cp => cp.chat_id === chat.id && cp.user_id === currentUserId);
        const lastReadAt = participantRecord?.last_read_at || null;

        const chatMessages = this.data.messages
            .filter(message => message.chat_id === chat.id)
            .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

        const lastMessage = chatMessages.length ? chatMessages[chatMessages.length - 1] : null;
        const lastMessageAuthor = lastMessage
            ? this.data.users.find(user => user.id === lastMessage.user_id)
            : null;

        const unreadCount = chatMessages.filter(message => {
            if (message.user_id === currentUserId) {
                return false;
            }

            if (!lastReadAt) {
                return true;
            }

            return new Date(message.created_at || 0).getTime() > new Date(lastReadAt).getTime();
        }).length;

        const participants = this.data.chat_participants
            .filter(cp => cp.chat_id === chat.id && cp.user_id !== currentUserId)
            .map(cp => {
                const user = this.data.users.find(u => u.id === cp.user_id);
                return user ? { id: user.id, name: user.name, role: user.role } : null;
            })
            .filter(Boolean);

        return {
            id: chat.id,
            name: chat.name || null,
            type: chat.type || null,
            department: chat.department || null,
            last_read_at: lastReadAt,
            updated_at: chat.updated_at || chat.created_at || null,
            unread_count: unreadCount,
            last_message: lastMessage
                ? {
                    id: lastMessage.id,
                    content: lastMessage.content || null,
                    created_at: lastMessage.created_at || null,
                    user_id: lastMessage.user_id,
                    username: lastMessageAuthor ? lastMessageAuthor.name : null
                }
                : null,
            participants
        };
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
