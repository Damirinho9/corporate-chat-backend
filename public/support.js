// ==================== SUPPORT SYSTEM CLIENT ====================

const API_BASE = '/api';
let currentUser = null;
let currentView = 'chatbot';
let chatbotSessionId = null;
let socket = null;
let currentTicketId = null;
let currentArticleSlug = null;

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    setupSocketIO();
    loadUserInfo();
});

function initializeApp() {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/register.html';
        return;
    }

    // Initialize chatbot session
    chatbotSessionId = localStorage.getItem('chatbot_session_id') || generateSessionId();
    localStorage.setItem('chatbot_session_id', chatbotSessionId);

    // Load theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    // Load initial content
    loadKnowledgeBase();
    loadMyTickets();
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchView(e.target.dataset.view);
        });
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // User menu
    document.getElementById('userMenuBtn').addEventListener('click', toggleUserMenu);
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Chatbot
    document.getElementById('chatbot-send').addEventListener('click', sendChatbotMessage);
    document.getElementById('chatbot-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatbotMessage();
        }
    });

    // Knowledge Base
    document.getElementById('kb-search').addEventListener('input', debounce(searchKnowledgeBase, 300));

    // Tickets
    document.getElementById('ticket-status-filter').addEventListener('change', loadMyTickets);

    // New Ticket Form
    document.getElementById('new-ticket-form').addEventListener('submit', createTicket);
    document.getElementById('cancel-ticket-btn').addEventListener('click', () => {
        document.getElementById('new-ticket-form').reset();
        switchView('chatbot');
    });

    // Modals
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModals();
        });
    });

    // Click outside to close dropdown
    document.addEventListener('click', (e) => {
        const userMenu = document.getElementById('userMenu');
        const userMenuBtn = document.getElementById('userMenuBtn');
        if (!userMenuBtn.contains(e.target) && !userMenu.contains(e.target)) {
            userMenu.classList.add('hidden');
        }
    });
}

function setupSocketIO() {
    socket = io({
        auth: {
            token: localStorage.getItem('token')
        }
    });

    socket.on('connect', () => {
        console.log('Socket.IO connected');
        // Join support room if viewing a ticket
        if (currentTicketId) {
            socket.emit('support:join', { ticketId: currentTicketId, role: currentUser?.role });
        }
    });

    socket.on('disconnect', () => {
        console.log('Socket.IO disconnected');
    });

    // New ticket created (for agents - not used in customer interface)
    socket.on('support:ticket_created', (data) => {
        console.log('New ticket created:', data);
    });

    // Ticket updated (status, priority, etc.)
    socket.on('support:ticket_updated', (data) => {
        console.log('Ticket updated:', data);
        if (data.updates.status) {
            showToast('Статус изменён', `Новый статус: ${getStatusLabel(data.updates.status)}`, 'info');
        }
        if (currentView === 'tickets') {
            loadMyTickets();
        }
        if (currentTicketId === data.ticketId) {
            loadTicketDetail(data.ticketId);
        }
    });

    // New message in ticket
    socket.on('support:ticket_message', (data) => {
        console.log('New message:', data);
        // Only update if message is not from current user
        if (data.message.author_email !== currentUser?.email) {
            showToast('Новое сообщение', data.message.content.substring(0, 50) + '...', 'info');
            if (currentTicketId === data.ticketId) {
                loadTicketDetail(data.ticketId);
            }
        }
    });

    // Ticket assigned to agent
    socket.on('support:ticket_assigned', (data) => {
        console.log('Ticket assigned:', data);
        if (currentTicketId === data.ticketId) {
            loadTicketDetail(data.ticketId);
        }
    });

    // Ticket status changed
    socket.on('support:ticket_status_changed', (data) => {
        console.log('Ticket status changed:', data);
        const statusInfo = getStatusInfo(data.newStatus);
        showToast('Статус обновлён', `${statusInfo.emoji} ${statusInfo.label}`, 'info');
        if (currentTicketId === data.ticketId) {
            loadTicketDetail(data.ticketId);
        }
        if (currentView === 'tickets') {
            loadMyTickets();
        }
    });

    // Someone is typing
    socket.on('support:user_typing', (data) => {
        if (currentTicketId === data.ticketId && data.userId !== currentUser?.id) {
            showTypingIndicator(data.userName);
        }
    });
}

