const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function atomicWriteFile(filePath, content, encoding = 'utf8') {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpPath, content, encoding);
  fs.renameSync(tmpPath, filePath);
}

function atomicWriteJson(filePath, value) {
  atomicWriteFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function safeInside(rootDir, candidatePath) {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function redactSecrets(value) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-...redacted')
    .replace(/(OPENAI_API_KEY=)[^\s]+/g, '$1...redacted')
    .replace(/(CODEX_API_KEY=)[^\s]+/g, '$1...redacted');
}

module.exports = {
  ensureDir,
  readJsonSafe,
  atomicWriteFile,
  atomicWriteJson,
  safeInside,
  redactSecrets,
};
