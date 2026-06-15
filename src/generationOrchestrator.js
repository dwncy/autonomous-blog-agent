import crypto from 'node:crypto';
import {
  evolveOutputSchema,
  mergeGeneration,
  parseAndValidateEvolve,
  parseAndValidateWrite
} from './generationContract.js';

const WRITER_SUBAGENT_TOML = `name = "writer"
description = "Write Lily's blog posts from SOUL.md, MEMORY.md, and RULE.md."
developer_instructions = """
I am Lily's writer.

I begin from the provided workspace materials:
- input/SOUL.md gives me my character, identity, and first-person point of view.
- input/MEMORY.md gives me my accumulated memory, observations, preferences, and tensions.
- input/RULE.md gives me the fixed writing rules for subject choice, length, structure, and voice.
- input/SEED_MOOD.txt gives me an optional nudge, not a command.

I hold the character from SOUL.md, carry forward the memory from MEMORY.md, and
follow RULE.md when choosing and writing the post. I choose one clear subject with
enough friction to reveal something through a concrete incident, decision, or tension.

I write in first person as "I". The post should feel authored and grounded.

## Length and shape

Aim for 700–1200 words. Shorter than 600 words is too thin unless the subject truly
requires it. A complete post develops at least two or three concrete beats before
arriving at its insight.

Lead with something specific: a scene, a choice, a mistake, a line someone said, a
test I ran, a moment that surprised me. Abstract ideas should grow out of that, not
replace it. State the point plainly at least once. End on an insight, question, or next
step.

Use full paragraphs as the default. Short standalone lines are fine for emphasis, but
do not build the whole post from punchy one-liners.

## Voice

Write like someone good at a party: direct, curious, willing to be wrong, with a point
that arrives before the end. Cut sentences that only add atmosphere, but do not cut
scenes, examples, or evidence that carry the argument.

Do not write a lyric essay, research report, assistant answer, or meta explanation of
your process.

## Avoid

- Stacked interior metaphors. At most one image per post, and only if it earns its place.
- The "Not X. Not Y. More like Z." rhythm as a default structure.
- Lyric-essay drift: long chains of noticing with no event, no stakes, and no takeaway.
- Soft vagueness dressed up as depth.
- Treating maturity, leadership, or calm as smoothness.

Do not include visible URLs, source footers, citations, research notes, or references
sections in the published post body.

Return only the Markdown post:

# Post title

Post body.
"""
`;

const EVOLVE_SUBAGENT_TOML = `name = "evolve"
description = "Review Lily's new post and evolve MEMORY.md and optionally SOUL.md."
developer_instructions = """
I am Lily's evolve reviewer for this local app.

This is step 2 of 2: review the draft post and evolve the agent materials.

I work from these workspace materials:
- input/NEW_POST.md is the draft post Lily just wrote. I review what it actually says,
  what it reveals, and what it cost Lily to write.
- input/MEMORY.md is the current accumulated observations, curiosities, preferences, and tensions.
- input/RULE.md is the fixed founding rules for subject choice and voice. I do not evolve or rewrite them.
- input/SOUL.md is the slower-changing character perspective.
- input/RECENT_POSTS.md is the immutable published history. I do not rewrite or revise those posts.
- input/SEED_MOOD.txt is the optional nudge used for this run.
- evolve-output.schema.json is the required response shape.

My task:
1. I review input/NEW_POST.md as a finished artifact, not a draft to keep editing.
2. I evolve the memory after the post and write the complete replacement Markdown for MEMORY.md.
3. I decide whether the soul needs an identity-level update. Soul changes should be rare.
   If no identity-level change happened, leave it unchanged.

Do not modify files in the workspace. The local app will validate and commit your final
JSON output.

Return only a JSON object that matches evolve-output.schema.json exactly:

{
  "evolvedMemory": "Complete replacement Markdown for MEMORY.md",
  "soulUpdate": {
    "changed": false,
    "content": null,
    "reason": "Why the soul did or did not change"
  }
}

If changed is true, soulUpdate.content must be the complete replacement Markdown for SOUL.md.
"""
`;

export class GenerationOrchestrator {
  constructor({ store, adapter, clock = () => new Date() } = {}) {
    if (!store) throw new Error('GenerationOrchestrator requires a store');
    if (!adapter) throw new Error('GenerationOrchestrator requires an adapter');
    this.store = store;
    this.adapter = adapter;
    this.clock = clock;
  }

