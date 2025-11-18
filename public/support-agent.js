// ==================== SUPPORT AGENT DASHBOARD ====================

const API_BASE = '/api';
let currentUser = null;
let currentView = 'dashboard';
let socket = null;
let currentTicketId = null;
let refreshInterval = null;
let statsChart = null;
let responseTimeChart = null;
let csatChart = null;

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    setupSocketIO();
    loadUserInfo();
    startAutoRefresh();
});

function initializeApp() {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/register.html';
        return;
    }

    // Load theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    // Load dashboard data
    loadDashboard();
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchView(e.target.dataset.view);
        });
    });

    // Header actions
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('refreshBtn').addEventListener('click', refreshCurrentView);
    document.getElementById('userMenuBtn').addEventListener('click', toggleUserMenu);
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Queue filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            loadQueue(e.target.dataset.status);
        });
    });

    document.getElementById('queue-sort')?.addEventListener('change', (e) => {
        const status = document.querySelector('.filter-btn.active')?.dataset.status || '';
        loadQueue(status, e.target.value);
    });

    // Ticket actions
    document.getElementById('send-agent-reply-btn')?.addEventListener('click', sendAgentReply);
    document.getElementById('resolve-ticket-btn')?.addEventListener('click', resolveTicket);

    document.getElementById('ticket-status-update')?.addEventListener('change', updateTicketStatus);
    document.getElementById('ticket-priority-update')?.addEventListener('change', updateTicketPriority);
    document.getElementById('ticket-assign-update')?.addEventListener('change', assignTicket);

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
    });

    socket.on('new_ticket', (data) => {
        showToast('New Ticket', `#${data.ticket_number} - ${data.subject}`, 'info');
        refreshCurrentView();
    });

    socket.on('ticket_updated', (data) => {
        if (currentTicketId === data.ticket_id) {
            loadAgentTicketDetail(data.ticket_id);
        }
        refreshCurrentView();
    });

    socket.on('new_message', (data) => {
        if (currentTicketId === data.ticket_id) {
            loadAgentTicketDetail(data.ticket_id);
        }
    });
}