// Helper to get status info
function getStatusInfo(status) {
    const statuses = {
        'new': { emoji: '🆕', label: 'Новый' },
        'open': { emoji: '📂', label: 'Открыт' },
        'in_progress': { emoji: '⚡', label: 'В работе' },
        'waiting_customer': { emoji: '⏳', label: 'Ожидание клиента' },
        'waiting_agent': { emoji: '⌛', label: 'Ожидание агента' },
        'resolved': { emoji: '✅', label: 'Решён' },
        'closed': { emoji: '🔒', label: 'Закрыт' }
    };
    return statuses[status] || { emoji: '📋', label: status };
}

function getStatusLabel(status) {
    return getStatusInfo(status).label;
}

// Typing indicator
let typingTimeout;
function showTypingIndicator(userName) {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.textContent = `${userName} печатает...`;
        indicator.classList.remove('hidden');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            indicator.classList.add('hidden');
        }, 3000);
    }
}

// Emit typing event
let lastTypingEmit = 0;
function onMessageTyping() {
    const now = Date.now();
    if (now - lastTypingEmit > 1000 && currentTicketId) { // Throttle to once per second
        socket?.emit('support:typing', { ticketId: currentTicketId });
        lastTypingEmit = now;
    }
}

// ==================== USER MANAGEMENT ====================

async function loadUserInfo() {
    try {
        const response = await fetch(`${API_BASE}/auth/profile`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to load user info');

        currentUser = await response.json();
        document.getElementById('userName').textContent = currentUser.name || 'Пользователь';
        document.getElementById('userEmail').textContent = currentUser.email || '';

        // Show/hide admin menu items
        if (currentUser.role === 'admin' || currentUser.role === 'head') {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.classList.remove('hidden');
            });
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

function toggleUserMenu() {
    document.getElementById('userMenu').classList.toggle('hidden');
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('chatbot_session_id');
    window.location.href = '/register.html';
}

// ==================== NAVIGATION ====================

function switchView(viewName) {
    currentView = viewName;

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`).classList.add('active');

    // Load content if needed
    if (viewName === 'kb') {
        loadKnowledgeBase();
    } else if (viewName === 'tickets') {
        loadMyTickets();
    }
}

// ==================== CHATBOT ====================

async function sendChatbotMessage() {
    const input = document.getElementById('chatbot-input');
    const message = input.value.trim();

    if (!message) return;

    // Clear input
    input.value = '';

    // Add user message to UI
    addChatbotMessage(message, false);

    // Show typing indicator
    const typingId = showTypingIndicator();

    try {
        const response = await fetch(`${API_BASE}/support/chatbot/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                message,
                session_id: chatbotSessionId
            })
        });

        removeTypingIndicator(typingId);

        if (!response.ok) throw new Error('Failed to send message');

        const data = await response.json();

        // Add bot response
        addChatbotMessage(data.message, true, data.suggestions, data.kb_article);

        // Handle special actions
        if (data.should_create_ticket) {
            setTimeout(() => {
                if (confirm('Создать тикет для более детальной помощи?')) {
                    switchView('new-ticket');
                    document.getElementById('ticket-category').value = data.ticket_category || 'other';
                    document.getElementById('ticket-subject').value = message;
                }
            }, 1000);
        }

    } catch (error) {
        removeTypingIndicator(typingId);
        console.error('Error sending chatbot message:', error);
        addChatbotMessage('Извините, произошла ошибка. Попробуйте ещё раз или создайте тикет.', true);
    }
}

