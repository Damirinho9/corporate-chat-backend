// ==================================================
// POLLS UI - JavaScript Module
// ==================================================

let currentPolls = {};

// ==================================================
// CREATE POLL MODAL
// ==================================================
function openCreatePollModal() {
    if (!selectedChatId) {
        alert('Выберите чат для создания опроса');
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'createPollModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>📊 Создать опрос</h2>
                <button class="close-btn" onclick="closeCreatePollModal()">×</button>
            </div>
            <form id="createPollForm" onsubmit="event.preventDefault(); createPoll();">
                <div class="modal-body">
                    <div class="form-group">
                        <label>Вопрос *</label>
                        <input type="text" id="pollQuestion" placeholder="Например: Когда удобнее провести встречу?" required maxlength="500">
                    </div>

                    <div class="form-group">
                        <label>Варианты ответов *</label>
                        <div id="pollOptionsContainer">
                            <input type="text" class="poll-option-input" placeholder="Вариант 1" required maxlength="200">
                            <input type="text" class="poll-option-input" placeholder="Вариант 2" required maxlength="200">
                        </div>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="addPollOption()" style="margin-top: 10px;">
                            ➕ Добавить вариант
                        </button>
                    </div>

                    <div class="form-group">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="pollMultipleChoice" style="margin-right: 10px;">
                            Множественный выбор
                        </label>
                    </div>

                    <div class="form-group">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="pollAnonymous" style="margin-right: 10px;">
                            Анонимное голосование
                        </label>
                    </div>

                    <div class="form-group">
                        <label>Закрыть автоматически (опционально)</label>
                        <input type="datetime-local" id="pollClosesAt">
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeCreatePollModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Создать опрос</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeCreatePollModal() {
    const modal = document.getElementById('createPollModal');
    if (modal) modal.remove();
}

function addPollOption() {
    const container = document.getElementById('pollOptionsContainer');
    const optionsCount = container.querySelectorAll('.poll-option-input').length;

    if (optionsCount >= 10) {
        alert('Максимум 10 вариантов ответа');
        return;
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'poll-option-input';
    input.placeholder = `Вариант ${optionsCount + 1}`;
    input.required = true;
    input.maxLength = 200;
    container.appendChild(input);
}

async function createPoll() {
    const question = document.getElementById('pollQuestion').value.trim();
    const optionInputs = document.querySelectorAll('.poll-option-input');
    const options = Array.from(optionInputs).map(input => input.value.trim()).filter(v => v);
    const multipleChoice = document.getElementById('pollMultipleChoice').checked;
    const anonymous = document.getElementById('pollAnonymous').checked;
    const closesAt = document.getElementById('pollClosesAt').value;

    if (options.length < 2) {
        alert('Необходимо минимум 2 варианта ответа');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/polls`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: selectedChatId,
                question,
                options,
                multiple_choice: multipleChoice,
                anonymous: anonymous,
                closes_at: closesAt || null
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create poll');
        }

        const data = await response.json();
        closeCreatePollModal();
        showToast('✅ Опрос создан успешно', 'success');

        // Reload messages to show the poll
        if (typeof loadMessages === 'function') {
            loadMessages(selectedChatId);
        }

    } catch (error) {
        console.error('Create poll error:', error);
        alert('❌ Ошибка создания опроса: ' + error.message);
    }
}

// ==================================================
// RENDER POLL IN MESSAGE
// ==================================================
function renderPoll(poll, messageElement) {
    if (!poll) return '';

    const options = Array.isArray(poll.options) ? poll.options : JSON.parse(poll.options || '[]');
    const userVote = poll.user_vote || [];
    const totalVoters = poll.total_voters || 0;
    const isClosed = poll.closed || (poll.closes_at && new Date(poll.closes_at) < new Date());

    // Calculate percentages
    const totalVotes = options.reduce((sum, opt) => sum + (opt.votes || 0), 0);

    const pollHTML = `
        <div class="poll-container" data-poll-id="${poll.id}">
            <div class="poll-header">
                <h4>📊 ${escapeHtml(poll.question)}</h4>
                ${isClosed ? '<span class="poll-closed-badge">Закрыт</span>' : ''}
            </div>

            <div class="poll-options">
                ${options.map((option, index) => {
                    const percentage = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
                    const isSelected = userVote.includes(index);

                    return `
                        <div class="poll-option ${isSelected ? 'selected' : ''} ${isClosed ? 'disabled' : ''}"
                             onclick="${isClosed ? '' : `togglePollOption(${poll.id}, ${index}, ${poll.multiple_choice})`}">
                            <div class="poll-option-bar" style="width: ${percentage}%"></div>
                            <div class="poll-option-content">
                                <div class="poll-option-text">
                                    ${isSelected ? '✓ ' : ''}${escapeHtml(option.text)}
                                </div>
                                <div class="poll-option-stats">
                                    <span class="poll-votes">${option.votes || 0}</span>
                                    <span class="poll-percentage">${percentage}%</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            <div class="poll-footer">
                <span class="poll-voters">👥 ${totalVoters} ${totalVoters === 1 ? 'голос' : 'голосов'}</span>
                ${poll.multiple_choice ? '<span class="poll-info">Можно выбрать несколько</span>' : ''}
                ${poll.anonymous ? '<span class="poll-info">Анонимно</span>' : ''}
                ${userVote.length > 0 && !isClosed ?
                    `<button class="btn btn-sm btn-primary" onclick="submitPollVote(${poll.id})">Проголосовать</button>` : ''}
                ${canClosePoll(poll) && !isClosed ?
                    `<button class="btn btn-sm btn-danger" onclick="closePoll(${poll.id})">Закрыть опрос</button>` : ''}
            </div>

            ${!poll.anonymous && poll.voters && poll.voters.length > 0 ? `
                <div class="poll-voters-list">
                    <details>
                        <summary>Кто проголосовал</summary>
                        <ul>
                            ${poll.voters.map(voter => `
                                <li>${voter.name}: ${voter.option_indices.map(i => options[i].text).join(', ')}</li>
                            `).join('')}
                        </ul>
                    </details>
                </div>
            ` : ''}
        </div>
    `;

    return pollHTML;
}

// Temporary storage for selected options
let tempPollVotes = {};

function togglePollOption(pollId, optionIndex, isMultipleChoice) {
    if (!tempPollVotes[pollId]) {
        tempPollVotes[pollId] = [];
    }

    const votes = tempPollVotes[pollId];
    const index = votes.indexOf(optionIndex);

    if (index > -1) {
        votes.splice(index, 1);
    } else {
        if (!isMultipleChoice) {
            tempPollVotes[pollId] = [optionIndex];
        } else {
            votes.push(optionIndex);
        }
    }

    // Update UI
    const pollContainer = document.querySelector(`[data-poll-id="${pollId}"]`);
    if (pollContainer) {
        const options = pollContainer.querySelectorAll('.poll-option');
        options.forEach((opt, idx) => {
            if (tempPollVotes[pollId].includes(idx)) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
    }
}

async function submitPollVote(pollId) {
    const optionIndices = tempPollVotes[pollId];

    if (!optionIndices || optionIndices.length === 0) {
        alert('Выберите хотя бы один вариант');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/polls/${pollId}/vote`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                option_indices: optionIndices
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to vote');
        }

        const data = await response.json();
        showToast('✅ Голос учтен', 'success');

        // Clear temp votes
        delete tempPollVotes[pollId];

        // Update poll display
        if (data.poll && currentPollsData) {
            currentPollsData[pollId] = data.poll;
            // Reload messages to update display
            if (typeof loadMessages === 'function' && selectedChatId) {
                loadMessages(selectedChatId);
            }
        }

    } catch (error) {
        console.error('Vote error:', error);
        alert('❌ Ошибка голосования: ' + error.message);
    }
}

async function closePoll(pollId) {
    if (!confirm('Закрыть опрос? После этого голосование будет невозможно.')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/polls/${pollId}/close`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to close poll');
        }

        showToast('✅ Опрос закрыт', 'success');

        // Reload messages
        if (typeof loadMessages === 'function' && selectedChatId) {
            loadMessages(selectedChatId);
        }

    } catch (error) {
        console.error('Close poll error:', error);
        alert('❌ Ошибка закрытия опроса: ' + error.message);
    }
}

function canClosePoll(poll) {
    if (!currentUser) return false;

    // Admin can close any poll
    if (currentUser.role === 'admin') return true;

    // Creator can close their poll
    if (poll.created_by === currentUser.id) return true;

    // ROP can close polls in their department
    if (currentUser.role === 'rop' && currentUser.department === poll.department) return true;

    return false;
}

// Store polls data globally for updates
let currentPollsData = {};

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export functions to global scope
window.openCreatePollModal = openCreatePollModal;
window.closeCreatePollModal = closeCreatePollModal;
window.addPollOption = addPollOption;
window.createPoll = createPoll;
window.renderPoll = renderPoll;
window.togglePollOption = togglePollOption;
window.submitPollVote = submitPollVote;
window.closePoll = closePoll;
window.canClosePoll = canClosePoll;

console.log('✅ Polls UI module loaded');
