/**
 * Hett — Multimodal Text & Vision Chatbot Logic
 * Features:
 * - Ultra-fast Groq Qwen 3.8 27B Vision + Text integration
 * - Automatic image resizing & canvas optimization for fast processing
 * - PDF document upload & client-side text extraction (pdf.js)
 * - Clipboard screenshot paste (Ctrl + V) & Drag-and-drop file upload
 * - Auto-repair of broken or outdated local storage settings
 */

// ---------------------------------------------------------------------------
// Model & API Auto-Repair / Initialization
// ---------------------------------------------------------------------------
const HARDCODED_GROQ_KEY = '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';
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';

// Auto-repair API Key
let currentKey = localStorage.getItem('hett_api_key');
if (!currentKey || currentKey.trim() === '' || currentKey === 'undefined' || currentKey === 'null') {
  currentKey = HARDCODED_GROQ_KEY;
  localStorage.setItem('hett_api_key', currentKey);
}

// Auto-repair Model (only qwen/qwen3.8-27b supports both Vision + Text on this Groq key)
let currentModel = localStorage.getItem('hett_model');
if (!currentModel || currentModel.includes('llama-3.3') || currentModel.includes('compound') || currentModel.includes('gemini') || currentModel.includes('gpt-4')) {
  currentModel = DEFAULT_MODEL;
  localStorage.setItem('hett_model', currentModel);
}

// Auto-repair AI Mode
let currentMode = localStorage.getItem('hett_ai_mode');
if (!currentMode || currentMode === 'offline' || (currentKey && currentKey.startsWith('gsk_'))) {
  currentMode = 'groq';
  localStorage.setItem('hett_ai_mode', 'groq');
}

const STATE = {
  theme: localStorage.getItem('hett_theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
  font: localStorage.getItem('hett_font') || 'sans',
  nickname: localStorage.getItem('hett_nickname') || 'User',
  aiMode: currentMode,
  apiKey: currentKey,
  modelName: currentModel,
  isGenerating: false,
  messages: [],
  currentAttachment: null // { type: 'image' | 'pdf', name: string, size: string, dataUrl?: string, text?: string, pages?: number }
};

// ---------------------------------------------------------------------------
// DOM References
// ---------------------------------------------------------------------------
const DOM = {
  html: document.documentElement,
  chatWrapper: document.querySelector('.chat-wrapper'),
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
  toast: document.getElementById('toast'),
  // Attachment Elements
  fileAttachmentInput: document.getElementById('fileAttachmentInput'),
  attachFileBtn: document.getElementById('attachFileBtn'),
  attachmentTray: document.getElementById('attachmentTray'),
  attachmentPreview: document.getElementById('attachmentPreview'),
  removeAttachmentBtn: document.getElementById('removeAttachmentBtn')
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
  }, 3200);
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
// Image Optimization & PDF Extraction
// ---------------------------------------------------------------------------
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/**
 * Optimizes an image using HTML5 Canvas:
 * - Ensures dimensions are at least 64x64 (Groq requires min 32px)
 * - Scales down excessively large images to max 1280px to avoid body size limits
 * - Compresses to lightweight JPEG/PNG Data URL
 */
function optimizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Ensure minimum 64px for Groq compatibility
        if (width < 64) width = 64;
        if (height < 64) height = 64;

        // Scale down if exceeds 1280px
        const maxDim = 1280;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Draw image onto canvas
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG with 0.88 quality
        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        resolve(optimizedDataUrl);
      };
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Extracts text from PDF files using Mozilla pdf.js
 */
async function extractTextFromPdf(file) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js library is loading. Please wait a moment and try again.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = '';
  const maxPagesToRead = Math.min(pdf.numPages, 30);

  for (let i = 1; i <= maxPagesToRead; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    if (pageText.trim().length > 0) {
      fullText += `[Page ${i}]\n${pageText}\n\n`;
    }
  }

  if (pdf.numPages > maxPagesToRead) {
    fullText += `\n[Note: Document truncated at page ${maxPagesToRead} of ${pdf.numPages}]\n`;
  }

  return {
    text: fullText.trim(),
    pages: pdf.numPages
  };
}

