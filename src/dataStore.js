import fs from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { DEFAULT_MEMORY, DEFAULT_RULE, DEFAULT_SOUL } from './seeds.js';
import { excerpt, makePostId, parseFrontmatter, slugify, stringifyPost } from './markdown.js';
import { validateGeneration } from './generationContract.js';

export class MarkdownDataStore {
  constructor({ dataDir } = {}) {
    if (!dataDir) throw new Error('MarkdownDataStore requires a dataDir');
    this.dataDir = dataDir;
    this.postsDir = path.join(dataDir, 'posts');
    this.tmpDir = path.join(dataDir, '.tmp');
    this.memoryPath = path.join(dataDir, 'MEMORY.md');
    this.rulePath = path.join(dataDir, 'RULE.md');
    this.soulPath = path.join(dataDir, 'SOUL.md');
  }

  async ensure() {
    await fs.mkdir(this.postsDir, { recursive: true });
    await fs.mkdir(this.tmpDir, { recursive: true });
    await ensureFile(this.memoryPath, DEFAULT_MEMORY);
    await ensureFile(this.rulePath, DEFAULT_RULE);
    await ensureFile(this.soulPath, DEFAULT_SOUL);
  }

  async readMaterials() {
    await this.ensure();
    const [memory, rule, soul] = await Promise.all([
      fs.readFile(this.memoryPath, 'utf8'),
      fs.readFile(this.rulePath, 'utf8'),
      fs.readFile(this.soulPath, 'utf8')
    ]);

    return { memory, rule, soul };
  }

  async listPosts() {
    await this.ensure();
    const entries = await fs.readdir(this.postsDir, { withFileTypes: true });
    const posts = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      if (entry.name === '.gitkeep') continue;

      const filePath = path.join(this.postsDir, entry.name);
      const markdown = await fs.readFile(filePath, 'utf8');
      const { metadata, body } = parseFrontmatter(markdown);
      const stat = await fs.stat(filePath);
      const createdAt = metadata.createdAt || stat.birthtime.toISOString();
      const id = metadata.id || entry.name.replace(/\.md$/u, '');

      posts.push({
        id,
        filename: entry.name,
        title: metadata.title || 'Untitled',
        createdAt,
        slug: metadata.slug || slugify(metadata.title || id),
        seedMood: metadata.seedMood || null,
        body,
        excerpt: excerpt(body),
        path: path.relative(this.dataDir, filePath)
      });
    }

    posts.sort((a, b) => {
      const byDate = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (Number.isFinite(byDate) && byDate !== 0) return byDate;
      return b.filename.localeCompare(a.filename);
    });

    return posts;
  }

  async commitGeneration(rawGeneration, { now = new Date(), seedMood = '', runId = makePostId({ title: 'run', date: now }) } = {}) {
    await this.ensure();
    const generation = validateGeneration(rawGeneration);
    const createdAt = now.toISOString();
    const slug = slugify(generation.title);
    const id = await this.#uniquePostId(generation.title, now);
    const filename = `${id}.md`;
    const postPath = path.join(this.postsDir, filename);
    const stagingDir = path.join(this.tmpDir, sanitizePathPart(runId));
    const backupDir = path.join(stagingDir, 'backup');

    await fs.rm(stagingDir, { recursive: true, force: true });
    await fs.mkdir(backupDir, { recursive: true });

    const postMarkdown = stringifyPost({
      id,
      title: generation.title,
      createdAt,
      slug,
      seedMood: seedMood?.trim(),
      body: generation.body
    });

    const postTempPath = path.join(stagingDir, 'post.md');
    const memoryTempPath = path.join(stagingDir, 'MEMORY.md');
    const soulTempPath = path.join(stagingDir, 'SOUL.md');

    await Promise.all([
      fs.writeFile(postTempPath, postMarkdown, 'utf8'),
      fs.writeFile(memoryTempPath, generation.evolvedMemory, 'utf8'),
      generation.soulUpdate.changed
        ? fs.writeFile(soulTempPath, generation.soulUpdate.content, 'utf8')
        : Promise.resolve()
    ]);

    const backups = {
      memory: path.join(backupDir, 'MEMORY.md'),
      soul: path.join(backupDir, 'SOUL.md')
    };

    await Promise.all([
      fs.copyFile(this.memoryPath, backups.memory),
      fs.copyFile(this.soulPath, backups.soul)
    ]);

    let postCopied = false;
    try {
      await fs.copyFile(postTempPath, postPath, fsConstants.COPYFILE_EXCL);
      postCopied = true;
      await fs.rename(memoryTempPath, this.memoryPath);
      if (generation.soulUpdate.changed) {
        await fs.rename(soulTempPath, this.soulPath);
      }
    } catch (error) {
      await this.#rollback({ backups, postPath, postCopied });
      throw error;
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true });
    }

    const [committed] = (await this.listPosts()).filter((post) => post.id === id);
    return committed;
  }

  async #rollback({ backups, postPath, postCopied }) {
    await Promise.allSettled([
      fs.copyFile(backups.memory, this.memoryPath),
      fs.copyFile(backups.soul, this.soulPath),
      postCopied ? fs.rm(postPath, { force: true }) : Promise.resolve()
    ]);
  }

  async #uniquePostId(title, date) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = makePostId({ title, date });
      try {
        await fs.access(path.join(this.postsDir, `${id}.md`));
      } catch {
        return id;
      }
    }
    return `${makePostId({ title, date })}-${Date.now()}`;
  }
}

async function ensureFile(filePath, contents) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents, 'utf8');
  }
}

function sanitizePathPart(input) {
  return String(input ?? '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || `run-${Date.now()}`;
}
