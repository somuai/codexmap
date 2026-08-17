# CodexMap vs Understand Anything

## Positioning

Understand Anything is a codebase comprehension and onboarding graph. It helps developers understand an existing project, search its architecture, inspect relationships, and generate context for questions.

CodexMap is a live AI-coding drift-control sidecar. It watches an engine such as Codex while files are being generated, scores whether each node still matches the original prompt, surfaces drift incidents, and lets the user re-anchor risky nodes.

The overlap is graph visualization. The product promise is different:

- Understand Anything: "What does this codebase do?"
- CodexMap: "Is the AI still building what I asked for, and how do I fix it before it derails?"

## Adapted Ideas

- Persistent project graph: `.codexmap/knowledge-graph.json`.
- Human-readable project index: `.codexmap/PROJECT_INDEX.md`.
- Learning guide: `.codexmap/learn.md`.
- Developer commands: `codexmap index`, `ask`, `context`, `diff`, and `onboard`.
- One-hop relationship expansion for scoped context and impact reports.

## CodexMap-Specific Advantages

- Original prompt remains the anchor for live drift scoring.
- Session drift is tracked over time, not only as a static graph.
- Re-anchor and heal queues turn detection into corrective action.
- Engine adapters make Codex-first support extensible to Claude Code, Gemini CLI, OpenCode, and other agents.
- Incident workflow can expose red/critical-yellow risk, queue state, repair progress, and post-heal rescoring.

## Next Improvements

- Replace line-based non-JS parsing with a tree-sitter registry across major languages.
- Validate project graph schema with a strict runtime validator.
- Add graph clustering, path finding, and richer browser exploration for the persistent graph.
- Add `codexmap export --format understand-anything` if interoperability becomes strategically useful.
- Add browser tests for project graph empty/loading/error states.
