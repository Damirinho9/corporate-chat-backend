// ==================================================
// POLLS UI - JavaScript Module (Modern UI Edition)
// ==================================================

let currentPolls = {};

// ==================================================
// CREATE POLL MODAL
// ==================================================
function openCreatePollModal() {
    if (!window.selectedChatId) {
        alert('Выберите чат для создания опроса');
        return;
    }

    const selectedChatId = window.selectedChatId;

    const modal = document.createElement('div');
    modal.id = 'createPollModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modern-modal-content">
            <div class="modern-modal-header">
                <div class="modal-title-group">
                    <div class="modal-icon">📊</div>
                    <h2>Создать опрос</h2>
                </div>
                <button class="modern-close-btn" onclick="closeCreatePollModal()" aria-label="Закрыть">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <form id="createPollForm" onsubmit="event.preventDefault(); createPoll();">
                <div class="modern-modal-body">
                    <!-- Question Field -->
                    <div class="modern-form-group">
                        <label class="modern-label">
                            <span class="label-icon">❓</span>
                            <span class="label-text">Вопрос опроса <span class="required">*</span></span>
                        </label>
                        <input
                            type="text"
                            id="pollQuestion"
                            class="modern-input"
                            placeholder="Например: Когда удобнее провести встречу?"
                            required
                            maxlength="500"
                        >
                        <div class="input-hint">Максимум 500 символов</div>
                    </div>

                    <!-- Options Field -->
                    <div class="modern-form-group">
                        <label class="modern-label">
                            <span class="label-icon">📝</span>
                            <span class="label-text">Варианты ответов <span class="required">*</span></span>
                        </label>
                        <div id="pollOptionsContainer" class="options-container">
                            <!-- Options will be added here -->
                        </div>
                        <button
                            type="button"
                            class="add-option-btn"
                            onclick="addPollOption()"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Добавить вариант
                        </button>
                        <div class="input-hint">Минимум 2 варианта, максимум 10</div>
                    </div>

                    <!-- Settings Card -->
                    <div class="settings-card">
                        <div class="settings-header">
                            <span class="label-icon">⚙️</span>
                            <span class="settings-title">Настройки опроса</span>
                        </div>

                        <div class="settings-options">
                            <label class="modern-checkbox">
                                <input type="checkbox" id="pollMultipleChoice">
                                <span class="checkbox-custom"></span>
                                <div class="checkbox-label">
                                    <span class="checkbox-title">Множественный выбор</span>
                                    <span class="checkbox-desc">Участники смогут выбрать несколько вариантов</span>
                                </div>
                            </label>

                            <label class="modern-checkbox">
                                <input type="checkbox" id="pollAnonymous">
                                <span class="checkbox-custom"></span>
                                <div class="checkbox-label">
                                    <span class="checkbox-title">Анонимное голосование</span>
                                    <span class="checkbox-desc">Имена проголосовавших не будут видны</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- Auto-close Field -->
                    <div class="modern-form-group">
                        <label class="modern-label">
                            <span class="label-icon">⏰</span>
                            <span class="label-text">Автоматическое закрытие (опционально)</span>
                        </label>
                        <input
                            type="datetime-local"
                            id="pollClosesAt"
                            class="modern-input"
                        >
                        <div class="input-hint">Опрос автоматически закроется в указанное время</div>
                    </div>
                </div>

                <div class="modern-modal-footer">
                    <button type="button" class="btn-cancel" onclick="closeCreatePollModal()">
                        Отмена
                    </button>
                    <button type="submit" class="btn-primary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Создать опрос
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    // Add initial options
    addPollOption();
    addPollOption();
}

function closeCreatePollModal() {
    const modal = document.getElementById('createPollModal');
    if (modal) modal.remove();
}

function addPollOption() {
    const container = document.getElementById('pollOptionsContainer');
    const optionsCount = container.querySelectorAll('.poll-option-wrapper').length;

    if (optionsCount >= 10) {
        alert('Максимум 10 вариантов ответа');
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'poll-option-wrapper';
    wrapper.innerHTML = `
        <div class="option-number">${optionsCount + 1}</div>
        <input
            type="text"
            class="poll-option-input modern-input"
            placeholder="Введите вариант ответа"
            required
            maxlength="200"
        >
        <button
            type="button"
            class="remove-option-btn"
            onclick="removePollOption(this)"
            aria-label="Удалить вариант"
            ${optionsCount < 2 ? 'style="visibility: hidden;"' : ''}
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    container.appendChild(wrapper);
    updateOptionNumbers();
}

function removePollOption(button) {
    const wrapper = button.closest('.poll-option-wrapper');
    const container = document.getElementById('pollOptionsContainer');

    // Don't allow removing if only 2 options left
    const optionsCount = container.querySelectorAll('.poll-option-wrapper').length;
    if (optionsCount <= 2) {
        alert('Минимум 2 варианта ответа');
        return;
    }

    wrapper.remove();
    updateOptionNumbers();
}

function updateOptionNumbers() {
    const container = document.getElementById('pollOptionsContainer');
    const wrappers = container.querySelectorAll('.poll-option-wrapper');

    wrappers.forEach((wrapper, index) => {
        const numberSpan = wrapper.querySelector('.option-number');
        if (numberSpan) {
            numberSpan.textContent = index + 1;
        }

        // Show/hide remove button based on count
        const removeBtn = wrapper.querySelector('.remove-option-btn');
        if (removeBtn) {
            removeBtn.style.visibility = wrappers.length <= 2 ? 'hidden' : 'visible';
        }
    });
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

    const selectedChatId = window.selectedChatId;
    if (!selectedChatId) {
        alert('Выберите чат для создания опроса');
        return;
    }

    try {
        const response = await fetch(`${window.API_URL}/polls`, {
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
        window.showToast('✅ Опрос создан успешно', 'success');

        // Reload messages to show the poll
        if (typeof window.loadMessages === 'function') {
            window.loadMessages(selectedChatId);
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
        const response = await fetch(`${window.API_URL}/polls/${pollId}/vote`, {
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
        window.showToast('✅ Голос учтен', 'success');

        // Clear temp votes
        delete tempPollVotes[pollId];

        // Update poll display
        if (data.poll && currentPollsData) {
            currentPollsData[pollId] = data.poll;
            // Reload messages to update display
            if (typeof window.loadMessages === 'function' && window.selectedChatId) {
                window.loadMessages(window.selectedChatId);
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
        const response = await fetch(`${window.API_URL}/polls/${pollId}/close`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to close poll');
        }

        window.showToast('✅ Опрос закрыт', 'success');

        // Reload messages
        if (typeof window.loadMessages === 'function' && window.selectedChatId) {
            window.loadMessages(window.selectedChatId);
        }

    } catch (error) {
        console.error('Close poll error:', error);
        alert('❌ Ошибка закрытия опроса: ' + error.message);
    }
}

function canClosePoll(poll) {
    const currentUser = window.currentUser;
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
window.removePollOption = removePollOption;
window.createPoll = createPoll;
window.renderPoll = renderPoll;
window.togglePollOption = togglePollOption;
window.submitPollVote = submitPollVote;
window.closePoll = closePoll;
window.canClosePoll = canClosePoll;

console.log('✅ Polls UI module loaded (Modern Edition)');
