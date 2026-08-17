# TODO: implement per SKILL.md

| Check | Result | Evidence |
|---|---|---|
| All `map-state.json` writes are atomic (tmp + rename) | PASS | [`cartographer.js`](/Users/soumyajitghosh/Downloads/Axiom/codexmap/agents/cartographer.js:23) and [`sentinel.js`](/Users/soumyajitghosh/Downloads/Axiom/codexmap/agents/sentinel.js:49) both use write-to-temp then `renameSync`. |
| Sentinel uses `setImmediate` instead of synchronous scoring loops | PASS | [`sentinel.js`](/Users/soumyajitghosh/Downloads/Axiom/codexmap/agents/sentinel.js:268) queues each pending node with `setImmediate`. |
| Broadcaster batches graph sends at 500ms | PASS | [`broadcaster.js`](/Users/soumyajitghosh/Downloads/Axiom/codexmap/agents/broadcaster.js:12) defines `BATCH_MS = 500`, and [`broadcaster.js`](/Users/soumyajitghosh/Downloads/Axiom/codexmap/agents/broadcaster.js:110) schedules flushes on that window. |
| `embeddingCache` is keyed by SHA-256 | PASS | [`sentinel.js`](/Users/soumyajitghosh/Downloads/Axiom/codexmap/agents/sentinel.js:237) hashes `${summary}\n\n${code}` with SHA-256 and uses the digest as the cache key. |
| `reanchorRegistry` prevents double-healing | PASS | [`sentinel.js`](/Users/soumyajitghosh/Downloads/Axiom/codexmap/agents/sentinel.js:93) checks registry membership before scoring or healing, and [`sentinel.js`](/Users/soumyajitghosh/Downloads/Axiom/codexmap/agents/sentinel.js:124) registers both node id and file path until the scoped Codex run exits. |
