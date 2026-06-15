# Autonomous Blog Agent Instructions

This is a local Markdown-backed autonomous blog agent. Keep changes small,
repo-grounded, and easy to verify.

## Project Shape

- Runtime: Node.js 22+, ESM modules, Express 5.
- App entrypoint: `src/server.js`.
- Write job entrypoint: `scripts/write-once.js`.
- Durable state: `data/MEMORY.md`, `data/RULE.md`, `data/SOUL.md`, and immutable post files under `data/posts/`.
- Static client: `public/index.html`, `public/app.js`, `public/styles.css`.
- Published static state: `public/state.json`.
- Generation contract and validators: `src/generationContract.js`.
- Codex execution wrapper: `src/codexAdapter.js`.
- Generation orchestration: `src/generationOrchestrator.js`.

## Core Invariants

- The browser UI is read-only. Do not add write API routes unless explicitly requested.
- The generation action is `npm run write:once`; it runs Codex, validates output, commits Markdown through `MarkdownDataStore`, then refreshes `public/state.json`.
- Published posts in `data/posts/` are immutable artifacts. Do not edit or delete them unless the task is explicitly about correcting data.
- `data/RULE.md` is fixed founding policy. `data/MEMORY.md` may change after successful generation. `data/SOUL.md` changes only for explicit identity-level updates.
- Durable writes should go through `MarkdownDataStore.commitGeneration()` so validation, staging, rollback, and post ID generation stay centralized.
- Codex run workspaces live under `data/.runs/`; commit staging lives under `data/.tmp/`. They are temporary runtime directories.
- Keep generated post validation strict: write output is Markdown starting with one `# Title`; evolve output is JSON matching `docs/evolve-output.schema.json`.

## Commands

```bash
npm install
npm start
npm run dev
npm run write:once
```

There is currently no `test` script in `package.json`. If you add tests, add the
script and report the exact command you ran. Until then, use targeted runtime
checks such as:

```bash
node --check src/server.js
node --check scripts/write-once.js
```

For local UI checks, run `npm start` and open `http://localhost:3000`.

## Implementation Rules

- State assumptions before making non-trivial changes.
- If a requirement is ambiguous, ask instead of choosing silently.
- Prefer the smallest code path that solves the requested behavior.
- Do not introduce abstractions, options, configuration, or broad error handling unless the request requires them.
- Touch only files directly needed for the task. Do not clean up unrelated code.
- Match the existing style: ESM imports, async filesystem APIs, plain functions/classes, and no build step.
- Use structured parsing/validation for Markdown/frontmatter/JSON rather than ad hoc string edits when existing helpers apply.
- Remove imports, variables, or helpers that your own change makes unused. Do not remove pre-existing dead code unless asked.

## Verification Expectations

- For validation or parsing changes, exercise the relevant validator in `src/generationContract.js`.
- For data write changes, verify rollback/staging behavior or explain why a narrower check is sufficient.
- For UI changes, verify both localhost behavior and the static/public data loading path when relevant.
- For generator changes, avoid running `npm run write:once` unless the task explicitly calls for a real generation run, because it mutates durable Markdown state.
- Always report commands run and any verification you could not perform.
