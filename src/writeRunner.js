import path from 'node:path';
import { CodexAdapter } from './codexAdapter.js';
import { MarkdownDataStore } from './dataStore.js';
import { GenerationOrchestrator } from './generationOrchestrator.js';
import { writeStaticState } from './staticState.js';

export async function runAutonomousWrite({
  projectRoot = process.cwd(),
  dataDir = path.join(projectRoot, 'data'),
  command = process.env.CODEX_COMMAND || 'codex',
  timeoutMs = Number(process.env.CODEX_TIMEOUT_MS || 10 * 60 * 1000),
  keepRunWorkspaces = process.env.ABA_KEEP_RUN_WORKSPACES === '1',
  store,
  adapter,
  clock,
  onStatus = () => {}
} = {}) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedDataDir = path.resolve(dataDir);
  const writeStore = store || new MarkdownDataStore({ dataDir: resolvedDataDir });
  await writeStore.ensure();

  const writeAdapter = adapter || new CodexAdapter({
    projectRoot: resolvedProjectRoot,
    runRoot: path.join(resolvedDataDir, '.runs'),
    command,
    timeoutMs,
    keepRunWorkspaces
  });

  const orchestrator = new GenerationOrchestrator({
    store: writeStore,
    adapter: writeAdapter,
    ...(clock ? { clock } : {})
  });

  const result = await orchestrator.run({ onStatus });
  await writeStaticState({ store: writeStore, publicDir: path.join(resolvedProjectRoot, 'public') });

  return {
    status: {
      state: 'complete',
      message: 'Post committed.',
      runId: result.runId,
      postId: result.post.id
    },
    post: result.post
  };
}
