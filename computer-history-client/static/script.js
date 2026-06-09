// ── Constants ─────────────────────────────────────────────────────────────────
const SESSIONS_KEY    = 'computing-history-sessions';
const ACTIVE_KEY      = 'computing-history-active';
const THEME_KEY       = 'computing-history-theme';
const SIDEBAR_KEY     = 'computing-history-sidebar';
const MAX_HISTORY     = 3; // must match agent_client.py max_history

// ── DOM elements ──────────────────────────────────────────────────────────────
const messageInput     = document.getElementById('messageInput');
const sendBtn          = document.getElementById('sendBtn');
const chatMessages     = document.getElementById('chatMessages');
const resetBtn         = document.getElementById('resetBtn');
const themeToggleBtn   = document.getElementById('themeToggleBtn');
const themeIcon        = document.getElementById('themeIcon');
const clearConfirm     = document.getElementById('clearConfirm');
const clearConfirmYes  = document.getElementById('clearConfirmYes');
const clearConfirmNo   = document.getElementById('clearConfirmNo');
const exportBtn        = document.getElementById('exportBtn');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const sidebar          = document.getElementById('sidebar');
const sessionList      = document.getElementById('sessionList');
const newChatBtn       = document.getElementById('newChatBtn');
const contextIndicator = document.getElementById('contextIndicator');

// Runtime state
let backendContextCount = 0;  // exchanges currently held by backend

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    themeToggleBtn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    themeToggleBtn.setAttribute('aria-label', themeToggleBtn.title);
}

function initTheme() {
    const saved     = localStorage.getItem(THEME_KEY);
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(saved || preferred);
}

themeToggleBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
});

// ── Sidebar ───────────────────────────────────────────────────────────────────
function setSidebarOpen(open) {
    sidebar.classList.toggle('open', open);
    sidebar.setAttribute('aria-hidden', String(!open));
    sidebarToggleBtn.setAttribute('aria-expanded', String(open));
    try { localStorage.setItem(SIDEBAR_KEY, open ? '1' : '0'); } catch (e) {}
}

sidebarToggleBtn.addEventListener('click', () => {
    setSidebarOpen(!sidebar.classList.contains('open'));
});

function initSidebar() {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    setSidebarOpen(saved === '1');
}

// ── Session storage helpers ───────────────────────────────────────────────────
function loadSessions() {
    try {
        const raw = localStorage.getItem(SESSIONS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}

function saveSessions(sessions) {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch (e) {}
}

function getActiveSessionId() {
    return localStorage.getItem(ACTIVE_KEY) || null;
}

function setActiveSessionId(id) {
    if (id) {
        try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {}
    } else {
        try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getActiveSession() {
    const id = getActiveSessionId();
    if (!id) return null;
    return loadSessions().find(s => s.id === id) || null;
}

function upsertSession(session) {
    const sessions = loadSessions();
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) {
        sessions[idx] = session;
    } else {
        sessions.unshift(session);
    }
    saveSessions(sessions);
}

function appendMessageToSession(sessionId, entry) {
    const sessions = loadSessions();
    const session  = sessions.find(s => s.id === sessionId);
    if (!session) return;
    session.messages.push(entry);
    // Derive title from first user message
    if (!session.title) {
        const firstUser = session.messages.find(m => m.sender === 'user');
        if (firstUser) session.title = firstUser.text.slice(0, 42).trim();
    }
    saveSessions(sessions);
}

// ── Session list rendering ────────────────────────────────────────────────────
function renderSessionList() {
    const sessions   = loadSessions().filter(s => s.messages.some(m => m.sender === 'user'));
    const activeId   = getActiveSessionId();

    if (sessions.length === 0) {
        sessionList.innerHTML = '<p class="session-empty">No previous conversations yet.</p>';
        return;
    }

    sessionList.innerHTML = '';
    sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'session-item' + (session.id === activeId ? ' active' : '');
        item.setAttribute('role', 'listitem');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', `Conversation: ${session.title || 'Untitled'}`);
        item.dataset.sessionId = session.id;

        const title = document.createElement('div');
        title.className = 'session-item-title';
        title.textContent = session.title || 'Untitled';

        const meta = document.createElement('div');
        meta.className = 'session-item-meta';
        meta.textContent = formatDate(session.createdAt);

        item.appendChild(title);
        item.appendChild(meta);

        item.addEventListener('click', () => switchToSession(session.id));
        item.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchToSession(session.id); }
        });

        sessionList.appendChild(item);
    });
}

