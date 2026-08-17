const path = require('path');
const { atomicWriteJson, readJsonSafe, ensureDir } = require('./atomic');

function getSharedDir() {
  return path.resolve(process.env.CODEXMAP_SHARED_DIR || path.join(__dirname, '..', 'shared'));
}

function getCostFile(sharedDir = getSharedDir()) {
  return path.join(sharedDir, 'api-cost.json');
}

function getCostCapUsd() {
  const parsed = Number(process.env.CODEXMAP_COST_CAP_USD || 5);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
}

function isCloudScoringEnabled() {
  return !['0', 'false', 'no', 'off'].includes(String(process.env.CODEXMAP_CLOUD_SCORING || 'true').toLowerCase());
}

function readCostState(sharedDir = getSharedDir()) {
  return readJsonSafe(getCostFile(sharedDir), {
    total_tokens: 0,
    total_cost_usd: 0,
    calls: 0,
    cap_usd: getCostCapUsd(),
    cap_reached: false,
    cloud_scoring_enabled: isCloudScoringEnabled(),
  });
}

function writeCostState(state, sharedDir = getSharedDir()) {
  ensureDir(sharedDir);
  atomicWriteJson(getCostFile(sharedDir), {
    total_tokens: Number(state.total_tokens || 0),
    total_cost_usd: Number(state.total_cost_usd || 0),
    calls: Number(state.calls || 0),
    cap_usd: getCostCapUsd(),
    cap_reached: !!state.cap_reached,
    cloud_scoring_enabled: isCloudScoringEnabled(),
    session_start: state.session_start || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

function canSpendEstimated(tokens = 0, pricePer1k = 0.00002) {
  if (!isCloudScoringEnabled()) {
    return { allowed: false, reason: 'cloud scoring disabled' };
  }

  const state = readCostState();
  const cap = getCostCapUsd();
  const estimatedCost = (Number(tokens || 0) / 1000) * pricePer1k;
  const projected = Number(state.total_cost_usd || 0) + estimatedCost;

  if (projected > cap) {
    writeCostState({
      ...state,
      cap_reached: true,
    });
    return { allowed: false, reason: `cost cap $${cap.toFixed(2)} would be exceeded` };
  }

  return { allowed: true, reason: null };
}

function trackEmbeddingCost(tokens, pricePer1k = 0.00002) {
  const state = readCostState();
  const cost = (Number(tokens || 0) / 1000) * pricePer1k;
  const next = {
    ...state,
    total_tokens: Number(state.total_tokens || 0) + Number(tokens || 0),
    total_cost_usd: parseFloat((Number(state.total_cost_usd || 0) + cost).toFixed(6)),
    calls: Number(state.calls || 0) + 1,
  };
  next.cap_reached = next.total_cost_usd >= getCostCapUsd();
  writeCostState(next);

  try {
    const { db, notify } = require('./db');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO events_queue (type, payload, timestamp)
      VALUES ('cost_update', ?, ?)
    `).run(JSON.stringify({
      total_tokens: next.total_tokens,
      total_cost_usd: next.total_cost_usd,
      calls: next.calls
    }), now);
    notify('events');
  } catch (err) {
    console.error(`[COST] Failed to queue cost_update event: ${err.message}`);
  }

  return cost;
}

module.exports = {
  getCostCapUsd,
  getCostFile,
  getSharedDir,
  isCloudScoringEnabled,
  readCostState,
  writeCostState,
  canSpendEstimated,
  trackEmbeddingCost,
};
