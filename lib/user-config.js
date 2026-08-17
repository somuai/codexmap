const path = require('path');
const { atomicWriteJson, ensureDir, readJsonSafe } = require('./atomic');

const CONFIG_VERSION = 1;

function configDir(cwd = process.cwd()) {
  return path.join(path.resolve(cwd), '.codexmap');
}

function configPath(cwd = process.cwd()) {
  return path.join(configDir(cwd), 'config.json');
}

function defaultUserConfig(overrides = {}) {
  return {
    version: CONFIG_VERSION,
    engine: overrides.engine || 'codex',
    openBrowser: overrides.openBrowser !== false,
    cloudScoring: overrides.cloudScoring !== false,
    autoHeal: overrides.autoHeal === true,
    costCapUsd: Number(overrides.costCapUsd || 5),
    ports: {
      http: Number(overrides.httpPort || 3333),
      websocket: Number(overrides.wsPort || 4242),
    },
  };
}

function readUserConfig(cwd = process.cwd()) {
  const raw = readJsonSafe(configPath(cwd), null);
  if (!raw || typeof raw !== 'object') return {};
  return raw;
}

function writeUserConfig(cwd = process.cwd(), value = {}) {
  const filePath = configPath(cwd);
  ensureDir(path.dirname(filePath));
  atomicWriteJson(filePath, {
    ...defaultUserConfig(),
    ...value,
    ports: {
      ...defaultUserConfig().ports,
      ...(value.ports || {}),
    },
    version: CONFIG_VERSION,
  });
  return filePath;
}

function setupUserConfig(cwd = process.cwd(), options = {}) {
  const existing = readUserConfig(cwd);
  const next = {
    ...defaultUserConfig(options),
    ...existing,
    engine: options.engine || existing.engine || 'codex',
    openBrowser: options.openBrowser ?? existing.openBrowser ?? true,
    cloudScoring: options.cloudScoring ?? existing.cloudScoring ?? true,
    autoHeal: options.autoHeal ?? existing.autoHeal ?? false,
    costCapUsd: Number(options.costCapUsd || existing.costCapUsd || 5),
    ports: {
      http: Number(options.httpPort || existing.ports?.http || 3333),
      websocket: Number(options.wsPort || existing.ports?.websocket || 4242),
    },
  };

  return {
    path: writeUserConfig(cwd, next),
    config: next,
  };
}

module.exports = {
  CONFIG_VERSION,
  configDir,
  configPath,
  defaultUserConfig,
  readUserConfig,
  setupUserConfig,
  writeUserConfig,
};
