/**
 * agents/broadcaster.js — WebSocket Broadcaster: streaming database updates and events to client UI
 */
const chokidar = require('chokidar');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { db, notify, TRIGGER_PATH } = require('../lib/db');
const { readCostState } = require('../lib/cost');

const ROOT_DIR = path.resolve(__dirname, '..');
const SHARED_DIR = path.resolve(process.env.CODEXMAP_SHARED_DIR || path.join(ROOT_DIR, 'shared'));
const BATCH_MS = 500;

const JWT_SECRET = process.env.CODEXMAP_TOKEN_SECRET;

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

const PORT = Number(process.env.CODEXMAP_WS_PORT || process.env.CODEXMAP_PORT || 4242);
const wss = new WebSocket.Server({ port: PORT });

let lastState = { nodes: [], edges: [] };
let pendingState = null;
let batchTimer = null;
let lastEventId = 0;

// Initialize lastEventId to current max event ID to prevent replay of old events
try {
  const row = db.prepare('SELECT MAX(id) as maxId FROM events_queue').get();
  if (row && row.maxId) {
    lastEventId = row.maxId;
  }
} catch (_) {}

function getGraphState() {
  try {
    const nodes = db.prepare('SELECT * FROM nodes').all().map(row => ({
      ...row,
      children: JSON.parse(row.children || '[]'),
      score: row.score === null ? null : Number(row.score),
      cyclomaticComplexity: row.cyclomaticComplexity === null ? null : Number(row.cyclomaticComplexity),
      S1: row.S1 === null ? null : Number(row.S1),
      S2: row.S2 === null ? null : Number(row.S2),
      A: row.A === null ? null : Number(row.A),
      T: row.T === null ? null : Number(row.T),
      D: row.D === null ? null : Number(row.D),
      S_final: row.S_final === null ? null : Number(row.S_final)
    }));
    const edges = db.prepare('SELECT * FROM edges').all();
    return { nodes, edges };
  } catch (err) {
    console.error(`[BROADCASTER] Failed to query graph state: ${err.message}`);
    return { nodes: [], edges: [] };
  }
}

// Bootstrap lastState on startup
lastState = getGraphState();

function getPayloadKey(item) {
  if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'id')) {
    return `node:${item.id}`;
  }
  return `edge:${item.source}->${item.target}`;
}

function computeDiff(previousState, nextState) {
  const diff = [];
  const previousNodes = new Map((previousState.nodes || []).map((node) => [node.id, node]));
  const previousEdges = new Map((previousState.edges || []).map((edge) => [`${edge.source}->${edge.target}`, edge]));

  for (const node of nextState.nodes || []) {
    const previous = previousNodes.get(node.id);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(node)) {
      diff.push(node);
    }
  }

  for (const edge of nextState.edges || []) {
    const key = `${edge.source}->${edge.target}`;
    const previous = previousEdges.get(key);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(edge)) {
      diff.push(edge);
    }
  }

  return diff.sort((a, b) => getPayloadKey(a).localeCompare(getPayloadKey(b)));
}

function broadcast(type, payload) {
  const data = JSON.stringify({ type, payload });
  let clientCount = 0;

  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) {
      continue;
    }

    clientCount += 1;

    try {
      client.send(data);
    } catch (error) {
      console.error(`[BROADCASTER] send failure: ${error.message}`);
    }
  }

  console.log(`[BROADCASTER] sent ${type} to ${clientCount} client(s)`);
}

function flushGraphUpdate() {
  batchTimer = null;
  if (!pendingState) {
    return;
  }

  const diff = computeDiff(lastState, pendingState);
  lastState = pendingState;
  pendingState = null;

  if (diff.length === 0) {
    return;
  }

  broadcast('graph_update', diff);
}

function queueGraphUpdate() {
  pendingState = getGraphState();
  if (batchTimer) {
    return;
  }
  batchTimer = setTimeout(flushGraphUpdate, BATCH_MS);
}

function flushEventsQueue() {
  try {
    const events = db.prepare('SELECT * FROM events_queue WHERE id > ? ORDER BY id ASC').all(lastEventId);
    for (const event of events) {
      lastEventId = Math.max(lastEventId, event.id);
      const payload = JSON.parse(event.payload);
      broadcast(event.type, payload);
    }
  } catch (err) {
    console.error(`[BROADCASTER] flushEventsQueue error: ${err.message}`);
  }
}

