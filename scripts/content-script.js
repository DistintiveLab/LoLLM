let popup = null;

// Pending keyboard-shortcut requests, keyed by id. The background delivers
// results back via tabs.sendMessage({frameId}) as 'tool-result' messages.
const pending = new Map();
let reqId = 0;
const TOOL_TIMEOUT_MS = 75000; // local safety net in case the background never replies

// --- Messages from the background script ---
browser.runtime.onMessage.addListener((request) => {
  // tool-result can target any frame (incl. the Overleaf editor iframe), so
  // handle it BEFORE the top-frame guard.
  if (request.action === 'tool-result') {
    const p = pending.get(request.id);
    if (p) {
      pending.delete(request.id);
      p.resolve({ ok: request.ok, text: request.text, error: request.error });
    }
    return undefined;
  }
  // Summarize popups only show in the top frame.
  if (window !== window.top) return undefined;
  if (request.action === 'show-loading-indicator') {
    showLoadingIndicator();
  } else if (request.action === 'show-result') {
    showResult(request.title, request.text);
  }
  return undefined;
});

// --- Keyboard-shortcut tools (run in all frames, incl. the editor iframe) ---
const TOOL_KEYS = { c: 'complete', i: 'improve', a: 'ask' };

document.addEventListener('keydown', (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const tool = TOOL_KEYS[e.key.toLowerCase()];
  if (!tool) return;
  const sel = window.getSelection();
  const text = sel ? sel.toString() : '';
  if (!text) return;
  if (!isEditable(sel.anchorNode)) return;
  e.preventDefault();
  handleShortcutTool(tool, text);
});

function isEditable(node) {
  let el = node ? (node.nodeType === 1 ? node : node.parentElement) : null;
  while (el) {
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return true;
    el = el.parentElement;
  }
  return false;
}

async function handleShortcutTool(tool, originalText) {
  showStatus(tool, true);
  const id = ++reqId;

  // Wait for the background's 'tool-result' message for this id.
  const done = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('Request timed out (no response from background).'));
      }
    }, TOOL_TIMEOUT_MS);
  });

  // Fire-and-forget; the answer comes back as a 'tool-result' message.
  browser.runtime.sendMessage({ action: 'run-tool', id: id, tool: tool, text: originalText })
    .catch(() => { /* ignored */ });

  try {
    const response = await done;
    if (!response || !response.ok) {
      throw new Error(response?.error || 'Unknown error.');
    }
    const inserted = insertResult(tool, originalText, response.text);
    if (!inserted) {
      showResult(capitalize(tool), response.text);
    }
  } catch (error) {
    showResult('Error', error.message);
  } finally {
    showStatus(tool, false);
  }
}

function insertResult(tool, original, result) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  switch (tool) {
    case 'ask':
      return execInsert(result);
    case 'complete':
      sel.collapseToEnd();
      return execInsert(result);
    case 'improve': {
      const commented = original
        .split('\n')
        .map((line) => `% ${line}`)
        .join('\n');
      return execInsert(`${commented}\n${result}`);
    }
  }
  return false;
}

function execInsert(text) {
  // Replaces the current selection (or inserts at the caret) in the focused editor.
  return document.execCommand('insertText', false, text);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- Popups / indicators ---
function removePopup() {
  if (popup) {
    popup.remove();
    popup = null;
  }
}

function createPopup() {
  removePopup();
  popup = document.createElement('div');
  if (!document.body) return;
  document.body.appendChild(popup);
  Object.assign(popup.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    width: '300px',
    backgroundColor: 'white',
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '16px',
    zIndex: '99999',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    fontFamily: 'sans-serif',
    fontSize: '14px',
    lineHeight: '1.5',
    color: '#333',
  });
}

function showStatus(tool, on) {
  if (!on) {
    if (popup && popup.dataset.status === tool) removePopup();
    return;
  }
  createPopup();
  if (!popup) return;
  popup.dataset.status = tool;
  popup.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;font-weight:bold;margin-bottom:8px;">
      <span id="leaf-status-label">\u2026</span>
      <span id="leaf-close-button" style="cursor:pointer;font-size:20px;">&times;</span>
    </div>
    <div style="height:4px;background-color:#eee;border-radius:2px;overflow:hidden;">
      <div style="width:50%;height:100%;background-color:#4CAF50;animation:leafloading 1.5s infinite;"></div>
    </div>
    <style>@keyframes leafloading{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}</style>
  `;
  const label = document.getElementById('leaf-status-label');
  if (label) label.textContent = capitalize(tool) + '\u2026';
  const btn = document.getElementById('leaf-close-button');
  if (btn) btn.onclick = removePopup;
}

function showLoadingIndicator() {
  createPopup();
  if (!popup) return;
  popup.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;font-weight:bold;margin-bottom:8px;">
      <span>Summarizing\u2026</span>
      <span id="leaf-close-button" style="cursor:pointer;font-size:20px;">&times;</span>
    </div>
    <div style="height:4px;background-color:#eee;border-radius:2px;overflow:hidden;">
      <div style="width:50%;height:100%;background-color:#4CAF50;animation:leafloading 1.5s infinite;"></div>
    </div>
    <style>@keyframes leafloading{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}</style>
  `;
  const btn = document.getElementById('leaf-close-button');
  if (btn) btn.onclick = removePopup;
}

function showResult(title, text) {
  createPopup();
  if (!popup) return;
  popup.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;font-weight:bold;margin-bottom:8px;">
      <span id="leaf-result-title"></span>
      <span id="leaf-close-button" style="cursor:pointer;font-size:20px;">&times;</span>
    </div>
    <div id="leaf-result-body" style="white-space:pre-wrap;"></div>
  `;
  const titleEl = document.getElementById('leaf-result-title');
  if (titleEl) titleEl.textContent = title;
  const bodyEl = document.getElementById('leaf-result-body');
  if (bodyEl) bodyEl.textContent = text;
  const btn = document.getElementById('leaf-close-button');
  if (btn) btn.onclick = removePopup;
}
