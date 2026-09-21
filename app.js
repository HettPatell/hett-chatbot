/**
 * Hett — Simple Text Chatbot Logic
 * Clean typography, simple subtle emojis, no brackets.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const STATE = {
  theme: localStorage.getItem('hett_theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
  font: localStorage.getItem('hett_font') || 'sans',
  nickname: localStorage.getItem('hett_nickname') || 'User',
  aiMode: localStorage.getItem('hett_ai_mode') || 'groq',
  apiKey: localStorage.getItem('hett_api_key') || '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',
  modelName: localStorage.getItem('hett_model') || 'groq/compound-mini',
  isGenerating: false,
  messages: []
};

// ---------------------------------------------------------------------------
// DOM References
// ---------------------------------------------------------------------------
const DOM = {
  html: document.documentElement,
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  clearChatBtn: document.getElementById('clearChatBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  aiModeSelect: document.getElementById('aiModeSelect'),
  apiKeyGroup: document.getElementById('apiKeyGroup'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  modelGroup: document.getElementById('modelGroup'),
  modelInput: document.getElementById('modelInput'),
  userNickname: document.getElementById('userNickname'),
  fontSelect: document.getElementById('fontSelect'),
  chatLog: document.getElementById('chatLog'),
  typingIndicator: document.getElementById('typingIndicator'),
  chatForm: document.getElementById('chatForm'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),
  toast: document.getElementById('toast')
};

// ---------------------------------------------------------------------------
// Toast Notification
// ---------------------------------------------------------------------------
let toastTimeout = null;
function showToast(message) {
  DOM.toast.textContent = message;
  DOM.toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    DOM.toast.classList.add('hidden');
  }, 2600);
}

// ---------------------------------------------------------------------------
// Themes & Typography
// ---------------------------------------------------------------------------
function applyTheme(theme) {
  STATE.theme = theme;
  DOM.html.setAttribute('data-theme', theme);
  DOM.themeToggleBtn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
  localStorage.setItem('hett_theme', theme);
}

function toggleTheme() {
  const nextTheme = STATE.theme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
  showToast(`Switched to ${nextTheme === 'dark' ? '🌙 Dark' : '☀️ Light'} theme`);
}

function applyFont(font) {
  STATE.font = font;
  DOM.html.setAttribute('data-font', font);
  localStorage.setItem('hett_font', font);
}

// ---------------------------------------------------------------------------
// Markdown & Text Formatter
// ---------------------------------------------------------------------------
function formatText(raw) {
  if (!raw) return '';
  
  // Escape HTML
  let escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks: ```language code ```
  escaped = escaped.replace(/```([a-z]*)\n([\s\S]*?)```/gi, (match, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code: `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold: **text**
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italics: *text*
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  const lines = escaped.split('\n');
  let result = '';
  let inList = false;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        result += '<ul>';
        inList = true;
      }
      result += `<li>${trimmed.substring(2)}</li>`;
    } else {
      if (inList) {
        result += '</ul>';
        inList = false;
      }
      if (trimmed.length > 0) {
        if (!trimmed.startsWith('<pre') && !trimmed.endsWith('</pre>')) {
          result += `<p>${trimmed}</p>`;
        } else {
          result += trimmed;
        }
      }
    }
  });

  if (inList) result += '</ul>';
  return result;
}

// ---------------------------------------------------------------------------
// Message Rendering
// ---------------------------------------------------------------------------
function appendMessage(role, content) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isHett = role === 'assistant';

  const entry = document.createElement('article');
  entry.className = 'message-entry';

  // Header row
  const headerRow = document.createElement('div');
  headerRow.className = 'message-header-row';

  const author = document.createElement('span');
  author.className = `message-author ${isHett ? 'author-hett' : 'author-user'}`;
  author.textContent = isHett ? '🤖 Hett' : (STATE.nickname || '👤 You');

  const timeSpan = document.createElement('span');
  timeSpan.className = 'message-time';
  timeSpan.textContent = time;

  headerRow.appendChild(author);
  headerRow.appendChild(timeSpan);

  // Body
  const body = document.createElement('div');
  body.className = 'message-body';
  body.innerHTML = formatText(content);

  entry.appendChild(headerRow);
  entry.appendChild(body);

  // Copy Action
  if (isHett) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'mini-action-btn';
    copyBtn.textContent = '📋 Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(content).then(() => {
        showToast('Copied to clipboard');
      }).catch(() => {
        showToast('Failed to copy');
      });
    });

    actions.appendChild(copyBtn);
    entry.appendChild(actions);
  }

  DOM.chatLog.appendChild(entry);
  scrollToBottom();

  STATE.messages.push({ role, content, time });
}

function scrollToBottom() {
  DOM.chatLog.scrollTop = DOM.chatLog.scrollHeight;
}

function setTyping(isTyping) {
  if (isTyping) {
    DOM.typingIndicator.classList.remove('hidden');
    scrollToBottom();
  } else {
    DOM.typingIndicator.classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Built-in Text Conversational Engine
// ---------------------------------------------------------------------------
function generateOfflineResponse(userPrompt) {
  const query = userPrompt.toLowerCase().trim();
  const name = STATE.nickname || 'Friend';

  // Deployment inquiries
  if (query.includes('deploy') || query.includes('vercel') || query.includes('host') || query.includes('github')) {
    return `To deploy Hett to Vercel:\n\n1. Push this folder to a GitHub repository or drag the folder to Netlify Drop (app.netlify.com/drop).\n2. On Vercel (vercel.com), click "Add New Project" and import your repository.\n3. The included vercel.json file handles everything. Click "Deploy".\n\nYour deployment will be live in under 30 seconds! 🚀`;
  }

  // Identity / capabilities
  if (query.includes('who are you') || query.includes('what are you') || query.includes('capabilities') || query.includes('help')) {
    return `I am Hett, your clean and direct text-focused assistant. 💡\n\nHere is how I can help you:\n- Clear explanations and summaries without unnecessary fluff.\n- Structured markdown formatting (checklists, code snippets, outlines).\n- Fast, zero-dependency offline performance.\n- Support for live Gemini or OpenAI models via Settings!`;
  }

  // Email drafting
  if (query.includes('email') || query.includes('draft')) {
    return `Subject: Quick follow-up regarding our discussion\n\nHello [Name],\n\nI hope you are having a productive week.\n\nI am writing to follow up on our recent conversation regarding [Topic]. Please let me know if you have had a chance to review the details, or if there is anything else you need from my side.\n\nLooking forward to hearing from you.\n\nBest regards,\n${name}`;
  }

  // Checklist / Task organization
  if (query.includes('checklist') || query.includes('task') || query.includes('organize') || query.includes('schedule')) {
    return `Structured Daily Checklist: 📋\n\n1. Define Priority 1: Pick the single most impactful task for today.\n2. Deep Work: Allocate 60 to 90 minutes of quiet, focused time to that task.\n3. Communications: Batch emails and messages in one dedicated block.\n4. End-of-Day Review: Check off finished goals and plan your first move for tomorrow.`;
  }

  // Code / technical questions
  if (query.includes('code') || query.includes('javascript') || query.includes('python') || query.includes('html') || query.includes('css')) {
    return `Technical Overview: 💻\n\nHett is built using vanilla web standards:\n- HTML5 for semantic structure.\n- CSS3 custom variables for instant dark and light mode switching.\n- JavaScript for clean message rendering and state management.\n\nWhat specific code question would you like to explore?`;
  }

  // Greetings
  if (/^(hi|hello|hey|greetings|good morning|good afternoon)/i.test(query)) {
    const greetings = [
      `Hello, ${name}! 👋 How can I assist you today?`,
      `Greetings, ${name}! I am ready. What is on your mind?`,
      `Good day, ${name}! How can I help make your work smoother today?`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // Default fallback
  const genericReplies = [
    `Understood, ${name}. Here is a concise thought on that:\n\nWhen evaluating this topic, it helps to identify the primary objective before diving into the details. Where would you like to focus next?`,
    `Received. I have processed your input regarding "${userPrompt.slice(0, 45)}". Would you like a step-by-step breakdown, an outline, or a quick summary?`,
    `Noted, ${name}. Let me know if you would like me to draft or organize this further for you.`
  ];
  return genericReplies[Math.floor(Math.random() * genericReplies.length)];
}

// ---------------------------------------------------------------------------
// Live API Handlers
// ---------------------------------------------------------------------------
const SYSTEM_INSTRUCTION = `You are Hett, a direct, concise, and helpful assistant. Use simple, clean formatting and subtle emojis where appropriate. Do not use square brackets like [...] for UI buttons or formatting.`;

async function fetchGemini(prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${STATE.modelName || 'gemini-1.5-flash'}:generateContent?key=${STATE.apiKey}`;

  const contents = [
    {
      role: 'user',
      parts: [
        { text: `${SYSTEM_INSTRUCTION}\n\nUser Name: ${STATE.nickname}\nUser Message: ${prompt}` }
      ]
    }
  ];

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini error status ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini API.');
  return text;
}

async function fetchOpenAI(prompt) {
  const endpoint = 'https://api.openai.com/v1/chat/completions';

  const messages = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...STATE.messages.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    })),
    { role: 'user', content: prompt }
  ];

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${STATE.apiKey}`
    },
    body: JSON.stringify({
      model: STATE.modelName || 'gpt-4o-mini',
      messages,
      temperature: 0.6
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI error status ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenAI.');
  return text;
}

async function fetchGroq(prompt) {
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  const messages = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...STATE.messages.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    })),
    { role: 'user', content: prompt }
  ];

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${STATE.apiKey}`
    },
    body: JSON.stringify({
      model: STATE.modelName || 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.6
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq error status ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq API.');
  return text;
}

// ---------------------------------------------------------------------------
// Send Message Orchestrator
// ---------------------------------------------------------------------------
async function handleSend(rawText) {
  const text = rawText.trim();
  if (!text || STATE.isGenerating) return;

  DOM.userInput.value = '';
  DOM.userInput.style.height = 'auto';

  appendMessage('user', text);

  STATE.isGenerating = true;
  DOM.sendBtn.disabled = true;
  setTyping(true);

  try {
    let reply = '';
    if (STATE.aiMode === 'groq' && STATE.apiKey) {
      reply = await fetchGroq(text);
    } else if (STATE.aiMode === 'gemini' && STATE.apiKey) {
      reply = await fetchGemini(text);
    } else if (STATE.aiMode === 'openai' && STATE.apiKey) {
      reply = await fetchOpenAI(text);
    } else {
      const delay = Math.min(1000, Math.max(400, text.length * 15));
      await new Promise(r => setTimeout(r, delay));
      reply = generateOfflineResponse(text);
    }

    setTyping(false);
    appendMessage('assistant', reply);
  } catch (err) {
    setTyping(false);
    const fallback = generateOfflineResponse(text);
    appendMessage('assistant', `Note: Live API is currently unavailable (${err.message}). Here is a reply from the built-in companion:\n\n${fallback}`);
    showToast('Switched to built-in companion');
  } finally {
    STATE.isGenerating = false;
    DOM.sendBtn.disabled = false;
    DOM.userInput.focus();
  }
}

// ---------------------------------------------------------------------------
// Settings Modal
// ---------------------------------------------------------------------------
function openSettings() {
  DOM.aiModeSelect.value = STATE.aiMode;
  DOM.apiKeyInput.value = STATE.apiKey;
  DOM.modelInput.value = STATE.modelName;
  DOM.userNickname.value = STATE.nickname;
  DOM.fontSelect.value = STATE.font;
  updateSettingsUI();
  DOM.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  DOM.settingsModal.classList.add('hidden');
}

function updateSettingsUI() {
  const mode = DOM.aiModeSelect.value;
  const isLive = mode !== 'offline';
  DOM.apiKeyGroup.classList.toggle('hidden', !isLive);
  DOM.modelGroup.classList.toggle('hidden', !isLive);

  const engineHint = document.getElementById('engineHint');

  if (mode === 'groq') {
    if (engineHint) engineHint.textContent = 'Groq provides ultra-fast inference with Groq Compound & Qwen models.';
    DOM.apiKeyInput.placeholder = 'Paste your Groq API key (starts with gsk_...)';
    if (!DOM.modelInput.value || DOM.modelInput.value.includes('gemini') || DOM.modelInput.value.includes('gpt') || DOM.modelInput.value.includes('llama')) {
      DOM.modelInput.value = 'groq/compound-mini';
    }
  } else if (mode === 'gemini') {
    if (engineHint) engineHint.textContent = 'Google Gemini via Google AI Studio.';
    DOM.apiKeyInput.placeholder = 'Paste your Gemini API key...';
    if (!DOM.modelInput.value || DOM.modelInput.value.includes('compound') || DOM.modelInput.value.includes('gpt')) {
      DOM.modelInput.value = 'gemini-1.5-flash';
    }
  } else if (mode === 'openai') {
    if (engineHint) engineHint.textContent = 'OpenAI or OpenRouter compatible endpoint.';
    DOM.apiKeyInput.placeholder = 'Paste your OpenAI or OpenRouter key...';
    if (!DOM.modelInput.value || DOM.modelInput.value.includes('compound') || DOM.modelInput.value.includes('gemini')) {
      DOM.modelInput.value = 'gpt-4o-mini';
    }
  } else {
    if (engineHint) engineHint.textContent = 'The built-in engine operates locally without requiring an API key.';
  }
}

function saveSettings() {
  STATE.aiMode = DOM.aiModeSelect.value;
  STATE.apiKey = DOM.apiKeyInput.value.trim();

  let defaultModel = 'groq/compound-mini';
  if (STATE.aiMode === 'gemini') defaultModel = 'gemini-1.5-flash';
  if (STATE.aiMode === 'openai') defaultModel = 'gpt-4o-mini';

  STATE.modelName = DOM.modelInput.value.trim() || defaultModel;
  STATE.nickname = DOM.userNickname.value.trim() || 'User';
  STATE.font = DOM.fontSelect.value;

  localStorage.setItem('hett_ai_mode', STATE.aiMode);
  localStorage.setItem('hett_api_key', STATE.apiKey);
  localStorage.setItem('hett_model', STATE.modelName);
  localStorage.setItem('hett_nickname', STATE.nickname);
  
  applyFont(STATE.font);
  closeSettings();
  showToast('Preferences saved');
}

// ---------------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------------
function initEvents() {
  DOM.themeToggleBtn.addEventListener('click', toggleTheme);
  DOM.openSettingsBtn.addEventListener('click', openSettings);
  DOM.closeSettingsBtn.addEventListener('click', closeSettings);
  DOM.saveSettingsBtn.addEventListener('click', saveSettings);
  DOM.aiModeSelect.addEventListener('change', updateSettingsUI);

  DOM.settingsModal.addEventListener('click', (e) => {
    if (e.target === DOM.settingsModal) closeSettings();
  });

  DOM.clearChatBtn.addEventListener('click', () => {
    if (confirm('Clear the conversation log?')) {
      DOM.chatLog.innerHTML = '';
      STATE.messages = [];
      showToast('Conversation cleared');
    }
  });

  DOM.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSend(DOM.userInput.value);
  });

  DOM.userInput.addEventListener('input', () => {
    DOM.userInput.style.height = 'auto';
    DOM.userInput.style.height = `${Math.min(DOM.userInput.scrollHeight, 120)}px`;
  });

  DOM.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(DOM.userInput.value);
    }
  });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
function init() {
  applyTheme(STATE.theme);
  applyFont(STATE.font);
  initEvents();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
