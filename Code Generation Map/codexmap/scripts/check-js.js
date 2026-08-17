#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const targets = [
  'bin/codexmap.js',
  'start.js',
  'config.js',
  'serve.js',
  'orchestrator.js',
  ...fs.readdirSync(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.js')).map((f) => `lib/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'engines')).filter((f) => f.endsWith('.js')).map((f) => `engines/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'agents')).filter((f) => f.endsWith('.js')).map((f) => `agents/${f}`),
].filter((file) => fs.existsSync(path.join(ROOT, file)));

let failed = false;
for (const file of targets) {
  const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`\n[check-js] ${file}\n${result.stderr || result.stdout}`);
  }
}

if (failed) process.exit(1);
console.log(`[check-js] ${targets.length} JavaScript files passed syntax checks`);