wss.on('connection', (socket, req) => {
  socket.on('error', () => {});

  // Authenticate WebSocket connection
  let authenticated = false;
  if (process.env.CODEXMAP_DISABLE_AUTH === 'true') {
    authenticated = true;
  } else if (!JWT_SECRET) {
    authenticated = true;
  } else {
    try {
      const parsed = url.parse(req.url, true);
      const token = parsed.query.token;
      const verified = verifyToken(token, JWT_SECRET);
      console.warn(`[BROADCASTER] Auth check - URL: ${req.url}, token exists: ${!!token}, verified: ${!!verified}`);
      if (verified) {
        authenticated = true;
      }
    } catch (err) {
      console.error('[BROADCASTER] Auth parsing error:', err.message);
    }
  }

  if (!authenticated) {
    console.warn('[BROADCASTER] Rejecting unauthorized WebSocket connection attempt.');
    socket.close(4001, 'Unauthorized');
    return;
  }

  // Bootstrap data on success
  try {
    const state = getGraphState();
    socket.send(JSON.stringify({ type: 'full_reset', payload: state }));

    const driftRow = db.prepare('SELECT * FROM drift_log ORDER BY timestamp DESC LIMIT 1').get();
    if (driftRow) {
      socket.send(JSON.stringify({ type: 'drift_score', payload: driftRow }));
    }

    const collapseRow = db.prepare("SELECT * FROM collapse_state WHERE key = 'main'").get();
    if (collapseRow) {
      socket.send(JSON.stringify({
        type: 'collapse_warning',
        payload: {
          triggered: collapseRow.triggered === 1,
          signals: JSON.parse(collapseRow.signals || '[]'),
          metrics: JSON.parse(collapseRow.metrics || '{}'),
          timestamp: collapseRow.timestamp
        }
      }));
    }

    const autoHealRow = db.prepare("SELECT value FROM settings WHERE key = 'autoHeal'").get();
    if (autoHealRow) {
      socket.send(JSON.stringify({ type: 'settings_update', payload: { autoHeal: autoHealRow.value === 'true' } }));
    }

    const costState = readCostState();
    if (costState) {
      socket.send(JSON.stringify({
        type: 'cost_update',
        payload: {
          total_tokens: costState.total_tokens,
          total_cost_usd: costState.total_cost_usd,
          calls: costState.calls
        }
      }));
    }
  } catch (error) {
    console.error(`[BROADCASTER] connection bootstrap failure: ${error.message}`);
  }

  // Handle client-to-server WS messages (such as auto-heal checkbox or full re-anchor triggers)
  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'request_full_reset') {
        const state = getGraphState();
        socket.send(JSON.stringify({ type: 'full_reset', payload: state }));
        
        const driftRow = db.prepare('SELECT * FROM drift_log ORDER BY timestamp DESC LIMIT 1').get();
        if (driftRow) {
          socket.send(JSON.stringify({ type: 'drift_score', payload: driftRow }));
        }
        
        const collapseRow = db.prepare("SELECT * FROM collapse_state WHERE key = 'main'").get();
        if (collapseRow) {
          socket.send(JSON.stringify({
            type: 'collapse_warning',
            payload: {
              triggered: collapseRow.triggered === 1,
              signals: JSON.parse(collapseRow.signals || '[]'),
              metrics: JSON.parse(collapseRow.metrics || '{}'),
              timestamp: collapseRow.timestamp
            }
          }));
        }

        const autoHealRow = db.prepare("SELECT value FROM settings WHERE key = 'autoHeal'").get();
        if (autoHealRow) {
          socket.send(JSON.stringify({ type: 'settings_update', payload: { autoHeal: autoHealRow.value === 'true' } }));
        }

        const costState = readCostState();
        if (costState) {
          socket.send(JSON.stringify({
            type: 'cost_update',
            payload: {
              total_tokens: costState.total_tokens,
              total_cost_usd: costState.total_cost_usd,
              calls: costState.calls
            }
          }));
        }
      }
      
      if (msg.type === 'set_autoheal') {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('autoHeal', ?)")
          .run(msg.enabled ? 'true' : 'false');
        notify('settings');
        
        broadcast('settings_update', { autoHeal: msg.enabled });
      }

      if (msg.type === 'full_reanchor') {
        const redNodes = db.prepare("SELECT id, type, path FROM nodes WHERE grade = 'red'").all();
        const now = new Date().toISOString();
        db.exec('BEGIN TRANSACTION');
        try {
          for (const node of redNodes) {
            const targetNodeId = node.type === 'function' ? node.path : node.id;
            db.prepare(`
              INSERT INTO heal_queue (nodeId, status, batchId, triggeredBy, enqueuedAt, attemptCount, reanchorOutputFlag)
              VALUES (?, 'pending', 'full-reanchor', 'manual', ?, 0, 1)
              ON CONFLICT(nodeId) DO UPDATE SET
                status = 'pending',
                enqueuedAt = ?,
                attemptCount = 0,
                reanchorOutputFlag = 1
            `).run(targetNodeId, now, now);
          }
          db.exec('COMMIT');
          notify('heal_queue');
        } catch (err) {
          db.exec('ROLLBACK');
          console.error(`[BROADCASTER] full_reanchor error: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`[BROADCASTER] Client message handling failure: ${err.message}`);
    }
  });
});

const watcher = chokidar.watch(TRIGGER_PATH, {
  ignoreInitial: false,
  persistent: true
});

watcher.on('all', (event, watchedPath) => {
  if (!['add', 'change'].includes(event)) {
    return;
  }

  try {
    if (fs.existsSync(TRIGGER_PATH)) {
      const trigger = JSON.parse(fs.readFileSync(TRIGGER_PATH, 'utf8'));
      if (trigger.type === 'graph_update') {
        queueGraphUpdate();
      }
      flushEventsQueue();
    }
  } catch (err) {
    queueGraphUpdate();
    flushEventsQueue();
  }
});

// Fallback polling for robust event and graph updates on all platforms (e.g. macOS chokidar bypass)
const fallbackInterval = setInterval(() => {
  if (wss.clients.size > 0) {
    flushEventsQueue();
    queueGraphUpdate();
  }
}, 1000);

process.on('SIGINT', async () => {
  clearInterval(fallbackInterval);
  if (batchTimer) {
    clearTimeout(batchTimer);
    flushGraphUpdate();
  }
  await watcher.close();
  wss.close(() => process.exit(0));
});
