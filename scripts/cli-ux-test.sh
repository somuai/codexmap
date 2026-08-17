#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cd "$TMP_DIR"

node "$ROOT/bin/codexmap.js" setup --engine fake --no-cloud-scoring --no-open --cost-cap-usd 1 --port 39888 --ws-port 49888 >/dev/null

test -f "$TMP_DIR/.codexmap/config.json"
node - <<'NODE'
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('.codexmap/config.json', 'utf8'));
if (cfg.engine !== 'fake') throw new Error('expected setup engine=fake');
if (cfg.cloudScoring !== false) throw new Error('expected cloudScoring=false');
if (cfg.openBrowser !== false) throw new Error('expected openBrowser=false');
if (cfg.costCapUsd !== 1) throw new Error('expected cost cap 1');
NODE

node "$ROOT/bin/codexmap.js" doctor --no-cloud-scoring --json > doctor.json
node - <<'NODE'
const fs = require('fs');
const doctor = JSON.parse(fs.readFileSync('doctor.json', 'utf8'));
if (!doctor.ok) throw new Error('doctor --no-cloud-scoring should be usable');
if (!Array.isArray(doctor.nextSteps) || doctor.nextSteps.length === 0) throw new Error('doctor should include next steps');
NODE

echo "[cli-ux] setup and doctor JSON UX checks passed"
