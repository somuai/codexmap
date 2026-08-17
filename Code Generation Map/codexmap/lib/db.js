/**
 * lib/db.js — Shared SQLite database configuration and notification layer
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = path.resolve(__dirname, '..');
const SHARED_DIR = path.resolve(process.env.CODEXMAP_SHARED_DIR || path.join(ROOT_DIR, 'shared'));
fs.mkdirSync(SHARED_DIR, { recursive: true });

const DB_PATH = path.join(SHARED_DIR, 'codexmap.db');
const TRIGGER_PATH = path.join(SHARED_DIR, 'db-trigger.json');

const db = new DatabaseSync(DB_PATH);

// Configure WAL mode and busy timeout for concurrent safety
db.exec('PRAGMA journal_mode=WAL;');
db.exec('PRAGMA busy_timeout=5000;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    label TEXT,
    type TEXT,
    path TEXT,
    language TEXT,
    summary TEXT,
    code TEXT,
    score REAL,
    grade TEXT,
    cyclomaticComplexity INTEGER,
    children TEXT, -- JSON stringified array of child IDs
    contentHash TEXT,
    lastUpdated TEXT,
    S1 REAL,
    S2 REAL,
    A REAL,
    T REAL,
    D REAL,
    S_final REAL
  );
`);

// Run dynamic ALTER TABLE schema migrations in case the database was already created
try { db.exec('ALTER TABLE nodes ADD COLUMN S1 REAL;'); } catch (_) {}
try { db.exec('ALTER TABLE nodes ADD COLUMN S2 REAL;'); } catch (_) {}
try { db.exec('ALTER TABLE nodes ADD COLUMN A REAL;'); } catch (_) {}
try { db.exec('ALTER TABLE nodes ADD COLUMN T REAL;'); } catch (_) {}
try { db.exec('ALTER TABLE nodes ADD COLUMN D REAL;'); } catch (_) {}
try { db.exec('ALTER TABLE nodes ADD COLUMN S_final REAL;'); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS edges (
    source TEXT,
    target TEXT,
    PRIMARY KEY (source, target)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS heal_queue (
    nodeId TEXT PRIMARY KEY,
    status TEXT,
    batchId TEXT,
    triggeredBy TEXT,
    enqueuedAt TEXT,
    startedAt TEXT,
    completedAt TEXT,
    attemptCount INTEGER,
    error TEXT,
    reanchorOutputFlag INTEGER -- 0 or 1
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS drift_log (
    timestamp TEXT PRIMARY KEY,
    score REAL,
    annotation TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS collapse_state (
    key TEXT PRIMARY KEY,
    triggered INTEGER, -- 0 or 1
    signals TEXT, -- JSON stringified array
    metrics TEXT, -- JSON stringified object
    timestamp TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS events_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    payload TEXT, -- JSON string
    timestamp TEXT
  );
`);

function notify(type, details = {}) {
  try {
    const tmpPath = `${TRIGGER_PATH}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify({
      type,
      details,
      timestamp: new Date().toISOString()
    }), 'utf8');
    fs.renameSync(tmpPath, TRIGGER_PATH);
  } catch (err) {
    console.error(`[DB] Failed to write notification trigger: ${err.message}`);
  }
}

module.exports = {
  db,
  notify,
  TRIGGER_PATH,
  DB_PATH
};
