/**
 * agents/healer.js — Agent A6: Self-healing for red nodes using SQLite datastores
 */
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { getEngine } = require('../engines');
const { db, notify, TRIGGER_PATH } = require('../lib/db');

console.log('[HEALER] Agent started (SQLite database backend)');

const ROOT = path.resolve(__dirname, '..');
const SHARED_DIR = path.resolve(process.env.CODEXMAP_SHARED_DIR || path.join(ROOT, 'shared'));
const PROMPT_PATH = path.join(SHARED_DIR, 'prompt.txt');

const MAX_ATTEMPTS = 3;
let healing = false;

// Notify orchestrator that we are ready
if (process.send) {
  process.send({ type: 'ready' });
}

function isAutoHealEnabled() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'autoHeal'").get();
    return row && row.value === 'true';
  } catch (_) {
    return false;
  }
}

function getTrackedDir() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'tracking'").get();
    if (row && row.value) {
      const tracking = JSON.parse(row.value);
      if (tracking && typeof tracking.trackedPath === 'string' && tracking.trackedPath.trim()) {
        return path.resolve(tracking.trackedPath.trim());
      }
    }
  } catch (_) {}
  return path.resolve(process.env.CODEXMAP_OUTPUT_DIR || path.join(ROOT, 'output'));
}

function getNodeInfo(nodeId) {
  try {
    return db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId) || null;
  } catch (_) {
    return null;
  }
}

function resolveFilePath(nodeId) {
  const trackedDir = getTrackedDir();
  if (path.isAbsolute(nodeId)) return nodeId;
  return path.join(trackedDir, nodeId);
}

function buildHealPrompt(nodeId, originalPrompt, existingCode) {
  const trackedDir = getTrackedDir();
  let relativeId = nodeId;
  if (path.isAbsolute(nodeId)) {
    relativeId = path.relative(trackedDir, nodeId);
  }

  return `
The file at ${relativeId} has drifted from the original intent of this project.
Original project prompt: ${originalPrompt}

The current file content is:
\`\`\`
${existingCode ? existingCode.substring(0, 4000) : '<empty or missing>'}
\`\`\`

Rewrite the ENTIRE file at ${relativeId} so that it strictly and completely fulfills the responsibilities
described in the original prompt above. Rules:
- Do not add features, classes, or functions not described in the original prompt.
- Do not change any other files.
- Preserve the programming language and file extension.
- Output only the rewritten file using the file edit/update tool.

CRITICAL: You MUST use the file update/edit tools to create and modify files. DO NOT use the exec tool or shell commands (like mkdir or touch), as they will fail due to a known sandbox bug.
`.trim();
}

function writeEvent(type, payload) {
  try {
    db.prepare(`
      INSERT INTO events_queue (type, payload, timestamp)
      VALUES (?, ?, ?)
    `).run(type, JSON.stringify(payload), new Date().toISOString());
    notify('events');
  } catch (err) {
    console.error(`[HEALER] Failed to write event ${type}: ${err.message}`);
  }
}

function findNextPending() {
  try {
    return db.prepare(`
      SELECT * FROM heal_queue 
      WHERE status = 'pending' AND attemptCount < ? 
      ORDER BY enqueuedAt ASC LIMIT 1
    `).get(MAX_ATTEMPTS) || null;
  } catch (err) {
    console.error(`[HEALER] findNextPending error: ${err.message}`);
    return null;
  }
}

