# CodexMap Release Checklist

CodexMap should ship public releases only through the npm package path.

## Preflight

```bash
npm run release:preflight
```

This verifies:

- JavaScript syntax for CLI, agents, server, engines, and libraries.
- Unit coverage for argument parsing, config fallback, sessions, atomic writes, and engine contract validation.
- Package contents exclude local runtime state, backup scripts, `.env`, `.codexmap`, `shared/`, and development fix scripts.
- Fake-engine E2E proves the `npx codexmap run` path can create files, map nodes, and serve state.
- Real-Codex smoke test is present but skipped unless explicitly enabled.
- Package tarball installs and `npx codexmap doctor` runs from the installed tarball.
- `git diff --check` has no whitespace errors.

## Real Codex Gate

Run only when you intentionally want to spend a small amount of Codex/OpenAI quota:

```bash
CODEXMAP_RUN_REAL_CODEX_SMOKE=1 npm run test:e2e:codex
```

The test creates a temporary project, asks Codex to write a tiny `index.js`, waits for Cartographer to map it, then shuts down the local sidecar.

## Publish

Publishing should use GitHub Actions trusted publishing with provenance:

1. Confirm `npm run release:preflight` passes locally.
2. Confirm the real Codex smoke has passed in a configured environment.
3. Tag the release, for example `v0.1.0-alpha.1`.
4. Run the `Publish` workflow.

Manual publish fallback:

```bash
npm publish --provenance --access public
```

Do not publish from a machine containing unrotated secrets in the working tree.
