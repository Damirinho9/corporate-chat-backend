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

    // 🔥 FIX: Use Web Audio API to generate beep sound (works everywhere)
    let audioContext = null;

    function initAudioContext() {
        if (!audioContext && (window.AudioContext || window.webkitAudioContext)) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioContext;
    }

    function playNotificationSound() {
        try {
            const ctx = initAudioContext();
            if (!ctx) {
                console.warn('[notificationUI] Web Audio API not supported');
                return Promise.resolve(false);
            }

            // Resume context if suspended (required for autoplay policy)
            if (ctx.state === 'suspended') {
                return ctx.resume().then(() => {
                    return playBeep(ctx);
                }).catch(err => {
                    console.warn('[notificationUI] Cannot resume audio context:', err.message);
                    return false;
                });
            }

            return playBeep(ctx);
        } catch (err) {
            console.warn('[notificationUI] Sound error:', err.message || err);
            return Promise.resolve(false);
        }
    }

    function playBeep(ctx) {
        try {
            // Create oscillator (beep generator)
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            // Connect: oscillator -> gain -> output
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            // Configure beep sound
            oscillator.frequency.value = 800; // 800 Hz tone
            oscillator.type = 'sine'; // Smooth sine wave

            // Envelope: fade in and out to avoid clicks
            const now = ctx.currentTime;
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01); // Fade in
            gainNode.gain.linearRampToValueAtTime(0.3, now + 0.08); // Hold
            gainNode.gain.linearRampToValueAtTime(0, now + 0.12); // Fade out

            // Play for 120ms
            oscillator.start(now);
            oscillator.stop(now + 0.12);

            console.log('[notificationUI] Beep sound played');
            return Promise.resolve(true);
        } catch (err) {
            console.warn('[notificationUI] Beep generation error:', err.message);
            return Promise.resolve(false);
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