function formatDate(iso) {
    if (!iso) return '';
    const d   = new Date(iso);
    const now = new Date();
    const diffMs   = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7)   return `${diffDays} days ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Switch between sessions ───────────────────────────────────────────────────
function switchToSession(id) {
    setActiveSessionId(id);
    backendContextCount = 0;

    // Reset backend context — it won't have this old session's history
    fetch('/reset', { method: 'POST' }).catch(() => {});

    const session = loadSessions().find(s => s.id === id);
    if (!session) return;

    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();
    chatMessages.innerHTML = '';

    session.messages.forEach(({ text, sender, isHtml }) => {
        addMessage(text, sender, { isHtml: !!isHtml }, false);
    });

    updateContextIndicator();
    renderSessionList();
    messageInput.focus();
}

// ── New chat ──────────────────────────────────────────────────────────────────
function startNewSession() {
    setActiveSessionId(null);
    backendContextCount = 0;
    fetch('/reset', { method: 'POST' }).catch(() => {});
    chatMessages.innerHTML = WELCOME_HTML;
    attachChipListeners();
    updateContextIndicator();
    renderSessionList();
    messageInput.focus();
}

newChatBtn.addEventListener('click', startNewSession);

// ── Clear / reset ─────────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
    clearConfirm.hidden = false;
    resetBtn.hidden = true;
    clearConfirmNo.focus();
});

clearConfirmNo.addEventListener('click', () => {
    clearConfirm.hidden = true;
    resetBtn.hidden = false;
    resetBtn.focus();
});

clearConfirmYes.addEventListener('click', () => {
    clearConfirm.hidden = true;
    resetBtn.hidden = false;

    // Delete the active session from storage before starting fresh
    const activeId = getActiveSessionId();
    if (activeId) {
        const sessions = loadSessions().filter(s => s.id !== activeId);
        saveSessions(sessions);
    }

    startNewSession();
    announce('Conversation cleared');
});

// ── Context visibility indicator ──────────────────────────────────────────────
function updateContextIndicator() {
    const active = Math.min(backendContextCount, MAX_HISTORY);
    if (backendContextCount === 0) {
        contextIndicator.hidden = true;
    } else {
        contextIndicator.hidden = false;
        contextIndicator.textContent = `${active} / ${MAX_HISTORY} exchanges in context`;
    }
}

// ── Export conversation ───────────────────────────────────────────────────────
exportBtn.addEventListener('click', () => {
    const session = getActiveSession();
    const messages = session ? session.messages : [];

    if (!messages.some(m => m.sender === 'user')) {
        announce('Nothing to export yet');
        return;
    }

    const title = session?.title || 'Conversation';
    const dateStr = new Date().toLocaleString();
    const divider = '═'.repeat(52);

    let text = `COMPUTING HISTORY AGENT — CONVERSATION EXPORT\n`;
    text += `Topic:    ${title}\n`;
    text += `Exported: ${dateStr}\n`;
    text += `${divider}\n\n`;

    messages.forEach(({ text: msgText, sender, isHtml }) => {
        const label = sender === 'user' ? '[YOU]' : '[AGENT]';
        const content = isHtml ? stripHtml(msgText) : msgText;
        text += `${label}\n${content.trim()}\n\n`;
    });

    const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `computing-history-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    announce('Conversation exported');
});

function stripHtml(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || '';
    } catch (e) {
        return html.replace(/<[^>]*>/g, '');
    }
}

// ── Send message ──────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // Ensure there's an active session; create one lazily on first message
    let activeId = getActiveSessionId();
    if (!activeId) {
        activeId = generateId();
        const newSession = { id: activeId, title: '', createdAt: new Date().toISOString(), messages: [] };
        upsertSession(newSession);
        setActiveSessionId(activeId);
    }

    addMessage(message, 'user');
    messageInput.value = '';
    setInputDisabled(true);

    const typingEl = addTypingIndicator();

    fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw { status: response.status, message: data.error || 'Unknown server error' };
            });
        }
        return response.json();
    })
    .then(data => {
        typingEl.remove();
        if (data.response_html) {
            addMessage(data.response_html, 'agent', { isHtml: true });
        } else {
            addMessage(data.response, 'agent');
        }
        backendContextCount++;
        updateContextIndicator();
        renderSessionList();
        setInputDisabled(false);
        messageInput.focus();
    })
    .catch(err => {
        typingEl.remove();
        addErrorMessage(err);
        setInputDisabled(false);
        messageInput.focus();
    });
}

