#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAutonomousWrite } from '../src/writeRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(process.env.ABA_PROJECT_ROOT || path.join(__dirname, '..'));
const dataDir = path.resolve(process.env.ABA_DATA_DIR || path.join(projectRoot, 'data'));

try {
  const result = await runAutonomousWrite({
    projectRoot,
    dataDir,
    seedMood: '',
    onStatus: (status) => {
      process.stderr.write(`${status.state}: ${status.message}\n`);
    }
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const failure = {
    status: {
      state: 'failed',
      message: 'Run failed.',
      error: {
        name: error?.name || 'Error',
        message: error?.message || String(error),
        errors: Array.isArray(error?.errors) ? error.errors : undefined
      }
    }
  };
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exitCode = 1;
}
