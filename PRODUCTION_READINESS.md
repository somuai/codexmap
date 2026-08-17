# Production Readiness

CodexMap is ready for a public `0.1.0-alpha.1` npm release path when all release gates pass.

## Current Status

| Area | Status | Evidence |
|---|---:|---|
| CLI usability | Pass | `setup`, forgiving prompt parsing, JSON doctor output, local config |
| Package hygiene | Pass | `npm run test:package` blocks runtime state, backups, `.env`, and dev fix scripts |
| Local runtime E2E | Pass | `npm run test:e2e:fake` creates files, maps graph nodes, serves state |
| Integration pipeline | Pass | `bash scripts/integration-test.sh` validates watcher, graph state, WebSocket |
| Release dry-run | Pass | `npm publish --dry-run --provenance --access public --tag alpha` |
| Real Codex E2E | Pending | Requires `CODEXMAP_RUN_REAL_CODEX_SMOKE=1` and an API key |

## Not Yet “Enterprise Final”

This is a productionizable alpha, not a mature enterprise release, until these are complete:

- Real Codex smoke passes in a configured release environment.
- Browser regression tests run in CI against the live UI.
- External security review covers local HTTP APIs, re-anchor queue, and file serving.
- First external users validate install/run flows from a clean machine.
- Future engine adapters, such as Claude Code, Gemini CLI, and OpenCode, are added behind the engine contract.

## Required Final Gate

```bash
export OPENAI_API_KEY=...
CODEXMAP_RUN_REAL_CODEX_SMOKE=1 npm run test:e2e:codex
npm run release:preflight
```
