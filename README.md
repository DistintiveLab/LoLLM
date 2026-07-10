# LeafLLM

LeafLLM is a privacy-respecting browser extension that brings the power of
large-language models (LLMs) into your browser. Right-click any text and choose
**Summarize**, or use the **Complete / Improve / Ask** keyboard shortcuts inside
an editor (e.g. the Overleaf source editor). It works with **any
OpenAI-compatible Chat Completion API** — point it at OpenAI, a local
[vLLM](https://docs.vllm.ai/) / [llama.cpp](https://github.com/ggerganov/llama.cpp)
server, or any other compatible endpoint by setting the **Endpoint URL**, **API
key** and **model** in the settings popup.

The extension originated from [GPT4Overleaf](https://github.com/e3ntity/gpt4overleaf).
This fork is **cross-browser**: it works in both Mozilla Firefox and Google
Chrome. The code uses the `browser.*` WebExtensions API and a WebExtension
Manifest V2, both of which are supported by Firefox. The keyboard-shortcut tools
(recall the original GPT4Overleaf `Alt+C` / `Alt+I` / `Alt+A`) are implemented
and described in [Usage](#usage).

## Installation

### Firefox (temporary load — for development / testing)
1. Clone this repository.
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **"Load Temporary Add-on..."**.
4. Select the `manifest.json` file in the repository folder.
5. The LeafLLM icon appears in the toolbar. (Temporary add-ons are removed when
   Firefox restarts.)

### Firefox (permanent / distribution)
To install permanently, the add-on must be signed through
[addons.mozilla.org (AMO)](https://addons.mozilla.org). You can build and sign
a package with the `web-ext` CLI:

```bash
npm install -g web-ext
web-ext build                      # creates a .zip in web-ext-artifacts/
web-ext sign --api-key=<JWT_ISSUER> --api-secret=<JWT_SECRET>
```

The `browser_specific_settings.gecko.id` (`leafllm@bthink.bgu.ac.il`) in
`manifest.json` is required for signing and is already set.

### Chrome (manual installation)
1. Clone the repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable developer mode.
4. Click "Load unpacked" and select the repository folder.
   (Since the code uses the `browser.*` namespace, Chrome needs the small
   [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)
   shim, or you can replace `browser.` with `chrome.` — note that Chrome's
   `chrome.*` callback APIs differ from the promise-based `browser.*` API.)

## Configuration
Click the LeafLLM button in the browser toolbar to open the settings popup.
There are three fields, all stored locally using the browser's **local**
storage (so changing them takes effect immediately on the next invocation):

- **API Key** — the bearer token sent to your endpoint (e.g. an
  [OpenAI API key](https://platform.openai.com/account/api-keys)).
- **Endpoint URL** — the Chat Completion endpoint to call. Defaults to
  `https://api.openai.com/v1/chat/completions` if left blank. Point this at any
  OpenAI-compatible server (vLLM, llama.cpp, LM Studio, LocalAI, etc.).
- **Model** — the model name to pass in the request body (e.g. `gpt-3.5-turbo`,
  `gpt-4o-mini`, or the name your local server exposes). Defaults to
  `gpt-3.5-turbo` if left blank.

### Test connection
The **Test connection** button sends a minimal request to your endpoint and
reports the result. If your Endpoint URL doesn't accept POST requests (a common
mistake is pasting only the server's base URL — e.g. `https://host` instead of
`https://host/api/chat/completions`), it automatically tries a few common
OpenAI-compatible paths appended to that origin:

- `/v1/chat/completions`
- `/api/chat/completions`
- `/openai/chat/completions`
- `/api/v1/chat/completions`

If one of them works (or at least accepts POST), the popup asks you to confirm
switching to it. For an OpenWebUI instance the correct path is typically
`/api/chat/completions`. The request uses `max_tokens: 1` to keep the test
cheap, and a list of every path tried (with its HTTP status) is shown in the
result area.

## Usage

### Summarize (context menu)
1. Select any text on a web page.
2. Right-click and choose **Summarize** (the LeafLLM context-menu item).
3. A small popup appears in the top-right corner of the page showing a loading
   indicator, then the summary. Click the **×** to dismiss it.

### Editor shortcut tools (Overleaf and any editable area)
Select text inside an editor (e.g. the Overleaf source editor, which lives in
an iframe, or any other text area / contenteditable element) and press:

- `Alt+C` — **Complete**: continues the text after your selection (the
  selection is kept, the continuation is appended right after it).
- `Alt+I` — **Improve**: comments out the selected text (`% …` per line) and
  inserts the improved text below it.
- `Alt+A` — **Ask**: replaces the selected text with the model's answer.

A small status popup appears in the top-right while the request is in flight;
this works inside the editor frame (the content script runs in all frames). If
the editor cannot be edited programmatically, the result is shown in the popup
instead. The shortcuts only fire when you have a selection inside an editable
element, so they won't interfere with normal Alt-key usage elsewhere.

Note on **Ask**: it sends the selected text as a user instruction and **replaces
the selection** with the model's answer, so it's meant for short instructions
(e.g. *"Create a table 4x3 with a bold first row"*), not for re-explaining whole
sections. Requests abort after **60 s**; if a request takes longer (slow model,
long generation, or a proxy that stalls long POSTs) you'll get a clear
"Request timed out" error instead of a spinner that never stops.

## How it works
- `scripts/main.js` — background page; registers the **Summarize** context menu,
  reads the **API key**, **endpoint URL** and **model** from `storage.local`,
  and POSTs the selected text to the OpenAI-compatible Chat Completion endpoint
  via `fetch`. Also handles `run-tool` messages from the content script for the
  complete/improve/ask shortcuts (each tool uses a different system prompt) and
  delivers results back to the **originating frame** with `tabs.sendMessage`
  using `sender.frameId` (the Overleaf editor lives in an iframe). Requests use
  `stream: false` and a 60 s timeout.
- `scripts/content-script.js` — runs in all frames. Shows the summarize
  loading/result popup (top frame only); listens for the `Alt+C` / `Alt+I` /
  `Alt+A` shortcuts in editable areas, asks the background to call the LLM, and
  inserts the result back into the editor via `document.execCommand`.
- `popup/popup.html` / `popup.js` / `popup.css` — settings UI for the API key,
  endpoint URL and model.

The request sent to the endpoint is a standard Chat Completion call:
```json
{
  "model": "<model>",
  "messages": [
    { "role": "system", "content": "<tool-specific prompt>" },
    { "role": "user", "content": "<selected text>" }
  ]
}
```
The system prompt differs per tool:

| Tool | System prompt |
| --- | --- |
| Summarize | "Summarize this for a second-grade student:" |
| Complete | "You are an assistant in a Latex editor that continues the given text. No need to rewrite the given text." |
| Improve | "You are an assistant in a Latex editor that improves the given text." |
| Ask | "You are an assistant in a Latex editor. Answer questions without introduction/explanations." |

For **Summarize**, the first choice's `message.content` is shown in the page
popup. For the editor tools, it is inserted directly into the editor.

## Privacy
The extension saves its configuration (API key, endpoint URL and model) locally
on the user's computer using the browser's **local** storage (it does not sync
across devices). The API key and the selected text are sent **only** to the
endpoint URL you configure, and only for the purpose of generating a response
(summarize / complete / improve / ask). The extension's authors are not
responsible for what the chosen endpoint provider does with this data. The
authors do not collect any data from the extension's users.

## Firefox compatibility notes
This fork was adapted from the original Chrome extension to run cleanly in
Firefox. The changes are minimal because the extension already used the
cross-browser `browser.*` API:

- **Icons:** fixed icon paths to the bundled images in `popup/` (the original
  manifest pointed at a non-existent `icons/` folder).
- **Host permission:** uses `<all_urls>` in `permissions` so cross-origin
  `fetch` works to **any** user-configured OpenAI-compatible endpoint (the
  endpoint URL is set at runtime, so a single broad host permission is required).
- **CSP:** simplified `content_security_policy` to `script-src 'self';
  object-src 'self';` (removed an unused `https://esm.run` remote source).
- **`browser_specific_settings.gecko.strict_min_version`:** set to `115.0` to
  declare a supported Firefox baseline.
- **Provider switch:** replaced the bundled Google Generative AI (Gemini) SDK
  with a direct, dependency-free `fetch` to an OpenAI-compatible Chat Completion
  endpoint; removed the now-unused `scripts/gemini.js` and
  `scripts/lib/generative-ai.js`.
- **Storage:** switched from `storage.sync` to `storage.local`. `storage.sync`
  requires a Firefox account to sync and is unreliable for unsigned/temporary
  add-ons, which previously caused settings changes (e.g. the endpoint URL) not
  to take effect.
- **Editor tools:** re-implemented the `Alt+C` / `Alt+I` / `Alt+A` shortcut
  tools. The content script runs with `all_frames: true` so the shortcuts work
  inside the Overleaf source editor's iframe, and results are inserted via
  `document.execCommand('insertText')` (works with the CodeMirror editor).

## Ask examples
For example, select the text "Create a table 4x3 that the first row is
boldface" and press `Alt+A`; it will be **replaced** with, e.g.:
```latex
\begin{tabular}{|c|c|c|}
\hline
\textbf{Column 1} & \textbf{Column 2} & \textbf{Column 3}\\
\hline
Entry 1 & Entry 2 & Entry 3\\
\hline
Entry 4 & Entry 5 & Entry 6\\
\hline
Entry 7 & Entry 8 & Entry 9\\
\hline
\end{tabular}
```

You can then, for example:
1. Write before the table: "Place the following tabular inside a table
   environment, center it, and give the following title: The comparison of the
   three approaches"
2. Select that sentence **and** the table
3. Press `Alt+A` to trigger the ask tool.

The result will be:
```latex
\begin{table}[h]
\centering
\caption{The comparison of the three approaches}
\begin{tabular}{|c|c|c|}
\hline
\textbf{Column 1} & \textbf{Column 2} & \textbf{Column 3}\\
\hline
Entry 1 & Entry 2 & Entry 3\\
\hline
Entry 4 & Entry 5 & Entry 6\\
\hline
Entry 7 & Entry 8 & Entry 9\\
\hline
\end{tabular}
\end{table}
```

## Future work
Possible improvements to consider:

- Advanced per-tool customization (temperature, `max_tokens`, custom system
  prompts) exposed in the popup, similar to the old JSON-configuration screen.
- Streaming responses for the editor tools.
- Treating plain `<textarea>`/`<input>` editors (which ignore
  `execCommand('insertText')` in some browsers) with a dedicated insertion path.

## Issues
If nothing happens when you use the plugin, verify that the extension's
shortcuts are not in conflict with other extensions' shortcuts. In Chrome, go
to `chrome://extensions/shortcuts`.

If you encounter any problem or question, please open an issue in the project's
repository.
