(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root || globalThis);
    } else {
        root.notificationUI = factory(root || window);
    }
})(typeof self !== 'undefined' ? self : this, function (root) {
    const doc = root && root.document ? root.document : null;
    const raf = (root && root.requestAnimationFrame) ? root.requestAnimationFrame.bind(root) : (fn) => setTimeout(fn, 0);

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    let toastContainer = null;
    function ensureToastContainer() {
        if (!doc) return null;
        if (toastContainer && doc.body.contains(toastContainer)) {
            return toastContainer;
        }
        toastContainer = doc.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = doc.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container';
            doc.body.appendChild(toastContainer);
        }
        return toastContainer;
    }

    function showToast(message, type = 'success', options = {}) {
        if (!doc) return null;
        const { duration = 4000 } = options;
        const container = ensureToastContainer();
        if (!container) return null;

        const toast = doc.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span class="toast-message">${escapeHtml(message)}</span>`;
        container.appendChild(toast);

        raf(() => toast.classList.add('visible'));

        const removeToast = () => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        };

        let hideTimer = setTimeout(removeToast, duration);

        toast.addEventListener('mouseenter', () => {
            clearTimeout(hideTimer);
        });

        toast.addEventListener('mouseleave', () => {
            hideTimer = setTimeout(removeToast, 800);
        });

        return toast;
    }

    // -------- Notification helpers --------
    function requestNotificationPermission() {
        if (!root || !root.Notification) return Promise.resolve('unsupported');
        if (Notification.permission === 'granted' || Notification.permission === 'denied') {
            return Promise.resolve(Notification.permission);
        }
        return Notification.requestPermission();
    }

    function showBrowserNotification({ title, body, tag = 'chat', data = {}, icon }) {
        if (!root || !root.Notification) return null;
        if (Notification.permission !== 'granted') return null;
        try {
            const notification = new Notification(title || 'Новое сообщение', {
                body: body || '',
                tag,
                data,
                icon: icon || '/favicon.ico'
            });
            return notification;
        } catch (err) {
            console.warn('[notificationUI] Notification error:', err);
            return null;
        }
    }

    let audioElement = null;
    const SOUND_SRC = 'data:audio/ogg;base64,T2dnUwACAAAAAAAAAADLMxQwAAAAANsYuXUBHgF2b3JiaXMAAAAAAkSsAAAAAAAAgN4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    function getAudioElement() {
        if (!root) return null;
        if (audioElement) return audioElement;
        if (typeof Audio === 'undefined') return null;
        audioElement = new Audio(SOUND_SRC);
        audioElement.preload = 'auto';
        audioElement.volume = 0.4;
        return audioElement;
    }

    async function playNotificationSound() {
        const audio = getAudioElement();
        if (!audio) return false;
        try {
            audio.currentTime = 0;
            await audio.play();
            return true;
        } catch (err) {
            console.warn('[notificationUI] Cannot play sound:', err.message || err);
            return false;
        }
    }

    return {
        ensureToastContainer,
        showToast,
        requestNotificationPermission,
        showBrowserNotification,
        playNotificationSound
    };
});
