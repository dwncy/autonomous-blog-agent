import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn as defaultSpawn } from 'node:child_process';
import { generationSchema } from './generationContract.js';

export class CodexRunError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CodexRunError';
    Object.assign(this, details);
  }
}

export class CodexAdapter {
  constructor({
    projectRoot,
    runRoot,
    command = 'codex',
    timeoutMs = 10 * 60 * 1000,
    spawnFn = defaultSpawn,
    keepRunWorkspaces = false
  } = {}) {
    if (!projectRoot) throw new Error('CodexAdapter requires a projectRoot');
    this.projectRoot = projectRoot;
    this.runRoot = runRoot || path.join(projectRoot, 'data', '.runs');
    this.command = command;
    this.timeoutMs = timeoutMs;
    this.spawnFn = spawnFn;
    this.keepRunWorkspaces = keepRunWorkspaces;
  }

  buildCommand({ workspaceDir, outputPath, schemaPath, schema }) {
    const args = [
      'exec',
      '--cd', workspaceDir,
      '--sandbox', 'workspace-write',
      '--skip-git-repo-check',
      '--color', 'never',
      '-c', 'web_search="live"',
      '--output-last-message', outputPath
    ];

    if (schema) {
      args.push('--output-schema', schemaPath);
    }

    args.push('-');

    return { command: this.command, args };
  }

  async run({
    prompt,
    files = {},
    runId,
    schema = generationSchema,
    schemaFilename = 'output.schema.json',
    outputFilename = 'final-message.json'
  } = {}) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('CodexAdapter.run requires a prompt string');
    }
    if (!runId) {
      throw new Error('CodexAdapter.run requires a runId');
    }

    const workspaceDir = path.join(this.runRoot, sanitizePathPart(runId));
    await fs.rm(workspaceDir, { recursive: true, force: true });
    await fs.mkdir(workspaceDir, { recursive: true });

    for (const [relativePath, contents] of Object.entries(files)) {
      const absolutePath = safeJoin(workspaceDir, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, String(contents ?? ''), 'utf8');
    }

    const schemaPath = path.join(workspaceDir, schemaFilename);
    const outputPath = path.join(workspaceDir, outputFilename);
    if (schema) {
      await fs.writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
    }

    const command = this.buildCommand({ workspaceDir, outputPath, schemaPath, schema });
    let result = { stdout: '', stderr: '' };

    try {
      result = await this.#spawnCodex({ ...command, prompt, cwd: workspaceDir });

      let finalMessage;
      try {
        finalMessage = await fs.readFile(outputPath, 'utf8');
      } catch (error) {
        throw new CodexRunError('Codex completed without writing its final message file', {
          cause: error,
          stdout: result.stdout,
          stderr: result.stderr,
          command
        });
      }

      return {
        finalMessage,
        stdout: result.stdout,
        stderr: result.stderr,
        workspaceDir,
        outputPath,
        command
      };
    } finally {
      if (!this.keepRunWorkspaces) {
        await fs.rm(workspaceDir, { recursive: true, force: true });
      }
    }
  }

  #spawnCodex({ command, args, prompt, cwd }) {
    return new Promise((resolve, reject) => {
      const child = this.spawnFn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NO_COLOR: '1'
        }
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        child.kill('SIGTERM');
        const error = new CodexRunError(`Codex run exceeded ${this.timeoutMs}ms timeout`, {
          stdout,
          stderr,
          command: { command, args }
        });
        settled = true;
        reject(error);
      }, this.timeoutMs);

      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
      });

      child.on('error', (error) => {
        if (settled) return;
        clearTimeout(timeout);
        settled = true;
        reject(new CodexRunError(`Failed to start ${command}: ${error.message}`, {
          cause: error,
          stdout,
          stderr,
          command: { command, args }
        }));
      });

      child.on('close', (code, signal) => {
        if (settled) return;
        clearTimeout(timeout);
        settled = true;
        if (code !== 0) {
          const stderrLine = stderr.trim().split('\n').find(Boolean);
          const exitLabel = signal ? `signal ${signal}` : `code ${code}`;
          const message = stderrLine
            ? `Codex exited with ${exitLabel}: ${stderrLine}`
            : `Codex exited with ${exitLabel}`;
          reject(new CodexRunError(message, {
            code,
            signal,
            stdout,
            stderr,
            command: { command, args }
          }));
          return;
        }
        resolve({ stdout, stderr });
      });

      child.stdin.end(prompt);
    });
  }
}

function sanitizePathPart(input) {
  return String(input ?? '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || `run-${Date.now()}`;
}

function safeJoin(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root);
  if (!resolved.startsWith(`${normalizedRoot}${path.sep}`) && resolved !== normalizedRoot) {
    throw new Error(`Unsafe run workspace path: ${relativePath}`);
  }
  return resolved;
}
