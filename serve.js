/**
 * serve.js - local HTTP sidecar for the CodexMap browser UI.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { ensureDir, readJsonSafe, safeInside } = require('./lib/atomic');
const { db, notify } = require('./lib/db');

const ROOT = __dirname;
const UI_DIR = path.join(ROOT, 'ui');
const STITCH_DIR = path.join(ROOT, 'stitch_codexmap_codebase_intelligence_dashboard');
const SHARED_DIR = path.resolve(process.env.CODEXMAP_SHARED_DIR || path.join(ROOT, 'shared'));
const OUTPUT_DIR = path.resolve(process.env.CODEXMAP_OUTPUT_DIR || path.join(ROOT, 'output'));
const WORKSPACE_DIR = path.resolve(process.env.CODEXMAP_WORKSPACE_DIR || process.cwd());
const HOST = process.env.CODEXMAP_HOST || '127.0.0.1';
const PORT = Number(process.env.CODEXMAP_HTTP_PORT || 3333);

const PATHS = {
  session: path.join(process.env.CODEXMAP_SESSION_DIR || SHARED_DIR, 'session.json'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

ensureDir(SHARED_DIR);
ensureDir(OUTPUT_DIR);

const JWT_SECRET = process.env.CODEXMAP_TOKEN_SECRET;

// Native HS256 JWT utilities
function signToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token, secret) {
  if (!token) return null;
  try {
    const [header, body, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

// Session-bound token generated at startup
const sessionToken = JWT_SECRET ? signToken({ session: process.env.CODEXMAP_SESSION_ID || 'codexmap-session' }, JWT_SECRET) : null;

function verifyAuth(req) {
  if (process.env.CODEXMAP_DISABLE_AUTH === 'true') return true;
  if (!JWT_SECRET) return true; // Bypass in dev when running standalone
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice('Bearer '.length).trim();
  const payload = verifyToken(token, JWT_SECRET);
  return !!payload;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeNodeIds(payload) {
  const ids = [];
  if (payload && typeof payload.nodeId === 'string') ids.push(payload.nodeId);
  if (payload && Array.isArray(payload.nodeIds)) {
    payload.nodeIds.forEach((nodeId) => {
      if (typeof nodeId === 'string') ids.push(nodeId);
    });
  }
  return [...new Set(ids.map((nodeId) => nodeId.trim()).filter(Boolean))];
}

function enqueueHealRequests(payload) {
  const nodeIds = normalizeNodeIds(payload);
  const batchId = payload.batchId || `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  
  const queued = [];
  const skipped = [];
  
  const selectStmt = db.prepare('SELECT status FROM heal_queue WHERE nodeId = ?');
  const insertStmt = db.prepare(`
    INSERT INTO heal_queue (nodeId, status, batchId, triggeredBy, enqueuedAt, attemptCount, error, reanchorOutputFlag)
    VALUES (?, 'pending', ?, ?, ?, 0, NULL, 1)
    ON CONFLICT(nodeId) DO UPDATE SET
      status = 'pending',
      batchId = ?,
      triggeredBy = ?,
      enqueuedAt = ?,
      attemptCount = 0,
      error = NULL,
      reanchorOutputFlag = 1
    WHERE status NOT IN ('pending', 'healing')
  `);

  for (const nodeId of nodeIds) {
    const nodeInfo = db.prepare('SELECT type, path FROM nodes WHERE id = ?').get(nodeId);
    const targetNodeId = (nodeInfo && nodeInfo.type === 'function') ? nodeInfo.path : nodeId;

    const existing = selectStmt.get(targetNodeId);
    if (existing && (existing.status === 'pending' || existing.status === 'healing')) {
      skipped.push({ nodeId: targetNodeId, reason: `already ${existing.status}` });
      continue;
    }
    const now = new Date().toISOString();
    const triggeredBy = payload.triggeredBy || 'manual';
    insertStmt.run(targetNodeId, batchId, triggeredBy, now, batchId, triggeredBy, now);
    queued.push(targetNodeId);
  }
  
  notify('heal_queue');
  return { status: 'queued', batchId, queued, skipped };
}

function getActiveWatchPath() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'activeWatch'").get();
    if (row && row.value) return row.value;
  } catch (_) {}
  return OUTPUT_DIR;
}

function isLocalRequest(req) {
  const addr = req.socket.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch (_) {
    return false;
  }
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*",
    ].join('; ')
  );
}

function serveFile(res, filePath, baseDir) {
  const resolved = path.resolve(filePath);
  if (!safeInside(baseDir, resolved)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      sendText(res, 404, 'Not found');
      return;
    }
    const mime = MIME[path.extname(resolved)] || 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

async function handleApi(req, res, pathname, parsed) {
  if (req.method === 'GET' && pathname === '/api/health') {
    let nodeCount = 0;
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM nodes').get();
      nodeCount = row ? row.count : 0;
    } catch (_) {}
    sendJson(res, 200, {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      sessionId: process.env.CODEXMAP_SESSION_ID || null,
      ports: {
        http: PORT,
        websocket: Number(process.env.CODEXMAP_WS_PORT || process.env.CODEXMAP_PORT || 4242),
      },
      nodes: nodeCount,
      engine: process.env.CODEXMAP_ENGINE || 'codex',
      cloudScoring: process.env.CODEXMAP_CLOUD_SCORING !== 'false',
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/session') {
    if (!verifyAuth(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return true;
    }
    sendJson(res, 200, {
      ...readJsonSafe(PATHS.session, {}),
      sessionId: process.env.CODEXMAP_SESSION_ID || null,
      sessionDir: process.env.CODEXMAP_SESSION_DIR || null,
      sharedDir: SHARED_DIR,
      outputDir: OUTPUT_DIR,
      uiUrl: process.env.CODEXMAP_UI_URL || `http://${HOST}:${PORT}`,
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/state') {
    if (!verifyAuth(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return true;
    }
    try {
      const nodes = db.prepare('SELECT * FROM nodes').all().map(row => ({
        ...row,
        children: JSON.parse(row.children || '[]'),
        score: row.score === null ? null : Number(row.score),
        cyclomaticComplexity: row.cyclomaticComplexity === null ? null : Number(row.cyclomaticComplexity)
      }));
      const edges = db.prepare('SELECT * FROM edges').all();
      sendJson(res, 200, { version: 1, nodes, edges, meta: {} });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/drift-log') {
    if (!verifyAuth(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return true;
    }
    try {
      const driftLog = db.prepare('SELECT * FROM drift_log ORDER BY timestamp ASC').all();
      sendJson(res, 200, driftLog);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/heal-queue') {
    if (!verifyAuth(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return true;
    }
    try {
      const queue = db.prepare('SELECT * FROM heal_queue ORDER BY enqueuedAt ASC').all().map(row => ({
        ...row,
        reanchorOutputFlag: row.reanchorOutputFlag === 1,
        attemptCount: Number(row.attemptCount)
      }));
      sendJson(res, 200, { queue });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  if (req.method === 'POST' && (pathname === '/api/reheal' || pathname === '/api/reanchor' || pathname === '/reheal' || pathname === '/reanchor')) {
    if (!isAllowedOrigin(req)) {
      sendJson(res, 403, { error: 'origin not allowed' });
      return true;
    }
    if (!verifyAuth(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return true;
    }
    try {
      const payload = await readBody(req);
      const nodeIds = normalizeNodeIds(payload);
      if (nodeIds.length === 0) throw new Error('missing nodeId or nodeIds');
      const result = enqueueHealRequests(payload);
      console.log(`[SERVE] Re-heal queued: ${result.queued.length} queued, ${result.skipped.length} skipped`);
      sendJson(res, 200, {
        ...result,
        nodeId: nodeIds.length === 1 ? nodeIds[0] : undefined,
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (req.method === 'GET' && pathname === '/ls') {
    if (!verifyAuth(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return true;
    }
    const rawPath = parsed.query.path || WORKSPACE_DIR;
    const resolved = path.resolve(String(rawPath));
    if (!safeInside(WORKSPACE_DIR, resolved)) {
      sendJson(res, 403, { error: 'path is outside the workspace' });
      return true;
    }
    try {
      const items = fs.readdirSync(resolved, { withFileTypes: true })
        .filter((item) => !item.name.startsWith('.') && item.name !== 'node_modules')
        .map((item) => ({
          name: item.name,
          isDir: item.isDirectory(),
          path: path.join(resolved, item.name),
        }));
      sendJson(res, 200, { current: resolved, items });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/set-target') {
    if (!isAllowedOrigin(req)) {
      sendJson(res, 403, { error: 'origin not allowed' });
      return true;
    }
    if (!verifyAuth(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return true;
    }
    try {
      const payload = await readBody(req);
      const newPath = path.resolve(String(payload.path || ''));
      if (!safeInside(WORKSPACE_DIR, newPath)) throw new Error('path is outside the workspace');
      if (!fs.existsSync(newPath)) throw new Error('path does not exist');
      
      const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      stmt.run('activeWatch', newPath);
      notify('settings');
      
      sendJson(res, 200, { status: 'ok', path: newPath });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (req.method === 'GET' && pathname === '/browse') {
    if (!verifyAuth(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return true;
    }
    const activePath = getActiveWatchPath();
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    execFile(opener, [activePath], () => {});
    sendJson(res, 200, { status: 'opened', path: activePath });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);

  if (!isLocalRequest(req)) {
    sendText(res, 403, 'CodexMap only accepts local browser connections by default.');
    return;
  }

  const parsed = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsed.pathname || '/');
  if (pathname === '/') pathname = '/index.html';

  if (pathname.startsWith('/api/') || ['/reheal', '/reanchor', '/ls', '/set-target', '/browse'].includes(pathname)) {
    if (await handleApi(req, res, pathname, parsed)) return;
  }

  if (pathname === '/index.html') {
    let content = fs.readFileSync(path.join(UI_DIR, 'index.html'), 'utf8');
    const wsPort = Number(process.env.CODEXMAP_WS_PORT || process.env.CODEXMAP_PORT || 4242);
    let injection = `<script>`;
    if (sessionToken) {
      injection += `window.__CODEXMAP_TOKEN__ = "${sessionToken}"; `;
    }
    injection += `window.CODEXMAP_WS_PORT = ${wsPort};`;
    injection += `</script>\n</head>`;
    content = content.replace('</head>', injection);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
    return;
  }

  if (pathname.startsWith('/project-code/')) {
    const relative = pathname.slice('/project-code/'.length);
    serveFile(res, path.join(OUTPUT_DIR, relative), OUTPUT_DIR);
    return;
  }

  if (pathname.startsWith('/stitch/')) {
    serveFile(res, path.join(STITCH_DIR, pathname.slice('/stitch/'.length)), STITCH_DIR);
    return;
  }

  serveFile(res, path.join(UI_DIR, pathname), UI_DIR);
});

server.listen(PORT, HOST, () => {
  console.log(`CodexMap UI listening on http://${HOST}:${PORT}/?project=CodexMap`);
  console.log(`Session shared state: ${SHARED_DIR}`);
});
