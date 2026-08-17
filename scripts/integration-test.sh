# TODO: implement per SKILL.md
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_DIR="${ROOT_DIR}/codexmap"
OUTPUT_DIR="${PROJECT_DIR}/output"
SHARED_DIR="${PROJECT_DIR}/shared"
FAKE_BIN_DIR="$(mktemp -d)"
LOG_FILE="$(mktemp)"
PID=""

cleanup() {
  if [[ -n "${PID}" ]] && kill -0 "${PID}" 2>/dev/null; then
    kill -INT "${PID}" 2>/dev/null || true
    wait "${PID}" 2>/dev/null || true
  fi
  rm -rf "${FAKE_BIN_DIR}"
  rm -f "${LOG_FILE}"
}

trap cleanup EXIT

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "ERROR: OPENAI_API_KEY must be set for integration-test.sh" >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}" "${SHARED_DIR}"
cat > "${OUTPUT_DIR}/test-file.ts" <<'EOF'
export function helloWorld(name: string) {
  if (!name) {
    return 'hello';
  }
  return `hello ${name}`;
}
EOF

cat > "${FAKE_BIN_DIR}/codex" <<'EOF'
#!/usr/bin/env bash
echo "fake codex invoked"
exit 0
EOF
chmod +x "${FAKE_BIN_DIR}/codex"

PATH="${FAKE_BIN_DIR}:${PATH}" node "${PROJECT_DIR}/orchestrator.js" "integration test prompt" >"${LOG_FILE}" 2>&1 &
PID=$!

sleep 10

if kill -0 "${PID}" 2>/dev/null; then
  kill -INT "${PID}" 2>/dev/null || true
  wait "${PID}" 2>/dev/null || true
fi

python - <<'PY' "${SHARED_DIR}/map-state.json"
import json
import sys

with open(sys.argv[1], "r", encoding="utf8") as handle:
    data = json.load(handle)

nodes = data.get("nodes", [])
if len(nodes) < 1:
    raise SystemExit("ERROR: map-state.json does not contain any nodes")

if not any(node.get("score") is not None for node in nodes):
    raise SystemExit("ERROR: map-state.json nodes do not contain a non-null score")
PY

python - <<'PY' "${SHARED_DIR}/session-drift-log.json"
import json
import sys

with open(sys.argv[1], "r", encoding="utf8") as handle:
    data = json.load(handle)

if len(data) < 1:
    raise SystemExit("ERROR: session-drift-log.json does not contain any entries")
PY

node - <<'EOF'
const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:4242');
const timer = setTimeout(() => {
  console.error('ERROR: WebSocket connection to port 4242 timed out');
  process.exit(1);
}, 3000);

ws.on('open', () => {
  clearTimeout(timer);
  ws.close();
  process.exit(0);
});

ws.on('error', (error) => {
  clearTimeout(timer);
  console.error(`ERROR: WebSocket connection failed: ${error.message}`);
  process.exit(1);
});
EOF

echo "Integration test passed"
