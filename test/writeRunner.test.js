import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownDataStore } from '../src/dataStore.js';
import { runAutonomousWrite } from '../src/writeRunner.js';

test('runAutonomousWrite commits one post with an empty seed mood', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aba-write-runner-'));
  const dataDir = path.join(tempRoot, 'data');
  const store = new MarkdownDataStore({ dataDir });
  const calls = [];
  const adapter = {
    async run(options) {
      calls.push(options);
      if (options.outputFilename === 'NEW_POST.md') {
        return {
          finalMessage: '# Direct Runner\n\nA post written through the app flow.\n',
          stdout: '',
          stderr: ''
        };
      }

      return {
        finalMessage: JSON.stringify({
          evolvedMemory: '# Memory\n\nThe direct runner worked.\n',
          soulUpdate: {
            changed: false,
            content: null,
            reason: 'No identity-level change.'
          }
        }),
        stdout: '',
        stderr: ''
      };
    }
  };

  const result = await runAutonomousWrite({
    projectRoot: tempRoot,
    dataDir,
    store,
    adapter,
    seedMood: '',
    clock: () => new Date('2026-06-16T00:00:00.000Z')
  });

  assert.equal(result.status.state, 'complete');
  assert.equal(result.post.title, 'Direct Runner');
  assert.equal(result.post.seedMood, null);
  assert.equal(calls.length, 2);

  const posts = await store.listPosts();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, result.status.postId);
});
