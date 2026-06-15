import { normalizeMarkdown } from './markdown.js';

export const soulUpdateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['changed', 'content', 'reason'],
  properties: {
    changed: { type: 'boolean' },
    content: {
      anyOf: [
        { type: 'string' },
        { type: 'null' }
      ]
    },
    reason: { type: 'string', minLength: 1 }
  }
};

export const evolveOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'AutonomousBlogAgentEvolveOutput',
  type: 'object',
  additionalProperties: false,
  required: ['evolvedMemory', 'soulUpdate'],
  properties: {
    evolvedMemory: {
      type: 'string',
      minLength: 1
    },
    soulUpdate: soulUpdateSchema
  }
};

export const generationSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'AutonomousBlogAgentGeneration',
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body', 'evolvedMemory', 'soulUpdate'],
  properties: {
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 140
    },
    body: {
      type: 'string',
      minLength: 1
    },
    evolvedMemory: {
      type: 'string',
      minLength: 1
    },
    soulUpdate: soulUpdateSchema
  }
};

export class GenerationValidationError extends Error {
  constructor(errors) {
    super(`Generation output failed validation: ${errors.join('; ')}`);
    this.name = 'GenerationValidationError';
    this.errors = errors;
  }
}

export function parseGenerationOutput(rawOutput) {
  const source = String(rawOutput ?? '').trim();
  if (!source) {
    throw new GenerationValidationError(['Codex returned an empty final message']);
  }

  const candidates = [source];
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu);
  if (fenced) candidates.push(fenced[1].trim());

  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }

  const parseErrors = [];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      parseErrors.push(error.message);
    }
  }

  throw new GenerationValidationError([
    `Final message was not valid JSON (${parseErrors[0] ?? 'unknown parse error'})`
  ]);
}

export function parseAndValidateWrite(rawOutput) {
  return validateWriteMarkdown(rawOutput);
}

export function validateWriteMarkdown(rawMarkdown) {
  const errors = [];
  let source = String(rawMarkdown ?? '').trim();
  if (!source) {
    throw new GenerationValidationError(['Codex returned an empty final message']);
  }

  const fenced = source.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/iu);
  if (fenced) source = fenced[1].trim();

  const normalized = source.replace(/\r\n/g, '\n');
  const match = normalized.match(/^#\s+(.+?)\n+([\s\S]+)$/u);
  if (!match) {
    throw new GenerationValidationError(['Write output must be Markdown starting with a single # title line']);
  }

  const title = match[1].trim();
  if (!title) errors.push('title is required');
  if (title.length > 140) errors.push('title must be 140 characters or fewer');

  const body = match[2].trim();
  if (!body) errors.push('body is required');
  validatePublishedBody(body, errors);

  if (errors.length > 0) {
    throw new GenerationValidationError(errors);
  }

  const normalizedBody = normalizeMarkdown(body);
  return {
    title,
    body: normalizedBody,
    markdown: formatDraftPost({ title, body: normalizedBody })
  };
}

/** @deprecated Use validateWriteMarkdown */
export function validateWriteOutput(candidate) {
  const errors = [];
  const value = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null;

  if (!value) {
    throw new GenerationValidationError(['Write output must be a JSON object']);
  }

  const allowedKeys = new Set(['title', 'body']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push(`Unexpected top-level key: ${key}`);
  }

  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!title) errors.push('title is required');
  if (title.length > 140) errors.push('title must be 140 characters or fewer');

  const body = typeof value.body === 'string' ? value.body.trim() : '';
  if (!body) errors.push('body is required');
  validatePublishedBody(body, errors);

  if (errors.length > 0) {
    throw new GenerationValidationError(errors);
  }

  return {
    title,
    body: normalizeMarkdown(body),
    markdown: formatDraftPost({ title, body: normalizeMarkdown(body) })
  };
}

function formatDraftPost({ title, body }) {
  return [
    `# ${title.trim()}`,
    '',
    normalizeMarkdown(body).trim(),
    ''
  ].join('\n');
}