// ── Error handling ────────────────────────────────────────────────────────────
function classifyError(err) {
    if (!err || err instanceof TypeError || err?.message === 'Failed to fetch') {
        return { icon: '📡', title: 'Connection error', detail: 'Unable to reach the agent. Check your network and try again.', canRetry: true };
    }
    if (err.status === 500) {
        return { icon: '⚙️', title: 'Server error', detail: 'The agent encountered an internal problem. Please try again.', canRetry: true };
    }
    if (err.status === 400) {
        return { icon: '✏️', title: 'Invalid request', detail: err.message || 'Your message could not be processed.', canRetry: false };
    }
    return { icon: '⚠️', title: 'Something went wrong', detail: err.message || 'An unexpected error occurred.', canRetry: true };
}

function addErrorMessage(err) {
    const { icon, title, detail, canRetry } = classifyError(err);

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message agent';
    messageDiv.setAttribute('role', 'article');
    messageDiv.setAttribute('aria-label', 'Error message');

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '🤖';

    const content = document.createElement('div');
    content.className = 'message-content error-content';

    const body = document.createElement('div');
    body.className = 'error-body';
    body.innerHTML = `
        <div><span class="error-icon" aria-hidden="true">${icon}</span> <strong>${escapeHtml(title)}</strong></div>
        <div>${escapeHtml(detail)}</div>`;

    if (canRetry) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'retry-btn';
        retryBtn.textContent = '↺ Retry';
        retryBtn.setAttribute('aria-label', 'Retry the last message');
        retryBtn.addEventListener('click', () => {
            const userMessages = chatMessages.querySelectorAll('.message.user');
            const lastUser = userMessages[userMessages.length - 1];
            if (lastUser) {
                const el = lastUser.querySelector('.message-content');
                if (el) messageInput.value = el.innerText || el.textContent;
            }
            messageDiv.remove();
            messageInput.focus();
        });
        body.appendChild(retryBtn);
    }

    content.appendChild(body);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

