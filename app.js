/**
 * Hett — Multimodal Chatbot with Live Streaming
 * Features:
 * - 100% Reliable Local PDF.js document reader (zero cross-origin worker blocks)
 * - Attachment Popover Menu on 📎 click (Image, PDF, Video, Audio)
 * - Real-time Word-by-Word Live Streaming (Groq SSE stream: true)
 * - Native Groq Audio Transcription (Whisper Large V3 Turbo)
 * - Native Groq Video Keyframe Vision & Video Player
 * - Auto-repair of broken or outdated local storage settings
 */

// ---------------------------------------------------------------------------
// Model & API Auto-Repair / Initialization
// ---------------------------------------------------------------------------
const HARDCODED_GROQ_KEY = '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';
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';

// Configure local PDF.js worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
}

// Auto-repair API Key
let currentKey = localStorage.getItem('hett_api_key');
if (!currentKey || currentKey.trim() === '' || currentKey === 'undefined' || currentKey === 'null') {
  currentKey = HARDCODED_GROQ_KEY;
  localStorage.setItem('hett_api_key', currentKey);
}

// Auto-repair Model
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
  currentAttachment: null // { type: 'image' | 'pdf' | 'video' | 'audio', name, size, dataUrl, text, pages, file, keyframeUrl }
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
  // Attachment Popover Menu & Inputs
  attachmentMenu: document.getElementById('attachmentMenu'),
  attachFileBtn: document.getElementById('attachFileBtn'),
  menuItemImage: document.getElementById('menuItemImage'),
  menuItemPdf: document.getElementById('menuItemPdf'),
  menuItemVideo: document.getElementById('menuItemVideo'),
  menuItemAudio: document.getElementById('menuItemAudio'),
  imageFileInput: document.getElementById('imageFileInput'),
  pdfFileInput: document.getElementById('pdfFileInput'),
  videoFileInput: document.getElementById('videoFileInput'),
  audioFileInput: document.getElementById('audioFileInput'),
  attachmentTray: document.getElementById('attachmentTray'),
  attachmentPreview: document.getElementById('attachmentPreview'),
  removeAttachmentBtn: document.getElementById('removeAttachmentBtn'),
  // Model Context Protocol (MCP) References
  mcpBtn: document.getElementById('mcpBtn'),
  mcpBadge: document.getElementById('mcpBadge'),
  mcpModal: document.getElementById('mcpModal'),
  closeMcpBtn: document.getElementById('closeMcpBtn'),
  closeMcpFooterBtn: document.getElementById('closeMcpFooterBtn'),
  mcpTabs: document.querySelectorAll('.mcp-tab'),
  mcpTabPanes: document.querySelectorAll('.mcp-tab-pane'),
  mcpServersList: document.getElementById('mcpServersList'),
  mcpActiveCountLabel: document.getElementById('mcpActiveCountLabel'),
  addMcpServerForm: document.getElementById('addMcpServerForm'),
  extServerName: document.getElementById('extServerName'),
  extServerUrl: document.getElementById('extServerUrl'),
  useLocalHostMcpBtn: document.getElementById('useLocalHostMcpBtn'),
  extServerTransport: document.getElementById('extServerTransport'),
  connectExtServerBtn: document.getElementById('connectExtServerBtn'),
  extServerFeedback: document.getElementById('extServerFeedback'),
  mcpMemoriesList: document.getElementById('mcpMemoriesList'),
  newMemoryKey: document.getElementById('newMemoryKey'),
  newMemoryValue: document.getElementById('newMemoryValue'),
  saveManualMemoryBtn: document.getElementById('saveManualMemoryBtn'),
  clearAllMemoriesBtn: document.getElementById('clearAllMemoriesBtn'),
  testerToolSelect: document.getElementById('testerToolSelect'),
  testerArgsInput: document.getElementById('testerArgsInput'),
  runTestToolBtn: document.getElementById('runTestToolBtn'),
  testerOutput: document.getElementById('testerOutput')
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
// File Pre-Processing (Image, PDF, Video, Audio)
// ---------------------------------------------------------------------------
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/**
 * Optimizes an image using HTML5 Canvas (min 64px, max 1280px)
 */
function optimizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width < 64) width = 64;
        if (height < 64) height = 64;

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
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Robust Client-Side PDF text extraction using local pdf.min.js & pdf.worker.min.js
 */