async function processSelectedFile(file) {
  if (!file) return;

  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!isImage && !isPdf) {
    showToast('Please attach an Image (PNG, JPG, WebP) or PDF file.');
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    showToast('File size exceeds 25MB limit.');
    return;
  }

  showToast('Reading file...');

  try {
    if (isImage) {
      const dataUrl = await optimizeImageFile(file);
      setAttachment({
        type: 'image',
        name: file.name || 'Image',
        size: formatFileSize(file.size),
        dataUrl: dataUrl
      });
      showToast('Image attached 📸');
    } else if (isPdf) {
      const { text, pages } = await extractTextFromPdf(file);
      setAttachment({
        type: 'pdf',
        name: file.name || 'Document.pdf',
        size: formatFileSize(file.size),
        text: text,
        pages: pages
      });
      showToast(`PDF attached 📄 (${pages} pages ready)`);
    }
  } catch (err) {
    console.error('File processing error:', err);
    showToast('Could not process file: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Attachment UI State & Tray
// ---------------------------------------------------------------------------
function setAttachment(attachment) {
  STATE.currentAttachment = attachment;
  DOM.attachmentPreview.innerHTML = '';

  if (attachment.type === 'image') {
    const img = document.createElement('img');
    img.src = attachment.dataUrl;
    img.className = 'preview-thumb';
    img.alt = attachment.name;

    const meta = document.createElement('div');
    meta.className = 'preview-meta';
    meta.innerHTML = `<span class="preview-name">${attachment.name}</span><span class="preview-details">Image • ${attachment.size}</span>`;

    DOM.attachmentPreview.appendChild(img);
    DOM.attachmentPreview.appendChild(meta);
  } else if (attachment.type === 'pdf') {
    const icon = document.createElement('span');
    icon.className = 'pdf-icon';
    icon.textContent = '📄';

    const meta = document.createElement('div');
    meta.className = 'preview-meta';
    meta.innerHTML = `<span class="preview-name">${attachment.name}</span><span class="preview-details">PDF • ${attachment.pages || 1} pages • ${attachment.size}</span>`;

    DOM.attachmentPreview.appendChild(icon);
    DOM.attachmentPreview.appendChild(meta);
  }

  DOM.attachmentTray.classList.remove('hidden');
  DOM.userInput.focus();
}

function clearAttachment() {
  STATE.currentAttachment = null;
  DOM.attachmentTray.classList.add('hidden');
  DOM.attachmentPreview.innerHTML = '';
  DOM.fileAttachmentInput.value = '';
}

// ---------------------------------------------------------------------------
// Markdown & Text Formatter
// ---------------------------------------------------------------------------
function formatText(raw) {
  if (!raw) return '';

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
function appendMessage(role, content, attachment = null) {
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

  // Body container
  const body = document.createElement('div');
  body.className = 'message-body';

  // Render attachment if present
  if (attachment) {
    if (attachment.type === 'image') {
      const img = document.createElement('img');
      img.src = attachment.dataUrl;
      img.className = 'msg-image-attachment';
      img.alt = attachment.name || 'Uploaded image';
      img.title = 'Click to open full size';
      img.addEventListener('click', () => {
        const win = window.open();
        if (win) {
          win.document.write(`<img src="${attachment.dataUrl}" style="max-width:100%;height:auto;margin:auto;display:block;">`);
        }
      });
      body.appendChild(img);
    } else if (attachment.type === 'pdf') {
      const pdfBadge = document.createElement('div');
      pdfBadge.className = 'msg-pdf-attachment';
      pdfBadge.innerHTML = `<span class="pdf-icon">📄</span> <div><strong>${attachment.name}</strong> (${attachment.pages || 1} pages)</div>`;
      body.appendChild(pdfBadge);
    }
  }

  // Text content
  if (content && content.trim().length > 0) {
    const textDiv = document.createElement('div');
    textDiv.innerHTML = formatText(content);
    body.appendChild(textDiv);
  }

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

  STATE.messages.push({ role, content, attachment, time });
}

function scrollToBottom() {
  DOM.chatLog.scrollTop = DOM.chatLog.scrollHeight;
}

function setTyping(isTyping, customText = 'Hett is thinking...') {
  if (isTyping) {
    DOM.typingIndicator.querySelector('.typing-text').textContent = customText;
    DOM.typingIndicator.classList.remove('hidden');
    scrollToBottom();
  } else {
    DOM.typingIndicator.classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Built-in Text Conversational Engine (Offline Fallback)
// ---------------------------------------------------------------------------
function generateOfflineResponse(userPrompt, attachment = null) {
  const query = (userPrompt || '').toLowerCase().trim();
  const name = STATE.nickname || 'Friend';

  if (attachment && attachment.type === 'image') {
    return `I received your image (**${attachment.name}**)! 📸\n\nTo get a full, deep AI description with vision analysis, ensure your Groq key is connected in ⚙️ **Settings**. In offline mode, I can confirm the image loaded successfully at ${attachment.size}.`;
  }

  if (attachment && attachment.type === 'pdf') {
    const snippet = (attachment.text || '').slice(0, 500);
    return `I received your PDF document (**${attachment.name}** with ${attachment.pages} pages)! 📄\n\n**Document Preview:**\n> ${snippet || 'No readable text layer found.'}\n\n*Connect your Groq key in ⚙️ Settings for in-depth intelligent analysis.*`;
  }

  if (/^(hi|hello|hey|greetings|good morning|good afternoon)/i.test(query)) {
    return `Hello, ${name}! 👋 How can I assist you today? You can ask questions, paste images directly with Ctrl+V, or upload PDFs with the 📎 button!`;
  }

  return `Understood, ${name}. I am running in offline mode. For full AI intelligence, deep image analysis, and PDF comprehension, connect your Groq API key in ⚙️ **Settings**!`;
}

// ---------------------------------------------------------------------------
// Live API Handlers (Groq Qwen 3.8 27B Vision & Text)
// ---------------------------------------------------------------------------
const SYSTEM_INSTRUCTION = `You are Hett, a direct, concise, and highly capable AI assistant.
- When an image is provided: Provide an exhaustive, deep, and complete description of everything in the image. Cover the main subject, background, text/words visible (OCR), colors, composition, setting, and notable details.
- When a PDF or document is provided: Read the extracted text carefully, answer the user's questions or provide a structured, clear summary with key takeaways.
- Keep tone direct, insightful, and well-structured using Markdown.`;

async function fetchGroq(prompt, attachment = null) {
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  // Build message history
  const messages = [
    { role: 'system', content: SYSTEM_INSTRUCTION }
  ];

  // Include recent conversation context
  STATE.messages.slice(-4).forEach(m => {
    if (m.content) {
      messages.push({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      });
    }
  });

  // Construct current user content
  let currentContent;

  if (attachment && attachment.type === 'image') {
    const userText = prompt && prompt.trim().length > 0 
      ? prompt 
      : "Please analyze this image thoroughly and provide a complete, detailed description of everything visible in it, including main objects, any text or labels, colors, and context.";

    currentContent = [
      { type: "text", text: userText },
      { type: "image_url", image_url: { url: attachment.dataUrl } }
    ];
  } else if (attachment && attachment.type === 'pdf') {
    const userText = prompt && prompt.trim().length > 0
      ? prompt
      : "Please read this attached PDF document carefully and provide a comprehensive summary, key findings, and highlight important points.";

    const textContent = attachment.text && attachment.text.length > 0 
      ? attachment.text.slice(0, 40000) 
      : "[Notice: No readable text could be extracted from this PDF. It might contain scanned images.]";

    currentContent = `Document Attached: ${attachment.name} (${attachment.pages} pages)\n\n--- Document Text Content ---\n${textContent}\n\n--- User Request ---\n${userText}`;
  } else {
    currentContent = prompt;
  }

  messages.push({ role: 'user', content: currentContent });

  // Guarantee key and model
  const apiKeyToUse = STATE.apiKey || HARDCODED_GROQ_KEY;
  const modelToUse = DEFAULT_MODEL; // qwen/qwen3.8-27b has full verified vision and text support

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKeyToUse}`
    },
    body: JSON.stringify({
      model: modelToUse,
      messages: messages,
      temperature: 0.6
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errMsg = err.error?.message || `Groq status ${res.status}: ${res.statusText}`;
    throw new Error(errMsg);
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
  const text = (rawText || '').trim();
  const attachment = STATE.currentAttachment;

  // Need either text or attachment
  if ((!text && !attachment) || STATE.isGenerating) return;

  // Reset inputs & tray
  DOM.userInput.value = '';
  DOM.userInput.style.height = 'auto';
  clearAttachment();

  // Show user bubble
  appendMessage('user', text, attachment);

  STATE.isGenerating = true;
  DOM.sendBtn.disabled = true;

  if (attachment && attachment.type === 'image') {
    setTyping(true, 'Hett is analyzing the image...');
  } else if (attachment && attachment.type === 'pdf') {
    setTyping(true, 'Hett is reading the PDF...');
  } else {
    setTyping(true, 'Hett is thinking...');
  }

  try {
    let reply = '';
    const key = STATE.apiKey || HARDCODED_GROQ_KEY;

    if (key) {
      reply = await fetchGroq(text, attachment);
    } else {
      const delay = Math.min(1200, Math.max(500, (text.length || 20) * 15));
      await new Promise(r => setTimeout(r, delay));
      reply = generateOfflineResponse(text, attachment);
    }

    setTyping(false);
    appendMessage('assistant', reply);
  } catch (err) {
    console.error('API call failed:', err);
    setTyping(false);
    const fallback = generateOfflineResponse(text, attachment);
    appendMessage('assistant', `⚠️ **API Error**: ${err.message}\n\n*Fallback response:*\n\n${fallback}`);
    showToast('API issue: ' + err.message.slice(0, 45));
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
  DOM.aiModeSelect.value = STATE.aiMode || 'groq';
  DOM.apiKeyInput.value = STATE.apiKey || HARDCODED_GROQ_KEY;
  DOM.modelInput.value = STATE.modelName || DEFAULT_MODEL;
  DOM.userNickname.value = STATE.nickname || 'User';
  DOM.fontSelect.value = STATE.font || 'sans';
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
    if (engineHint) engineHint.textContent = 'Groq delivers ultra-fast responses with native Vision (Images) and Text via Qwen 3.8 27B.';
    DOM.apiKeyInput.placeholder = 'Paste your Groq API key (starts with gsk_...)';
    DOM.modelInput.value = DEFAULT_MODEL;
  } else if (mode === 'gemini') {
    if (engineHint) engineHint.textContent = 'Google Gemini API with multimodal vision support.';
    DOM.apiKeyInput.placeholder = 'Paste your Gemini API key...';
    DOM.modelInput.value = 'gemini-1.5-flash';
  } else if (mode === 'openai') {
    if (engineHint) engineHint.textContent = 'OpenAI or compatible vision API endpoint.';
    DOM.apiKeyInput.placeholder = 'Paste your OpenAI key...';
    DOM.modelInput.value = 'gpt-4o-mini';
  } else {
    if (engineHint) engineHint.textContent = 'The built-in engine operates locally without requiring an API key.';
  }
}

function saveSettings() {
  STATE.aiMode = DOM.aiModeSelect.value;
  STATE.apiKey = DOM.apiKeyInput.value.trim() || HARDCODED_GROQ_KEY;
  STATE.modelName = DEFAULT_MODEL;
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
// Event Listeners Initialization
// ---------------------------------------------------------------------------
function initEvents() {
  // Theme Toggle
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
      clearAttachment();
      showToast('Conversation cleared');
    }
  });

  // Attach Button & File Input
  DOM.attachFileBtn.addEventListener('click', () => {
    DOM.fileAttachmentInput.click();
  });

  DOM.fileAttachmentInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) processSelectedFile(file);
  });

  DOM.removeAttachmentBtn.addEventListener('click', clearAttachment);

  // Form Submit
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

  // Clipboard Paste for Images (Ctrl + V)
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          e.preventDefault();
          processSelectedFile(blob);
          showToast('Image pasted from clipboard 📸');
          break;
        }
      }
    }
  });

  // Drag and Drop Files over Chat
  const dropZone = DOM.chatWrapper || document.body;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'dragend'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  }, false);
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
