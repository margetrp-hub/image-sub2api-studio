import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createStandaloneAuthStore } from './studio-service/standaloneAuth.js';

const rootDir = path.resolve(import.meta.dirname, '..');
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-provider-protocol-'));
const databasePath = path.join(dataDir, 'auth.sqlite');
const password = 'Provider Protocol 123!';
const providerKey = 'provider-protocol-secret';
const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const tinyMp4 = Buffer.from('provider-protocol-mp4');
const imageDataUrl = `data:image/jpeg;base64,${tinyJpeg.toString('base64')}`;
const providerHits = [];

const store = createStandaloneAuthStore({ databasePath, passwordIterations: 100_000 });
store.createUser({ email: 'protocol@example.com', username: 'Protocol', password, role: 'admin' });
store.close();

const provider = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyBuffer = Buffer.concat(chunks);
  const rawBody = bodyBuffer.toString('utf8');
  providerHits.push({
    method: req.method,
    url: req.url,
    contentType: String(req.headers['content-type'] || ''),
    rawBody
  });

  if (req.method === 'GET' && req.url === '/v1/models') {
    return json(res, {
      object: 'list',
      data: [
        { id: 'nano-banana-pro-preview' },
        { id: 'jimeng_high_aes_general_v21_L' },
        { id: 'sora-2' },
        { id: 'veo-3.1-generate-preview' },
        { id: 'unknown-creative-model' }
      ]
    });
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    return json(res, { choices: [{ message: { content: `![generated](${imageDataUrl})` } }] });
  }
  if (req.method === 'POST' && req.url === '/v1/images/generations') {
    return json(res, { data: [{ b64_json: tinyJpeg.toString('base64') }] });
  }
  if (req.method === 'POST' && req.url === '/v1/videos') {
    return json(res, { id: 'sora-protocol-1', status: 'queued' });
  }
  if (req.method === 'GET' && req.url === '/v1/videos/sora-protocol-1') {
    return json(res, { id: 'sora-protocol-1', status: 'completed', progress: 100 });
  }
  if (req.method === 'GET' && req.url === '/v1/videos/sora-protocol-1/content') {
    res.setHeader('Content-Type', 'video/mp4');
    res.end(tinyMp4);
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/video/generations') {
    return json(res, { data: { task_id: 'veo-protocol-1', status: 'queued' } });
  }
  if (req.method === 'GET' && req.url === '/v1/video/generations/veo-protocol-1') {
    return json(res, { data: { task_id: 'veo-protocol-1', status: 'succeeded', progress: 100, url: '/v1/video/veo-protocol-1/content' } });
  }
  if (req.method === 'GET' && req.url === '/v1/video/veo-protocol-1/content') {
    res.setHeader('Content-Type', 'video/mp4');
    res.end(tinyMp4);
    return;
  }
  res.statusCode = 404;
  json(res, { error: { message: 'not found' } });
});

await listen(provider);
const providerPort = provider.address().port;
const servicePort = await freePort();
const service = startService(servicePort, providerPort);