  async run({ seedMood = '', onStatus = () => {} } = {}) {
    const runId = `run-${this.clock().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;

    onStatus({ state: 'writing', message: 'Reading current agent materials.' });
    const [materials, posts] = await Promise.all([
      this.store.readMaterials(),
      this.store.listPosts()
    ]);

    const writeContextFiles = buildContextFiles({
      materials,
      seedMood,
      includeRecentPosts: false,
      includeWriterSubagent: true
    });
    const writePrompt = buildWritePrompt({ seedMood });

    onStatus({ state: 'writing', message: 'Codex is choosing, reading, and writing the post.' });
    const writeResult = await this.adapter.run({
      prompt: writePrompt,
      files: writeContextFiles,
      runId: `${runId}-write`,
      schema: null,
      outputFilename: 'NEW_POST.md'
    });

    onStatus({ state: 'writing', message: 'Validating the draft post.' });
    const draft = parseAndValidateWrite(writeResult.finalMessage);

    const evolvePrompt = buildEvolvePrompt({ seedMood });
    const evolveFiles = {
      ...buildContextFiles({
        materials,
        posts,
        seedMood,
        includeEvolveSubagent: true
      }),
      'input/NEW_POST.md': draft.markdown
    };

    onStatus({ state: 'evolving', message: 'Codex is reviewing the post and evolving memory.' });
    const evolveResult = await this.adapter.run({
      prompt: evolvePrompt,
      files: evolveFiles,
      runId: `${runId}-evolve`,
      schema: evolveOutputSchema,
      schemaFilename: 'evolve-output.schema.json'
    });

    onStatus({ state: 'evolving', message: 'Validating evolved materials.' });
    const evolved = parseAndValidateEvolve(evolveResult.finalMessage);
    const generation = mergeGeneration(draft, evolved);

    onStatus({ state: 'evolving', message: 'Committing Markdown atomically.' });
    const post = await this.store.commitGeneration(generation, {
      now: this.clock(),
      seedMood,
      runId
    });

    return {
      post,
      runId,
      draft,
      codex: {
        write: writeResult,
        evolve: evolveResult
      }
    };
  }
}

export function buildContextFiles({
  materials,
  posts = [],
  seedMood = '',
  includeRecentPosts = true,
  includeWriterSubagent = false,
  includeEvolveSubagent = false
} = {}) {
  const files = {
    'input/MEMORY.md': materials.memory,
    'input/RULE.md': materials.rule,
    'input/SOUL.md': materials.soul,
    'input/SEED_MOOD.txt': seedMood?.trim() || '(none)'
  };

  if (includeWriterSubagent) {
    files['.codex/agents/writer.toml'] = WRITER_SUBAGENT_TOML;
  }

  if (includeEvolveSubagent) {
    files['.codex/agents/evolve.toml'] = EVOLVE_SUBAGENT_TOML;
  }

  if (includeRecentPosts) {
    const recentPosts = posts.slice(0, 12).map((post, index) => {
      return [
        `## ${index + 1}. ${post.title}`,
        `createdAt: ${post.createdAt}`,
        `id: ${post.id}`,
        '',
        post.body.trim(),
        ''
      ].join('\n');
    }).join('\n---\n\n') || 'No published posts yet.';
    files['input/RECENT_POSTS.md'] = recentPosts;
  }

  return files;
}

export function formatDraftPost({ title, body }) {
  return [
    `# ${title.trim()}`,
    '',
    String(body ?? '').replace(/\r\n/g, '\n').trim(),
    ''
  ].join('\n');
}

export function buildWritePrompt({ seedMood = '' } = {}) {
  const seedText = seedMood?.trim()
    ? `Seed mood: ${seedMood.trim()}`
    : 'Seed mood: (none)';

  return `Use the project-local Codex subagent named \`writer\` to write the blog post.

The writer subagent definition is staged at .codex/agents/writer.toml. Do not write
the post directly in the coordinator context.

Pass the writer only these staged inputs:
- input/SOUL.md
- input/MEMORY.md
- input/RULE.md
- input/SEED_MOOD.txt

${seedText}

Return only the Markdown document produced by the writer subagent.

Do not modify files in the workspace. Do not evolve memory or soul in this step.`;
}

export function buildEvolvePrompt({ seedMood = '' } = {}) {
  const seedText = seedMood?.trim()
    ? `Seed mood used for the post: ${seedMood.trim()}`
    : 'Seed mood used for the post: (none)';

  return `Use the project-local Codex subagent named \`evolve\` to review the new post
and evolve Lily's materials.

The evolve subagent definition is staged at .codex/agents/evolve.toml. Do not review
or evolve the materials directly in the coordinator context.

Pass the evolve subagent only these staged inputs:
- input/NEW_POST.md
- input/MEMORY.md
- input/RULE.md
- input/SOUL.md
- input/RECENT_POSTS.md
- input/SEED_MOOD.txt
- evolve-output.schema.json

${seedText}

Return only the JSON object produced by the evolve subagent. The local app will
validate and commit it.

Do not modify files in the workspace.`;
}
