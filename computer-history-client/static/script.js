// ── DOM elements ──────────────────────────────────────────────────────────────
const messageInput    = document.getElementById('messageInput');
const sendBtn         = document.getElementById('sendBtn');
const chatMessages    = document.getElementById('chatMessages');
const resetBtn        = document.getElementById('resetBtn');
const themeToggleBtn  = document.getElementById('themeToggleBtn');
const themeIcon       = document.getElementById('themeIcon');
const clearConfirm    = document.getElementById('clearConfirm');
const clearConfirmYes = document.getElementById('clearConfirmYes');
const clearConfirmNo  = document.getElementById('clearConfirmNo');

// ── Storage keys ──────────────────────────────────────────────────────────────
const CHAT_KEY  = 'computing-history-chat';
const THEME_KEY = 'computing-history-theme';

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    themeToggleBtn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    themeToggleBtn.setAttribute('aria-label', themeToggleBtn.title);
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(saved || preferred);
}

themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
});

// ── localStorage helpers ──────────────────────────────────────────────────────
function saveChat(messages) {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(messages)); } catch (e) {}
}

function loadChat() {
    try {
        const raw = localStorage.getItem(CHAT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function clearChat() {
    try { localStorage.removeItem(CHAT_KEY); } catch (e) {}
}

function getStoredMessages() { return loadChat() || []; }

function appendStoredMessage(entry) {
    const msgs = getStoredMessages();
    msgs.push(entry);
    saveChat(msgs);
}

// ── Welcome state helpers ──────────────────────────────────────────────────────
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

// ── Restore conversation on load ──────────────────────────────────────────────
function restoreConversation() {
    const messages = loadChat();
    if (!messages || messages.length === 0) return;
    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();
    messages.forEach(({ text, sender, isHtml }) => {
        addMessage(text, sender, { isHtml: !!isHtml }, false);
    });
}

// ── Clear / Reset ─────────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
    // Show inline confirmation
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

    fetch('/reset', { method: 'POST' })
        .then(r => r.json())
        .then(() => {
            clearChat();
            chatMessages.innerHTML = WELCOME_HTML;
            attachChipListeners();
            announce('Conversation cleared');
            messageInput.focus();
        })
        .catch(() => {
            announce('Error clearing conversation');
        });
});

// Space-key accessibility for toolbar buttons
[resetBtn, themeToggleBtn, clearConfirmYes, clearConfirmNo].forEach(btn => {
    btn.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); btn.click(); }
    });
});

// ── Send message ──────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); sendMessage(); }
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

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

// ── Error classification & display ────────────────────────────────────────────
function classifyError(err) {
    if (!err || err instanceof TypeError || err.message === 'Failed to fetch') {
        return {
            icon: '📡',
            title: 'Connection error',
            detail: 'Unable to reach the agent. Check your network connection and try again.',
            canRetry: true
        };
    }
    if (err.status === 500) {
        return {
            icon: '⚙️',
            title: 'Server error',
            detail: 'The agent encountered an internal problem. Please try again in a moment.',
            canRetry: true
        };
    }
    if (err.status === 400) {
        return {
            icon: '✏️',
            title: 'Invalid request',
            detail: err.message || 'Your message could not be processed.',
            canRetry: false
        };
    }
    return {
        icon: '⚠️',
        title: 'Something went wrong',
        detail: err.message || 'An unexpected error occurred.',
        canRetry: true
    };
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
        retryBtn.setAttribute('aria-label', 'Retry sending the last message');
        retryBtn.addEventListener('click', () => {
            // Re-fill input with last user message and remove the error bubble
            const userMessages = chatMessages.querySelectorAll('.message.user');
            const lastUser = userMessages[userMessages.length - 1];
            if (lastUser) {
                const lastText = lastUser.querySelector('.message-content');
                if (lastText) messageInput.value = lastText.innerText || lastText.textContent;
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

    if (options.isHtml === true) {
        content.innerHTML = text;
    } else {
        content.innerHTML = renderMessageContent(text);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    if (sender === 'agent') {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.title = 'Copy to clipboard';
        copyBtn.setAttribute('aria-label', 'Copy message to clipboard');
        copyBtn.textContent = '⎘';
        copyBtn.addEventListener('click', () => {
            const plainText = content.innerText || content.textContent;
            navigator.clipboard.writeText(plainText).then(() => {
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
        appendStoredMessage({ text, sender, isHtml: options.isHtml || false });
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

    const row = document.createElement('div');
    row.className = 'typing-row';
    row.setAttribute('aria-hidden', 'true');
    row.innerHTML = `
        <div class="typing-indicator"><span></span><span></span><span></span></div>
        <span class="typing-label">Agent is thinking…</span>`;

    content.appendChild(row);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function setInputDisabled(disabled) {
    messageInput.disabled = disabled;
    sendBtn.disabled = disabled;
    sendBtn.setAttribute('aria-busy', disabled ? 'true' : 'false');
    messageInput.setAttribute('aria-busy', disabled ? 'true' : 'false');
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

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
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Markdown rendering ────────────────────────────────────────────────────────
function renderMessageContent(text) {
    const normalizedText = String(text || '').replace(/\r\n/g, '\n');
    const markedLib = resolveMarkedLibrary();
    const purifyLib = resolvePurifyLibrary();
    if (!markedLib || !purifyLib) return renderFallbackMarkdown(normalizedText);

    const renderer = new markedLib.Renderer();
    renderer.link = (hrefOrToken, title, textValue) => {
        let href = hrefOrToken, linkTitle = title, textContent = textValue;
        if (hrefOrToken && typeof hrefOrToken === 'object') {
            href = hrefOrToken.href;
            linkTitle = hrefOrToken.title;
            textContent = markedLib.Parser && hrefOrToken.tokens
                ? markedLib.Parser.parseInline(hrefOrToken.tokens)
                : hrefOrToken.text;
        }
        const safeHref = href || '#';
        const safeTitle = linkTitle ? ` title="${escapeHtml(linkTitle)}"` : '';
        return `<a href="${safeHref}"${safeTitle} target="_blank" rel="noopener noreferrer">${textContent}</a>`;
    };

    markedLib.setOptions({ gfm: true, breaks: true, renderer });
    const rawHtml = markedLib.parse(normalizedText);
    return purifyLib.sanitize(rawHtml, {
        USE_PROFILES: { html: true },
        ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class']
    });
}

function resolveMarkedLibrary() {
    if (typeof marked === 'undefined' && typeof window === 'undefined') return null;
    const candidate = typeof marked !== 'undefined' ? marked : window.marked;
    if (!candidate) return null;
    if (typeof candidate.parse === 'function') return candidate;
    if (typeof candidate.marked === 'function') {
        return { parse: candidate.marked, setOptions: candidate.setOptions?.bind(candidate) || (() => {}), Renderer: candidate.Renderer, Parser: candidate.Parser };
    }
    if (typeof candidate === 'function') {
        return { parse: candidate, setOptions: candidate.setOptions?.bind(candidate) || (() => {}), Renderer: candidate.Renderer, Parser: candidate.Parser };
    }
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
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, _lang, code) => `<pre><code>${code.trimEnd()}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return html.replace(/\n/g, '<br>');
}

// ── Init ──────────────────────────────────────────────────────────────────────
initTheme();
attachChipListeners();
restoreConversation();
messageInput.focus();
