import fs from 'node:fs/promises';
import path from 'node:path';

export async function buildStaticState({ store }) {
  if (!store) throw new Error('buildStaticState requires a store');
  const [posts, materials] = await Promise.all([
    store.listPosts(),
    store.readMaterials()
  ]);
  return { posts, materials };
}

export async function writeStaticState({ store, publicDir }) {
  if (!publicDir) throw new Error('writeStaticState requires a publicDir');
  const state = await buildStaticState({ store });
  await fs.mkdir(publicDir, { recursive: true });
  await fs.writeFile(
    path.join(publicDir, 'state.json'),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8'
  );
  return state;
}
