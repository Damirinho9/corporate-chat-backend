// ==================================================
// BOTS AND INTEGRATIONS UI - JavaScript Module
// ==================================================

// Global state
let currentBots = [];
let currentWebhooks = [];
let selectedBotForWebhook = null;

// ==================================================
// TAB SWITCHING
// ==================================================
function switchBotsTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');

    // Add active class to clicked button
    event.target.classList.add('active');

    // Load data for the tab
    if (tabName === 'bots-list') {
        loadBots();
    } else if (tabName === 'webhooks') {
        loadWebhooks();
    }
}

// ==================================================
// BOTS MANAGEMENT
// ==================================================
async function loadBots() {
    const container = document.getElementById('botsListContainer');
    container.innerHTML = '<p style="text-align: center; color: #a0aec0; padding: 20px;">Loading...</p>';

    try {
        const response = await fetch('/api/bots', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to load bots');

        const data = await response.json();
        currentBots = data.bots || [];

        if (currentBots.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #718096;">
                    <div style="font-size: 48px; margin-bottom: 20px;">🤖</div>
                    <h3>Нет ботов</h3>
                    <p>Создайте первого бота для автоматизации и интеграций</p>
                    <button class="btn btn-primary" onclick="openCreateBotModal()" style="margin-top: 20px;">
                        ➕ Создать бота
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = currentBots.map(bot => `
            <div class="bot-card">
                <div class="bot-card-header">
                    <div class="bot-info">
                        <div class="bot-avatar">🤖</div>
                        <div class="bot-details">
                            <h4>${bot.name}</h4>
                            <p>@${bot.username}</p>
                        </div>
                    </div>
                    <div class="bot-status ${bot.is_active ? 'active' : 'inactive'}">
                        ${bot.is_active ? 'Активен' : 'Неактивен'}
                    </div>
                </div>

                <div class="bot-card-body">
                    <p style="color: #4a5568; margin-bottom: 10px;">${bot.description || 'Описание не указано'}</p>

                    <div class="bot-permissions">
                        <strong style="display: block; margin-bottom: 8px; color: #2d3748;">Права:</strong>
                        ${(bot.permissions || []).map(p => `
                            <span class="permission-badge">${p.permission_type}</span>
                        `).join('') || '<span style="color: #a0aec0;">Нет прав</span>'}
                    </div>
                </div>

                <div class="bot-actions">
                    <button class="btn btn-sm btn-secondary" onclick="manageBotPermissions(${bot.id})">
                        🔐 Права
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="regenerateBotToken(${bot.id})">
                        🔄 Токен
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="toggleBotStatus(${bot.id}, ${!bot.is_active})">
                        ${bot.is_active ? '⏸ Остановить' : '▶ Запустить'}
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBot(${bot.id})">
                        🗑 Удалить
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Load bots error:', error);
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #e53e3e;">
                <p>❌ Ошибка загрузки ботов</p>
                <p style="font-size: 14px; margin-top: 10px;">${error.message}</p>
            </div>
        `;
    }
}

function openCreateBotModal() {
    // Create modal dynamically
    const modal = document.createElement('div');
    modal.id = 'createBotModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>➕ Создать бота</h2>
                <button class="close-btn" onclick="closeCreateBotModal()">×</button>
            </div>
            <form id="createBotForm" onsubmit="event.preventDefault(); createBot();">
                <div class="modal-body">
                    <div class="form-group">
                        <label>Имя бота *</label>
                        <input type="text" id="botName" placeholder="Например: Notification Bot" required>
                    </div>

                    <div class="form-group">
                        <label>Username *</label>
                        <input type="text" id="botUsername" placeholder="Например: notify_bot" required pattern="[a-z0-9_]+">
                        <small class="form-hint">Только строчные буквы, цифры и подчеркивание</small>
                    </div>

                    <div class="form-group">
                        <label>Описание</label>
                        <textarea id="botDescription" placeholder="Краткое описание назначения бота" rows="3"></textarea>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeCreateBotModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Создать бота</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeCreateBotModal() {
    const modal = document.getElementById('createBotModal');
    if (modal) modal.remove();
}

async function createBot() {
    const name = document.getElementById('botName').value;
    const username = document.getElementById('botUsername').value;
    const description = document.getElementById('botDescription').value;

    try {
        const response = await fetch('/api/bots', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, username, description })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create bot');
        }

        const data = await response.json();

        // Show token to user
        alert(`✅ Бот создан успешно!\n\n⚠️ ВАЖНО: Сохраните API токен, он больше не будет показан!\n\nТокен: ${data.bot.api_token}`);

        closeCreateBotModal();
        loadBots();

    } catch (error) {
        alert('❌ Ошибка создания бота: ' + error.message);
    }
}

async function deleteBot(botId) {
    if (!confirm('Вы уверены, что хотите удалить этого бота? Это действие необратимо.')) {
        return;
    }

    try {
        const response = await fetch(`/api/bots/${botId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to delete bot');

        alert('✅ Бот успешно удален');
        loadBots();

    } catch (error) {
        alert('❌ Ошибка удаления бота: ' + error.message);
    }
}

async function toggleBotStatus(botId, newStatus) {
    try {
        const response = await fetch(`/api/bots/${botId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ is_active: newStatus })
        });

        if (!response.ok) throw new Error('Failed to update bot status');

        loadBots();

    } catch (error) {
        alert('❌ Ошибка обновления статуса: ' + error.message);
    }
}

