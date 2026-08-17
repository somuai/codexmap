const { spawn, spawnSync } = require('child_process');
const path = require('path');

function which(command) {
  const tool = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(tool, [command], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).find(Boolean) || null;
}

async function detect() {
  const binary = which(process.env.CODEXMAP_CODEX_PATH || 'codex');
  return {
    name: 'codex',
    available: !!binary,
    binary,
    reason: binary ? null : 'Codex CLI not found in PATH',
  };
}

async function health() {
  const status = await detect();
  return {
    ...status,
    authenticated: !!(process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY),
    authHint: process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY
      ? null
      : 'Set OPENAI_API_KEY or sign in with Codex CLI',
  };
}

function buildEnv(env = {}) {
  const next = { ...process.env, ...env };
  if (!next.CODEX_API_KEY && next.OPENAI_API_KEY) next.CODEX_API_KEY = next.OPENAI_API_KEY;
  return next;
}

function start({ prompt, outputDir, env = {}, model }) {
  const binary = process.env.CODEXMAP_CODEX_PATH || 'codex';
  const resolvedOutputDir = path.resolve(outputDir);
  const selectedModel = model || process.env.CODEXMAP_CODEX_MODEL || process.env.OPENAI_MODEL || 'gpt-4o';

  return spawn(binary, [
    '-c', `model="${selectedModel}"`,
    'exec',
    prompt,
    '--dangerously-bypass-approvals-and-sandbox',
    '--cd',
    resolvedOutputDir,
  ], {
    cwd: resolvedOutputDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: buildEnv(env),
  });
}

function reanchor({ prompt, filePath, cwd, env = {}, model }) {
  const binary = process.env.CODEXMAP_CODEX_PATH || 'codex';
  const selectedModel = model || process.env.CODEXMAP_CODEX_MODEL || process.env.OPENAI_MODEL || 'gpt-4o';
  const workingDir = path.resolve(cwd || path.dirname(filePath));

  return spawn(binary, [
    '-c', `model="${selectedModel}"`,
    'exec',
    prompt,
    '--dangerously-bypass-approvals-and-sandbox',
    '--cd',
    workingDir,
  ], {
    cwd: workingDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: buildEnv(env),
  });
}

module.exports = {
  name: 'codex',
  detect,
  health,
  start,
  reanchor,
};
