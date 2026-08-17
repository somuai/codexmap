const { spawn } = require('child_process');
const path = require('path');

async function detect() {
  const hasKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  return {
    name: 'gemini',
    available: true, // Keep it available so it registers and is selectable in the doctor/CLI
    binary: null,
    reason: hasKey ? null : 'GEMINI_API_KEY or GOOGLE_API_KEY not found in environment',
  };
}

async function health() {
  const hasKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  return {
    name: 'gemini',
    available: true,
    authenticated: hasKey,
    authHint: hasKey ? null : 'Set GEMINI_API_KEY or GOOGLE_API_KEY in your environment/.env file',
  };
}

function start({ prompt, outputDir, env = {}, model }) {
  const workerPath = path.join(__dirname, 'gemini_worker.js');
  const selectedModel = model || process.env.CODEXMAP_GEMINI_MODEL || 'gemini-1.5-flash';
  
  const childEnv = { ...process.env, ...env };
  
  return spawn(process.execPath, [
    workerPath,
    '--action', 'start',
    '--prompt', prompt,
    '--outputDir', path.resolve(outputDir),
    '--model', selectedModel,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
  });
}

function reanchor({ healPrompt, filePath, cwd, env = {}, model }) {
  const workerPath = path.join(__dirname, 'gemini_worker.js');
  const selectedModel = model || process.env.CODEXMAP_GEMINI_MODEL || 'gemini-1.5-flash';
  const workingDir = path.resolve(cwd || path.dirname(filePath));
  
  const childEnv = { ...process.env, ...env };

  return spawn(process.execPath, [
    workerPath,
    '--action', 'reanchor',
    '--prompt', healPrompt,
    '--filePath', path.resolve(filePath),
    '--model', selectedModel,
  ], {
    cwd: workingDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
  });
}

module.exports = {
  name: 'gemini',
  detect,
  health,
  start,
  reanchor,
};
