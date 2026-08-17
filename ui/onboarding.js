const FIRST_RUN_KEY = 'codexmap_seen_welcome';

function showWelcomeIfNew() {
  if (localStorage.getItem(FIRST_RUN_KEY)) return;
  
  // Inject welcome overlay into canvas area
  const canvas = document.getElementById('canvas-container');
  const welcome = document.createElement('div');
  welcome.id = 'welcome-overlay';
  welcome.style.cssText = `
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    z-index: 50; pointer-events: none;
  `;
  welcome.innerHTML = `
    <div style="
      background: #ffffff; border: 0.5px solid #c7cad5;
      border-radius: 16px; padding: 32px 36px;
      max-width: 440px; text-align: center;
      pointer-events: all;
      box-shadow: 0 8px 32px rgba(0,0,0,0.10);
    ">
      <div style="
        width:48px;height:48px;background:#5b76fe;
        border-radius:12px;margin:0 auto 16px;
        display:flex;align-items:center;justify-content:center;
        font-size:24px;color:white;
      ">⬡</div>
      <div style="
        font-family:'Roobert PRO Medium',sans-serif;
        font-size:20px;font-weight:500;
        color:#1c1c1e;margin-bottom:10px;
      ">Welcome to CodexMap</div>
      <div style="
        font-size:14px;color:#555a6a;
        line-height:1.7;margin-bottom:20px;
      ">
        Your codebase will appear here as nodes while Codex generates it.
        <br><br>
        <strong style="color:#1c1c1e">Teal nodes</strong> = aligned with your prompt<br>
        <strong style="color:#1c1c1e">Orange nodes</strong> = review recommended<br>
        <strong style="color:#1c1c1e">Coral nodes</strong> = drifted — click to re-anchor
      </div>
      <button onclick="dismissWelcome()" style="
        background:#5b76fe;color:white;border:none;
        border-radius:8px;padding:10px 24px;
        font-family:'Roobert PRO Medium',sans-serif;
        font-size:14px;cursor:pointer;width:100%;
      ">Got it — show me the graph</button>
    </div>
  `;
  canvas.style.position = 'relative';
  canvas.appendChild(welcome);
}

function hideWelcomeOverlay() {
  document.getElementById('welcome-overlay')?.remove();
}

function dismissWelcome() {
  localStorage.setItem(FIRST_RUN_KEY, '1');
  hideWelcomeOverlay();
}

// ── Error state overlay ───────────────────────────────────────

function showError(type) {
  const ERRORS = {
    disconnected: {
      icon: '⚡',
      title: 'Not connected',
      body:  'CodexMap is not running. Start it in your terminal:',
      code:  'npx codexmap "your prompt here"',
      action: { label: 'Retry', fn: () => { hideError(); window.initSession ? window.initSession() : window.location.reload(); } }
    },
    no_api_key: {
      icon: '🔑',
      title: 'API key missing',
      body:  'Set your OpenAI API key before running:',
      code:  'export OPENAI_API_KEY=sk-...',
      action: { label: 'Reload after adding key', fn: () => location.reload() }
    },
    codex_missing: {
      icon: '⚙',
      title: 'Codex CLI not found',
      body:  'Install Codex CLI first:',
      code:  'npm install -g @openai/codex',
      action: { label: 'Reload after installing', fn: () => location.reload() }
    },
    empty: {
      icon: '○',
      title: 'Waiting for first file...',
      body:  'Codex is starting up. Nodes will appear here automatically.',
      code:  null, action: null
    },
  };
  
  const e = ERRORS[type];
  if (!e) return;
  
  const el = document.getElementById('error-overlay');
  if (!el) return;
  
  el.innerHTML = `
    <div style="text-align:center;max-width:380px;
                background:#fff;border:0.5px solid #c7cad5;
                border-radius:16px;padding:32px;
                box-shadow:0 8px 32px rgba(0,0,0,0.10)">
      <div style="font-size:28px;margin-bottom:12px">${e.icon}</div>
      <div style="font-family:'Roobert PRO Medium',sans-serif;
                  font-size:18px;font-weight:500;
                  color:#1c1c1e;margin-bottom:8px">${e.title}</div>
      <div style="font-size:14px;color:#555a6a;
                  line-height:1.6;margin-bottom:${e.code?'12px':'0'}">${e.body}</div>
      ${e.code ? `<code style="display:block;font-family:'IBM Plex Mono',monospace;
                               font-size:12px;background:#f0efe9;padding:8px 12px;
                               border-radius:8px;color:#1c1c1e;
                               margin-bottom:16px;text-align:left">${e.code}</code>` : ''}
      ${e.action ? `<button onclick="(${e.action.fn.toString()})()" style="
        background:#5b76fe;color:white;border:none;border-radius:8px;
        padding:10px 20px;font-size:14px;cursor:pointer;width:100%;
        font-family:'Roobert PRO Medium',sans-serif">${e.action.label}</button>` : ''}
    </div>
  `;
  el.style.display = 'flex';
}

function hideError() {
  const el = document.getElementById('error-overlay');
  if (el) el.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', showWelcomeIfNew);
window.addEventListener('codexmap:graph-hydrated', (event) => {
  if ((event.detail?.nodeCount || 0) > 0) {
    hideWelcomeOverlay();
  }
});