function healNode(entry) {
  return new Promise((resolve) => {
    const nodeInfo = getNodeInfo(entry.nodeId);
    const trackedDir = getTrackedDir();
    const filePath = resolveFilePath(entry.nodeId);
    const existingCode = nodeInfo?.code || (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '');
    const originalPrompt = fs.existsSync(PROMPT_PATH) ? fs.readFileSync(PROMPT_PATH, 'utf8').trim() : '';
    const healPrompt = buildHealPrompt(entry.nodeId, originalPrompt, existingCode);

    console.log(`[HEALER] 🛠 Healing ${entry.nodeId} (attempt ${(entry.attemptCount || 0)}/${MAX_ATTEMPTS})...`);

    // Write progress event to db events queue
    writeEvent('heal_progress', {
      nodeId: entry.nodeId,
      status: 'healing',
      label: (nodeInfo?.label || entry.nodeId.split('/').pop()),
      attempt: entry.attemptCount,
    });

    const env = { ...process.env };
    if (!env.OPENAI_API_KEY && env.CODEX_API_KEY) {
      env.OPENAI_API_KEY = env.CODEX_API_KEY;
    }

    const engineName = process.env.CODEXMAP_ENGINE || 'codex';
    const engine = getEngine(engineName);
    const codex = engine.reanchor({
      healPrompt,
      prompt: healPrompt,
      filePath,
      cwd: trackedDir,
      env,
    });

    let stdout = '';
    codex.stdout.on('data', (d) => { stdout += d.toString(); });
    codex.stderr.on('data', (d) => process.stderr.write(`[HEALER-ERR] ${d}`));

    codex.on('close', (code) => {
      const success = code === 0;

      let newCode = existingCode;
      if (fs.existsSync(filePath)) {
        newCode = fs.readFileSync(filePath, 'utf8');
      }

      console.log(`[HEALER] Finished ${entry.nodeId} with code ${code}`);

      resolve({
        success,
        exitCode: code,
        newCode,
        codeChanged: newCode !== existingCode,
      });
    });

    codex.on('error', (err) => {
      console.error(`[HEALER] ✖ Failed to spawn codex: ${err.message}`);
      resolve({ success: false, exitCode: -1, newCode: existingCode, codeChanged: false, error: err.message });
    });

    // Timeout after 60s
    setTimeout(() => {
      try { codex.kill('SIGTERM'); } catch (_) {}
    }, 60000);
  });
}

async function processQueue() {
  if (healing) return;

  const next = findNextPending();
  if (!next) return;

  healing = true;

  try {
    db.prepare(`
      UPDATE heal_queue SET 
        status = 'healing', 
        startedAt = ?, 
        attemptCount = attemptCount + 1 
      WHERE nodeId = ?
    `).run(new Date().toISOString(), next.nodeId);
    
    notify('heal_queue');
  } catch (err) {
    console.error(`[HEALER] Failed to update queue status for healing: ${err.message}`);
    healing = false;
    return;
  }

  // Reload the item to reflect the incremented attemptCount
  const activeEntry = db.prepare('SELECT * FROM heal_queue WHERE nodeId = ?').get(next.nodeId);
  const result = await healNode(activeEntry);

  const nodeInfo = getNodeInfo(next.nodeId);
  const label = nodeInfo?.label || next.nodeId.split('/').pop();

  try {
    if (result.success && result.codeChanged) {
      db.prepare(`
        UPDATE heal_queue SET 
          status = 'done', 
          completedAt = ? 
        WHERE nodeId = ?
      `).run(new Date().toISOString(), next.nodeId);

      const filePath = resolveFilePath(next.nodeId);
      const freshCode = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : result.newCode;

      // Update nodes table: set code, grade to pending, score to 0
      db.prepare(`
        UPDATE nodes SET 
          code = ?, 
          grade = 'pending', 
          score = 0, 
          lastUpdated = ? 
        WHERE id = ?
      `).run(freshCode, new Date().toISOString(), next.nodeId);

      console.log(`[HEALER] ✅ ${next.nodeId} rewritten successfully`);
      notify('graph_update');

      writeEvent('heal_complete', {
        nodeId: next.nodeId,
        grade: 'pending',
        score: 0,
        S_final: 0,
        label,
        improved: true,
      });
    } else {
      db.prepare(`
        UPDATE heal_queue SET 
          status = 'failed', 
          completedAt = ?, 
          error = ? 
        WHERE nodeId = ?
      `).run(new Date().toISOString(), result.error || 'Rewrite failed', next.nodeId);

      console.log(`[HEALER] ❌ ${next.nodeId} failed (code=${result.exitCode})`);

      writeEvent('heal_complete', {
        nodeId: next.nodeId,
        grade: 'red',
        score: nodeInfo?.score || 0,
        S_final: nodeInfo?.score || 0,
        label,
        improved: false,
      });
    }

    notify('heal_queue');
  } catch (err) {
    console.error(`[HEALER] Failed to finalize heal: ${err.message}`);
  }

  healing = false;
  setTimeout(processQueue, 2000);
}

