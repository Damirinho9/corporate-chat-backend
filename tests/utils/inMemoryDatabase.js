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

        if (normalized.startsWith('SELECT role FROM users WHERE id =')) {
            const id = toInt(params[0]);
            const user = this.data.users.find(u => u.id === id);
            return { rows: user ? [{ role: user.role }] : [], rowCount: user ? 1 : 0 };
        }

        if (normalized.startsWith('SELECT id, username, name FROM users WHERE id =')) {
            const id = toInt(params[0]);
            const user = this.data.users.find(u => u.id === id && u.is_active);
            return { rows: user ? [{ id: user.id, username: user.username, name: user.name }] : [], rowCount: user ? 1 : 0 };
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

        if (normalized.startsWith('INSERT INTO chat_participants')) {
            return this.handleInsert('chat_participants', normalized, params);
        }

        if (normalized.startsWith('INSERT INTO messages')) {
            return this.handleInsert('messages', normalized, params);
        }

        if (normalized.startsWith('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id =')) {
            const chatId = toInt(params[0]);
            const chat = this.data.chats.find(c => c.id === chatId);
            if (chat) {
                chat.updated_at = new Date().toISOString();
            }
            return { rows: [], rowCount: chat ? 1 : 0 };
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
                is_edited: false,
                reply_to_id: m.reply_to_id || null,
                forwarded_from_id: m.forwarded_from_id || null,
                user_id: m.user_id,
                user_name: this.userName(m.user_id),
                username: this.userUsername(m.user_id),
                file: null,
                reply_to: null,
                forwarded_from: null,
                reactions: null,
                mentions: null
            }));
            return { rows: result.reverse(), rowCount: result.length };
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
                user_id: message.user_id,
                user_name: this.userName(message.user_id),
                username: this.userUsername(message.user_id),
                file: null,
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
                is_edited: false,
                reply_to_id: m.reply_to_id || null,
                forwarded_from_id: m.forwarded_from_id || null,
                user_id: m.user_id,
                user_name: this.userName(m.user_id),
                username: this.userUsername(m.user_id),
                file: null,
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
        let paramIndex = 0;
        const rowCount = (valuesPart.match(/\(/g) || []).length;

        for (let i = 0; i < rowCount; i++) {
            const row = {};
            columns.forEach((column) => {
                row[column] = params[paramIndex++];
            });
            rowsToInsert.push(row);
        }

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
                this.data.chat_participants.push({ ...entity });
            } else if (table === 'messages') {
                entity.id = this.nextId('messages');
                const timestamp = new Date().toISOString();
                entity.created_at = timestamp;
                entity.updated_at = timestamp;
                this.data.messages.push(entity);
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