// ── addMessage ────────────────────────────────────────────────────────────────
function addMessage(text, sender, options = {}, persist = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.setAttribute('role', 'article');
    messageDiv.setAttribute('aria-label', `${sender === 'user' ? 'User' : 'Agent'} message`);

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = sender === 'user' ? '👤' : '🤖';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = options.isHtml ? text : renderMessageContent(text);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    if (sender === 'agent') {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.title = 'Copy to clipboard';
        copyBtn.setAttribute('aria-label', 'Copy message to clipboard');
        copyBtn.textContent = '⎘';
        copyBtn.addEventListener('click', () => {
            const plain = content.innerText || content.textContent;
            navigator.clipboard.writeText(plain).then(() => {
                copyBtn.textContent = '✓';
                copyBtn.classList.add('copied');
                setTimeout(() => { copyBtn.textContent = '⎘'; copyBtn.classList.remove('copied'); }, 1500);
            }).catch(() => {
                copyBtn.textContent = '✗';
                setTimeout(() => { copyBtn.textContent = '⎘'; }, 1500);
            });
        });
        messageDiv.appendChild(copyBtn);
    }

    chatMessages.appendChild(messageDiv);
    scrollToBottom();
    setTimeout(scrollToBottom, 100);

    if (persist) {
        const activeId = getActiveSessionId();
        if (activeId) {
            appendMessageToSession(activeId, { text, sender, isHtml: options.isHtml || false });
        }
    }
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function addTypingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message agent';
    messageDiv.id = 'typing-indicator';
    messageDiv.setAttribute('role', 'status');
    messageDiv.setAttribute('aria-label', 'Agent is thinking');
    messageDiv.setAttribute('aria-live', 'polite');

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '🤖';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = `
        <div class="typing-row" aria-hidden="true">
            <div class="typing-indicator"><span></span><span></span><span></span></div>
            <span class="typing-label">Agent is thinking…</span>
        </div>`;

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function setInputDisabled(disabled) {
    messageInput.disabled = disabled;
    sendBtn.disabled      = disabled;
    sendBtn.setAttribute('aria-busy', String(disabled));
    messageInput.setAttribute('aria-busy', String(disabled));
}

function scrollToBottom() { chatMessages.scrollTop = chatMessages.scrollHeight; }

function announce(text) {
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.className = 'sr-only';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ── Markdown rendering ────────────────────────────────────────────────────────
function renderMessageContent(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n');
    const markedLib  = resolveMarkedLibrary();
    const purifyLib  = resolvePurifyLibrary();
    if (!markedLib || !purifyLib) return renderFallbackMarkdown(normalized);

    const renderer = new markedLib.Renderer();
    renderer.link = (hrefOrToken, title, textValue) => {
        let href = hrefOrToken, linkTitle = title, textContent = textValue;
        if (hrefOrToken && typeof hrefOrToken === 'object') {
            href = hrefOrToken.href; linkTitle = hrefOrToken.title;
            textContent = markedLib.Parser && hrefOrToken.tokens
                ? markedLib.Parser.parseInline(hrefOrToken.tokens) : hrefOrToken.text;
        }
        const safeHref  = href || '#';
        const safeTitle = linkTitle ? ` title="${escapeHtml(linkTitle)}"` : '';
        return `<a href="${safeHref}"${safeTitle} target="_blank" rel="noopener noreferrer">${textContent}</a>`;
    };

    markedLib.setOptions({ gfm: true, breaks: true, renderer });
    const rawHtml = markedLib.parse(normalized);
    return purifyLib.sanitize(rawHtml, {
        USE_PROFILES: { html: true },
        ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class']
    });
}

function resolveMarkedLibrary() {
    if (typeof marked === 'undefined' && typeof window === 'undefined') return null;
    const c = typeof marked !== 'undefined' ? marked : window.marked;
    if (!c) return null;
    if (typeof c.parse === 'function') return c;
    if (typeof c.marked === 'function') return { parse: c.marked, setOptions: c.setOptions?.bind(c) || (() => {}), Renderer: c.Renderer, Parser: c.Parser };
    if (typeof c === 'function') return { parse: c, setOptions: c.setOptions?.bind(c) || (() => {}), Renderer: c.Renderer, Parser: c.Parser };
    return null;
}

function resolvePurifyLibrary() {
    if (typeof DOMPurify !== 'undefined') return DOMPurify;
    if (typeof window !== 'undefined') {
        if (window.DOMPurify) return window.DOMPurify;
        if (window.dompurify?.sanitize) return window.dompurify;
    }
    return null;
}

function renderFallbackMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, _l, code) => `<pre><code>${code.trimEnd()}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return html.replace(/\n/g, '<br>');
}

// ── Welcome HTML (used on reset) ──────────────────────────────────────────────
const WELCOME_HTML = `
<div class="welcome-message" role="status">
    <p>Let's chat about computing history...</p>
    <div class="quick-prompts" aria-label="Suggested questions">
        <p class="quick-prompts-label">Try asking:</p>
        <div class="quick-prompts-chips">
            <button class="prompt-chip" data-prompt="What was the first computer ever built?">What was the first computer?</button>
            <button class="prompt-chip" data-prompt="Tell me about the history of the internet">History of the internet</button>
            <button class="prompt-chip" data-prompt="Who invented the transistor and why was it important?">Who invented the transistor?</button>
            <button class="prompt-chip" data-prompt="What is Moore's Law and is it still relevant today?">What is Moore's Law?</button>
            <button class="prompt-chip" data-prompt="Tell me about the history of personal computers in the 1980s">Personal computers in the 1980s</button>
            <button class="prompt-chip" data-prompt="Who were the pioneers of software programming?">Pioneers of software programming</button>
        </div>
    </div>
</div>`;

function attachChipListeners() {
    document.querySelectorAll('.prompt-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            messageInput.value = chip.dataset.prompt;
            messageInput.focus();
        });
    });
}

// Space-key accessibility for buttons
[resetBtn, themeToggleBtn, clearConfirmYes, clearConfirmNo, exportBtn, sidebarToggleBtn, newChatBtn].forEach(btn => {
    btn?.addEventListener('keydown', e => {
        if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); btn.click(); }
    });
});

// ── Restore active session on load ────────────────────────────────────────────
function restoreActiveSession() {
    const activeId = getActiveSessionId();
    if (!activeId) return;

    const session = loadSessions().find(s => s.id === activeId);
    if (!session || !session.messages.some(m => m.sender === 'user')) return;

    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    session.messages.forEach(({ text, sender, isHtml }) => {
        addMessage(text, sender, { isHtml: !!isHtml }, false);
    });
    // backendContextCount stays 0 — backend starts fresh on page load
}

// ── Init ──────────────────────────────────────────────────────────────────────
initTheme();
initSidebar();
attachChipListeners();
restoreActiveSession();
renderSessionList();
updateContextIndicator();
messageInput.focus();
