const chatBox = document.getElementById('chat-box');
const inputBox = document.getElementById('input-box');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing');
const welcome = document.getElementById('welcome');
const conversationList = document.getElementById('conversation-list');
const newChatBtn = document.getElementById('new-chat-btn');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');

// ── Multi-conversation state ─────────────────────────────────
let currentConversationId = null;

// ── Helper: create a chat bubble ─────────────────────────────
function addMessage(text, type) {
    const bubble = document.createElement('div');
    bubble.classList.add('message', type);

    if (type === 'ai') {
        bubble.innerHTML = marked.parse(text);
    } else {
        bubble.textContent = text;
    }

    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ── Render conversation list in sidebar ──────────────────────
function renderConversationList(conversations) {
    conversationList.innerHTML = '';
    conversations.forEach(conv => {
        const tab = document.createElement('button');
        tab.className = 'conversation-tab' + (conv.id === currentConversationId ? ' active' : '');
        tab.dataset.id = conv.id;

        const title = document.createElement('span');
        title.className = 'tab-title';
        title.textContent = conv.title || 'New Chat';
        tab.appendChild(title);

        const del = document.createElement('button');
        del.className = 'tab-delete';
        del.title = 'Delete conversation';
        del.innerHTML = '&#x2715;';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
        });
        tab.appendChild(del);

        tab.addEventListener('click', () => switchConversation(conv.id));
        conversationList.appendChild(tab);
    });
}

// ── Switch to a different conversation ───────────────────────
async function switchConversation(convId) {
    currentConversationId = convId;

    document.querySelectorAll('.conversation-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.id === convId);
    });

    chatBox.innerHTML = '';
    sidebar.classList.remove('open');

    const token = getAuthToken();
    if (!token) return;

    try {
        const res = await fetch(`http://localhost:5000/conversations/${convId}/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.history && data.history.length > 0) {
            data.history.forEach(msg => {
                addMessage(msg.text, msg.role === 'user' ? 'user' : 'ai');
            });
        } else {
            chatBox.innerHTML = `
                <div class="welcome" id="welcome">
                    <h2>Hello!</h2>
                    <p>Ask me about finance, gaming, anime, or life advice.</p>
                </div>`;
        }
    } catch (err) {
        console.warn('Could not load conversation history:', err);
    }
}

// ── Create a new chat ────────────────────────────────────────
async function createNewChat() {
    const token = getAuthToken();
    if (!token) return;

    try {
        const res = await fetch('http://localhost:5000/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();
        if (data.id) {
            currentConversationId = data.id;
            await loadConversations();
            await switchConversation(data.id);
        }
    } catch (err) {
        console.warn('Could not create new chat:', err);
    }
}

// ── Delete a conversation ────────────────────────────────────
async function deleteConversation(convId) {
    const token = getAuthToken();
    if (!token) return;

    try {
        await fetch(`http://localhost:5000/conversations/${convId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const conversations = await fetchConversationsList();
        renderConversationList(conversations);

        if (convId === currentConversationId) {
            if (conversations.length > 0) {
                await switchConversation(conversations[0].id);
            } else {
                currentConversationId = null;
                chatBox.innerHTML = `
                    <div class="welcome" id="welcome">
                        <h2>Hello!</h2>
                        <p>Start a new chat to begin.</p>
                    </div>`;
            }
        }
    } catch (err) {
        console.warn('Could not delete conversation:', err);
    }
}

// ── Fetch conversations list from API ────────────────────────
async function fetchConversationsList() {
    const token = getAuthToken();
    if (!token) return [];
    try {
        const res = await fetch('http://localhost:5000/conversations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        return data.conversations || [];
    } catch (err) {
        console.warn('Could not fetch conversations:', err);
        return [];
    }
}

// ── Load conversations on login (called by auth.js) ──────────
async function loadConversations() {
    const conversations = await fetchConversationsList();
    renderConversationList(conversations);

    if (conversations.length > 0) {
        await switchConversation(conversations[0].id);
    } else {
        currentConversationId = null;
        chatBox.innerHTML = `
            <div class="welcome" id="welcome">
                <h2>Hello!</h2>
                <p>Start a new chat to begin.</p>
            </div>`;
    }
}

// ── Send a message ───────────────────────────────────────────
async function sendMessage() {
    const message = inputBox.value.trim();
    if (!message) return;

    const token = getAuthToken();
    if (!token) {
        addMessage('You must be logged in to chat.', 'error');
        return;
    }

    // Auto-create conversation if none active
    if (!currentConversationId) {
        try {
            const res = await fetch('http://localhost:5000/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            if (data.id) {
                currentConversationId = data.id;
            } else {
                addMessage('Could not create a new conversation.', 'error');
                return;
            }
        } catch (err) {
            addMessage('Could not reach the server.', 'error');
            return;
        }
    }

    const welcomeEl = document.getElementById('welcome');
    if (welcomeEl) welcomeEl.style.display = 'none';

    addMessage(message, 'user');
    inputBox.value = '';

    typingIndicator.classList.add('visible');
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const response = await fetch('http://localhost:5000/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message, conversationId: currentConversationId })
        });

        const data = await response.json();
        typingIndicator.classList.remove('visible');

        if (data.error) {
            addMessage(data.error, 'error');
            return;
        }
        if (data.response) {
            addMessage(data.response, 'ai');
        } else {
            addMessage('No response from server', 'error');
        }

        // If the backend returned an updated title, refresh sidebar
        if (data.title) {
            await loadConversations();
            document.querySelectorAll('.conversation-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.id === currentConversationId);
            });
        }
    } catch (err) {
        typingIndicator.classList.remove('visible');
        addMessage('Could not reach the server. Is it running?', 'error');
    }
}

// ── Event listeners ──────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);
inputBox.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

newChatBtn.addEventListener('click', createNewChat);

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
});