function startAutoRefresh() {
    // Refresh every 30 seconds
    refreshInterval = setInterval(() => {
        if (currentView === 'dashboard' || currentView === 'queue') {
            refreshCurrentView();
        }
    }, 30000);
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
        document.getElementById('userName').textContent = currentUser.name || 'Agent';
        document.getElementById('userEmail').textContent = currentUser.email || '';

        // Check if user has support role
        if (currentUser.role !== 'admin' && currentUser.role !== 'head') {
            // You might want to check for specific support role
            console.warn('User may not have agent permissions');
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
    if (refreshInterval) clearInterval(refreshInterval);
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

    // Load content
    switch(viewName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'queue':
            loadQueue();
            break;
        case 'my-tickets':
            loadMyAssignedTickets();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'kb-manage':
            loadKBManagement();
            break;
    }
}

function refreshCurrentView() {
    document.getElementById('refreshBtn').style.transform = 'rotate(360deg)';
    setTimeout(() => {
        document.getElementById('refreshBtn').style.transform = 'rotate(0deg)';
    }, 500);

    switchView(currentView);
}

// ==================== DASHBOARD ====================

async function loadDashboard() {
    try {
        // Load stats
        const statsResponse = await fetch(`${API_BASE}/support/stats?period=7d`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!statsResponse.ok) throw new Error('Failed to load stats');

        const stats = await statsResponse.json();
        renderDashboardStats(stats);
        renderStatusChart(stats.tickets_by_status);

        // Load SLA at risk tickets
        await loadSLAAtRisk();

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Error', 'Failed to load dashboard data', 'error');
    }
}

function renderDashboardStats(stats) {
    const grid = document.getElementById('stats-grid');
    grid.innerHTML = `
        <div class="stat-card">
            <div class="stat-card-title">Total Tickets</div>
            <div class="stat-card-value">${stats.total_tickets || 0}</div>
            <div class="stat-card-change">Last 7 days</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-title">Avg First Response</div>
            <div class="stat-card-value">${stats.avg_first_response_minutes || 0}<small style="font-size: 1rem;">min</small></div>
            <div class="stat-card-change ${stats.avg_first_response_minutes > 60 ? 'negative' : ''}">
                Target: 60 min
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-title">Avg Resolution Time</div>
            <div class="stat-card-value">${Math.round((stats.avg_resolution_minutes || 0) / 60)}<small style="font-size: 1rem;">hrs</small></div>
            <div class="stat-card-change">
                ${stats.avg_resolution_minutes || 0} minutes
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-title">SLA Compliance</div>
            <div class="stat-card-value">${stats.sla?.compliance_rate || 0}%</div>
            <div class="stat-card-change ${stats.sla?.compliance_rate < 85 ? 'negative' : ''}">
                ${stats.sla?.met || 0}/${stats.sla?.total || 0} met
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-card-title">CSAT Score</div>
            <div class="stat-card-value">${stats.csat?.avg_rating || 0}<small style="font-size: 1rem;">/5</small></div>
            <div class="stat-card-change">
                ${stats.csat?.total_ratings || 0} ratings
            </div>
        </div>
    `;
}

function renderStatusChart(ticketsByStatus) {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;

    if (statsChart) {
        statsChart.destroy();
    }

    const statuses = ticketsByStatus || [];
    const labels = statuses.map(s => getStatusText(s.status));
    const data = statuses.map(s => parseInt(s.count));

    statsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tickets',
                data: data,
                backgroundColor: [
                    'rgba(33, 150, 243, 0.7)',
                    'rgba(255, 152, 0, 0.7)',
                    'rgba(156, 39, 176, 0.7)',
                    'rgba(233, 30, 99, 0.7)',
                    'rgba(76, 175, 80, 0.7)',
                    'rgba(158, 158, 158, 0.7)'
                ],
                borderColor: [
                    'rgba(33, 150, 243, 1)',
                    'rgba(255, 152, 0, 1)',
                    'rgba(156, 39, 176, 1)',
                    'rgba(233, 30, 99, 1)',
                    'rgba(76, 175, 80, 1)',
                    'rgba(158, 158, 158, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

async function loadSLAAtRisk() {
    try {
        const response = await fetch(`${API_BASE}/support/tickets?sla_at_risk=true`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Failed to load SLA at risk tickets');

        const ticketsData = await response.json();
        const tickets = ticketsData.tickets || [];

        document.getElementById('at-risk-count').textContent = tickets.length;

        const container = document.getElementById('sla-at-risk-list');
        container.innerHTML = '';

        if (tickets.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">✅ No tickets at risk</p>';
            return;
        }

        tickets.forEach(ticket => {
            const slaStatus = getSLAStatus(ticket.sla_due_date);
            const div = document.createElement('div');
            div.className = `queue-ticket sla-${slaStatus.class}`;
            div.innerHTML = `
                <div class="ticket-info">
                    <div style="font-weight: 600; margin-bottom: 0.25rem;">
                        #${ticket.ticket_number} - ${ticket.subject}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">
                        ${getPriorityText(ticket.priority)} | ${slaStatus.text}
                    </div>
                </div>
                <div class="ticket-quick-actions">
                    <button class="quick-action-btn" onclick="openAgentTicket(${ticket.id})">
                        Open
                    </button>
                </div>
            `;
            container.appendChild(div);
        });

    } catch (error) {
        console.error('Error loading SLA at risk tickets:', error);
    }
}

// ==================== QUEUE ====================

async function loadQueue(status = '', sortBy = 'sla') {
    try {
        let url = `${API_BASE}/support/tickets?`;
        const params = new URLSearchParams();

        if (status) params.append('status', status);
        params.append('sort', sortBy);

        url += params.toString();

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Failed to load queue');

        const ticketsData = await response.json();
        renderQueue(ticketsData.tickets || []);

    } catch (error) {
        console.error('Error loading queue:', error);
        showToast('Error', 'Failed to load ticket queue', 'error');
    }
}

function renderQueue(tickets) {
    const container = document.getElementById('ticket-queue');
    container.innerHTML = '';

    if (tickets.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No tickets in queue</p>';
        return;
    }

    tickets.forEach(ticket => {
        const slaStatus = getSLAStatus(ticket.sla_due_date);
        const div = document.createElement('div');
        div.className = `queue-ticket sla-${slaStatus.class}`;
        div.onclick = () => openAgentTicket(ticket.id);

        const statusClass = `status-${ticket.status}`;
        const priorityClass = `priority-${ticket.priority}`;

        div.innerHTML = `
            <div class="ticket-info">
                <div style="margin-bottom: 0.5rem;">
                    <span style="color: var(--text-tertiary); font-size: 0.9rem;">#${ticket.ticket_number}</span>
                    <span class="ticket-status ${statusClass}" style="margin-left: 0.5rem; font-size: 0.75rem; padding: 0.2rem 0.5rem;">
                        ${getStatusText(ticket.status)}
                    </span>
                    <span class="sla-indicator sla-${slaStatus.class}">
                        ${slaStatus.text}
                    </span>
                </div>
                <div style="font-weight: 600; margin-bottom: 0.25rem;">
                    ${ticket.subject}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                    <span class="ticket-priority ${priorityClass}" style="font-size: 0.7rem; padding: 0.2rem 0.4rem;">
                        ${getPriorityText(ticket.priority)}
                    </span>
                    <span style="margin-left: 0.5rem;">
                        ${ticket.customer_name} • ${formatDate(ticket.created_at)}
                    </span>
                    ${ticket.assigned_to ? `<span style="margin-left: 0.5rem;">👤 Assigned</span>` : ''}
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// ==================== MY TICKETS ====================

async function loadMyAssignedTickets() {
    try {
        const response = await fetch(`${API_BASE}/support/tickets?assigned_to_me=true`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Failed to load assigned tickets');

        const ticketsData = await response.json();
        const tickets = ticketsData.tickets || [];

        document.getElementById('my-ticket-count').textContent = tickets.length;

        const container = document.getElementById('my-tickets-list');
        container.innerHTML = '';

        if (tickets.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <div class="empty-state-text">No tickets assigned to you</div>
                </div>
            `;
            return;
        }

        tickets.forEach(ticket => {
            const card = createTicketCard(ticket);
            card.onclick = () => openAgentTicket(ticket.id);
            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading assigned tickets:', error);
        showToast('Error', 'Failed to load your tickets', 'error');
    }
}

function createTicketCard(ticket) {
    const card = document.createElement('div');
    card.className = 'ticket-card';

    const statusClass = `status-${ticket.status}`;
    const priorityClass = `priority-${ticket.priority}`;
    const slaStatus = getSLAStatus(ticket.sla_due_date);

    card.innerHTML = `
        <div class="ticket-card-header">
            <div class="ticket-number">Ticket #${ticket.ticket_number}</div>
            <div>
                <span class="ticket-status ${statusClass}">${getStatusText(ticket.status)}</span>
                <span class="sla-indicator sla-${slaStatus.class}" style="margin-left: 0.5rem;">
                    ${slaStatus.text}
                </span>
            </div>
        </div>
        <div class="ticket-subject">${ticket.subject}</div>
        <div class="ticket-description">${ticket.description}</div>
        <div class="ticket-meta">
            <span class="ticket-priority ${priorityClass}">${getPriorityText(ticket.priority)}</span>
            <span>📅 ${formatDate(ticket.created_at)}</span>
            <span>👤 ${ticket.customer_name}</span>
        </div>
    `;
    return card;
}

// ==================== TICKET DETAIL ====================

async function openAgentTicket(ticketId) {
    currentTicketId = ticketId;
    await loadAgentTicketDetail(ticketId);
    await loadCannedResponses();
    document.getElementById('agent-ticket-modal').classList.add('active');
}

async function loadAgentTicketDetail(ticketId) {
    try {
        const response = await fetch(`${API_BASE}/support/tickets/${ticketId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Failed to load ticket');

        const ticket = await response.json();

        document.getElementById('agent-modal-ticket-title').textContent = `Ticket #${ticket.ticket_number}`;

        // Render ticket detail
        const detailDiv = document.getElementById('agent-ticket-detail');
        const statusClass = `status-${ticket.status}`;

        detailDiv.innerHTML = `
            <div style="margin-bottom: 1rem;">
                <span class="ticket-status ${statusClass}" style="display: inline-block; margin-bottom: 0.5rem;">
                    ${getStatusText(ticket.status)}
                </span>
                <h3 style="margin-bottom: 0.5rem;">${ticket.subject}</h3>
                <div style="color: var(--text-secondary); margin-bottom: 1rem;">
                    Customer: ${ticket.customer_name} (${ticket.customer_email})<br>
                    Created: ${formatDate(ticket.created_at)} |
                    Priority: ${getPriorityText(ticket.priority)} |
                    Category: ${ticket.category}
                </div>
                <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px;">
                    ${ticket.description.replace(/\n/g, '<br>')}
                </div>
            </div>
        `;

        // Render messages
        renderAgentTicketMessages(ticket.messages || []);

        // Render SLA info
        const slaInfo = document.getElementById('sla-info');
        const slaStatus = getSLAStatus(ticket.sla_due_date);
        slaInfo.innerHTML = `
            <div class="sla-indicator sla-${slaStatus.class}" style="display: block; margin-bottom: 0.5rem;">
                ${slaStatus.text}
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">
                Due: ${formatDate(ticket.sla_due_date)}<br>
                ${ticket.first_response_at ? `First Response: ${formatDate(ticket.first_response_at)}` : 'No response yet'}
            </div>
        `;

        // Setup action buttons
        document.getElementById('send-agent-reply-btn').onclick = () => sendAgentReply(ticketId);
        document.getElementById('resolve-ticket-btn').onclick = () => resolveTicket(ticketId);

    } catch (error) {
        console.error('Error loading ticket detail:', error);
        showToast('Error', 'Failed to load ticket details', 'error');
    }
}

function renderAgentTicketMessages(messages) {
    const container = document.getElementById('agent-ticket-messages');
    container.innerHTML = '<h4>Conversation History</h4>';

    if (messages.length === 0) {
        container.innerHTML += '<p style="color: var(--text-secondary);">No messages yet</p>';
        return;
    }

    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'ticket-message';
        if (msg.is_internal) div.classList.add('internal');

        div.innerHTML = `
            <div class="message-author">
                ${msg.sender_name || 'System'}
                ${msg.is_internal ? '(Internal Note)' : ''}
                ${msg.is_customer ? '(Customer)' : '(Agent)'}
            </div>
            <div class="message-text">${msg.content.replace(/\n/g, '<br>')}</div>
            <div class="message-date">${formatDate(msg.created_at)}</div>
        `;
        container.appendChild(div);
    });
}

async function sendAgentReply(ticketId) {
    const textarea = document.getElementById('agent-reply-text');
    const content = textarea.value.trim();
    const isInternal = document.getElementById('internal-note-toggle').checked;

    if (!content) {
        showToast('Error', 'Please enter a message', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/support/tickets/${ticketId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ content, is_internal: isInternal })
        });

        if (!response.ok) throw new Error('Failed to send reply');

        textarea.value = '';
        document.getElementById('internal-note-toggle').checked = false;
        showToast('Success', 'Reply sent', 'success');
        await loadAgentTicketDetail(ticketId);

    } catch (error) {
        console.error('Error sending reply:', error);
        showToast('Error', 'Failed to send reply', 'error');
    }
}

async function resolveTicket(ticketId) {
    if (!confirm('Mark this ticket as resolved?')) return;

    try {
        const response = await fetch(`${API_BASE}/support/tickets/${ticketId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ status: 'resolved' })
        });

        if (!response.ok) throw new Error('Failed to resolve ticket');

        showToast('Success', 'Ticket marked as resolved', 'success');
        await loadAgentTicketDetail(ticketId);
        refreshCurrentView();

    } catch (error) {
        console.error('Error resolving ticket:', error);
        showToast('Error', 'Failed to resolve ticket', 'error');
    }
}

async function updateTicketStatus(e) {
    const status = e.target.value;
    if (!status || !currentTicketId) return;

    try {
        await fetch(`${API_BASE}/support/tickets/${currentTicketId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ status })
        });

        showToast('Success', 'Status updated', 'success');
        await loadAgentTicketDetail(currentTicketId);
        e.target.value = '';

    } catch (error) {
        console.error('Error updating status:', error);
        showToast('Error', 'Failed to update status', 'error');
    }
}

async function updateTicketPriority(e) {
    const priority = e.target.value;
    if (!priority || !currentTicketId) return;

    try {
        await fetch(`${API_BASE}/support/tickets/${currentTicketId}/priority`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ priority })
        });

        showToast('Success', 'Priority updated', 'success');
        await loadAgentTicketDetail(currentTicketId);
        e.target.value = '';

    } catch (error) {
        console.error('Error updating priority:', error);
        showToast('Error', 'Failed to update priority', 'error');
    }
}

