import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { createKeyedLock } from './studio-service/keyedLock.js';

const root = path.resolve(import.meta.dirname, '..');
await fs.mkdir(path.join(root, 'tmp'), { recursive: true });
const dataDir = await fs.mkdtemp(path.join(root, 'tmp', 'data-integrity-'));
const listener = net.createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const base = `http://127.0.0.1:${port}/studio-api`;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const service = spawn(process.execPath, ['scripts/image-agent-studio-history-service.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    STUDIO_AUTH_MODE: 'local',
    STUDIO_HISTORY_HOST: '127.0.0.1',
    STUDIO_HISTORY_PORT: String(port),
    STUDIO_DATA_DIR: dataDir,
    STUDIO_ALLOWED_ORIGINS: `http://127.0.0.1:${port}`
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serviceOutput = '';
service.stdout.on('data', (chunk) => { serviceOutput += chunk; });
service.stderr.on('data', (chunk) => { serviceOutput += chunk; });

async function request(user, route, { method = 'GET', body, headers = {} } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { Authorization: `Bearer integrity-${user}`, 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000)
  });
}

async function api(user, route, options) {
  const response = await request(user, route, options);
  const result = await response.json();
  assert.equal(response.ok, true, `${JSON.stringify(result)}\n${serviceOutput.slice(-4000)}`);
  return result;
}