try {
  await waitForHealth(servicePort);
  const token = await login(servicePort);
  const models = await request(servicePort, '/studio-api/model-sync', { method: 'POST', token, body: {} });
  assert.equal(models.status, 200, models.raw);
  const discovered = models.payload.models.data;
  assert.equal(discovered.find((model) => model.id === 'nano-banana-pro-preview').invocations.image.adapter, 'openai-chat-images');
  assert.equal(discovered.find((model) => model.id === 'unknown-creative-model').invocations.image.status, 'unsupported');

  const nano = await createAndWait(servicePort, token, {
    id: 'job-nano-reference', mode: 'edit', route: 'edits', model: 'nano-banana-pro-preview',
    prompt: 'Keep the subject and improve the lighting.', size: '1536x1024', n: 1
  }, { images: [{ dataUrl: imageDataUrl, name: 'reference.jpg' }] });
  assert.equal(nano.status, 'succeeded');

  const jimeng = await createAndWait(servicePort, token, {
    id: 'job-jimeng-image', mode: 'image', route: 'generations', model: 'jimeng_high_aes_general_v21_L',
    prompt: 'Create an editorial portrait.', size: '1024x1024', n: 1
  });
  assert.equal(jimeng.status, 'succeeded');

  const sora = await createAndWait(servicePort, token, {
    id: 'job-sora-video', mode: 'video', route: 'video', model: 'sora-2', prompt: 'A slow camera orbit.',
    duration: 8, width: 1280, height: 720
  }, { images: [{ dataUrl: imageDataUrl, name: 'input-reference.jpg' }] });
  assert.equal(sora.status, 'succeeded');

  const veo = await createAndWait(servicePort, token, {
    id: 'job-veo-video', mode: 'video', route: 'video', model: 'veo-3.1-generate-preview', prompt: 'A stable flythrough.',
    duration: 8, width: 1280, height: 720, aspectRatio: '16:9'
  });
  assert.equal(veo.status, 'succeeded');

  const nanoHit = providerHits.find((hit) => hit.url === '/v1/chat/completions');
  const nanoBody = JSON.parse(nanoHit.rawBody);
  assert.equal(nanoBody.messages[0].content[1].type, 'image_url');
  assert.equal(nanoBody.extra_body.google.image_config.aspect_ratio, '3:2');

  const jimengHit = providerHits.find((hit) => hit.url === '/v1/images/generations');
  assert.equal(JSON.parse(jimengHit.rawBody).model, 'jimeng_high_aes_general_v21_L');

  const soraHit = providerHits.find((hit) => hit.url === '/v1/videos');
  assert.match(soraHit.contentType, /^multipart\/form-data; boundary=/);
  assert.match(soraHit.rawBody, /name="model"\r\n\r\nsora-2/);
  assert.match(soraHit.rawBody, /name="input_reference"; filename="input-reference.jpg"/);

  const veoHit = providerHits.find((hit) => hit.url === '/v1/video/generations');
  const veoBody = JSON.parse(veoHit.rawBody);
  assert.equal(veoBody.model, 'veo-3.1-generate-preview');
  assert.equal(veoBody.size, '1280x720');
  assert.equal(veoBody.metadata.aspect_ratio, '16:9');

  const unsupported = await request(servicePort, '/studio-api/generation-jobs', {
    method: 'POST', token, body: { request: { id: 'job-unsupported', mode: 'video', route: 'video', model: 'unknown-creative-model', prompt: 'No protocol.' } }
  });
  assert.equal(unsupported.status, 400);
  assert.equal(unsupported.payload.error, 'MODEL_INVOCATION_NOT_VERIFIED');

  console.log(JSON.stringify({ ok: true, routes: providerHits.map((hit) => `${hit.method} ${hit.url}`) }, null, 2));
} finally {
  await stopService(service);
  await new Promise((resolve) => provider.close(resolve));
}

function json(res, payload) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function startService(port, providerPort) {
  const state = { stdout: '', stderr: '' };
  state.child = spawn(process.execPath, ['scripts/image-agent-studio-history-service.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      STUDIO_HISTORY_HOST: '127.0.0.1',
      STUDIO_AUTH_MODE: 'standalone',
      STUDIO_USER_PROVIDER_ONLY: 'false',
      STUDIO_DATA_DIR: dataDir,
      STUDIO_AUTH_DB_PATH: databasePath,
      STUDIO_PROVIDER_BASE_URL: `http://127.0.0.1:${providerPort}`,
      STUDIO_PROVIDER_API_KEY: providerKey,
      STUDIO_PROVIDER_TYPE: 'newapi-compatible',
      STUDIO_VIDEO_POLL_INTERVAL_MS: '100',
      STUDIO_ALLOWED_ORIGINS: 'http://127.0.0.1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  state.child.stdout.on('data', (chunk) => { state.stdout += chunk.toString(); });
  state.child.stderr.on('data', (chunk) => { state.stderr += chunk.toString(); });
  return state;
}

async function createAndWait(port, token, requestBody, extra = {}) {
  const created = await request(port, '/studio-api/generation-jobs', {
    method: 'POST', token, body: { request: requestBody, ...extra }
  });
  assert.equal(created.status, 202, created.raw);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const current = await request(port, `/studio-api/generation-jobs/${requestBody.id}`, { token });
    assert.equal(current.status, 200, current.raw);
    if (['succeeded', 'failed', 'canceled'].includes(current.payload.job.status)) return current.payload.job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Job ${requestBody.id} did not finish.`);
}

async function login(port) {
  const response = await request(port, '/studio-api/auth/login', {
    method: 'POST', body: { identifier: 'protocol@example.com', password }
  });
  assert.equal(response.status, 200, response.raw);
  return response.payload.token;
}

async function request(port, pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = await response.text();
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch {}
  return { status: response.status, payload, raw };
}

async function waitForHealth(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/studio-api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Provider protocol service did not become healthy.');
}

async function stopService(state) {
  if (state.child.exitCode === null) state.child.kill('SIGTERM');
  await new Promise((resolve) => {
    if (state.child.exitCode !== null) resolve();
    else state.child.once('exit', resolve);
    setTimeout(resolve, 1000);
  });
  if (state.stderr.trim()) process.stderr.write(state.stderr);
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