async function regenerateBotToken(botId) {
    if (!confirm('⚠️ Регенерация токена сделает старый токен недействительным. Продолжить?')) {
        return;
    }

    try {
        const response = await fetch(`/api/bots/${botId}/regenerate-token`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to regenerate token');

        const data = await response.json();
        alert(`✅ Новый токен:\n\n${data.bot.api_token}\n\n⚠️ Сохраните его, он больше не будет показан!`);

    } catch (error) {
        alert('❌ Ошибка регенерации токена: ' + error.message);
    }
}

function manageBotPermissions(botId) {
    // Simplified version - just show alert for now
    alert(`🔐 Управление правами для бота #${botId}\n\nИспользуйте API для настройки прав:\n\nPOST /api/bots/${botId}/permissions\n\nДоступные типы прав:\n- read_messages\n- send_messages\n- edit_messages\n- delete_messages\n- read_chats\n- read_users\n\nПодробнее в документации.`);
}

// ==================================================
// WEBHOOKS MANAGEMENT
// ==================================================
async function loadWebhooks() {
    const container = document.getElementById('webhooksListContainer');
    container.innerHTML = '<p style="text-align: center; color: #a0aec0; padding: 20px;">Loading...</p>';

    try {
        const response = await fetch('/api/webhooks', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to load webhooks');

        const data = await response.json();
        currentWebhooks = data.webhooks || [];

        if (currentWebhooks.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #718096;">
                    <div style="font-size: 48px; margin-bottom: 20px;">🔗</div>
                    <h3>Нет вебхуков</h3>
                    <p>Создайте вебхук для получения событий из чата</p>
                    <button class="btn btn-primary" onclick="openCreateWebhookModal()" style="margin-top: 20px;">
                        ➕ Создать вебхук
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = currentWebhooks.map(webhook => `
            <div class="webhook-card">
                <div class="webhook-card-header">
                    <div class="webhook-info">
                        <h4>${webhook.name}</h4>
                        <p>Бот: ${webhook.bot_name || 'Unknown'}</p>
                        <p style="font-size: 12px; color: #a0aec0; margin-top: 5px;">${webhook.url}</p>
                    </div>
                    <div class="bot-status ${webhook.is_active ? 'active' : 'inactive'}">
                        ${webhook.is_active ? 'Активен' : 'Неактивен'}
                    </div>
                </div>

                <div class="webhook-events">
                    <strong style="display: block; width: 100%; margin-bottom: 8px; color: #2d3748;">События:</strong>
                    ${(webhook.events || []).map(event => `
                        <span class="event-badge">${event}</span>
                    `).join('')}
                </div>

                <div class="webhook-actions">
                    <button class="btn btn-sm btn-secondary" onclick="testWebhook(${webhook.id})">
                        🧪 Тест
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="viewWebhookLogs(${webhook.id})">
                        📋 Логи
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteWebhook(${webhook.id})">
                        🗑 Удалить
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Load webhooks error:', error);
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #e53e3e;">
                <p>❌ Ошибка загрузки вебхуков</p>
            </div>
        `;
    }
}

function openCreateWebhookModal() {
    const modal = document.createElement('div');
    modal.id = 'createWebhookModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>➕ Создать вебхук</h2>
                <button class="close-btn" onclick="closeCreateWebhookModal()">×</button>
            </div>
            <form id="createWebhookForm" onsubmit="event.preventDefault(); createWebhook();">
                <div class="modal-body">
                    <div class="form-group">
                        <label>Название *</label>
                        <input type="text" id="webhookName" placeholder="Например: Notification Webhook" required>
                    </div>

                    <div class="form-group">
                        <label>URL *</label>
                        <input type="url" id="webhookUrl" placeholder="https://example.com/webhook" required>
                    </div>

                    <div class="form-group">
                        <label>Бот *</label>
                        <select id="webhookBotId" required>
                            <option value="">Выберите бота...</option>
                            ${currentBots.map(bot => `<option value="${bot.id}">${bot.name} (@${bot.username})</option>`).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>События *</label>
                        <div style="max-height: 200px; overflow-y: auto; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px;">
                            ${['message.created', 'message.updated', 'message.deleted', 'user.joined', 'user.left', 'chat.created', 'chat.updated', 'call.started', 'call.ended', 'file.uploaded', 'reaction.added'].map(event => `
                                <label style="display: block; padding: 5px 0; cursor: pointer;">
                                    <input type="checkbox" name="webhookEvents" value="${event}">
                                    ${event}
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeCreateWebhookModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Создать вебхук</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    // Load bots if not loaded
    if (currentBots.length === 0) {
        fetch('/api/bots', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
        .then(r => r.json())
        .then(data => {
            currentBots = data.bots || [];
            document.getElementById('webhookBotId').innerHTML =
                '<option value="">Выберите бота...</option>' +
                currentBots.map(bot => `<option value="${bot.id}">${bot.name} (@${bot.username})</option>`).join('');
        });
    }
}

function closeCreateWebhookModal() {
    const modal = document.getElementById('createWebhookModal');
    if (modal) modal.remove();
}

async function createWebhook() {
    const name = document.getElementById('webhookName').value;
    const url = document.getElementById('webhookUrl').value;
    const bot_id = document.getElementById('webhookBotId').value;
    const events = Array.from(document.querySelectorAll('input[name="webhookEvents"]:checked')).map(cb => cb.value);

    if (events.length === 0) {
        alert('⚠️ Выберите хотя бы одно событие');
        return;
    }

    try {
        const response = await fetch('/api/webhooks', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, url, bot_id: parseInt(bot_id), events })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create webhook');
        }

        const data = await response.json();
        alert(`✅ Вебхук создан успешно!\n\n⚠️ Secret для HMAC подписи:\n${data.webhook.secret}\n\nСохраните его для верификации запросов!`);

        closeCreateWebhookModal();
        loadWebhooks();

    } catch (error) {
        alert('❌ Ошибка создания вебхука: ' + error.message);
    }
}

async function testWebhook(webhookId) {
    try {
        const response = await fetch(`/api/webhooks/${webhookId}/test`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to test webhook');

        const data = await response.json();
        alert(`✅ Тестовый запрос отправлен!\n\nСтатус: ${data.status_code}\nВремя: ${data.duration_ms}ms`);

    } catch (error) {
        alert('❌ Ошибка тестирования вебхука: ' + error.message);
    }
}

async function viewWebhookLogs(webhookId) {
    try {
        const response = await fetch(`/api/webhooks/${webhookId}/logs?limit=20`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to load logs');

        const data = await response.json();
        const logs = data.logs || [];

        if (logs.length === 0) {
            alert('📋 Логов пока нет');
            return;
        }

        const logsText = logs.map(log =>
            `[${new Date(log.created_at).toLocaleString()}] ${log.event_type}\nСтатус: ${log.response_status || 'N/A'}\nДлительность: ${log.duration_ms}ms\n${log.error_message ? 'Ошибка: ' + log.error_message : ''}\n`
        ).join('\n---\n');

        alert(`📋 Последние логи вебхука:\n\n${logsText}`);

    } catch (error) {
        alert('❌ Ошибка загрузки логов: ' + error.message);
    }
}

async function deleteWebhook(webhookId) {
    if (!confirm('Вы уверены, что хотите удалить этот вебхук?')) {
        return;
    }

    try {
        const response = await fetch(`/api/webhooks/${webhookId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to delete webhook');

        alert('✅ Вебхук успешно удален');
        loadWebhooks();

    } catch (error) {
        alert('❌ Ошибка удаления вебхука: ' + error.message);
    }
}

// Export functions to global scope
window.switchBotsTab = switchBotsTab;
window.loadBots = loadBots;
window.openCreateBotModal = openCreateBotModal;
window.closeCreateBotModal = closeCreateBotModal;
window.createBot = createBot;
window.deleteBot = deleteBot;
window.toggleBotStatus = toggleBotStatus;
window.regenerateBotToken = regenerateBotToken;
window.manageBotPermissions = manageBotPermissions;
window.loadWebhooks = loadWebhooks;
window.openCreateWebhookModal = openCreateWebhookModal;
window.closeCreateWebhookModal = closeCreateWebhookModal;
window.createWebhook = createWebhook;
window.testWebhook = testWebhook;
window.viewWebhookLogs = viewWebhookLogs;
window.deleteWebhook = deleteWebhook;

console.log('✅ Bots UI module loaded');
