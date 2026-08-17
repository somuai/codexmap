#!/usr/bin/env node

const assert = require('assert');
const { spawnSync } = require('child_process');

const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  maxBuffer: 1024 * 1024 * 10,
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

let pack;
try {
  pack = JSON.parse(result.stdout)[0];
} catch (error) {
  console.error('ERROR: failed to parse npm pack --json output');
  console.error(error.message);
  process.exit(1);
}

const files = (pack.files || []).map((file) => file.path).sort();
const fileSet = new Set(files);

const required = [
  'bin/codexmap.js',
  'lib/runtime.js',
  'lib/session.js',
  'lib/cost.js',
  'engines/codex.js',
  'engines/fake.js',
  'agents/cartographer.js',
  'agents/broadcaster.js',
  'agents/sentinel.js',
  'agents/generator.js',
  'agents/healer.js',
  'serve.js',
  'orchestrator.js',
  'ui/index.html',
  'scripts/embed.js',
  'scripts/fake-engine-e2e.sh',
  'scripts/real-codex-smoke.sh',
  'README.md',
  'package.json',
];

for (const file of required) {
  assert.ok(fileSet.has(file), `required file missing from package: ${file}`);
}

const forbiddenPatterns = [
  /^\.env/,
  /^\.git\//,
  /^\.codexmap\//,
  /^node_modules\//,
  /^output\//,
  /^shared\//,
  /^scripts\/shared\//,
  /^codex_hackathon_temp_repo\//,
  /^\.opencode\//,
  /\.bak$/,
  /apply_.*\.js$/,
  /fix_.*\.js$/,
  /generation-done\.txt$/,
  /embedding-cache\.json$/,
  /api-cost\.json$/,
];

const forbidden = files.filter((file) => forbiddenPatterns.some((pattern) => pattern.test(file)));
if (forbidden.length > 0) {
  console.error('ERROR: package contains forbidden runtime/dev artifacts:');
  forbidden.forEach((file) => console.error(`  - ${file}`));
  process.exit(1);
}

console.log(`[package-contents] ${files.length} files checked; package contents look clean`);
