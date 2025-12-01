/*
 * Lightweight tests for notification helpers without external dependencies.
 */

const assert = require('assert');

class FakeClassList {
    constructor() {
        this.set = new Set();
    }
    add(...cls) { cls.forEach(c => this.set.add(c)); }
    remove(...cls) { cls.forEach(c => this.set.delete(c)); }
    toggle(cls, force) {
        if (force === undefined) {
            if (this.set.has(cls)) { this.set.delete(cls); return false; }
            this.set.add(cls); return true;
        }
        force ? this.set.add(cls) : this.set.delete(cls);
        return force;
    }
    contains(cls) { return this.set.has(cls); }
}

class FakeElement {
    constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.classList = new FakeClassList();
        this.style = {};
        this.eventHandlers = {};
        this._className = '';
        this._id = '';
    }
    set className(val) {
        this._className = val;
        this.classList.set = new Set(val.split(/\s+/).filter(Boolean));
    }
    get className() { return this._className; }
    set id(val) { this._id = val; }
    get id() { return this._id; }
    appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }
    remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(c => c !== this);
        this.parentNode = null;
    }
    addEventListener(type, handler) {
        this.eventHandlers[type] = this.eventHandlers[type] || [];
        this.eventHandlers[type].push(handler);
    }
    querySelectorAll(selector) {
        const matches = (el) => {
            if (selector === '.toast') return el.classList.contains('toast');
            if (selector === '#toastContainer') return el.id === 'toastContainer';
            return false;
        };
        const result = [];
        const traverse = (el) => {
            if (matches(el)) result.push(el);
            el.children.forEach(traverse);
        };
        this.children.forEach(traverse);
        return result;
    }
    contains(el) {
        if (this === el) return true;
        return this.children.some(child => child.contains ? child.contains(el) : child === el);
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeElement('body');
    }
    createElement(tag) { return new FakeElement(tag); }
    getElementById(id) {
        const search = (el) => {
            if (el.id === id) return el;
            for (const child of el.children) {
                const found = search(child);
                if (found) return found;
            }
            return null;
        };
        return search(this.body);
    }
}

(async () => {
    global.document = new FakeDocument();
    global.window = { document: global.document };
    global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

    let playCount = 0;
    class FakeAudio {
        constructor(src) { this.src = src; }
        play() { playCount += 1; return Promise.resolve(); }
    }
    global.Audio = FakeAudio;

    function MockNotification(title, opts) {
        MockNotification.last = { title, opts };
        return { close() {} };
    }
    MockNotification.permission = 'granted';
    global.Notification = MockNotification;

    const notifications = require('../public/js/notifications');

    // ensure toast container is created
    const container = notifications.ensureToastContainer();
    assert(container && container.id === 'toastContainer', 'Toast container should exist');

    // show toast and ensure it disappears
    notifications.showToast('Привет', 'info', { duration: 50 });
    await new Promise(res => setTimeout(res, 400));
    const activeToasts = document.body.querySelectorAll('.toast');
    assert.strictEqual(activeToasts.length, 0, 'Toast should auto-remove');

    // sound should be played once
    await notifications.playNotificationSound();
    assert.strictEqual(playCount, 1, 'Notification sound should play');

    // browser notification emitted
    notifications.showBrowserNotification({ title: 'Ping', body: 'Test', tag: 't1' });
    assert(MockNotification.last && MockNotification.last.title === 'Ping', 'Browser notification should be created');

    console.log('✅ notifications.test.js passed');
})();
