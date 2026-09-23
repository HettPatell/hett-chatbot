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
// Groq Live Streaming API (Server-Sent Events)
// ---------------------------------------------------------------------------
const SYSTEM_INSTRUCTION = `You are Hett, a direct, concise, and highly capable AI assistant.
- When an image is provided: Provide an exhaustive, deep, and complete description of everything visible in the image. Cover the main subject, background, visible text (OCR), colors, composition, setting, and details.
- When a video is provided: Analyze the extracted visual scene and provide an informative overview of the video content.
- When an audio transcription is provided: Answer or address the spoken query thoughtfully.
- When a PDF/document is provided: Read the extracted text carefully and provide a structured, clear summary with key takeaways.
- Format cleanly using standard Markdown.`;

async function streamGroqResponse(prompt, attachment, onChunk) {
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  const apiKey = STATE.apiKey || HARDCODED_GROQ_KEY;
  const modelToUse = DEFAULT_MODEL;

  const messages = [
    { role: 'system', content: SYSTEM_INSTRUCTION }
  ];

  STATE.messages.slice(-4).forEach(m => {
    if (m.content) {
      messages.push({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      });
    }
  });

  let currentContent;

  if (attachment && attachment.type === 'image') {
    const userText = prompt && prompt.trim().length > 0
      ? prompt
      : "Please analyze this image thoroughly and provide a complete, detailed description of everything visible in it, including main objects, any text or labels, colors, and context.";

    currentContent = [
      { type: "text", text: userText },
      { type: "image_url", image_url: { url: attachment.dataUrl } }
    ];
  } else if (attachment && attachment.type === 'video') {
    const userText = prompt && prompt.trim().length > 0
      ? prompt
      : "Please analyze this video keyframe and describe the visual scene, subject, and context.";

    if (attachment.keyframeUrl) {
      currentContent = [
        { type: "text", text: `[Video Attachment: ${attachment.name}, duration: ${attachment.duration}s]\n\n${userText}` },
        { type: "image_url", image_url: { url: attachment.keyframeUrl } }
      ];
    } else {
      currentContent = `[Video Attachment: ${attachment.name}, duration: ${attachment.duration}s]\n\nUser request: ${userText}`;
    }
  } else if (attachment && attachment.type === 'audio') {
    const userText = prompt && prompt.trim().length > 0 ? prompt : "Please respond to this audio transcription.";
    currentContent = `[Audio Message Transcription: "${attachment.transcription}"]\n\nUser request: ${userText}`;
  } else if (attachment && attachment.type === 'pdf') {
    const userText = prompt && prompt.trim().length > 0
      ? prompt
      : "Please read this attached PDF document carefully and provide a comprehensive summary, key findings, and highlight important points.";

    const textContent = attachment.text && attachment.text.length > 0
      ? attachment.text.slice(0, 40000)
      : "[Notice: No readable text could be extracted from this PDF. It might be a scanned image.]";

    currentContent = `Document Attached: ${attachment.name} (${attachment.pages} pages)\n\n--- Document Text Content ---\n${textContent}\n\n--- User Request ---\n${userText}`;
  } else {
    currentContent = prompt;
  }

  messages.push({ role: 'user', content: currentContent });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelToUse,
      messages: messages,
      temperature: 0.6,
      stream: true // LIVE STREAMING
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq error status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep last incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      if (trimmed === 'data: [DONE]') return;

      try {
        const jsonStr = trimmed.slice(5).trim();
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          onChunk(delta);
        }
      } catch (e) {
        // partial json chunk, continue
      }
    }
  }
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
// Send Message Orchestrator
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

  // Create live streaming bubble
  const streamEntry = createStreamingMessageEntry();

  try {
    const key = STATE.apiKey || HARDCODED_GROQ_KEY;

    if (key) {
      let firstChunkReceived = false;

      await streamGroqResponse(text, attachment, (chunk) => {
        if (!firstChunkReceived) {
          firstChunkReceived = true;
          setTyping(false); // remove thinking indicator once streaming begins
        }
        streamEntry.appendChunk(chunk);
      });

      setTyping(false);
      streamEntry.finalize();
    } else {
      setTyping(false);
      const simulatedText = "Offline Mode: Connect your Groq API key in Settings for live AI answers.";
      await streamSimulatedText(simulatedText, (chunk) => streamEntry.appendChunk(chunk));
      streamEntry.finalize();
    }
  } catch (err) {
    console.error('Streaming API call failed:', err);
    setTyping(false);
    streamEntry.appendChunk(`\n\n⚠️ **API Error**: ${err.message}`);
    streamEntry.finalize();
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