async function assignTicket(e) {
    const value = e.target.value;
    if (!value || !currentTicketId) return;

    const assignToId = value === 'me' ? currentUser.id : parseInt(value);

    try {
        await fetch(`${API_BASE}/support/tickets/${currentTicketId}/assign`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ assigned_to: assignToId })
        });

        showToast('Success', 'Ticket assigned', 'success');
        await loadAgentTicketDetail(currentTicketId);
        e.target.value = '';

    } catch (error) {
        console.error('Error assigning ticket:', error);
        showToast('Error', 'Failed to assign ticket', 'error');
    }
}

// ==================== CANNED RESPONSES ====================

async function loadCannedResponses() {
    try {
        const response = await fetch(`${API_BASE}/support/canned-responses`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) return;

        const responses = await response.json();
        renderCannedResponses(responses);

    } catch (error) {
        console.error('Error loading canned responses:', error);
    }
}

function renderCannedResponses(responses) {
    const container = document.getElementById('canned-responses-list');
    container.innerHTML = '';

    responses.forEach(resp => {
        const div = document.createElement('div');
        div.className = 'canned-response-item';
        div.onclick = () => useCannedResponse(resp.content);
        div.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 0.25rem;">
                ${resp.title} <span class="canned-shortcut">${resp.shortcut}</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">
                ${resp.content.substring(0, 80)}...
            </div>
        `;
        container.appendChild(div);
    });
}

function toggleCannedResponses() {
    const panel = document.getElementById('canned-responses-section');
    panel.classList.toggle('hidden');
}

function useCannedResponse(content) {
    document.getElementById('agent-reply-text').value = content;
    document.getElementById('canned-responses-section').classList.add('hidden');
}

// ==================== ANALYTICS ====================

async function loadAnalytics() {
    try {
        const response = await fetch(`${API_BASE}/support/stats?period=30d`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Failed to load analytics');

        const stats = await response.json();
        renderAnalyticsStats(stats);

    } catch (error) {
        console.error('Error loading analytics:', error);
        showToast('Error', 'Failed to load analytics', 'error');
    }
}

function renderAnalyticsStats(stats) {
    const grid = document.getElementById('analytics-stats');
    grid.innerHTML = `
        <div class="stat-card">
            <div class="stat-card-title">Total Tickets (30d)</div>
            <div class="stat-card-value">${stats.total_tickets || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-title">Avg First Response</div>
            <div class="stat-card-value">${stats.avg_first_response_minutes || 0}<small style="font-size: 1rem;">m</small></div>
        </div>
        <div class="stat-card">
            <div class="stat-card-title">Avg Resolution</div>
            <div class="stat-card-value">${Math.round((stats.avg_resolution_minutes || 0) / 60)}<small style="font-size: 1rem;">h</small></div>
        </div>
        <div class="stat-card">
            <div class="stat-card-title">CSAT Score</div>
            <div class="stat-card-value">${stats.csat?.avg_rating || 0}<small style="font-size: 1rem;">/5</small></div>
        </div>
    `;
}

// ==================== KB MANAGEMENT ====================

async function loadKBManagement() {
    try {
        const response = await fetch(`${API_BASE}/support/kb/articles`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error('Failed to load KB articles');

        const articlesData = await response.json();
        renderKBManagement(articlesData.articles || []);

    } catch (error) {
        console.error('Error loading KB:', error);
        showToast('Error', 'Failed to load knowledge base', 'error');
    }
}

function renderKBManagement(articles) {
    const container = document.getElementById('kb-articles-manage');
    container.innerHTML = '';

    articles.forEach(article => {
        const div = document.createElement('div');
        div.className = 'kb-article';
        div.innerHTML = `
            <div class="kb-article-title">${article.title}</div>
            <div class="kb-article-summary">${article.summary || ''}</div>
            <div class="kb-article-meta">
                <span>Status: ${article.status}</span>
                <span>👁️ ${article.view_count || 0} views</span>
                <span>👍 ${article.helpful_count || 0} helpful</span>
            </div>
        `;
        container.appendChild(div);
    });
}

function createNewArticle() {
    showToast('Coming Soon', 'Article editor will be available soon', 'info');
}

// ==================== UTILITIES ====================

function getSLAStatus(slaDueDate) {
    if (!slaDueDate) return { class: 'ok', text: 'No SLA' };

    const now = new Date();
    const due = new Date(slaDueDate);
    const diffMs = due - now;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 0) {
        return { class: 'breach', text: 'SLA Breached' };
    } else if (diffMins < 60) {
        return { class: 'warning', text: `${diffMins}m left` };
    } else {
        const hours = Math.floor(diffMins / 60);
        return { class: 'ok', text: `${hours}h left` };
    }
}

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

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

function getStatusText(status) {
    const statusMap = {
        'new': 'New',
        'open': 'Open',
        'in_progress': 'In Progress',
        'waiting_customer': 'Waiting',
        'resolved': 'Resolved',
        'closed': 'Closed'
    };
    return statusMap[status] || status;
}

function getPriorityText(priority) {
    const priorityMap = {
        'low': 'Low',
        'normal': 'Normal',
        'high': 'High',
        'urgent': 'Urgent',
        'critical': 'Critical'
    };
    return priorityMap[priority] || priority;
}

// Expose functions to global scope
window.openAgentTicket = openAgentTicket;
window.createNewArticle = createNewArticle;
window.toggleCannedResponses = toggleCannedResponses;
