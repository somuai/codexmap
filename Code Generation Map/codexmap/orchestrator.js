// TODO: implement per SKILL.md
const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const SHARED_DIR = path.join(ROOT_DIR, 'shared');
const MAP_STATE_PATH = path.join(SHARED_DIR, 'map-state.json');
const PROMPT_PATH = path.join(SHARED_DIR, 'prompt.txt');
const DRIFT_LOG_PATH = path.join(SHARED_DIR, 'session-drift-log.json');
const GRADE_QUEUE_PATH = path.join(SHARED_DIR, 'grade-queue.json');
const COLLAPSE_STATE_PATH = path.join(SHARED_DIR, 'collapse-state.json');
const GENERATION_DONE_PATH = path.join(SHARED_DIR, 'generation-done.txt');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');

const prompt = process.argv[2];
const autoHeal = process.argv.includes('--auto-heal');

if (!prompt || prompt.startsWith('--')) {
  console.error('Error: developer prompt is required. Usage: node codexmap/orchestrator.js "<prompt>" [--auto-heal]');
  process.exit(1);
}

fs.mkdirSync(SHARED_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(PROMPT_PATH, prompt, 'utf8');
fs.writeFileSync(MAP_STATE_PATH, JSON.stringify({ nodes: [], edges: [] }), 'utf8');
fs.writeFileSync(DRIFT_LOG_PATH, JSON.stringify([]), 'utf8');
fs.writeFileSync(GRADE_QUEUE_PATH, JSON.stringify([]), 'utf8');
fs.writeFileSync(
  COLLAPSE_STATE_PATH,
  JSON.stringify({ triggered: false, signals: [], timestamp: new Date().toISOString() }),
  'utf8'
);

if (fs.existsSync(GENERATION_DONE_PATH)) {
  fs.unlinkSync(GENERATION_DONE_PATH);
}

const agentSpecs = [
  { name: 'cartographer', modulePath: path.join(ROOT_DIR, 'agents', 'cartographer.js'), args: [] },
  { name: 'broadcaster', modulePath: path.join(ROOT_DIR, 'agents', 'broadcaster.js'), args: [] },
  { name: 'sentinel', modulePath: path.join(ROOT_DIR, 'agents', 'sentinel.js'), args: autoHeal ? ['--auto-heal'] : [] },
  { name: 'generator', modulePath: path.join(ROOT_DIR, 'agents', 'generator.js'), args: [] },
  { name: 'healer', modulePath: path.join(ROOT_DIR, 'agents', 'healer.js'), args: [] }
];

const children = agentSpecs.map((spec) => ({
  name: spec.name,
  child: fork(spec.modulePath, spec.args, {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  })
}));

let shuttingDown = false;

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) {
      child.kill('SIGINT');
    }
  }

  setTimeout(() => process.exit(exitCode), 250);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('='.repeat(72));
console.log('[CODEXMAP] Startup complete');
console.log(`[CODEXMAP] Prompt: ${prompt}`);
console.log(`[CODEXMAP] Auto-heal: ${autoHeal ? 'enabled' : 'disabled'}`);
console.log(`[CODEXMAP] Agents launched: ${children.map(({ name }) => name).join(' -> ')}`);
console.log('='.repeat(72));
