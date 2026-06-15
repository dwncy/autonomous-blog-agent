import crypto from 'node:crypto';

export function slugify(input) {
  const slug = String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'post';
}

export function makePostId({ title, date = new Date(), random = crypto.randomUUID } = {}) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  const suffix = random().replace(/-/g, '').slice(0, 8);
  return `${stamp}_${slugify(title)}_${suffix}`;
}

export function quoteFrontmatterValue(value) {
  return JSON.stringify(String(value ?? ''));
}

export function stringifyPost({ id, title, createdAt, slug, seedMood, body }) {
  const lines = [
    '---',
    `id: ${quoteFrontmatterValue(id)}`,
    `title: ${quoteFrontmatterValue(title)}`,
    `createdAt: ${quoteFrontmatterValue(createdAt)}`,
    `slug: ${quoteFrontmatterValue(slug)}`
  ];

  if (seedMood) {
    lines.push(`seedMood: ${quoteFrontmatterValue(seedMood)}`);
  }

  lines.push('---', '', normalizeMarkdown(body));
  return `${lines.join('\n').replace(/\n+$/u, '')}\n`;
}

export function normalizeMarkdown(value) {
  return `${String(value ?? '').replace(/\r\n/g, '\n').trim()}\n`;
}

export function parseFrontmatter(markdown) {
  const source = String(markdown ?? '').replace(/\r\n/g, '\n');
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u);
  if (!match) {
    return { metadata: {}, body: source };
  }

  const metadata = {};
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!key) continue;

    try {
      metadata[key] = rawValue.startsWith('"') ? JSON.parse(rawValue) : rawValue;
    } catch {
      metadata[key] = rawValue.replace(/^"|"$/g, '');
    }
  }

  return { metadata, body: match[2] };
}

export function excerpt(markdown, maxLength = 220) {
  const text = String(markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`\-[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}
