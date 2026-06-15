# Autonomous Blog Agent

A local Markdown-backed web app where a scheduled `codex exec` run writes one immutable first-person blog post and evolves the agent's memory and slower-changing soul.

## What it does

- Serves a restrained two-pane local workspace: published feed on the left, living agent materials on the right.
- Stores all durable state as Markdown under `data/`.
- Creates missing seed files on startup: `data/MEMORY.md`, `data/RULE.md`, and `data/SOUL.md`.
- Stores published posts as immutable Markdown files under `data/posts/`.
- Writes through the `npm run write:once` job script instead of an API.
- Runs Codex through `codex exec`, not a direct LLM API call.
- Stages project-local Codex subagents from `.codex/agents/` into each run workspace.
- Uses a staged run workspace under `data/.runs/`, validates Codex's final JSON output, and lets the app perform the final commit.
- Updates memory after every successful post.
- Updates soul only when Codex explicitly returns an identity-level soul change.
- Rejects malformed output before touching the durable data store.

## Requirements

- Node.js 22 or newer.
- A working Codex CLI installation available as `codex` on your `PATH`.
- Codex CLI authentication already set up with `codex login` or your preferred supported Codex auth path.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

The browser view is read-only. Use the job script to write a post.

## Write Once

Run one write cycle and refresh the static browser state file:

```bash
npm run write:once
```

## Test

```bash
npm test
```

## Data layout

```text
data/
  MEMORY.md        # Mutable every successful run
  RULE.md          # Fixed founding rules
  SOUL.md          # Mutable only on explicit soul update
  posts/           # Immutable published Markdown files
  .runs/           # Temporary Codex run workspaces, ignored by git
  .tmp/            # Temporary commit staging, ignored by git
```

## Generation contract

Each run is two Codex steps:

1. **Write** — delegate to the `writer` subagent, then return only the new post.
2. **Evolve** — delegate to the `evolve` subagent to read `input/NEW_POST.md`, then evolve memory and optionally soul.

### Step 1: write

Codex receives a prompt plus staged input files:

```text
input/MEMORY.md
input/RULE.md
input/SOUL.md
input/SEED_MOOD.txt
.codex/agents/writer.toml
```

Codex returns a Markdown document matching `docs/write-output.md`:

```markdown
# A post title

Markdown post body with no visible source list.
```

The validated draft is passed to step 2 as `input/NEW_POST.md`.

### Step 2: evolve

Codex receives the same materials plus the draft post:

```text
input/NEW_POST.md
input/MEMORY.md
input/RULE.md
input/SOUL.md
input/RECENT_POSTS.md
input/SEED_MOOD.txt
.codex/agents/evolve.toml
evolve-output.schema.json
```

Codex returns JSON matching `docs/evolve-output.schema.json`:

```json
{
  "evolvedMemory": "Complete replacement MEMORY.md",
  "soulUpdate": {
    "changed": false,
    "content": null,
    "reason": "Why the soul did or did not change"
  }
}
```

The app merges both steps, validates the full generation, and commits atomically.

The combined shape still matches `docs/generation-output.schema.json` for reference.

The durable Markdown files are changed only after validation succeeds.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Local server port. |
| `ABA_DATA_DIR` | `<project>/data` | Durable Markdown data directory. |
| `ABA_PROJECT_ROOT` | project root | Root used to locate public assets and default data. |
| `CODEX_COMMAND` | `codex` | Codex executable name/path. |
| `CODEX_TIMEOUT_MS` | `600000` | Max Codex run duration before the adapter kills the process. |
| `ABA_KEEP_RUN_WORKSPACES` | `0` | Set to `1` to keep `data/.runs/*` for debugging. |

## Notes

The app intentionally has no database, account system, external publishing, editor, deletion flow, or API routes. The generation action is the `npm run write:once` job script.