function addChatbotMessage(message, isBot, suggestions = [], kbArticle = null) {
    const messagesContainer = document.getElementById('chatbot-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = isBot ? 'bot-message' : 'user-message';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = isBot ? '🤖' : '👤';

    const content = document.createElement('div');
    content.className = 'message-content';

    const text = document.createElement('p');
    text.textContent = message;
    content.appendChild(text);

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    content.appendChild(time);

    // Add KB article link if provided
    if (kbArticle) {
        const articleLink = document.createElement('div');
        articleLink.className = 'message-suggestions';
        const btn = document.createElement('button');
        btn.className = 'suggestion-btn';
        btn.textContent = `📖 ${kbArticle.title}`;
        btn.onclick = () => openArticle(kbArticle.slug);
        articleLink.appendChild(btn);
        content.appendChild(articleLink);
    }

    // Add suggestions
    if (suggestions && suggestions.length > 0) {
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'message-suggestions';
        suggestions.forEach(suggestion => {
            const btn = document.createElement('button');
            btn.className = 'suggestion-btn';
            btn.textContent = suggestion;
            btn.onclick = () => handleSuggestionClick(suggestion);
            suggestionsDiv.appendChild(btn);
        });
        content.appendChild(suggestionsDiv);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    messagesContainer.appendChild(messageDiv);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function handleSuggestionClick(suggestion) {
    if (suggestion.includes('Создать тикет') || suggestion.includes('тикет')) {
        switchView('new-ticket');
    } else if (suggestion.includes('База знаний')) {
        switchView('kb');
    } else if (suggestion.includes('Читать')) {
        // Extract article title and open it
        const title = suggestion.replace('📖 Читать: ', '');
        // This would need article slug - for now just switch to KB
        switchView('kb');
    } else {
        // Send as new message
        document.getElementById('chatbot-input').value = suggestion;
        sendChatbotMessage();
    }
}

function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const messagesContainer = document.getElementById('chatbot-messages');
    const typingDiv = document.createElement('div');
    typingDiv.id = id;
    typingDiv.className = 'bot-message';
    typingDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
            <p>Печатает...</p>
        </div>
    `;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) indicator.remove();
}

// ==================== KNOWLEDGE BASE ====================

async function loadKnowledgeBase(categorySlug = null, searchQuery = null) {
    try {
        // Load categories
        const categoriesResponse = await fetch(`${API_BASE}/support/kb/categories`);
        if (!categoriesResponse.ok) throw new Error('Failed to load categories');
        const categoriesData = await categoriesResponse.json();
        renderCategories(categoriesData.categories || []);

        // Load articles
        let url = `${API_BASE}/support/kb/articles`;
        const params = new URLSearchParams();
        if (categorySlug) params.append('category', categorySlug);
        if (searchQuery) params.append('search', searchQuery);
        if (params.toString()) url += '?' + params.toString();

        const articlesResponse = await fetch(url);
        if (!articlesResponse.ok) throw new Error('Failed to load articles');
        const articlesData = await articlesResponse.json();
        renderArticles(articlesData.articles || []);

    } catch (error) {
        console.error('Error loading knowledge base:', error);
        showToast('Ошибка', 'Не удалось загрузить базу знаний', 'error');
    }
}

function renderCategories(categories) {
    const container = document.getElementById('kb-categories');
    container.innerHTML = '';

    categories.forEach(category => {
        const div = document.createElement('div');
        div.className = 'kb-category';
        div.onclick = () => loadKnowledgeBase(category.slug);
        div.innerHTML = `
            <div class="kb-category-icon">${category.icon || '📁'}</div>
            <div class="kb-category-name">${category.name}</div>
            <div class="kb-category-description">${category.description || ''}</div>
            <div class="kb-category-count">${category.article_count || 0} статей</div>
        `;
        container.appendChild(div);
    });
}

function renderArticles(articles) {
    const container = document.getElementById('kb-articles');
    container.innerHTML = '';

    if (articles.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <div class="empty-state-text">Статьи не найдены</div>
            </div>
        `;
        return;
    }

    articles.forEach(article => {
        const div = document.createElement('div');
        div.className = 'kb-article';
        div.onclick = () => openArticle(article.slug);
        div.innerHTML = `
            <div class="kb-article-title">${article.title}</div>
            <div class="kb-article-summary">${article.summary || ''}</div>
            <div class="kb-article-meta">
                <span>👁️ ${article.view_count || 0} просмотров</span>
                <span>👍 ${article.helpful_count || 0} полезно</span>
            </div>
        `;
        container.appendChild(div);
    });
}

async function openArticle(slug) {
    try {
        const response = await fetch(`${API_BASE}/support/kb/articles/${slug}`);
        if (!response.ok) throw new Error('Failed to load article');

        const article = await response.json();
        currentArticleSlug = slug;

        document.getElementById('modal-article-title').textContent = article.title;

        // Render markdown content
        const content = document.getElementById('article-content');
        if (window.marked && window.DOMPurify) {
            const dirty = marked.parse(article.content);
            const clean = DOMPurify.sanitize(dirty);
            content.innerHTML = clean;
        } else {
            content.innerHTML = `<pre>${article.content}</pre>`;
        }

        // Setup helpful buttons
        document.getElementById('article-helpful-btn').onclick = () => markArticleHelpful(article.id, true);
        document.getElementById('article-not-helpful-btn').onclick = () => markArticleHelpful(article.id, false);

        document.getElementById('article-modal').classList.add('active');

    } catch (error) {
        console.error('Error opening article:', error);
        showToast('Ошибка', 'Не удалось загрузить статью', 'error');
    }
}

async function markArticleHelpful(articleId, isHelpful) {
    try {
        await fetch(`${API_BASE}/support/kb/articles/${articleId}/helpful`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ is_helpful: isHelpful })
        });

        showToast('Спасибо!', 'Ваш отзыв учтён', 'success');
        closeModals();

        // If not helpful, suggest creating a ticket
        if (!isHelpful) {
            setTimeout(() => {
                if (confirm('Статья не помогла? Создать тикет для персональной помощи?')) {
                    switchView('new-ticket');
                }
            }, 1000);
        }

    } catch (error) {
        console.error('Error marking article helpful:', error);
    }
}