function autoEnqueueRedNodes() {
  if (!isAutoHealEnabled()) return;

  try {
    const redNodes = db.prepare(`
      SELECT id, score, type, path FROM nodes 
      WHERE grade = 'red' AND type NOT IN ('directory', 'block')
    `).all();

    const now = new Date().toISOString();
    let changed = false;

    for (const node of redNodes) {
      const targetNodeId = node.type === 'function' ? node.path : node.id;
      
      const existing = db.prepare('SELECT status, attemptCount FROM heal_queue WHERE nodeId = ?').get(targetNodeId);
      if (!existing) {
        db.prepare(`
          INSERT INTO heal_queue (nodeId, status, batchId, triggeredBy, enqueuedAt, attemptCount, reanchorOutputFlag)
          VALUES (?, 'pending', 'healer-auto', 'auto', ?, 0, 1)
        `).run(targetNodeId, now);
        changed = true;
      } else if (existing.status === 'failed' && existing.attemptCount < MAX_ATTEMPTS) {
        db.prepare(`
          UPDATE heal_queue SET 
            status = 'pending', 
            triggeredBy = 'auto', 
            enqueuedAt = ?, 
            startedAt = NULL, 
            completedAt = NULL, 
            reanchorOutputFlag = 1 
          WHERE nodeId = ?
        `).run(now, targetNodeId);
        changed = true;
      }
    }

    if (changed) {
      notify('heal_queue');
    }
  } catch (err) {
    console.error(`[HEALER] autoEnqueueRedNodes error: ${err.message}`);
  }
}

const sharedWatcher = chokidar.watch(TRIGGER_PATH, {
  ignoreInitial: false,
  persistent: true
});

sharedWatcher.on('all', (event, filePath) => {
  if (!['add', 'change'].includes(event)) {
    return;
  }
  try {
    if (fs.existsSync(TRIGGER_PATH)) {
      const trigger = JSON.parse(fs.readFileSync(TRIGGER_PATH, 'utf8'));
      if (trigger.type === 'heal_queue') {
        processQueue();
      } else if (trigger.type === 'graph_update') {
        autoEnqueueRedNodes();
        processQueue();
      }
    }
  } catch (err) {
    // Fallback if trigger file is temporarily empty/locked during write
    processQueue();
  }
});

// Handle manual heal requests via IPC
process.on('message', (msg) => {
  if (msg.type === 'heal_node') {
    try {
      const now = new Date().toISOString();
      const nodeInfo = db.prepare('SELECT type, path FROM nodes WHERE id = ?').get(msg.nodeId);
      const targetNodeId = (nodeInfo && nodeInfo.type === 'function') ? nodeInfo.path : msg.nodeId;
      
      db.prepare(`
        INSERT INTO heal_queue (nodeId, status, batchId, triggeredBy, enqueuedAt, attemptCount, reanchorOutputFlag)
        VALUES (?, 'pending', 'ipc-trigger', 'manual', ?, 0, 1)
        ON CONFLICT(nodeId) DO UPDATE SET
          status = 'pending',
          enqueuedAt = ?,
          attemptCount = 0,
          reanchorOutputFlag = 1
      `).run(targetNodeId, now, now);
      notify('heal_queue');
      processQueue();
    } catch (err) {
      console.error(`[HEALER] IPC heal_node trigger error: ${err.message}`);
    }
  }
});

processQueue();
autoEnqueueRedNodes();