try {
  await test('keyed locks serialize, release after failure, and isolate users', async () => {
    const lock = createKeyedLock();
    const releaseA = await lock.acquire('a');
    let enteredA = false;
    const queuedA = lock.run('a', () => { enteredA = true; });
    await lock.run('b', () => assert.equal(enteredA, false));
    assert.equal(lock.size, 1);
    releaseA();
    releaseA();
    await queuedA;
    assert.equal(enteredA, true);
    await assert.rejects(lock.run('a', () => { throw new Error('fixture failure'); }), /fixture failure/);
    await lock.run('a', () => {});
    assert.equal(lock.size, 0);
  });

  const deadline = Date.now() + 15_000;
  while (true) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) break;
    } catch {}
    assert(Date.now() < deadline && service.exitCode === null, serviceOutput || 'Service startup timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await test('persistent data integrity', async (t) => {
    await t.test('concurrent history writes retain every acknowledged record', async () => {
      const saved = await Promise.all(Array.from({ length: 16 }, (_, index) => api('history', '/history', {
        method: 'POST', body: { id: `parallel-history-${index}`, prompt: `History ${index}`, resultUrls: [] }
      })));
      const loaded = await api('history', '/history?limit=100');
      assert.deepEqual(loaded.records.map((item) => item.id).sort(), saved.map((item) => item.record.id).sort());
    });

    await t.test('concurrent shares and reactions do not overwrite each other', async () => {
      const saved = await Promise.all(Array.from({ length: 12 }, (_, index) => api('community', '/community-prompts', {
        method: 'POST', body: { prompt: `Concurrent community prompt ${index}` }
      })));
      const loaded = await api('community', '/community-prompts');
      assert.equal(loaded.items.length, saved.length);
      const id = saved[0].item.id;
      await Promise.all(Array.from({ length: 12 }, () => api('community', `/community-prompts/${id}/reaction`, {
        method: 'POST', body: { action: 'copy' }
      })));
      const reacted = await api('community', '/community-prompts');
      assert.equal(reacted.items.find((item) => item.id === id).copied, 12);
      assert.equal((await api('other-user', '/community-prompts')).items.length, 0);
    });

    await t.test('concurrent session snapshots leave one complete usable snapshot', async () => {
      await Promise.all(Array.from({ length: 10 }, (_, index) => api('sessions', '/session?sessionId=parallel-session', {
        method: 'POST', body: { prompt: `Session ${index}`, results: [png], canvasNodes: [], parameters: { index } }
      })));
      const { session } = await api('sessions', '/session?sessionId=parallel-session');
      assert.equal(session.prompt, `Session ${session.parameters.index}`);
      assert.equal((await request('sessions', session.results[0].replace('/studio-api', ''))).status, 200);
    });

    await t.test('multiline prompts and video metadata survive all persistence paths', async () => {
      const prompt = 'Subject:\n  Keep the line breaks and indentation.\n\nLighting:\n  Soft daylight.\n'.repeat(100).trim();
      const generationPrompt = `${prompt}\n\nOutput: high detail.`;
      const meta = {
        mode: 'video', model: 'video-fixture', aspectRatio: '3:4', resolutionTier: '2K',
        duration: 8, fps: 24, width: 768, height: 1024, negativePrompt: 'Blur\nArtifacts', referenceCount: 0,
        videoMotion: 'slow-pan', videoStyle: 'cinematic', videoQuality: 'high'
      };
      await api('metadata', '/history', {
        method: 'POST', body: { id: 'metadata-history', prompt, generationPrompt, ...meta }
      });
      const history = (await api('metadata', '/history')).records[0];
      assert(history.prompt === prompt, 'History must retain the complete multiline prompt');
      assert(history.generationPrompt === generationPrompt, 'History must retain the generation prompt');
      for (const [key, value] of Object.entries(meta)) assert.equal(String(history[key]), String(value), key);
      await api('metadata', '/session?sessionId=metadata-session', {
        method: 'POST',
        body: { sessionId: 'metadata-session', prompt, canvasNodes: [{ id: 'metadata-node', prompt, generationPrompt, kind: 'image', url: png }] }
      });
      const session = (await api('metadata', '/session?sessionId=metadata-session')).session;
      assert(session.prompt === prompt, 'Session must retain the complete multiline prompt');
      assert(session.canvasNodes[0].generationPrompt === generationPrompt, 'Canvas must retain the generation prompt');
      await api('metadata', '/community-prompts', {
        method: 'POST', body: { prompt, generationPrompt, generation: meta }
      });
      const shared = (await api('metadata', '/community-prompts')).items[0];
      assert(shared.prompt === prompt, 'Share must retain the complete multiline prompt');
      assert(shared.generationPrompt === generationPrompt, 'Share must retain the generation prompt');
      assert.equal(shared.generation.negativePrompt, meta.negativePrompt);
      for (const [key, value] of Object.entries(meta)) assert.equal(shared.generation[key], String(value), `Shared ${key}`);
      const detail = (await api('metadata', `/library/${shared.id}`)).case;
      assert(detail.prompt === prompt, 'Library detail must retain the complete multiline prompt');
      assert(detail.generationPrompt === generationPrompt, 'Library detail must retain the generation prompt');
    });

    await t.test('shared media owns a copy that survives deletion of its source history', async () => {
      const { record } = await api('media', '/history', {
        method: 'POST', body: { id: 'shared-source-history', prompt: 'Source image', resultUrls: [png] }
      });
      const { item } = await api('media', '/community-prompts', {
        method: 'POST', body: { prompt: 'Share this image with its prompt', image: record.resultUrls[0] }
      });
      assert.notEqual(item.image, record.resultUrls[0]);
      const foreign = await request('other-user', '/community-prompts', {
        method: 'POST', body: { prompt: 'Must not access another user media', image: record.resultUrls[0] }
      });
      assert.equal(foreign.status, 404);
      assert.equal((await api('other-user', '/community-prompts')).items.length, 0);
      await api('media', `/history/${record.id}`, { method: 'DELETE' });
      const response = await request('media', item.image.replace('/studio-api', ''));
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(png.split(',')[1], 'base64'));
      assert.equal((await request('other-user', item.image.replace('/studio-api', ''))).status, 404);
      assert.equal((await request('media', '/community-prompts', {
        method: 'POST', body: { prompt: 'Missing source should not silently succeed', image: record.resultUrls[0] }
      })).status, 404);
      for (const image of ['blob:expired-preview', 'data:image/png;base64,', '/studio-api/history/invalid']) {
        const response = await request('media', '/community-prompts', {
          method: 'POST', body: { prompt: 'Invalid media must not silently succeed', image }
        });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error, 'SHARE_ASSET_INVALID');
      }
      assert.equal((await api('media', '/community-prompts')).items.length, 1);
    });

    await t.test('video byte ranges return suffix and open-ended ranges correctly', async () => {
      const bytes = Buffer.from('0123456789');
      const { record } = await api('ranges', '/history', {
        method: 'POST', body: { id: 'video-range-history', mode: 'video', resultUrls: [`data:video/mp4;base64,${bytes.toString('base64')}`] }
      });
      const route = record.resultUrls[0].replace('/studio-api', '');
      for (const [range, expected, contentRange] of [
        ['bytes=-3', '789', 'bytes 7-9/10'],
        ['bytes=5-', '56789', 'bytes 5-9/10'],
        ['bytes=2-4', '234', 'bytes 2-4/10'],
        ['bytes=-30', '0123456789', 'bytes 0-9/10']
      ]) {
        const response = await request('ranges', route, { headers: { Range: range } });
        assert.equal(response.status, 206);
        assert.equal(response.headers.get('content-range'), contentRange);
        assert.equal(await response.text(), expected);
      }
      for (const range of ['bytes=-0', 'bytes=-', 'bytes=20-', 'bytes=4-2']) {
        assert.equal((await request('ranges', route, { headers: { Range: range } })).status, 416, range);
      }
    });

    await t.test('session video and WebM shares persist as owned media', async () => {
      const bytes = Buffer.from('webm-persistence-fixture-'.repeat(150));
      const { session } = await api('webm', '/session?sessionId=webm-session', {
        method: 'POST', body: { mode: 'video', videoResults: [`data:video/webm;base64,${bytes.toString('base64')}`] }
      });
      assert.match(session.videoResults[0], /^\/studio-api\/history\/.*\/assets\/0\.webm$/);
      const { item } = await api('webm', '/community-prompts', {
        method: 'POST', body: { prompt: 'Share a saved WebM clip', image: session.videoResults[0], generation: { mode: 'video' } }
      });
      await api('webm', '/session?sessionId=webm-session', { method: 'DELETE' });
      const response = await request('webm', item.image.replace('/studio-api', ''), { headers: { Range: 'bytes=-8' } });
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-type'), 'video/webm');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(-8));
    });

    await t.test('invalid backup contents are rejected before any existing data changes', async () => {
      await api('backup', '/history', {
        method: 'POST', body: { id: 'backup-sentinel-record', prompt: 'Keep this record', resultUrls: [png] }
      });
      const original = await api('backup', '/backup');
      const invalid = [
        { ...original, data: {} },
        { ...original, data: { ...original.data, records: 'not an array' } },
        { ...original, data: { ...original.data, records: [original.data.records[0], original.data.records[0]] } },
        { ...original, data: { ...original.data, jobs: [null] } },
        { ...original, data: { ...original.data, session: [] } },
        { ...original, data: { ...original.data, sessions: [null] } },
        { ...original, data: { ...original.data, sessions: [{ sessionId: 'Same-session' }, { sessionId: 'same-session' }] } },
        { ...original, data: { ...original.data, communityPrompts: {} } },
        { ...original, data: { ...original.data, assets: [...original.data.assets, ...original.data.assets] } },
        { ...original, data: { ...original.data, assets: [{ path: 'bad/data.png', bytes: 9, data: 'invalid-base64!' }] } },
        { ...original, data: { ...original.data, assets: [{ path: 'bad/data.png', bytes: 999, data: 'YWJj' }] } },
        ...[['folder', 'folder/data.png'], ['folder/data.png', 'FOLDER']]
          .map((paths) => ({ ...original, data: { ...original.data, assets: paths.map((path) => ({ path, bytes: 3, data: 'YWJj' })) } })),
        ...['/absolute/data.png', '../outside/data.png', 'C:\\outside\\data.png', 'folder\\..\\outside', 'NUL.png', 'folder/data.png:stream']
          .map((path) => ({ ...original, data: { ...original.data, assets: [{ path, bytes: 3, data: 'YWJj' }] } }))
      ];
      for (const backup of invalid) {
        const response = await request('backup', '/backup/restore', { method: 'POST', body: backup });
        assert.equal(response.status, 400, await response.text());
        assert.deepEqual((await api('backup', '/backup')).data, original.data);
      }
      await api('backup', '/backup/restore', { method: 'POST', body: original });
      assert.deepEqual((await api('backup', '/backup')).data, original.data);
      const legacy = structuredClone(original);
      legacy.kind = 'ai-image-workbench.user-backup';
      delete legacy.data.sessions;
      delete legacy.data.communityPrompts;
      await api('backup', '/backup/restore', { method: 'POST', body: legacy });
      assert.deepEqual((await api('backup', '/backup')).data, original.data);
    });
  });
} finally {
  if (service.exitCode === null) {
    const stopped = once(service, 'exit');
    service.kill();
    await stopped;
  }
  await fs.rm(dataDir, { recursive: true, force: true });
}
