// agents/sentinel.js — Sentinel Agent: scoring drift and trigger collapse warnings
const chokidar = require('chokidar');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');
const { db, notify, TRIGGER_PATH } = require('../lib/db');
const { trackEmbeddingCost } = require('../lib/cost');

const ROOT_DIR = path.resolve(__dirname, '..');
const SHARED_DIR = path.resolve(process.env.CODEXMAP_SHARED_DIR || path.join(ROOT_DIR, 'shared'));
const PROMPT_PATH = path.join(SHARED_DIR, 'prompt.txt');
const AUTO_HEAL = process.argv.includes('--auto-heal');

const prompt = fs.existsSync(PROMPT_PATH) ? fs.readFileSync(PROMPT_PATH, 'utf8') : '';
const promptEmbedding = runEmbed(prompt);
const embeddingCache = new Map();
const reanchorRegistry = new Set();
const queuedNodes = new Set();
const edgeHistory = [];
let baselineCC = null;
let baselineEdgeRate = null;
const sessionStart = Date.now();

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function runEmbed(text) {
  const estimatedTokens = Math.ceil((text || '').length / 4);
  trackEmbeddingCost(estimatedTokens);

  if (process.env.CODEXMAP_ENGINE === 'fake' || !process.env.OPENAI_API_KEY) {
    const embedding = new Array(1536).fill(0);
    if (text.includes('Re-anchored by fake engine')) {
      embedding[0] = 0.85;
    } else if (text.includes('drift') || text.includes('error')) {
      embedding[0] = 0.3;
    } else {
      embedding[0] = 0.78;
    }
    return embedding;
  }

  try {
    const output = execSync('python3 scripts/embed.py', {
      cwd: ROOT_DIR,
      input: text || '',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return JSON.parse(output);
  } catch (error) {
    console.error(`[SENTINEL] Failed to embed text: ${error.stderr ? error.stderr.toString() : error.message}`);
    process.exit(1);
  }
}

function runSimilarity(first, second) {
  if (process.env.CODEXMAP_ENGINE === 'fake' || !process.env.OPENAI_API_KEY) {
    return second[0];
  }

  try {
    const output = execSync('python3 scripts/similarity.py', {
      cwd: ROOT_DIR,
      input: `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return Number.parseFloat(output.trim());
  } catch (error) {
    console.error(`[SENTINEL] Failed to compute similarity: ${error.stderr ? error.stderr.toString() : error.message}`);
    return 0;
  }
}

function isReanchoring(node) {
  if (reanchorRegistry.has(node.id) || reanchorRegistry.has(node.path)) {
    return true;
  }
  try {
    const entry = db.prepare(`
      SELECT status FROM heal_queue 
      WHERE nodeId = ? AND reanchorOutputFlag = 1 AND status != 'done'
    `).get(node.id);
    return !!entry;
  } catch (e) {
    return false;
  }
}function gradeForScore(score) {
  if (score >= 0.75) {
    return 'green';
  }
  if (score >= 0.5) {
    return 'yellow';
  }
  return 'red';
}

let pageRankMap = new Map();

function calculatePageRank() {
  try {
    const nodes = db.prepare('SELECT id FROM nodes').all().map(n => n.id);
    const edges = db.prepare('SELECT source, target FROM edges').all();
    
    const N = nodes.length;
    if (N === 0) return new Map();
    
    // Initialize PageRank
    const pr = new Map();
    for (const id of nodes) {
      pr.set(id, 1 / N);
    }
    
    // Build adjacency list (incoming edges represent imports: A imports B -> link A to B)
    const incoming = new Map();
    const outDegree = new Map();
    for (const id of nodes) {
      incoming.set(id, []);
      outDegree.set(id, 0);
    }
    
    for (const edge of edges) {
      if (incoming.has(edge.target)) {
        incoming.get(edge.target).push(edge.source);
      }
      if (outDegree.has(edge.source)) {
        outDegree.set(edge.source, outDegree.get(edge.source) + 1);
      }
    }
    
    const damping = 0.85;
    const iterations = 15;
    
    for (let iter = 0; iter < iterations; iter++) {
      const nextPr = new Map();
      let sinkSum = 0;
      
      for (const id of nodes) {
        if (outDegree.get(id) === 0) {
          sinkSum += pr.get(id);
        }
      }
      
      for (const id of nodes) {
        let sum = 0;
        for (const src of incoming.get(id)) {
          sum += pr.get(src) / outDegree.get(src);
        }
        const newRank = (1 - damping) / N + damping * (sum + sinkSum / N);
        nextPr.set(id, newRank);
      }
      
      for (const id of nodes) {
        pr.set(id, nextPr.get(id));
      }
    }
    
    // Normalize to [0, 1]
    let maxPr = 0;
    for (const rank of pr.values()) {
      if (rank > maxPr) maxPr = rank;
    }
    
    const normalizedPr = new Map();
    for (const [id, rank] of pr.entries()) {
      normalizedPr.set(id, maxPr > 0 ? rank / maxPr : 0);
    }
    
    return normalizedPr;
  } catch (err) {
    console.error('[SENTINEL] calculatePageRank error:', err.message);
    return new Map();
  }
}

const stopWords = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'if', 'else',
  'for', 'while', 'var', 'let', 'const', 'function', 'class', 'import', 'require',
  'return', 'new', 'this', 'to', 'of', 'in', 'with', 'by', 'as', 'from'
]);

function tokenize(text) {
  return (text || '').toLowerCase().split(/[^a-z0-9_]+/i).filter(t => t.length > 1);
}

function computeBM25(nodeText, allNodesText, promptText) {
  const N = allNodesText.length || 1;
  let totalLen = 0;
  const dfMap = new Map();
  
  for (const tokens of allNodesText) {
    totalLen += tokens.length;
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      dfMap.set(token, (dfMap.get(token) || 0) + 1);
    }
  }
  
  const avgDocLen = totalLen / N || 1;
  const docTokens = tokenize(nodeText);
  const docLen = docTokens.length;
  const promptTokens = tokenize(promptText);
  
  const tfMap = new Map();
  for (const t of docTokens) {
    tfMap.set(t, (tfMap.get(t) || 0) + 1);
  }
  
  let score = 0;
  const k1 = 1.2;
  const b = 0.75;
  
  for (const term of promptTokens) {
    if (stopWords.has(term)) continue;
    const tf = tfMap.get(term) || 0;
    const df = dfMap.get(term) || 0;
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLen / avgDocLen));
    score += idf * (numerator / denominator);
  }
  
  return score > 0 ? score / (score + 5) : 0;
}

function computeT(node) {
  const code = node.code || '';
  if (!code.trim()) return 1.0;
  if (node.type !== 'file' && node.type !== 'function') return 1.0;

  let isUnparseable = false;
  if (node.type === 'file' && node.cyclomaticComplexity === null) {
    isUnparseable = true;
  }
  if (isUnparseable) return 0.1;

  let penalty = 0;
  const hasEval = /\beval\s*\(|\bnew\s+Function\s*\(/.test(code);
  if (hasEval) penalty += 0.4;

  const looseCount = (code.match(/\b==\b|\b!=\b/g) || []).length;
  if (looseCount > 0) {
    penalty += Math.min(0.2, looseCount * 0.05);
  }

  const anyCount = (code.match(/:\s*any\b/g) || []).length;
  if (anyCount > 0) {
    penalty += Math.min(0.3, anyCount * 0.05);
  }

  const hasDb = /db\./.test(code);
  const hasTry = /try\s*\{/.test(code);
  if (hasDb && !hasTry) {
    penalty += 0.15;
  }

  return Math.max(0.1, Math.min(1.0, 1.0 - penalty));
}

function computeA(node, nodeEmbedding) {
  if (node.type !== 'file' && node.type !== 'function') return 1.0;

  let parentSim = 1.0;
  let parentId = null;

  if (node.type === 'function') {
    parentId = node.path;
  } else if (node.id.includes('/')) {
    const parts = node.id.split('/');
    parts.pop();
    parentId = parts.join('/');
  }

  if (parentId) {
    const parent = db.prepare('SELECT code, summary FROM nodes WHERE id = ?').get(parentId);
    if (parent) {
      const parentText = `${parent.summary || ''}\n\n${parent.code || ''}`.slice(0, 4000);
      const parentHash = sha256(parentText);
      let parentEmbedding = embeddingCache.get(parentHash);
      if (!parentEmbedding) {
        parentEmbedding = runEmbed(parentText);
        embeddingCache.set(parentHash, parentEmbedding);
      }
      parentSim = Array.isArray(parentEmbedding) ? runSimilarity(nodeEmbedding, parentEmbedding) : 1.0;
    }
  }

  let depPenalty = 0;
  const nodeEdges = db.prepare('SELECT target FROM edges WHERE source = ?').all(node.id);
  for (const edge of nodeEdges) {
    const targetNode = db.prepare('SELECT grade FROM nodes WHERE id = ?').get(edge.target);
    if (targetNode && targetNode.grade === 'red') {
      depPenalty += 0.15;
    }
  }

  let ccPenalty = 0;
  if (node.type === 'file' && typeof node.cyclomaticComplexity === 'number' && node.cyclomaticComplexity > 10) {
    ccPenalty = Math.min(0.3, (node.cyclomaticComplexity - 10) * 0.03);
  }

  return Math.max(0.0, Math.min(1.0, parentSim - depPenalty - ccPenalty));
}

function updateNodeGrade(nodeId, score, grade, S1, S2, A, T, D, S_final) {
  try {
    db.prepare(`
      UPDATE nodes SET 
        score = ?, 
        grade = ?, 
        lastUpdated = ?,
        S1 = ?,
        S2 = ?,
        A = ?,
        T = ?,
        D = ?,
        S_final = ?
      WHERE id = ?
    `).run(score, grade, new Date().toISOString(), S1, S2, A, T, D, S_final, nodeId);
  } catch (error) {
    console.error(`[SENTINEL] Failed to update node grade: ${error.message}`);
  }
}

function reanchorNode(node) {
  if (!node) {
    return false;
  }

  const targetId = node.type === 'function' ? node.path : node.id;
  const targetNode = db.prepare('SELECT * FROM nodes WHERE id = ?').get(targetId);
  if (!targetNode || isReanchoring(targetNode)) {
    return false;
  }

  try {
    const now = new Date().toISOString();
    const triggeredBy = AUTO_HEAL ? 'auto' : 'manual';
    db.prepare(`
      INSERT INTO heal_queue (nodeId, status, batchId, triggeredBy, enqueuedAt, attemptCount, error, reanchorOutputFlag)
      VALUES (?, 'pending', 'sentinel-auto', ?, ?, 0, NULL, 1)
      ON CONFLICT(nodeId) DO UPDATE SET
        status = 'pending',
        triggeredBy = ?,
        enqueuedAt = ?,
        attemptCount = 0,
        error = NULL,
        reanchorOutputFlag = 1
    `).run(targetNode.id, triggeredBy, now, triggeredBy, now);
    
    notify('heal_queue');
    console.log(`[SENTINEL] Enqueued re-anchor in queue for ${targetNode.id}`);
    return true;
  } catch (err) {
    console.error(`[SENTINEL] Failed to enqueue re-anchor: ${err.message}`);
    return false;
  }
}

function computeDriftScore(nodes) {
  const scored = nodes.filter((node) => typeof node.score === 'number');
  if (scored.length === 0) {
    return 100;
  }

  const avg = scored.reduce((sum, node) => sum + node.score, 0) / scored.length;
  return Math.round(avg * 100);
}

function computeAverageCyclomaticComplexity(nodes) {
  const fileNodes = nodes.filter((node) => node.type === 'file' && typeof node.cyclomaticComplexity === 'number');
  if (fileNodes.length === 0) {
    return 0;
  }

  return fileNodes.reduce((sum, node) => sum + node.cyclomaticComplexity, 0) / fileNodes.length;
}

function computeEdgeGrowthRate(state) {
  const now = Date.now();
  edgeHistory.push({ timestamp: now, edges: (state.edges || []).length });

  while (edgeHistory.length > 0 && now - edgeHistory[0].timestamp > 5 * 60 * 1000) {
    edgeHistory.shift();
  }

  const elapsedMinutes = Math.max((now - sessionStart) / 60000, 1 / 60);
  const initialRate = (state.edges || []).length / elapsedMinutes;
  if (baselineEdgeRate === null && initialRate > 0) {
    baselineEdgeRate = initialRate;
  }

  if (edgeHistory.length < 2 || !baselineEdgeRate) {
    return 0;
  }

  const oldest = edgeHistory[0];
  const latest = edgeHistory[edgeHistory.length - 1];
  const windowMinutes = Math.max((latest.timestamp - oldest.timestamp) / 60000, 1 / 60);
  return (latest.edges - oldest.edges) / windowMinutes / baselineEdgeRate;
}

function checkArchitecturalCollapse() {
  try {
    const nodes = db.prepare('SELECT id, type, score, grade, cyclomaticComplexity FROM nodes').all();
    const edges = db.prepare('SELECT source, target FROM edges').all();
    const state = { nodes, edges };

    const scored = nodes.filter((node) => node.grade && node.grade !== 'pending');
    const redRatio = scored.length === 0 ? 0 : scored.filter((node) => node.grade === 'red').length / scored.length;
    const avgCC = computeAverageCyclomaticComplexity(nodes);

    if (baselineCC === null && avgCC > 0) {
      baselineCC = avgCC;
    }

    const edgeGrowthRate = computeEdgeGrowthRate(state);
    const signals = [];

    if (redRatio > 0.4) {
      signals.push('red_node_density');
    }
    if (edgeGrowthRate > 3) {
      signals.push('dependency_graph_complexity');
    }
    if (baselineCC && avgCC > baselineCC * 2) {
      signals.push('cyclomatic_complexity');
    }

    const triggered = signals.length > 0 ? 1 : 0;
    const collapseState = {
      triggered: triggered === 1,
      signals,
      metrics: {
        redRatio,
        edgeGrowthRate,
        avgCC,
        baselineCC
      },
      timestamp: new Date().toISOString()
    };

    db.prepare(`
      INSERT OR REPLACE INTO collapse_state (key, triggered, signals, metrics, timestamp)
      VALUES ('main', ?, ?, ?, ?)
    `).run(
      triggered,
      JSON.stringify(signals),
      JSON.stringify(collapseState.metrics),
      collapseState.timestamp
    );

    // Queue WebSocket event
    db.prepare(`
      INSERT INTO events_queue (type, payload, timestamp)
      VALUES ('collapse_warning', ?, ?)
    `).run(JSON.stringify(collapseState), collapseState.timestamp);

    notify('collapse_state');
    notify('events');
  } catch (err) {
    console.error(`[SENTINEL] Collapse check failed: ${err.message}`);
  }
}

function clearReanchorFlag(nodeId) {
  try {
    db.prepare('UPDATE heal_queue SET reanchorOutputFlag = 0 WHERE nodeId = ?').run(nodeId);
    notify('heal_queue');
    console.log(`[SENTINEL] Cleared reanchorOutputFlag in DB for ${nodeId}`);
  } catch (err) {
    console.error(`[SENTINEL] Failed to clear reanchorOutputFlag: ${err.message}`);
  }
}

function scoreNode(nodeId) {
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);

  if (!node || node.grade !== 'pending' || isReanchoring(node)) {
    return;
  }

  const text = `${node.summary || ''}\n\n${node.code || ''}`.slice(0, 4000);
  const hash = sha256(text);

  let nodeEmbedding = embeddingCache.get(hash);
  if (!nodeEmbedding) {
    nodeEmbedding = runEmbed(text);
    embeddingCache.set(hash, nodeEmbedding);
  }

  const s1 = Array.isArray(promptEmbedding) ? runSimilarity(promptEmbedding, nodeEmbedding) : 0;
  const S1 = Number.isFinite(s1) ? s1 : 0;

  // Compute S2 (BM25)
  const allNodes = db.prepare('SELECT code, summary FROM nodes').all();
  const allNodesText = allNodes.map(n => tokenize(`${n.summary || ''} ${n.code || ''}`));
  const S2 = computeBM25(text, allNodesText, prompt);

  // Compute A (Architectural consistency)
  const A = computeA(node, nodeEmbedding);

  // Compute T (Type Safety)
  const T = computeT(node);

  // Compute D (Drift penalty based on PageRank)
  const pageIndex = pageRankMap.get(node.id) || 0;
  const D = - (pageIndex * (1 - S1));

  // Compute final score
  const finalScore = Math.max(0, Math.min(1, (S1 + S2 + A + T) / 4 + D));
  const grade = gradeForScore(finalScore);

  updateNodeGrade(node.id, finalScore, grade, S1, S2, A, T, D, finalScore);

  // Write grade event
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO events_queue (type, payload, timestamp)
    VALUES ('node_grade', ?, ?)
  `).run(
    JSON.stringify({
      id: node.id,
      label: node.label,
      grade,
      score: finalScore,
      S_final: finalScore,
      S1,
      S2,
      A,
      T,
      D,
      type: node.type,
      path: node.path,
      timestamp: now
    }),
    now
  );

  console.log(`[SENTINEL] scored ${node.id} -> ${grade} (${finalScore.toFixed(4)}) (S1=${S1.toFixed(2)}, S2=${S2.toFixed(2)}, A=${A.toFixed(2)}, T=${T.toFixed(2)}, D=${D.toFixed(2)})`);
  
  clearReanchorFlag(node.id);
  checkArchitecturalCollapse();
  notify('events');

  if (AUTO_HEAL && finalScore < 0.4 && !isReanchoring(node)) {
    reanchorNode(node);
  }
}

function queuePendingNodes() {
  try {
    pageRankMap = calculatePageRank();
    const pendingNodes = db.prepare("SELECT * FROM nodes WHERE grade = 'pending'").all();
    for (const node of pendingNodes) {
      if (isReanchoring(node) || queuedNodes.has(node.id)) {
        continue;
      }

      queuedNodes.add(node.id);
      setImmediate(() => {
        queuedNodes.delete(node.id);
        try {
          scoreNode(node.id);
        } catch (error) {
          console.error(`[SENTINEL] scoring failure for ${node.id}: ${error.message}`);
        }
      });
    }
  } catch (error) {
    console.error(`[SENTINEL] queuePendingNodes failure: ${error.message}`);
  }
}

function updateDriftLog() {
  try {
    const nodes = db.prepare('SELECT score FROM nodes WHERE score IS NOT NULL').all();
    const score = computeDriftScore(nodes);
    
    const now = new Date().toISOString();
    let annotation = null;

    const history = db.prepare('SELECT score FROM drift_log ORDER BY timestamp DESC LIMIT 2').all();
    if (history.length === 2) {
      const previous = history[0].score;
      const beforePrevious = history[1].score;
      if (previous - score > 10 && beforePrevious - previous > 10) {
        annotation = 'Drift increasing — context likely weakening';
      }
    }

    db.prepare('INSERT OR REPLACE INTO drift_log (timestamp, score, annotation) VALUES (?, ?, ?)')
      .run(now, score, annotation);

    db.prepare(`
      INSERT INTO events_queue (type, payload, timestamp)
      VALUES ('drift_score', ?, ?)
    `).run(
      JSON.stringify({ timestamp: now, score, annotation }),
      now
    );

    notify('drift_log');
    notify('events');
  } catch (err) {
    console.error(`[SENTINEL] Failed to update drift log: ${err.message}`);
  }
}

const watcher = chokidar.watch(TRIGGER_PATH, {
  ignoreInitial: false,
  persistent: true
});

watcher.on('all', (event, filePath) => {
  if (!['add', 'change'].includes(event)) {
    return;
  }

  try {
    if (fs.existsSync(TRIGGER_PATH)) {
      const trigger = JSON.parse(fs.readFileSync(TRIGGER_PATH, 'utf8'));
      if (trigger.type === 'graph_update') {
        queuePendingNodes();
      }
    }
  } catch (err) {
    // Fallback if trigger file is temporarily empty/locked during write
    queuePendingNodes();
  }
});

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/session-drift-log') {
    try {
      const driftLog = db.prepare('SELECT * FROM drift_log ORDER BY timestamp ASC').all();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(driftLog));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/reanchor') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(parsed.nodeId);

        if (!node) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Node not found' }));
          return;
        }

        const started = reanchorNode(node);
        res.writeHead(started ? 202 : 409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: started }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: error.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false }));
});

server.listen(4243);
queuePendingNodes();
updateDriftLog();
setInterval(updateDriftLog, 60000);

process.on('SIGINT', async () => {
  await watcher.close();
  server.close(() => process.exit(0));
});
