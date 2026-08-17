#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const cli = path.join(__dirname, 'bin', 'codexmap.js');
const args = ['run', ...process.argv.slice(2)];

const child = spawn(process.execPath, [cli, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code || 0);
});