function searchKnowledgeBase() {
    const query = document.getElementById('kb-search').value.trim();
    loadKnowledgeBase(null, query);
}

// ==================== TICKETS ====================

async function loadMyTickets() {
    try {
        const status = document.getElementById('ticket-status-filter').value;
        let url = `${API_BASE}/support/tickets?assigned_to_me=false`;
        if (status) url += `&status=${status}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to load tickets');

        const ticketsData = await response.json();
        renderTickets(ticketsData.tickets || []);

    } catch (error) {
        console.error('Error loading tickets:', error);
        showToast('Ошибка', 'Не удалось загрузить тикеты', 'error');
    }
}

function renderTickets(tickets) {
    const container = document.getElementById('tickets-list');
    container.innerHTML = '';

    if (tickets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎫</div>
                <div class="empty-state-text">У вас пока нет тикетов</div>
                <button class="btn btn-primary" onclick="switchView('new-ticket')">
                    ✏️ Создать первый тикет
                </button>
            </div>
        `;
        return;
    }

    tickets.forEach(ticket => {
        const card = document.createElement('div');
        card.className = 'ticket-card';
        card.onclick = () => openTicket(ticket.id);

        const statusClass = `status-${ticket.status}`;
        const priorityClass = `priority-${ticket.priority}`;
        const statusText = getStatusText(ticket.status);
        const priorityText = getPriorityText(ticket.priority);

        card.innerHTML = `
            <div class="ticket-card-header">
                <div class="ticket-number">Тикет #${ticket.ticket_number}</div>
                <div class="ticket-status ${statusClass}">${statusText}</div>
            </div>
            <div class="ticket-subject">${ticket.subject}</div>
            <div class="ticket-description">${ticket.description}</div>
            <div class="ticket-meta">
                <span class="ticket-priority ${priorityClass}">${priorityText}</span>
                <span>📅 ${formatDate(ticket.created_at)}</span>
                ${ticket.assigned_to ? '<span>👤 Назначено</span>' : '<span>👤 Не назначено</span>'}
            </div>
        `;
        container.appendChild(card);
    });
}

