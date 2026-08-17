const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { isPortFree } = require('./ports');
const { sessionsRoot } = require('./session');
const { listEngines, getEngine } = require('../engines');
const { redactSecrets } = require('./atomic');

function commandVersion(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5000 });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr || '').trim();
}

function checkWritable(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  const probe = path.join(dirPath, `.probe-${process.pid}`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
}

async function runDoctor(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const checks = [];

  function add(name, ok, detail) {
    checks.push({ name, ok, detail });
  }

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add('Node.js >= 18', nodeMajor >= 18, process.version);

  const python = commandVersion('python3') || commandVersion('python') || null;
  add('Python available', !!python, python || 'python/python3 not found');

  try {
    checkWritable(sessionsRoot(cwd));
    add('Writable session directory', true, sessionsRoot(cwd));
  } catch (error) {
    add('Writable session directory', false, error.message);
  }

  const openaiKey = process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY || '';
  add('OpenAI key', !!openaiKey, openaiKey ? redactSecrets(openaiKey) : 'not set');

  for (const name of listEngines()) {
    try {
      const status = await getEngine(name).health();
      add(`Engine: ${name}`, !!status.available, status.available ? (status.binary || 'available') : status.reason || status.authHint || 'not available');
    } catch (error) {
      add(`Engine: ${name}`, false, error.message);
    }
  }

  const httpPort = Number(options.port || process.env.CODEXMAP_HTTP_PORT || 3333);
  const wsPort = Number(options.wsPort || process.env.CODEXMAP_WS_PORT || process.env.CODEXMAP_PORT || 4242);
  add(`HTTP port ${httpPort}`, await isPortFree(httpPort), 'occupied ports will use automatic fallback');
  add(`WebSocket port ${wsPort}`, await isPortFree(wsPort), 'occupied ports will use automatic fallback');

  const ok = checks.every((check) => check.ok || check.name.startsWith('HTTP port') || check.name.startsWith('WebSocket port'));

  console.log('\nCodexMap Doctor\n');
  for (const check of checks) {
    const icon = check.ok ? 'PASS' : 'WARN';
    console.log(`${icon.padEnd(4)} ${check.name} - ${check.detail}`);
  }
  console.log('');
  console.log(ok ? 'Doctor status: usable for local alpha runtime.' : 'Doctor status: action required before a full Codex run.');

  return { ok, checks };
}

module.exports = {
  runDoctor,
};
