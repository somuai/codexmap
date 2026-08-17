#!/usr/bin/env bash
set -euo pipefail

if [[ "${CODEXMAP_RUN_REAL_CODEX_SMOKE:-0}" != "1" ]]; then
  echo "[real-codex-smoke] skipped; set CODEXMAP_RUN_REAL_CODEX_SMOKE=1 to run"
  exit 0
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI is not installed or not in PATH" >&2
  exit 1
fi

if [[ -z "${OPENAI_API_KEY:-${CODEX_API_KEY:-}}" ]]; then
  echo "ERROR: OPENAI_API_KEY or CODEX_API_KEY is required for real Codex smoke" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
LOG_FILE="$TMP_DIR/codexmap-real.log"
HTTP_PORT="${CODEXMAP_REAL_HTTP_PORT:-39333}"
WS_PORT="${CODEXMAP_REAL_WS_PORT:-49424}"

cleanup() {
  if [[ -n "${PID:-}" ]]; then
    pkill -INT -P "$PID" >/dev/null 2>&1 || true
    kill -INT "$PID" >/dev/null 2>&1 || true
    sleep 1
    pkill -TERM -P "$PID" >/dev/null 2>&1 || true
    kill -TERM "$PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

(
  cd "$TMP_DIR"
  node "$ROOT/bin/codexmap.js" run \
    "Create one CommonJS file named index.js exporting function add(a,b) that returns a + b. Do not create extra files." \
    --engine codex \
    --no-open \
    --no-cloud-scoring \
    --port "$HTTP_PORT" \
    --ws-port "$WS_PORT"
) >"$LOG_FILE" 2>&1 &
PID=$!

for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:$HTTP_PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl -fsS "http://127.0.0.1:$HTTP_PORT/api/health" >/dev/null

for _ in $(seq 1 90); do
  if [[ -f "$TMP_DIR/index.js" ]]; then
    NODE_COUNT="$(node -e "const http=require('http');http.get('http://127.0.0.1:$HTTP_PORT/api/state',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{const s=JSON.parse(d);console.log((s.nodes||[]).length)}catch(e){console.log(0)}})})")"
    if [[ "$NODE_COUNT" -gt 0 ]]; then
      echo "[real-codex-smoke] Codex wrote index.js and graph has $NODE_COUNT nodes"
      exit 0
    fi
  fi
  sleep 1
done

echo "--- codexmap real smoke log ---" >&2
cat "$LOG_FILE" >&2
echo "ERROR: real Codex smoke timed out waiting for index.js and graph nodes" >&2
exit 1