async function extractTextFromPdf(file) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js library is not available. Please refresh the page.');
  }

  // Ensure local worker is set
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true
  });

  const pdf = await loadingTask.promise;
  let fullText = '';
  const maxPagesToRead = Math.min(pdf.numPages, 30);

  for (let i = 1; i <= maxPagesToRead; i++) {
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      if (pageText.trim().length > 0) {
        fullText += `[Page ${i}]\n${pageText}\n\n`;
      }
    } catch (e) {
      console.warn(`Could not read page ${i}:`, e);
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

/**
 * Extracts a keyframe snapshot from a video file using HTML5 <video> & <canvas>
 */
function extractVideoKeyframe(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      // Seek to 25% of duration or 1s
      video.currentTime = Math.min(1.5, video.duration / 3);
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(640, video.videoWidth || 640);
      canvas.height = Math.round((canvas.width * (video.videoHeight || 360)) / (video.videoWidth || 640));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const keyframeDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({
        objectUrl: objectUrl,
        keyframeDataUrl: keyframeDataUrl,
        duration: Math.round(video.duration)
      });
    };

    video.onerror = () => {
      resolve({ objectUrl: objectUrl, keyframeDataUrl: null, duration: 0 });
    };
  });
}

// ---------------------------------------------------------------------------
// File Router & Processing
// ---------------------------------------------------------------------------
async function processSelectedFile(file, forcedType = null) {
  if (!file) return;

  hideAttachmentMenu();

  const isImage = forcedType === 'image' || file.type.startsWith('image/');
  const isPdf = forcedType === 'pdf' || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type === 'text/plain';
  const isVideo = forcedType === 'video' || file.type.startsWith('video/');
  const isAudio = forcedType === 'audio' || file.type.startsWith('audio/');

  if (!isImage && !isPdf && !isVideo && !isAudio) {
    showToast('Unsupported file type. Please attach an Image, PDF, Video, or Audio.');
    return;
  }

  showToast('Reading file...');

  try {
    if (isImage) {
      const dataUrl = await optimizeImageFile(file);
      setAttachment({
        type: 'image',
        name: file.name || 'Photo',
        size: formatFileSize(file.size),
        dataUrl: dataUrl
      });
      showToast('Image attached 📸');
    } else if (isPdf) {
      let text = '';
      let pages = 1;
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        text = await file.text();
      } else {
        const result = await extractTextFromPdf(file);
        text = result.text;
        pages = result.pages;
      }

      setAttachment({
        type: 'pdf',
        name: file.name || 'Document.pdf',
        size: formatFileSize(file.size),
        text: text,
        pages: pages
      });
      showToast(`PDF ready 📄 (${pages} pages extracted)`);
    } else if (isVideo) {
      const { objectUrl, keyframeDataUrl, duration } = await extractVideoKeyframe(file);
      setAttachment({
        type: 'video',
        name: file.name || 'Video',
        size: formatFileSize(file.size),
        objectUrl: objectUrl,
        keyframeUrl: keyframeDataUrl,
        duration: duration,
        file: file
      });
      showToast(`Video attached 🎥 (${duration}s)`);
    } else if (isAudio) {
      const objectUrl = URL.createObjectURL(file);
      setAttachment({
        type: 'audio',
        name: file.name || 'Audio',
        size: formatFileSize(file.size),
        objectUrl: objectUrl,
        file: file
      });
      showToast('Audio attached 🎵 (Ready to transcribe)');
    }
  } catch (err) {
    console.error('File process error:', err);
    showToast('Error reading file: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Attachment Tray Management
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
    meta.innerHTML = `<span class="preview-name">${attachment.name}</span><span class="preview-details">Document • ${attachment.pages || 1} pages • ${attachment.size}</span>`;

    DOM.attachmentPreview.appendChild(icon);
    DOM.attachmentPreview.appendChild(meta);
  } else if (attachment.type === 'video') {
    const icon = document.createElement('span');
    icon.className = 'pdf-icon';
    icon.textContent = '🎥';

    const meta = document.createElement('div');
    meta.className = 'preview-meta';
    meta.innerHTML = `<span class="preview-name">${attachment.name}</span><span class="preview-details">Video • ${attachment.duration || 0}s • ${attachment.size}</span>`;

    DOM.attachmentPreview.appendChild(icon);
    DOM.attachmentPreview.appendChild(meta);
  } else if (attachment.type === 'audio') {
    const icon = document.createElement('span');
    icon.className = 'pdf-icon';
    icon.textContent = '🎵';

    const meta = document.createElement('div');
    meta.className = 'preview-meta';
    meta.innerHTML = `<span class="preview-name">${attachment.name}</span><span class="preview-details">Audio • ${attachment.size}</span>`;

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
  DOM.imageFileInput.value = '';
  DOM.pdfFileInput.value = '';
  DOM.videoFileInput.value = '';
  DOM.audioFileInput.value = '';
}

// ---------------------------------------------------------------------------
// Popover Menu Toggle
// ---------------------------------------------------------------------------
function toggleAttachmentMenu(e) {
  if (e) e.stopPropagation();
  DOM.attachmentMenu.classList.toggle('hidden');
}

function hideAttachmentMenu() {
  DOM.attachmentMenu.classList.add('hidden');
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
// Message Rendering (Static & Streaming)
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
    } else if (attachment.type === 'video') {
      const videoContainer = document.createElement('div');
      videoContainer.className = 'msg-video-attachment';
      videoContainer.innerHTML = `<video controls src="${attachment.objectUrl}"></video>`;
      body.appendChild(videoContainer);
    } else if (attachment.type === 'audio') {
      const audioContainer = document.createElement('div');
      audioContainer.className = 'msg-audio-attachment';
      audioContainer.innerHTML = `<audio controls src="${attachment.objectUrl}"></audio>`;
      body.appendChild(audioContainer);
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

/**
 * Creates an empty streaming message entry and returns an updater function
 * that updates text live word-by-word with a blinking cursor
 */
function createStreamingMessageEntry() {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const entry = document.createElement('article');
  entry.className = 'message-entry';

  const headerRow = document.createElement('div');
  headerRow.className = 'message-header-row';

  const author = document.createElement('span');
  author.className = 'message-author author-hett';
  author.textContent = '🤖 Hett';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'message-time';
  timeSpan.textContent = time;

  headerRow.appendChild(author);
  headerRow.appendChild(timeSpan);

  const body = document.createElement('div');
  body.className = 'message-body';

  const textDiv = document.createElement('div');
  const cursor = document.createElement('span');
  cursor.className = 'streaming-cursor';

  body.appendChild(textDiv);
  body.appendChild(cursor);
  entry.appendChild(headerRow);
  entry.appendChild(body);

  DOM.chatLog.appendChild(entry);
  scrollToBottom();

  let accumulatedText = '';

  return {
    appendChunk: (chunk) => {
      accumulatedText += chunk;
      textDiv.innerHTML = formatText(accumulatedText);
      scrollToBottom();
    },
    finalize: () => {
      cursor.remove();

      // Add copy button
      const actions = document.createElement('div');
      actions.className = 'message-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'mini-action-btn';
      copyBtn.textContent = '📋 Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(accumulatedText).then(() => {
          showToast('Copied to clipboard');
        }).catch(() => {
          showToast('Failed to copy');
        });
      });

      actions.appendChild(copyBtn);
      entry.appendChild(actions);
      scrollToBottom();

      STATE.messages.push({ role: 'assistant', content: accumulatedText, time });
    },
    getText: () => accumulatedText
  };
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
// Audio Transcription (Groq Whisper Large V3 Turbo)
// ---------------------------------------------------------------------------
async function transcribeAudioWithGroq(audioFile) {
  const endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';
  const apiKey = STATE.apiKey || HARDCODED_GROQ_KEY;

  const formData = new FormData();
  formData.append('file', audioFile);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'json');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Whisper error ${res.status}`);
  }

  const data = await res.json();
  return data.text || '';
}

// ---------------------------------------------------------------------------
// Model Context Protocol (MCP) In-Chat Visual Cards
// ---------------------------------------------------------------------------
function appendMcpToolBubble(toolName, rawArgs) {
  const bubble = document.createElement('div');
  bubble.className = 'mcp-tool-bubble';

  let formattedArgs = rawArgs;
  try {
    const parsed = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
    formattedArgs = JSON.stringify(parsed, null, 2);
  } catch (e) {}

  bubble.innerHTML = `
    <div class="mcp-tool-bubble-header">
      <div class="mcp-tool-bubble-title">
        <span>⚡</span>
        <span>MCP Tool: <code>${toolName}</code></span>
      </div>
      <span class="mcp-tool-status running">⏳ Executing...</span>
    </div>
    <div class="mcp-tool-details">
      <div><strong>Parameters:</strong></div>
      <pre>${formattedArgs}</pre>
      <div class="mcp-tool-result-wrap" style="display:none; margin-top:0.4rem;">
        <div><strong>Result:</strong></div>
        <pre class="mcp-tool-result-pre"></pre>
      </div>
    </div>
  `;

  // Toggle details on header click
  bubble.querySelector('.mcp-tool-bubble-header').addEventListener('click', () => {
    const details = bubble.querySelector('.mcp-tool-details');
    details.classList.toggle('hidden');
  });

  DOM.chatLog.appendChild(bubble);
  scrollToBottom();
  return bubble;
}

function updateMcpToolBubble(bubble, status, output) {
  if (!bubble) return;
  const statusSpan = bubble.querySelector('.mcp-tool-status');
  const resultWrap = bubble.querySelector('.mcp-tool-result-wrap');
  const resultPre = bubble.querySelector('.mcp-tool-result-pre');

  if (status === 'done') {
    statusSpan.className = 'mcp-tool-status done';
    statusSpan.textContent = '✅ Completed';
  } else if (status === 'error') {
    statusSpan.className = 'mcp-tool-status error';
    statusSpan.textContent = '❌ Failed';
  }

  if (resultWrap && resultPre) {
    resultWrap.style.display = 'block';
    let text = typeof output === 'object' ? JSON.stringify(output, null, 2) : String(output);
    resultPre.textContent = text;
  }
  scrollToBottom();
}

// ---------------------------------------------------------------------------
// Groq Live Streaming API (Server-Sent Events) with MCP Tool Calling
// ---------------------------------------------------------------------------
const SYSTEM_INSTRUCTION = `You are Hett, an intelligent, direct, concise, and highly capable AI assistant equipped with Anthropic Model Context Protocol (MCP) tools.
- Real-time Tools: You have access to Model Context Protocol (MCP) tools for real-time information (e.g., current date/time, live weather forecasts, Wikipedia lookups, mathematical calculations, string hashing, and persistent memory storage/retrieval).
- When a user asks a question that can be answered accurately using an available MCP tool (e.g., "what time is it", "weather in London", "calculate 25*48", "remember my preference"), CALL the corresponding tool immediately rather than guessing or refusing.
- When an image is provided: Provide an exhaustive, deep, and complete description of everything visible in the image. Cover the main subject, background, visible text (OCR), colors, composition, setting, and details.
- When a video is provided: Analyze the extracted visual scene and provide an informative overview of the video content.
- When an audio transcription is provided: Answer or address the spoken query thoughtfully.
- When a PDF/document is provided: Read the extracted text carefully and provide a structured, clear summary with key takeaways.
- Format cleanly using standard Markdown.`;

/**
 * Streams Groq completion with support for SSE chunks and tool call accumulation
 */
async function streamGroqResponse(messagesList, onChunk) {
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  const apiKey = STATE.apiKey || HARDCODED_GROQ_KEY;
  const modelToUse = DEFAULT_MODEL;

  const mcpTools = window.MCP ? window.MCP.getOpenAiTools() : [];

  const payload = {
    model: modelToUse,
    messages: messagesList,
    temperature: 0.6,
    stream: true
  };

  if (mcpTools.length > 0) {
    payload.tools = mcpTools;
    payload.tool_choice = 'auto';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq error status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const accumulatedToolCalls = {};
  let finishReason = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      if (trimmed === 'data: [DONE]') break;

      try {
        const jsonStr = trimmed.slice(5).trim();
        const parsed = JSON.parse(jsonStr);
        const choice = parsed.choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason) finishReason = choice.finish_reason;

        // Content chunk
        const deltaContent = choice.delta?.content;
        if (deltaContent) {
          onChunk(deltaContent);
        }

        // Tool call delta chunk
        const toolCallsDelta = choice.delta?.tool_calls;
        if (toolCallsDelta && Array.isArray(toolCallsDelta)) {
          toolCallsDelta.forEach(tc => {
            const idx = tc.index ?? 0;
            if (!accumulatedToolCalls[idx]) {
              accumulatedToolCalls[idx] = {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || ''
              };
            } else {
              if (tc.id) accumulatedToolCalls[idx].id = tc.id;
              if (tc.function?.name) accumulatedToolCalls[idx].name += tc.function.name;
              if (tc.function?.arguments) accumulatedToolCalls[idx].arguments += tc.function.arguments;
            }
          });
        }
      } catch (e) {
        // partial json, continue
      }
    }
  }

  const toolCallsArray = Object.values(accumulatedToolCalls);
  if (toolCallsArray.length > 0 && finishReason === 'tool_calls') {
    return { type: 'tool_calls', toolCalls: toolCallsArray };
  }

  return { type: 'content' };
}

/**
 * Word-by-word typewriter fallback for simulated offline typing
 */
async function streamSimulatedText(text, onChunk) {
  const words = text.split(' ');
  for (let i = 0; i < words.length; i++) {
    onChunk((i === 0 ? '' : ' ') + words[i]);
    await new Promise(r => setTimeout(r, 22));
  }
}

// ---------------------------------------------------------------------------
// Send Message Orchestrator with Agentic MCP Tool Loop
// ---------------------------------------------------------------------------
async function handleSend(rawText) {
  const text = (rawText || '').trim();
  const attachment = STATE.currentAttachment;

  if ((!text && !attachment) || STATE.isGenerating) return;

  // Clear inputs & tray
  DOM.userInput.value = '';
  DOM.userInput.style.height = 'auto';
  clearAttachment();
  hideAttachmentMenu();

  // If audio attachment, transcribe first
  if (attachment && attachment.type === 'audio' && attachment.file) {
    setTyping(true, 'Transcribing audio with Whisper...');
    try {
      const transcription = await transcribeAudioWithGroq(attachment.file);
      attachment.transcription = transcription;
      showToast('Audio transcribed successfully 🎙️');
    } catch (e) {
      console.warn('Whisper transcription failed:', e);
      attachment.transcription = '[Could not transcribe audio]';
    }
  }

  // Render user bubble
  appendMessage('user', text, attachment);

  STATE.isGenerating = true;
  DOM.sendBtn.disabled = true;

  if (attachment && attachment.type === 'image') {
    setTyping(true, 'Hett is analyzing the image...');
  } else if (attachment && attachment.type === 'video') {
    setTyping(true, 'Hett is analyzing video frames...');
  } else if (attachment && attachment.type === 'pdf') {
    setTyping(true, 'Hett is reading the PDF...');
  } else {
    setTyping(true, 'Hett is thinking...');
  }

  // Prepare full conversation messages payload
  const currentMessages = [
    { role: 'system', content: SYSTEM_INSTRUCTION }
  ];

  STATE.messages.slice(-5).forEach(m => {
    if (m.content) {
      currentMessages.push({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      });
    }
  });

  // Current turn user content
  let currentContent;
  if (attachment && attachment.type === 'image') {
    const userText = text || "Please analyze this image thoroughly and provide a complete description.";
    currentContent = [
      { type: "text", text: userText },
      { type: "image_url", image_url: { url: attachment.dataUrl } }
    ];
  } else if (attachment && attachment.type === 'video') {
    const userText = text || "Please analyze this video keyframe and describe the visual scene.";
    if (attachment.keyframeUrl) {
      currentContent = [
        { type: "text", text: `[Video: ${attachment.name}, duration: ${attachment.duration}s]\n\n${userText}` },
        { type: "image_url", image_url: { url: attachment.keyframeUrl } }
      ];
    } else {
      currentContent = `[Video: ${attachment.name}, duration: ${attachment.duration}s]\n\nUser request: ${userText}`;
    }
  } else if (attachment && attachment.type === 'audio') {
    const userText = text || "Please respond to this audio transcription.";
    currentContent = `[Audio Message Transcription: "${attachment.transcription}"]\n\nUser request: ${userText}`;
  } else if (attachment && attachment.type === 'pdf') {
    const userText = text || "Please summarize this document.";
    const textContent = attachment.text && attachment.text.length > 0 ? attachment.text.slice(0, 40000) : "[Empty PDF]";
    currentContent = `Document Attached: ${attachment.name} (${attachment.pages} pages)\n\n--- Content ---\n${textContent}\n\n--- User Request ---\n${userText}`;
  } else {
    currentContent = text;
  }

  currentMessages.push({ role: 'user', content: currentContent });

  try {
    const key = STATE.apiKey || HARDCODED_GROQ_KEY;

    if (key && STATE.aiMode !== 'offline') {
      let iterations = 0;
      const maxIterations = 3;

      while (iterations < maxIterations) {
        iterations++;
        let streamEntry = null;

        const streamResult = await streamGroqResponse(currentMessages, (chunk) => {
          if (!streamEntry) {
            setTyping(false);
            streamEntry = createStreamingMessageEntry();
          }
          streamEntry.appendChunk(chunk);
        });

        // Check if model called MCP tools
        if (streamResult.type === 'tool_calls' && streamResult.toolCalls.length > 0) {
          setTyping(false);
          if (streamEntry) {
            streamEntry.finalize();
            streamEntry = null;
          }

          // Add assistant message with tool_calls
          currentMessages.push({
            role: 'assistant',
            content: null,
            tool_calls: streamResult.toolCalls.map(tc => ({
              id: tc.id || `call_${Date.now()}`,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments }
            }))
          });

          // Execute each MCP tool
          for (const tc of streamResult.toolCalls) {
            const bubble = appendMcpToolBubble(tc.name, tc.arguments);
            setTyping(true, `Executing MCP tool: ${tc.name}...`);

            try {
              const execRes = await window.MCP.executeTool(tc.name, tc.arguments);
              updateMcpToolBubble(bubble, 'done', execRes.result);
              currentMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(execRes.result)
              });
            } catch (toolErr) {
              console.error('MCP tool error:', toolErr);
              updateMcpToolBubble(bubble, 'error', { error: toolErr.message });
              currentMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify({ isError: true, error: toolErr.message })
              });
            }
          }

          // Loop back to stream Groq response with tool data
          setTyping(true, 'Hett is formulating response...');
          continue;
        }

        // Finalize standard stream
        if (streamEntry) {
          setTyping(false);
          streamEntry.finalize();
        }
        break;
      }
    } else {
      // Offline mode with built-in MCP tool fallback
      setTyping(false);
      const streamEntry = createStreamingMessageEntry();

      // Check if user is asking for time or math offline
      const lower = text.toLowerCase();
      if (lower.includes('time') || lower.includes('date')) {
        const timeRes = await window.MCP.executeTool('get_current_time', {});
        const timeObj = JSON.parse(timeRes.result.content[0].text);
        await streamSimulatedText(`Current local date and time: **${timeObj.local_formatted}** (${timeObj.timezone}).`, (c) => streamEntry.appendChunk(c));
      } else if (lower.includes('calculate') || /^[\d\s+\-*/^().]+$/.test(text)) {
        try {
          const mathRes = await window.MCP.executeTool('calculate', { expression: text.replace(/^calculate\s*/i, '') });
          const mathObj = JSON.parse(mathRes.result.content[0].text);
          await streamSimulatedText(`Result: **${mathObj.result}**`, (c) => streamEntry.appendChunk(c));
        } catch (e) {
          await streamSimulatedText("Could not calculate. Connect Groq API key in Settings for full AI assistance.", (c) => streamEntry.appendChunk(c));
        }
      } else {
        const simulatedText = "Offline Companion: To activate live answers, web search, weather, and full multimodal capabilities, ensure your Groq API key is set in ⚙️ Settings.";
        await streamSimulatedText(simulatedText, (chunk) => streamEntry.appendChunk(chunk));
      }
      streamEntry.finalize();
    }
  } catch (err) {
    console.error('Streaming API call failed:', err);
    setTyping(false);
    const errEntry = createStreamingMessageEntry();
    errEntry.appendChunk(`\n\n⚠️ **API Error**: ${err.message}`);
    errEntry.finalize();
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
    if (engineHint) engineHint.textContent = 'Groq delivers ultra-fast streaming responses with native Vision (Images, Video) and Whisper Audio.';
    DOM.apiKeyInput.placeholder = 'Paste your Groq API key (starts with gsk_...)';
    DOM.modelInput.value = DEFAULT_MODEL;
  } else if (mode === 'gemini') {
    if (engineHint) engineHint.textContent = 'Google Gemini API with multimodal vision support.';
    DOM.apiKeyInput.placeholder = 'Paste your Gemini API key...';
    DOM.modelInput.value = 'gemini-1.5-flash';
  } else if (mode === 'openai') {
    if (engineHint) engineHint.textContent = 'OpenAI or compatible API endpoint.';
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
// Model Context Protocol (MCP) Modal Management
// ---------------------------------------------------------------------------
function updateMcpBadge() {
  if (!window.MCP) return;
  const count = window.MCP.getActiveToolCount();
  if (DOM.mcpBadge) DOM.mcpBadge.textContent = count;
  if (DOM.mcpActiveCountLabel) DOM.mcpActiveCountLabel.textContent = `${count} Tools Ready`;
}

function openMcpModal() {
  renderMcpServersList();
  renderMcpMemoriesList();
  populateTesterToolSelect();
  updateMcpBadge();
  DOM.mcpModal.classList.remove('hidden');
}

function closeMcpModal() {
  DOM.mcpModal.classList.add('hidden');
  updateMcpBadge();
}

function renderMcpServersList() {
  if (!DOM.mcpServersList || !window.MCP) return;
  DOM.mcpServersList.innerHTML = '';

  window.MCP.servers.forEach(server => {
    const card = document.createElement('div');
    card.className = 'mcp-server-card';

    const toolsPillsHtml = server.tools.map(tool => {
      return `<span class="mcp-tool-pill" title="${tool.description}">🛠️ ${tool.name}</span>`;
    }).join('');

    card.innerHTML = `
      <div class="mcp-server-top">
        <div class="mcp-server-info">
          <span class="mcp-server-icon">${server.icon || '🔌'}</span>
          <div>
            <div class="mcp-server-title">${server.name}</div>
            <div class="mcp-server-desc">${server.description}</div>
          </div>
        </div>
        <label class="mcp-switch" title="Toggle server on/off">
          <input type="checkbox" ${server.enabled ? 'checked' : ''} data-server-id="${server.id}">
          <span class="mcp-slider"></span>
        </label>
      </div>
      <div class="mcp-tools-wrap">
        <span style="font-size:0.75rem; color:var(--text-muted); margin-right:0.3rem;">Tools (${server.tools.length}):</span>
        ${toolsPillsHtml}
      </div>
    `;

    // Toggle switch listener
    const checkbox = card.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', (e) => {
      window.MCP.toggleServer(server.id, e.target.checked);
      updateMcpBadge();
      populateTesterToolSelect();
      showToast(`${server.name} ${e.target.checked ? 'enabled' : 'disabled'}`);
    });

    DOM.mcpServersList.appendChild(card);
  });
}

function renderMcpMemoriesList() {
  if (!DOM.mcpMemoriesList) return;
  DOM.mcpMemoriesList.innerHTML = '';

  const memories = JSON.parse(localStorage.getItem('hett_mcp_memories') || '{}');
  const keys = Object.keys(memories);

  if (keys.length === 0) {
    DOM.mcpMemoriesList.innerHTML = '<div style="font-size:0.82rem; color:var(--text-muted); padding:1rem 0; text-align:center;">No memories stored yet. Tell Hett to remember something or add a note above!</div>';
    return;
  }

  keys.forEach(k => {
    const item = memories[k];
    const card = document.createElement('div');
    card.className = 'memory-card';
    card.innerHTML = `
      <div class="memory-main">
        <span class="memory-key">${k}</span>
        <span class="memory-val">${item.value}</span>
      </div>
      <button type="button" class="delete-memory-btn" title="Delete note">✕</button>
    `;

    card.querySelector('.delete-memory-btn').addEventListener('click', async () => {
      await window.MCP.executeTool('delete_memory', { key: k });
      renderMcpMemoriesList();
      showToast(`Deleted memory "${k}"`);
    });

    DOM.mcpMemoriesList.appendChild(card);
  });
}

function populateTesterToolSelect() {
  if (!DOM.testerToolSelect || !window.MCP) return;
  DOM.testerToolSelect.innerHTML = '';

  const allTools = window.MCP.getAllToolsList().filter(t => t.serverEnabled);
  if (allTools.length === 0) {
    DOM.testerToolSelect.innerHTML = '<option value="">No active tools</option>';
    return;
  }

  allTools.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.toolName;
    opt.textContent = `${t.serverIcon} ${t.toolName} — ${t.serverName}`;
    DOM.testerToolSelect.appendChild(opt);
  });

  updateTesterSampleArgs();
}

function updateTesterSampleArgs() {
  if (!DOM.testerToolSelect || !DOM.testerArgsInput) return;
  const toolName = DOM.testerToolSelect.value;
  const sampleMap = {
    'get_current_time': '{}',
    'calculate': '{"expression": "Math.sqrt(144) + 25 * 3"}',
    'generate_random': '{"type": "number", "min": 1, "max": 100}',
    'weather_forecast': '{"city": "Tokyo"}',
    'wikipedia_search': '{"query": "Quantum Computing"}',
    'fetch_web_page': '{"url": "https://api.github.com"}',
    'save_memory': '{"key": "favorite_color", "value": "Emerald Green"}',
    'retrieve_memories': '{"query": ""}',
    'delete_memory': '{"key": "favorite_color"}',
    'word_counter': '{"text": "Hett is a powerful multimodal chatbot with Model Context Protocol."}',
    'hash_generator': '{"text": "Hello Hett MCP", "algorithm": "sha256"}',
    'host_ping': '{"message": "Hello from MCP Client"}',
    'host_system_info': '{}'
  };

  DOM.testerArgsInput.value = sampleMap[toolName] || '{}';
}

// ---------------------------------------------------------------------------
// Event Listeners Initialization
// ---------------------------------------------------------------------------
function initEvents() {
  // Model Context Protocol (MCP) Modal Events
  DOM.mcpBtn.addEventListener('click', openMcpModal);
  DOM.closeMcpBtn.addEventListener('click', closeMcpModal);
  DOM.closeMcpFooterBtn.addEventListener('click', closeMcpModal);

  DOM.mcpModal.addEventListener('click', (e) => {
    if (e.target === DOM.mcpModal) closeMcpModal();
  });

  // MCP Tab Navigation
  DOM.mcpTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      DOM.mcpTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      DOM.mcpTabPanes.forEach(p => p.classList.add('hidden'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.remove('hidden');

      if (targetId === 'memoryTab') renderMcpMemoriesList();
      if (targetId === 'testerTab') populateTesterToolSelect();
      if (targetId === 'serversTab') renderMcpServersList();
    });
  });

  // Use Local Host MCP Button
  DOM.useLocalHostMcpBtn.addEventListener('click', () => {
    DOM.extServerName.value = 'Hett Host Local MCP';
    DOM.extServerUrl.value = 'http://localhost:8000/mcp';
    DOM.extServerTransport.value = 'http';
    showToast('Local host endpoint populated');
  });

  // Connect External MCP Server Form
  DOM.addMcpServerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = DOM.extServerName.value.trim() || 'Custom MCP Server';
    const url = DOM.extServerUrl.value.trim();
    const transport = DOM.extServerTransport.value;

    if (!url) {
      showToast('Please enter an MCP server URL');
      return;
    }

    DOM.connectExtServerBtn.disabled = true;
    DOM.connectExtServerBtn.textContent = '⏳ Connecting...';
    DOM.extServerFeedback.className = 'mcp-feedback hidden';

    try {
      const ext = await window.MCP.addExternalServer(name, url, transport);
      DOM.extServerFeedback.className = 'mcp-feedback success';
      DOM.extServerFeedback.textContent = `✅ Successfully connected to "${ext.name}"! Discovered ${ext.tools.length} tools.`;
      DOM.extServerFeedback.classList.remove('hidden');
      updateMcpBadge();
      showToast(`Connected ${ext.tools.length} MCP tools!`);
    } catch (err) {
      DOM.extServerFeedback.className = 'mcp-feedback error';
      DOM.extServerFeedback.textContent = `❌ Connection failed: ${err.message}`;
      DOM.extServerFeedback.classList.remove('hidden');
    } finally {
      DOM.connectExtServerBtn.disabled = false;
      DOM.connectExtServerBtn.textContent = '🔌 Connect & Discover Tools';
    }
  });

  // Manual Memory Management
  DOM.saveManualMemoryBtn.addEventListener('click', async () => {
    const k = DOM.newMemoryKey.value.trim();
    const v = DOM.newMemoryValue.value.trim();
    if (!k || !v) {
      showToast('Please enter both key and value');
      return;
    }
    await window.MCP.executeTool('save_memory', { key: k, value: v });
    DOM.newMemoryKey.value = '';
    DOM.newMemoryValue.value = '';
    renderMcpMemoriesList();
    showToast(`Saved note "${k}"`);
  });

  DOM.clearAllMemoriesBtn.addEventListener('click', () => {
    if (confirm('Clear all stored memories?')) {
      localStorage.removeItem('hett_mcp_memories');
      renderMcpMemoriesList();
      showToast('All memories cleared');
    }
  });

  // Tool Tester Events
  DOM.testerToolSelect.addEventListener('change', updateTesterSampleArgs);

  DOM.runTestToolBtn.addEventListener('click', async () => {
    const toolName = DOM.testerToolSelect.value;
    if (!toolName) return;

    let args = {};
    try {
      args = JSON.parse(DOM.testerArgsInput.value || '{}');
    } catch (err) {
      DOM.testerOutput.textContent = `Invalid JSON arguments: ${err.message}`;
      return;
    }

    DOM.runTestToolBtn.disabled = true;
    DOM.runTestToolBtn.textContent = '⏳ Running...';
    DOM.testerOutput.textContent = 'Executing JSON-RPC tools/call request...';

    try {
      const res = await window.MCP.executeTool(toolName, args);
      DOM.testerOutput.textContent = JSON.stringify(res, null, 2);
    } catch (err) {
      DOM.testerOutput.textContent = `Error executing tool: ${err.message}`;
    } finally {
      DOM.runTestToolBtn.disabled = false;
      DOM.runTestToolBtn.textContent = '⚡ Execute Tool';
    }
  });

  // Theme & Settings
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

  // Attachment Popover Menu Trigger (Click 📎)
  DOM.attachFileBtn.addEventListener('click', toggleAttachmentMenu);

  // Popover Menu Options
  DOM.menuItemImage.addEventListener('click', () => {
    hideAttachmentMenu();
    DOM.imageFileInput.click();
  });

  DOM.menuItemPdf.addEventListener('click', () => {
    hideAttachmentMenu();
    DOM.pdfFileInput.click();
  });

  DOM.menuItemVideo.addEventListener('click', () => {
    hideAttachmentMenu();
    DOM.videoFileInput.click();
  });

  DOM.menuItemAudio.addEventListener('click', () => {
    hideAttachmentMenu();
    DOM.audioFileInput.click();
  });

  // Close attachment menu if clicking anywhere outside
  document.addEventListener('click', (e) => {
    if (!DOM.attachmentMenu.contains(e.target) && e.target !== DOM.attachFileBtn) {
      hideAttachmentMenu();
    }
  });

  // Dedicated File Inputs
  DOM.imageFileInput.addEventListener('change', (e) => {
    if (e.target.files?.[0]) processSelectedFile(e.target.files[0], 'image');
  });

  DOM.pdfFileInput.addEventListener('change', (e) => {
    if (e.target.files?.[0]) processSelectedFile(e.target.files[0], 'pdf');
  });

  DOM.videoFileInput.addEventListener('change', (e) => {
    if (e.target.files?.[0]) processSelectedFile(e.target.files[0], 'video');
  });

  DOM.audioFileInput.addEventListener('change', (e) => {
    if (e.target.files?.[0]) processSelectedFile(e.target.files[0], 'audio');
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
          processSelectedFile(blob, 'image');
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
  updateMcpBadge();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
