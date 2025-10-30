// Найдем строку 1235 и заменим всю функцию renderChats

function renderChats() {
    const chatsList = document.getElementById('chatsList');
    
    if (chats.length === 0) {
        chatsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Нет доступных чатов</div>';
        return;
    }
    
    chatsList.innerHTML = chats.map(chat => {
        // Безопасно получаем текст последнего сообщения
        let lastMessageText = 'Нет сообщений';
        if (chat.last_message) {
            if (typeof chat.last_message === 'object' && chat.last_message.content) {
                lastMessageText = escapeHtml(chat.last_message.content);
            } else if (typeof chat.last_message === 'string') {
                lastMessageText = escapeHtml(chat.last_message);
            }
        }
        
        return `
            <div class="chat-item" data-chat-id="${chat.id}" onclick="openChat(${chat.id})">
                <div class="chat-item-header">
                    <span class="chat-name">${escapeHtml(chat.name || 'Чат')}</span>
                    ${chat.unread_count > 0 ? `<span class="unread-badge">${chat.unread_count}</span>` : ''}
                </div>
                <div class="chat-last-message">
                    ${lastMessageText}
                </div>
            </div>
        `;
    }).join('');
}
