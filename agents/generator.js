// TODO: implement per SKILL.md
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SHARED_DIR = path.join(ROOT_DIR, 'shared');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const PROMPT_PATH = path.join(SHARED_DIR, 'prompt.txt');
const GENERATION_DONE_PATH = path.join(SHARED_DIR, 'generation-done.txt');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const prompt = fs.readFileSync(PROMPT_PATH, 'utf8').trim();
const { getEngine } = require('../engines');
const engineName = process.env.CODEXMAP_ENGINE || 'codex';
const engine = getEngine(engineName);

const codex = engine.start({
  prompt,
  outputDir: OUTPUT_DIR
});

codex.stdout.on('data', (chunk) => {
  process.stdout.write(`[GENERATOR] ${chunk}`);
});

codex.stderr.on('data', (chunk) => {
  process.stderr.write(`[GENERATOR] ${chunk}`);
});

codex.on('close', (code, signal) => {
  try {
    const { db, notify } = require('../lib/db');
    db.prepare(`
      INSERT INTO events_queue (type, payload, timestamp)
      VALUES ('generation_done', ?, ?)
    `).run(JSON.stringify({
      code,
      signal,
      timestamp: new Date().toISOString()
    }), new Date().toISOString());
    notify('events');
    console.log(`[GENERATOR] Wrote generation_done event to SQLite (code=${code})`);
  } catch (err) {
    console.error(`[GENERATOR] Failed to write completion event: ${err.message}`);
  }
});

process.on('SIGINT', () => {
  codex.kill('SIGINT');
  process.exit(0);
});
