const { spawn } = require('child_process');
const path = require('path');
const { createSession } = require('./session');
const { resolveRuntimeConfig } = require('./config-resolver');
const { getEngine } = require('../engines');

const ROOT = path.resolve(__dirname, '..');

function openUrl(url) {
  const opener = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';

  const child = spawn(opener, [url], {
    stdio: 'ignore',
    detached: true,
    shell: process.platform === 'win32',
  });
  child.unref();
}

function pipeWithPrefix(child, prefix) {
  child.stdout?.on('data', (chunk) => process.stdout.write(`[${prefix}] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[${prefix}] ${chunk}`));
}

function terminate(child, signal = 'SIGINT') {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    child.kill(signal);
  } catch (_) {
    // no-op
  }
}

async function runRuntime(options = {}) {
  const prompt = String(options.prompt || '').trim();
  if (!prompt && !options.resume && !options.latest && options.command !== 'watch') {
    throw new Error('Prompt is required. Usage: codexmap run "<prompt>"');
  }

  const config = await resolveRuntimeConfig({
    cwd: options.cwd,
    engine: options.engine,
    httpPort: options.port,
    wsPort: options.wsPort,
    host: options.host,
    autoHeal: options.autoHeal,
    openBrowser: options.openBrowser,
    cloudScoring: options.cloudScoring,
    costCapUsd: options.costCapUsd,
  });

  const engine = getEngine(config.engine);
  const engineStatus = await engine.detect();
  if (!engineStatus.available) {
    throw new Error(`Engine "${config.engine}" is not available: ${engineStatus.reason || 'not detected'}`);
  }

  const session = createSession({
    cwd: config.cwd,
    prompt,
    watchPath: options.watchPath,
    autoHeal: config.autoHeal,
    cloudScoring: config.cloudScoring,
    engine: config.engine,
    sessionId: options.resume,
    latest: options.latest,
    resume: !!(options.resume || options.latest),
  });

  const uiUrl = `http://${config.host}:${config.httpPort}/?project=${encodeURIComponent(path.basename(config.cwd))}&session=${encodeURIComponent(session.id)}`;

  console.log('========================================================================');
  console.log('[CODEXMAP] Production runtime starting');
  console.log(`[CODEXMAP] Session: ${session.id}`);
  console.log(`[CODEXMAP] Engine: ${config.engine}`);
  console.log(`[CODEXMAP] Watch path: ${session.outputDir}`);
  console.log(`[CODEXMAP] UI: ${uiUrl}`);
  console.log(`[CODEXMAP] WebSocket: ws://${config.host}:${config.websocketPort}`);
  if (config.httpPortFallback) console.log(`[CODEXMAP] HTTP port fallback: requested ${config.requestedHttpPort}, using ${config.httpPort}`);
  if (config.wsPortFallback) console.log(`[CODEXMAP] WS port fallback: requested ${config.requestedWsPort}, using ${config.websocketPort}`);
  if (config.cloudScoring) {
    console.log('[CODEXMAP] Privacy: cloud scoring is enabled; code snippets/summaries may be sent to OpenAI for embeddings/scoring.');
    console.log(`[CODEXMAP] Cost cap: $${config.costCapUsd.toFixed(2)} unless overridden by CODEXMAP_COST_CAP_USD.`);
  } else {
    console.log('[CODEXMAP] Privacy: cloud scoring is disabled; scoring falls back to local heuristics where available.');
  }
  console.log('========================================================================');

  const crypto = require('crypto');
  const tokenSecret = process.env.CODEXMAP_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

  const childEnv = {
    ...process.env,
    NODE_PATH: [path.join(ROOT, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
    CODEXMAP_ROOT: ROOT,
    CODEXMAP_WORKSPACE_DIR: config.cwd,
    CODEXMAP_SESSION_ID: session.id,
    CODEXMAP_SESSION_DIR: session.sessionDir,
    CODEXMAP_SHARED_DIR: session.sharedDir,
    CODEXMAP_OUTPUT_DIR: session.outputDir,
    CODEXMAP_ENGINE: config.engine,
    CODEXMAP_HOST: config.host,
    CODEXMAP_HTTP_PORT: String(config.httpPort),
    CODEXMAP_WS_PORT: String(config.websocketPort),
    CODEXMAP_PORT: String(config.websocketPort),
    CODEXMAP_CLOUD_SCORING: config.cloudScoring ? 'true' : 'false',
    CODEXMAP_COST_CAP_USD: String(config.costCapUsd),
    CODEXMAP_UI_URL: uiUrl,
    CODEXMAP_SKIP_UI_SERVER: '1',
    CODEXMAP_TOKEN_SECRET: tokenSecret,
  };

  const serve = spawn(process.execPath, [path.join(ROOT, 'serve.js')], {
    cwd: config.cwd,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeWithPrefix(serve, 'SERVE');

  const orchestratorArgs = [
    path.join(ROOT, 'orchestrator.js'),
    session.prompt,
    '--watch',
    session.outputDir,
    '--enhanced-scoring',
  ];
  if (config.autoHeal) orchestratorArgs.push('--auto-heal');

  const orchestrator = spawn(process.execPath, orchestratorArgs, {
    cwd: config.cwd,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeWithPrefix(orchestrator, 'RUNTIME');

  const children = [serve, orchestrator];
  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[CODEXMAP] ${signal} received; stopping runtime children...`);
    children.forEach((child) => terminate(child, 'SIGINT'));
    setTimeout(() => children.forEach((child) => terminate(child, 'SIGTERM')), 1500).unref();
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  if (options.openBrowser !== false) {
    setTimeout(() => openUrl(uiUrl), 1000).unref();
  }

  return new Promise((resolve) => {
    orchestrator.on('exit', (code, signal) => {
      terminate(serve, 'SIGINT');
      resolve({ code, signal, session, config });
    });
    serve.on('exit', (code) => {
      if (!shuttingDown && code && code !== 0) {
        console.error(`[CODEXMAP] UI server exited with code ${code}`);
      }
    });
  });
}

module.exports = {
  runRuntime,
};
