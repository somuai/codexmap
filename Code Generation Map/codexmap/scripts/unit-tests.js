#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, booleanFlag } = require('../lib/args');
const { parseBool, parsePort } = require('../lib/config-resolver');
const { atomicWriteJson, readJsonSafe, safeInside } = require('../lib/atomic');
const { createSession, listSessions } = require('../lib/session');
const { getEngine, listEngines } = require('../engines');

async function main() {
  {
    const parsed = parseArgs(['run', 'hello world', '--engine', 'fake', '--no-open', '--ws-port=4545']);
    assert.equal(parsed.command, 'run');
    assert.equal(parsed.positionals[0], 'hello world');
    assert.equal(parsed.flags.engine, 'fake');
    assert.equal(parsed.flags.noOpen, true);
    assert.equal(parsed.flags.wsPort, '4545');
    assert.equal(booleanFlag(parsed.flags, 'open', 'noOpen', true), false);
  }

  {
    assert.equal(parseBool('false', true), false);
    assert.equal(parseBool('1', false), true);
    assert.equal(parsePort('3333', 1), 3333);
    assert.equal(parsePort('bad', 1), 1);
  }

  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codexmap-unit-'));
    const file = path.join(tmp, 'state.json');
    atomicWriteJson(file, { ok: true });
    assert.deepEqual(readJsonSafe(file, {}), { ok: true });
    assert.equal(safeInside(tmp, path.join(tmp, 'nested', 'file.txt')), true);
    assert.equal(safeInside(tmp, path.join(tmp, '..', 'escape.txt')), false);
  }

  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codexmap-session-'));
    const session = createSession({
      cwd: tmp,
      prompt: 'unit prompt',
      engine: 'fake',
      cloudScoring: false,
      outputDir: path.join(tmp, 'watched'),
    });
    assert.ok(fs.existsSync(path.join(session.sharedDir, 'map-state.json')));
    const state = readJsonSafe(path.join(session.sharedDir, 'map-state.json'), null);
    assert.equal(state.version, 1);
    assert.equal(state.meta.engine, 'fake');
    assert.equal(listSessions(tmp).length, 1);
  }

  {
    assert.ok(listEngines().includes('codex'));
    assert.ok(listEngines().includes('fake'));
    assert.ok(listEngines().includes('gemini'));
    const fake = await getEngine('fake').detect();
    assert.equal(fake.available, true);
    const gemini = await getEngine('gemini').detect();
    assert.equal(gemini.available, true);
    assert.throws(() => getEngine('missing'), /Unknown engine/);
  }

  console.log('[unit-tests] all assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
