const path = require('path');
const { findFreePort } = require('./ports');

function parseBool(value, defaultValue = false) {
  if (value == null || value === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

async function resolveRuntimeConfig(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const desiredHttpPort = parsePort(options.httpPort || process.env.CODEXMAP_HTTP_PORT || process.env.CODEXMAP_PORT_HTTP, 3333);
  const desiredWsPort = parsePort(options.wsPort || process.env.CODEXMAP_WS_PORT || process.env.CODEXMAP_PORT, 4242);
  const host = options.host || process.env.CODEXMAP_HOST || '127.0.0.1';
  const httpPort = options.noPortFallback ? desiredHttpPort : await findFreePort(desiredHttpPort, host);
  const websocketPort = options.noPortFallback ? desiredWsPort : await findFreePort(desiredWsPort, host);

  return {
    cwd,
    host,
    httpPort,
    websocketPort,
    requestedHttpPort: desiredHttpPort,
    requestedWsPort: desiredWsPort,
    httpPortFallback: httpPort !== desiredHttpPort,
    wsPortFallback: websocketPort !== desiredWsPort,
    engine: options.engine || process.env.CODEXMAP_ENGINE || 'codex',
    openBrowser: options.openBrowser,
    autoHeal: !!options.autoHeal,
    cloudScoring: options.cloudScoring ?? parseBool(process.env.CODEXMAP_CLOUD_SCORING, true),
    costCapUsd: Number(process.env.CODEXMAP_COST_CAP_USD || options.costCapUsd || 5),
  };
}

module.exports = {
  parseBool,
  parsePort,
  resolveRuntimeConfig,
};
