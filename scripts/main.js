const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-3.5-turbo';

// Abort a chat-completion request after this long, so a slow/hung endpoint
// (or a proxy that stalls long POSTs) shows a clear error instead of spinning
// the loading indicator forever.
const REQUEST_TIMEOUT_MS = 60000;

// Common OpenAI-compatible chat-completion paths, used by "Test connection"
// to discover a working endpoint when the user only provides a base URL.
const COMMON_PATHS = [
  '/v1/chat/completions',
  '/api/chat/completions',
  '/openai/chat/completions',
  '/api/v1/chat/completions',
];

const SYSTEM_PROMPTS = {
  summarize: 'Summarize this for a second-grade student:',
  complete: 'You are an assistant in a Latex editor that continues the given text. No need to rewrite the given text.',
  improve: 'You are an assistant in a Latex editor that improves the given text.',
  ask: 'You are an assistant in a Latex editor. Answer questions without introduction/explanations.',
};

// Create the context menu item once on install.
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'summarize-text',
    title: 'Summarize',
    contexts: ['selection'],
  });
});

async function getSettings() {
  return browser.storage.local.get(['apiKey', 'endpointUrl', 'model']);
}

// Call an OpenAI-compatible Chat Completion endpoint with a given system prompt.
async function complete(text, systemPrompt, settings) {
  const apiKey = settings.apiKey;
  if (!apiKey) {
    throw new Error('API key not set. Please set it in the extension popup.');
  }
  const endpoint = settings.endpointUrl || DEFAULT_ENDPOINT;
  const model = settings.model || DEFAULT_MODEL;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. The endpoint may be slow, streaming, or blocked by a proxy.`);
    }
    throw new Error(`Network error: ${e.message}`);
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const errBody = await response.json();
      if (errBody?.error?.message) detail = errBody.error.message;
    } catch (_) { /* ignore non-JSON error bodies */ }
    throw new Error(`API request failed: ${detail}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content returned in the API response.');
  return content.trim();
}

// Listen for context menu clicks (Summarize tool).
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'summarize-text') return;

  browser.tabs.sendMessage(tab.id, { action: 'show-loading-indicator' });

  try {
    const settings = await getSettings();
    const summary = await complete(info.selectionText, SYSTEM_PROMPTS.summarize, settings);
    browser.tabs.sendMessage(tab.id, {
      action: 'show-result',
      title: 'Summary',
      text: summary,
    });
  } catch (error) {
    browser.tabs.sendMessage(tab.id, {
      action: 'show-result',
      title: 'Error',
      text: error.message,
    });
  }
});

// Probe a single endpoint with a minimal chat-completion request.
// Returns {status, ok, acceptsPost, detail}.
//   ok          — true if the endpoint returned a 2xx response.
//   acceptsPost — true if the path accepts POST (status != 404/405), i.e. it
//                 is a real chat-completion route even if auth/model failed.
async function testEndpoint(endpoint, apiKey, model) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    return { status: 0, ok: false, acceptsPost: false, detail: `Network error: ${e.name === 'AbortError' ? 'timeout' : e.message}` };
  }
  clearTimeout(timeout);

  const status = response.status;
  const acceptsPost = status !== 404 && status !== 405;
  const ok = response.ok;
  let detail = `${status} ${response.statusText}`;
  try {
    const body = await response.json();
    if (ok) {
      detail = body?.choices ? 'OK — got a response' : 'OK';
    } else if (body?.error?.message) {
      detail = `${status}: ${body.error.message}`;
    }
  } catch (_) { /* non-JSON body, keep the status detail */ }
  return { status, ok, acceptsPost, detail };
}

// Handle "Test connection": probe the user's endpoint, and if it doesn't
// accept POST (404/405 — usually a base URL), try common chat-completion
// paths derived from its origin. If one works (or at least accepts POST),
// return a suggestion so the popup can ask the user to confirm switching.
async function handleTestConnection(endpointUrl, apiKey, model) {
  const endpoint = endpointUrl || DEFAULT_ENDPOINT;
  const tried = [];

  const userResult = await testEndpoint(endpoint, apiKey, model);
  tried.push({ endpoint, ...userResult });

  if (userResult.ok) {
    return { ok: true, message: 'Connection successful!', tried };
  }

  // If the user's path doesn't accept POST, look for a working alternative.
  if (!userResult.acceptsPost) {
    let origin;
    try {
      origin = new URL(endpoint).origin;
    } catch (_) {
      return { ok: false, message: `Invalid endpoint URL: "${endpoint}"`, tried };
    }

    let workingAlt = null;
    let partialAlt = null;
    for (const path of COMMON_PATHS) {
      const candidate = origin + path;
      if (candidate === endpoint) continue; // already tested
      const result = await testEndpoint(candidate, apiKey, model);
      tried.push({ endpoint: candidate, ...result });
      if (result.ok && !workingAlt) workingAlt = { endpoint: candidate, ...result };
      if (result.acceptsPost && !partialAlt) partialAlt = { endpoint: candidate, ...result };
      if (workingAlt) break; // a fully-working endpoint is enough
    }

    if (workingAlt) {
      return {
        ok: false,
        message: `Your endpoint didn't work (${userResult.detail}), but a working one was found.`,
        suggestion: {
          endpoint: workingAlt.endpoint,
          detail: workingAlt.detail,
          autoMessage: `Found a working endpoint:\n\n${workingAlt.endpoint}\n\nUse it?`,
        },
        tried,
      };
    }
    if (partialAlt) {
      return {
        ok: false,
        message: `Your endpoint doesn't accept requests (${userResult.detail}), but this one does: ${partialAlt.detail}`,
        suggestion: {
          endpoint: partialAlt.endpoint,
          detail: partialAlt.detail,
          autoMessage: `Your endpoint didn't accept the request, but this one does:\n\n${partialAlt.endpoint}\n(${partialAlt.detail})\n\nUse it?`,
        },
        tried,
      };
    }
    return { ok: false, message: `Could not find a working endpoint. Last error: ${userResult.detail}`, tried };
  }

  // The user's path accepts POST but the request failed (auth, model, etc.).
  return {
    ok: false,
    message: `Endpoint accepted the request but it failed: ${userResult.detail}`,
    tried,
  };
}

// Run a keyboard-shortcut tool and deliver the result back to the exact frame
// that asked (using tabs.sendMessage with sender.frameId) instead of relying
// on the runtime.sendMessage return value, which is unreliable for content
// scripts running in subframes (e.g. the Overleaf editor iframe).
async function handleRunTool(request, sender) {
  let payload;
  try {
    const settings = await getSettings();
    const prompt = SYSTEM_PROMPTS[request.tool] || SYSTEM_PROMPTS.ask;
    const result = await complete(request.text, prompt, settings);
    payload = { action: 'tool-result', id: request.id, ok: true, text: result };
  } catch (error) {
    payload = { action: 'tool-result', id: request.id, ok: false, error: error.message };
  }
  try {
    await browser.tabs.sendMessage(sender.tab.id, payload, { frameId: sender.frameId });
  } catch (_) { /* tab/frame may be gone; nothing to do */ }
}

// Handle requests from content scripts (keyboard-shortcut tools) and the
// popup (test-connection).
browser.runtime.onMessage.addListener((request, sender) => {
  if (request.action === 'run-tool') {
    handleRunTool(request, sender); // responds async via tabs.sendMessage
    return undefined;
  }
  if (request.action === 'test-connection') {
    return handleTestConnection(request.endpointUrl, request.apiKey, request.model);
  }
  return undefined;
});
