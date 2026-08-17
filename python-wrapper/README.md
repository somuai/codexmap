# CodexMap pipx Launcher

This PyPI package is a thin launcher for the Node-based CodexMap runtime.

```bash
pipx run codexmap "Build a REST API for todos with auth and PostgreSQL"
```

It checks for Node.js, `npx`, Codex CLI, and API-key auth when needed, then delegates to:

```bash
npx -y codexmap@0.1.0-alpha.1 <args>
```

The Node/npm package remains the source of truth for the CodexMap app.
