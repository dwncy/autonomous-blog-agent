import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import fs from 'node:fs/promises';
import { MarkdownDataStore } from './dataStore.js';
import { writeStaticState } from './staticState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(process.env.ABA_PROJECT_ROOT || path.join(__dirname, '..'));
const dataDir = path.resolve(process.env.ABA_DATA_DIR || path.join(projectRoot, 'data'));
const publicDir = path.join(projectRoot, 'public');
const port = Number(process.env.PORT || 3000);

const store = new MarkdownDataStore({ dataDir });
await store.ensure();
await writeStaticState({ store, publicDir });

const app = express();
app.disable('x-powered-by');
app.use(express.static(publicDir, {
  etag: true,
  extensions: ['html']
}));

app.get(/.*/u, async (_req, res, next) => {
  try {
    res.type('html').send(await fs.readFile(path.join(publicDir, 'index.html'), 'utf8'));
  } catch (error) {
    next(error);
  }
});

const server = app.listen(port, () => {
  console.log(`Lily listening on http://localhost:${port}`);
  console.log(`Markdown data directory: ${dataDir}`);
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Closing server.`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