async function openTicket(ticketId) {
    currentTicketId = ticketId;
    await loadTicketDetail(ticketId);
    document.getElementById('ticket-modal').classList.add('active');
}

async function loadTicketDetail(ticketId) {
    try {
        currentTicketId = ticketId;

        // Join ticket room for real-time updates
        if (socket && socket.connected) {
            socket.emit('support:join', { ticketId, role: currentUser?.role });
        }

        const response = await fetch(`${API_BASE}/support/tickets/${ticketId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to load ticket');

        const ticket = await response.json();

        document.getElementById('modal-ticket-title').textContent = `Тикет #${ticket.ticket_number}`;

        // Render ticket detail
        const detailDiv = document.getElementById('ticket-detail');
        const statusClass = `status-${ticket.status}`;
        const statusText = getStatusText(ticket.status);

        detailDiv.innerHTML = `
            <div style="margin-bottom: 1rem;">
                <div class="ticket-status ${statusClass}" style="display: inline-block; margin-bottom: 0.5rem;">${statusText}</div>
                <h3 style="margin-bottom: 0.5rem;">${ticket.subject}</h3>
                <div style="color: var(--text-secondary); margin-bottom: 1rem;">
                    Создан: ${formatDate(ticket.created_at)} |
                    Приоритет: ${getPriorityText(ticket.priority)}
                </div>
                <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                    ${ticket.description.replace(/\n/g, '<br>')}
                </div>
            </div>
        `;

        // Render messages
        renderTicketMessages(ticket.messages || []);

        // Setup reply button
        document.getElementById('send-reply-btn').onclick = () => sendTicketReply(ticketId);

        // Setup typing indicator
        const replyTextarea = document.getElementById('ticket-reply-text');
        if (replyTextarea) {
            replyTextarea.addEventListener('input', onMessageTyping);
        }

        // Render rating section if resolved
        if (ticket.status === 'resolved' && !ticket.customer_rating) {
            renderRatingSection(ticketId);
        } else {
            document.getElementById('ticket-rating').innerHTML = '';
        }

    } catch (error) {
        console.error('Error loading ticket detail:', error);
        showToast('Ошибка', 'Не удалось загрузить детали тикета', 'error');
    }
}

function renderTicketMessages(messages) {
    const container = document.getElementById('ticket-messages');
    container.innerHTML = '<h4>История переписки</h4>';

    if (messages.length === 0) {
        container.innerHTML += '<p style="color: var(--text-secondary);">Пока нет сообщений</p>';
        return;
    }

    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'ticket-message';
        if (msg.is_internal) div.classList.add('internal');

        div.innerHTML = `
            <div class="message-author">${msg.sender_name || 'Система'} ${msg.is_internal ? '(внутреннее)' : ''}</div>
            <div class="message-text">${msg.content.replace(/\n/g, '<br>')}</div>
            <div class="message-date">${formatDate(msg.created_at)}</div>
        `;
        container.appendChild(div);
    });
}

async function sendTicketReply(ticketId) {
    const textarea = document.getElementById('ticket-reply-text');
    const content = textarea.value.trim();

    if (!content) {
        showToast('Ошибка', 'Введите текст сообщения', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/support/tickets/${ticketId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ content, is_internal: false })
        });

        if (!response.ok) throw new Error('Failed to send reply');

        textarea.value = '';
        showToast('Успех', 'Сообщение отправлено', 'success');
        await loadTicketDetail(ticketId);

    } catch (error) {
        console.error('Error sending reply:', error);
        showToast('Ошибка', 'Не удалось отправить сообщение', 'error');
    }
}

