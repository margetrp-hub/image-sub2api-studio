import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson } from './jsonFiles.js';
import { createKeyedLock } from './keyedLock.js';
import { sanitizeCommunityPrompt } from './communityPrompts.js';

const ID = /^share-[a-f0-9-]{36}$/;
const ASSET = /^0\.(png|jpg|webp|mp4|webm)$/;

function failure(code, status = 404) {
  return Object.assign(new Error(code), { status });
}

// Only explicit new publications live here. Never scan user directories to
// populate the public square: legacy "workspace" shares were private in practice.
export function createPublicPromptStore(root) {
  const locks = createKeyedLock();
  const itemPath = (id) => {
    if (!ID.test(id)) throw failure('COMMUNITY_PROMPT_NOT_FOUND');
    return path.join(root, `${id}.json`);
  };
  const read = async (id) => {
    try { return JSON.parse(await fs.readFile(itemPath(id), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const view = (entry, auth) => ({
    ...sanitizeCommunityPrompt(entry.item),
    visibility: 'public',
    canWithdraw: entry.ownerKey === auth.userKey,
    userReaction: entry.votes?.[auth.userKey] || ''
  });

  async function list(auth) {
    if (!auth) return [];
    const files = await fs.readdir(root).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const items = [];
    for (const file of files) {
      const id = file.replace(/\.json$/, '');
      if (file !== `${id}.json` || !ID.test(id)) continue;
      const entry = await read(id);
      if (entry) items.push(view(entry, auth));
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function publish(auth, item) {
    return locks.run(item.id, async () => {
      const metadataPath = itemPath(item.id);
      const target = path.join(root, 'assets', item.id);
      let image = '';
      try {
        if (item.image) {
          const match = item.image.match(/^\/studio-api\/history\/(share-[a-f0-9-]{36})\/assets\/(0\.(?:png|jpg|webp|mp4|webm))$/);
          if (!match || match[1] !== item.id) throw failure('SHARE_ASSET_INVALID', 400);
          await fs.mkdir(target, { recursive: true, mode: 0o700 });
          await fs.copyFile(path.join(auth.userDir, 'assets', item.id, match[2]), path.join(target, match[2]));
          image = `/studio-api/community-prompts/${item.id}/assets/${match[2]}`;
        }
        const entry = { ownerKey: auth.userKey, item: { ...item, image, visibility: 'public' }, votes: {} };
        await atomicWriteJson(metadataPath, entry);
        return view(entry, auth);
      } catch (error) {
        await fs.rm(target, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
    });
  }

  async function withdraw(auth, id) {
    return locks.run(id, async () => {
      const entry = await read(id);
      if (!entry || entry.ownerKey !== auth.userKey) throw failure('COMMUNITY_PROMPT_NOT_FOUND');
      // Remove the publication first. Assets can no longer be served afterward.
      await fs.unlink(itemPath(id));
      await fs.rm(path.join(root, 'assets', id), { recursive: true, force: true }).catch(() => {});
      return true;
    });
  }

  async function react(auth, id, action) {
    return locks.run(id, async () => {
      const entry = await read(id);
      if (!entry) return null;
      const item = entry.item;
      if (action === 'up' || action === 'down') {
        entry.votes ||= {};
        const previous = entry.votes[auth.userKey];
        item.reactions ||= { up: 0, down: 0 };
        if (previous) item.reactions[previous] = Math.max(0, (item.reactions[previous] || 0) - 1);
        if (previous === action) delete entry.votes[auth.userKey];
        else {
          entry.votes[auth.userKey] = action;
          item.reactions[action] = (item.reactions[action] || 0) + 1;
        }
      } else if (action === 'copy' || action === 'share') {
        const field = action === 'copy' ? 'copied' : 'shared';
        item[field] = (item[field] || 0) + 1;
      } else throw failure('ACTION_NOT_SUPPORTED', 400);
      await atomicWriteJson(itemPath(id), entry);
      return view(entry, auth);
    });
  }

  async function assetAuth(auth, id, file) {
    if (!auth || !ID.test(id) || !ASSET.test(file)) return null;
    const entry = await read(id);
    if (!entry || entry.item.image !== `/studio-api/community-prompts/${id}/assets/${file}`) return null;
    return { userDir: root, publication: true };
  }

  return { list, publish, withdraw, react, assetAuth };
}
