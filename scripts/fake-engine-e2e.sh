#!/usr/bin/env bash
set -euo pipefail

export CODEXMAP_DISABLE_AUTH=true

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
LOG_FILE="$TMP_DIR/codexmap.log"
HTTP_PORT="${CODEXMAP_E2E_HTTP_PORT:-38333}"
WS_PORT="${CODEXMAP_E2E_WS_PORT:-48424}"

cleanup() {
  if [[ -n "${PID:-}" ]]; then
    kill -INT "$PID" >/dev/null 2>&1 || true
    wait "$PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

(
  cd "$TMP_DIR"
  node "$ROOT/bin/codexmap.js" run "fake e2e prompt for todo API" \
    --engine fake \
    --no-open \
    --no-cloud-scoring \
    --port "$HTTP_PORT" \
    --ws-port "$WS_PORT"
) >"$LOG_FILE" 2>&1 &
PID=$!

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$HTTP_PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl -fsS "http://127.0.0.1:$HTTP_PORT/api/health" >/dev/null
curl -fsS "http://127.0.0.1:$HTTP_PORT/api/session" >/dev/null

for _ in $(seq 1 30); do
  NODE_COUNT="$(node -e "const http=require('http');http.get('http://127.0.0.1:$HTTP_PORT/api/state',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{const s=JSON.parse(d);console.log((s.nodes||[]).length)}catch(e){console.log(0)}})})")"
  if [[ "$NODE_COUNT" -gt 0 ]]; then
    echo "[fake-e2e] graph has $NODE_COUNT nodes"
    exit 0
  fi
  sleep 1
done

echo "--- codexmap log ---" >&2
cat "$LOG_FILE" >&2
echo "ERROR: fake-engine E2E timed out waiting for graph nodes" >&2
exit 1
