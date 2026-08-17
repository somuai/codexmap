const codex = require('./codex');
const fake = require('./fake');
const gemini = require('./gemini');

const engines = {
  codex,
  fake,
  gemini,
};

function getEngine(name = 'codex') {
  const engine = engines[name];
  if (!engine) {
    throw new Error(`Unknown engine "${name}". Available engines: ${Object.keys(engines).join(', ')}`);
  }
  return engine;
}

function listEngines() {
  return Object.keys(engines);
}

module.exports = {
  getEngine,
  listEngines,
};