function renderRatingSection(ticketId) {
    const container = document.getElementById('ticket-rating');
    container.innerHTML = `
        <h4>Оцените решение</h4>
        <p style="color: var(--text-secondary); margin-bottom: 1rem;">
            Помогла ли наша поддержка решить вашу проблему?
        </p>
        <div class="rating-stars" id="rating-stars"></div>
        <textarea id="rating-feedback" rows="3" placeholder="Дополнительный отзыв (необязательно)" style="width: 100%; margin-top: 1rem;"></textarea>
        <button class="btn btn-primary" onclick="submitRating(${ticketId})" style="margin-top: 1rem;">
            Отправить оценку
        </button>
    `;

    // Create stars
    const starsContainer = document.getElementById('rating-stars');
    for (let i = 1; i <= 5; i++) {
        const star = document.createElement('span');
        star.className = 'rating-star';
        star.textContent = '⭐';
        star.dataset.rating = i;
        star.onclick = () => selectRating(i);
        starsContainer.appendChild(star);
    }
}

let selectedRating = 0;

function selectRating(rating) {
    selectedRating = rating;
    const stars = document.querySelectorAll('.rating-star');
    stars.forEach((star, index) => {
        star.style.opacity = index < rating ? '1' : '0.3';
    });
}

async function submitRating(ticketId) {
    if (selectedRating === 0) {
        showToast('Ошибка', 'Выберите оценку', 'warning');
        return;
    }

    const feedback = document.getElementById('rating-feedback').value.trim();

    try {
        const response = await fetch(`${API_BASE}/support/tickets/${ticketId}/rating`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                rating: selectedRating,
                feedback: feedback || null
            })
        });

        if (!response.ok) throw new Error('Failed to submit rating');

        showToast('Спасибо!', 'Ваша оценка отправлена', 'success');
        document.getElementById('ticket-rating').innerHTML = '<p style="color: var(--success);">✅ Спасибо за вашу оценку!</p>';

    } catch (error) {
        console.error('Error submitting rating:', error);
        showToast('Ошибка', 'Не удалось отправить оценку', 'error');
    }
}

async function createTicket(e) {
    e.preventDefault();

    const subject = document.getElementById('ticket-subject').value.trim();
    const category = document.getElementById('ticket-category').value;
    const priority = document.getElementById('ticket-priority').value;
    const description = document.getElementById('ticket-description').value.trim();

    if (!subject || !category || !description) {
        showToast('Ошибка', 'Заполните все обязательные поля', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/support/tickets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                subject,
                category,
                priority,
                description
            })
        });

        if (!response.ok) throw new Error('Failed to create ticket');

        const ticket = await response.json();

        showToast('Успех', `Тикет #${ticket.ticket_number} создан`, 'success');
        document.getElementById('new-ticket-form').reset();

        // Switch to tickets view and open the new ticket
        switchView('tickets');
        setTimeout(() => openTicket(ticket.id), 500);

    } catch (error) {
        console.error('Error creating ticket:', error);
        showToast('Ошибка', 'Не удалось создать тикет', 'error');
    }
}

// ==================== UTILITIES ====================

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    document.getElementById('themeToggle').textContent = theme === 'light' ? '🌙' : '☀️';
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
    currentTicketId = null;
    currentArticleSlug = null;
}

function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 0.25rem;">${title}</div>
        <div style="font-size: 0.9rem; color: var(--text-secondary);">${message}</div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays < 7) return `${diffDays} д назад`;

    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

function getStatusText(status) {
    const statusMap = {
        'new': 'Новый',
        'open': 'Открыт',
        'in_progress': 'В работе',
        'waiting_customer': 'Ожидает ответа',
        'resolved': 'Решён',
        'closed': 'Закрыт'
    };
    return statusMap[status] || status;
}

function getPriorityText(priority) {
    const priorityMap = {
        'low': 'Низкий',
        'normal': 'Обычный',
        'high': 'Высокий',
        'urgent': 'Срочный',
        'critical': 'Критический'
    };
    return priorityMap[priority] || priority;
}

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Expose functions to global scope for onclick handlers
window.switchView = switchView;
window.openArticle = openArticle;
window.openTicket = openTicket;
window.submitRating = submitRating;
window.selectRating = selectRating;