export function validateEvolveOutput(candidate) {
  const errors = [];
  const value = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null;

  if (!value) {
    throw new GenerationValidationError(['Evolve output must be a JSON object']);
  }

  const allowedKeys = new Set(['evolvedMemory', 'soulUpdate']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push(`Unexpected top-level key: ${key}`);
  }

  const evolvedMemory = typeof value.evolvedMemory === 'string' ? value.evolvedMemory.trim() : '';
  if (!evolvedMemory) errors.push('evolvedMemory is required');

  const soulUpdate = validateSoulUpdate(value.soulUpdate, errors);

  if (errors.length > 0) {
    throw new GenerationValidationError(errors);
  }

  return {
    evolvedMemory: normalizeMarkdown(evolvedMemory),
    soulUpdate
  };
}

export function validateGeneration(candidate) {
  const errors = [];
  const value = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null;

  if (!value) {
    throw new GenerationValidationError(['Generation output must be a JSON object']);
  }

  const allowedKeys = new Set(['title', 'body', 'evolvedMemory', 'soulUpdate']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push(`Unexpected top-level key: ${key}`);
  }

  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!title) errors.push('title is required');
  if (title.length > 140) errors.push('title must be 140 characters or fewer');

  const body = typeof value.body === 'string' ? value.body.trim() : '';
  if (!body) errors.push('body is required');
  validatePublishedBody(body, errors);

  const evolvedMemory = typeof value.evolvedMemory === 'string' ? value.evolvedMemory.trim() : '';
  if (!evolvedMemory) errors.push('evolvedMemory is required');

  const soulUpdate = validateSoulUpdate(value.soulUpdate, errors);

  if (errors.length > 0) {
    throw new GenerationValidationError(errors);
  }

  return {
    title,
    body: normalizeMarkdown(body),
    evolvedMemory: normalizeMarkdown(evolvedMemory),
    soulUpdate
  };
}

export function parseAndValidateEvolve(rawOutput) {
  return validateEvolveOutput(parseGenerationOutput(rawOutput));
}

export function parseAndValidateGeneration(rawOutput) {
  return validateGeneration(parseGenerationOutput(rawOutput));
}

export function mergeGeneration(write, evolve) {
  return validateGeneration({
    title: write.title,
    body: write.body,
    ...evolve
  });
}

function validateSoulUpdate(soulUpdate, errors) {
  const value = soulUpdate && typeof soulUpdate === 'object' && !Array.isArray(soulUpdate)
    ? soulUpdate
    : null;

  if (!value) {
    errors.push('soulUpdate object is required');
    return { changed: false, content: null, reason: '' };
  }

  const allowedSoulKeys = new Set(['changed', 'content', 'reason']);
  for (const key of Object.keys(value)) {
    if (!allowedSoulKeys.has(key)) errors.push(`Unexpected soulUpdate key: ${key}`);
  }

  if (typeof value.changed !== 'boolean') {
    errors.push('soulUpdate.changed must be a boolean');
  }

  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  if (!reason) errors.push('soulUpdate.reason is required');

  if (value.changed === true) {
    const content = typeof value.content === 'string' ? value.content.trim() : '';
    if (!content) errors.push('soulUpdate.content is required when changed is true');
  }

  return {
    changed: value.changed === true,
    content: value.changed === true ? normalizeMarkdown(value.content) : null,
    reason
  };
}

function validatePublishedBody(body, errors) {
  const visibleUrls = body.match(/https?:\/\/\S+/giu) ?? [];
  if (visibleUrls.length === 1 || visibleUrls.length > 3) {
    errors.push('body must include either no visible URLs or 2-3 visible URLs');
  }

  if (/^\s{0,3}#{1,6}\s*(sources?|research notes?|works cited|influences?)\s*$/imu.test(body)) {
    errors.push('body must not include source, influence, or research-note sections');
  }

  if (/\b(source list|research notes:|works cited)\b/iu.test(body)) {
    errors.push('body must not include visible source lists or research notes');
  }
}
