import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-image-workbench-service-smoke-'));
const token = 'local-smoke-token';
const secret = 'test-key-service-smoke-secret-should-not-persist';
const port = 19000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const gatewayPort = port + 2000;
const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;
const userKey = createHash('sha256').update(`local:${token}`).digest('hex');
const gatewayTimers = new Set();
const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const tinyPngDataUrl = `data:image/png;base64,${tinyPngBase64}`;
const editRequests = [];

async function request(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const attempts = method === 'GET' ? 3 : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `HTTP_${response.status}`);
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 160 * attempt));
    }
  }
  throw lastError;
}

async function waitForHealth() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/studio-api/health`);
      if (response.ok) return;
    } catch {
      // Service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('History service did not become healthy.');
}

async function waitForJob(jobId, predicate, label) {
  const deadline = Date.now() + 10_000;
  let latest = null;
  while (Date.now() < deadline) {
    latest = (await request(`/studio-api/generation-jobs/${jobId}`)).job;
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for job ${jobId}: ${label}\n${JSON.stringify(latest, null, 2)}`);
}

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

async function readAllJsonFiles(root) {
  const result = [];
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        result.push({
          path: fullPath,
          raw: await fs.readFile(fullPath, 'utf8')
        });
      }
    }
  }
  await visit(root);
  return result;
}

const child = spawn(process.execPath, ['scripts/image-sub2api-studio-history-service.mjs'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: {
    ...process.env,
    PORT: String(port),
    STUDIO_HISTORY_PORT: String(port),
    STUDIO_HISTORY_HOST: '127.0.0.1',
    STUDIO_AUTH_MODE: 'local',
    STUDIO_DATA_DIR: dataDir,
    STUDIO_ALLOWED_ORIGINS: 'http://127.0.0.1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

const slowGateway = http.createServer((req, res) => {
  if (req.url === '/v1/images/edits') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      editRequests.push({
        clientRequestId: String(req.headers['x-client-request-id'] || ''),
        body
      });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'x-request-id': 'req-editjob1'
      });
      res.end(JSON.stringify({
        data: [{ b64_json: tinyPngBase64 }],
        usage: { images: 1, route: 'edits' }
      }));
    });
    return;
  }

  if (req.url === '/v1/images/generations') {
    const clientRequestId = String(req.headers['x-client-request-id'] || '');
    if (clientRequestId.startsWith('successjob1-client')) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'x-request-id': 'req-successjob1'
      });
      res.end(JSON.stringify({
        data: [{ b64_json: tinyPngBase64 }],
        usage: { images: 1 }
      }));
      return;
    }
    if (clientRequestId.startsWith('failjob1-client')) {
      res.writeHead(403, {
        'Content-Type': 'application/json',
        'x-request-id': 'req-failjob1'
      });
      res.end(JSON.stringify({
        error: {
          message: 'ORIGIN_NOT_ALLOWED'
        }
      }));
      return;
    }
    let timer = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      gatewayTimers.delete(timer);
    };
    req.on('aborted', cleanup);
    res.on('close', cleanup);
    timer = setTimeout(() => {
      gatewayTimers.delete(timer);
      if (!res.destroyed) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [] }));
      }
    }, 30_000);
    gatewayTimers.add(timer);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'not found' } }));
});

await new Promise((resolve) => slowGateway.listen(gatewayPort, '127.0.0.1', resolve));

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

try {
  const staleUserDir = path.join(dataDir, 'users', userKey);
  await fs.mkdir(staleUserDir, { recursive: true });
  await fs.writeFile(path.join(staleUserDir, 'records.json'), `${JSON.stringify([
    {
      id: 'tailrecord1',
      sessionId: 'smoke-session',
      createdAt: '2020-01-01T00:00:00.000Z',
      mode: 'image',
      prompt: 'tail record prompt',
      generationPrompt: 'tail record generation prompt',
      model: 'gpt-image-2',
      resultUrls: ['/studio-api/history/tailrecord1/assets/0.png']
    }
  ], null, 2)}trailing-corruption`);
  await fs.writeFile(path.join(staleUserDir, 'jobs.json'), `${JSON.stringify([
    {
      id: 'stalejob1',
      clientRequestId: 'stalejob1-client',
      sessionId: 'smoke-session',
      status: 'upstream',
      stage: 'upstream',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      model: 'gpt-image-2',
      prompt: 'stale prompt',
      generationPrompt: 'stale generation prompt',
      size: '1024x1024',
      quality: 'high',
      count: 1,
      resultUrls: [],
      requestIds: []
    },
    {
      id: 'stalequeued1',
      clientRequestId: 'stalequeued1-client',
      sessionId: 'smoke-session',
      status: 'queued',
      stage: 'queued',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      model: 'gpt-image-2',
      prompt: 'stale queued prompt',
      generationPrompt: 'stale queued generation prompt',
      size: '1024x1024',
      quality: 'high',
      count: 1,
      resultUrls: [],
      requestIds: []
    }
  ], null, 2)}trailing-corruption`);

  await waitForHealth();

  const sharedCreation = (await request('/studio-api/community-prompts', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Shared generated image',
      prompt: 'A shared generated image prompt with enough detail for the smoke test.',
      generationPrompt: 'A shared generated image prompt with enough detail for the smoke test. Resolution target: 1K.',
      image: tinyPngDataUrl,
      imageAlt: 'Shared generated image',
      generation: {
        model: 'gpt-image-2',
        aspectRatio: '3:4',
        quality: 'high',
        resolutionTier: '1k',
        outputFormat: 'png'
      }
    })
  })).item;
  assert(sharedCreation?.image?.startsWith('/studio-api/history/share-'), 'Community creation image was not persisted as a user asset.', sharedCreation);
  assert(sharedCreation?.generation?.model === 'gpt-image-2' && sharedCreation?.generation?.aspectRatio === '3:4', 'Community creation metadata was not persisted.', sharedCreation);
  const sharedLibrary = await request('/studio-api/library');
  const sharedLibraryItem = sharedLibrary.cases?.find((item) => item.id === sharedCreation.id);
  assert(sharedLibraryItem?.image === sharedCreation.image, 'Community creation image was not returned by the inspiration library.', sharedLibraryItem);
  assert(sharedLibraryItem?.generationPrompt?.includes('Resolution target: 1K'), 'Community creation generation prompt was not returned by the inspiration library.', sharedLibraryItem);

  const staleJobs = await request('/studio-api/generation-jobs?sessionId=smoke-session');
  const staleJob = staleJobs.jobs?.find?.((job) => job.id === 'stalejob1');
  const staleQueuedJob = staleJobs.jobs?.find?.((job) => job.id === 'stalequeued1');
  assert(staleJob?.status === 'unknown', 'Stale active job was not marked unknown after service restart.', staleJob);
  assert(staleJob?.error?.code === 'JOB_RUNTIME_NOT_ATTACHED', 'Stale active job did not record restart/lost-runner reason.', staleJob);
  assert(staleQueuedJob?.status === 'unknown', 'Stale queued job was not marked unknown after service restart.', staleQueuedJob);
  assert(staleQueuedJob?.error?.code === 'JOB_RUNTIME_NOT_ATTACHED', 'Stale queued job did not record restart/lost-runner reason.', staleQueuedJob);
  const initialHistory = await request('/studio-api/history?limit=20');
  const tailRecord = initialHistory.records?.find?.((record) => record.id === 'tailrecord1');
  assert(tailRecord?.generationPrompt === 'tail record generation prompt', 'History with trailing corruption was not recovered.', tailRecord);

  const sessionPayload = {
    sessionId: 'smoke-session',
    mode: 'image',
    prompt: 'base prompt',
    model: 'gpt-image-2',
    canvasNodes: [{
      id: 'node-1',
      canvasIndex: 1,
      kind: 'image',
      url: 'data:image/png;base64,iVBORw0KGgo=',
      prompt: 'node prompt',
      generationPrompt: 'node generation prompt',
      sourceUrl: '/source/not-secret.png',
      downloadMeta: { id: 'record-1', prompt: 'node generation prompt' }
    }],
    generationQueue: [{
      id: 'task-1',
      serverJobId: 'server-job-1',
      remote: true,
      status: 'running',
      prompt: 'queued prompt',
      model: 'gpt-image-2',
      resultUrls: [],
      requestIds: ['req-1']
    }]
  };
  const savedSession = await request('/studio-api/session', {
    method: 'POST',
    body: JSON.stringify(sessionPayload)
  });
  assert(savedSession.session?.canvasNodes?.[0]?.generationPrompt === 'node generation prompt', 'Session node generation prompt was not preserved.', savedSession.session);
  assert(savedSession.session?.canvasNodes?.[0]?.persistedUrl, 'Session node persisted URL was not recorded.', savedSession.session);

  const savedRecord = await request('/studio-api/history', {
    method: 'POST',
    body: JSON.stringify({
      id: 'record-1',
      sessionId: 'smoke-session',
      mode: 'image',
      providerId: 'openai-compatible',
      providerFamily: 'openai-compatible',
      providerLabel: 'Manual compatible gateway',
      prompt: 'record prompt',
      generationPrompt: 'record generation prompt',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'high',
      outputFormat: 'png',
      moderation: 'auto',
      requestIds: ['req-record-1'],
      usageSummary: '1 image',
      timing: { totalMs: 1234 },
      count: 1,
      resultUrls: ['data:image/png;base64,iVBORw0KGgo=']
    })
  });
  assert(savedRecord.record?.generationPrompt === 'record generation prompt', 'History record generation prompt was not preserved.', savedRecord.record);
  assert(savedRecord.record?.providerLabel === 'Manual compatible gateway', 'History provider label was not preserved.', savedRecord.record);
  assert(savedRecord.record?.requestIds?.[0] === 'req-record-1', 'History request id was not preserved.', savedRecord.record);

  const createdSuccessJob = await request('/studio-api/generation-jobs', {
    method: 'POST',
    body: JSON.stringify({
      apiKey: secret,
      gatewayBaseUrl,
      request: {
        id: 'successjob1',
        clientRequestId: 'successjob1-client',
        sessionId: 'smoke-session',
        mode: 'image',
        route: 'generations',
        model: 'gpt-image-2',
        providerId: 'openai-compatible',
        providerFamily: 'openai-compatible',
        providerLabel: 'Manual compatible gateway',
        apiKeySource: 'manual',
        prompt: 'successful job prompt',
        generationPrompt: 'successful job generation prompt',
        size: '1024x1024',
        quality: 'high',
        outputFormat: 'png',
        moderation: 'auto',
        count: 1
      }
    })
  });
  assert(createdSuccessJob.job?.id === 'successjob1', 'Successful generation job was not created.', createdSuccessJob.job);
  const successfulJob = await waitForJob('successjob1', (job) => job?.status === 'succeeded', 'job to persist succeeded state');
  assert(successfulJob.resultUrls?.length === 1, 'Successful job did not persist one result URL.', successfulJob);
  assert(successfulJob.requestIds?.includes('req-successjob1'), 'Successful job did not persist gateway request id.', successfulJob);
  assert(successfulJob.usage?.images === 1, 'Successful job did not persist usage metadata.', successfulJob);

  const successHistory = await request('/studio-api/history?limit=20');
  const successRecord = successHistory.records?.find?.((record) => record.id === 'successjob1');
  assert(successRecord?.generationPrompt === 'successful job generation prompt', 'Successful job did not write a history record with generation prompt.', successRecord);
  assert(successRecord?.resultUrls?.[0] === successfulJob.resultUrls[0], 'Successful job history record does not point to the persisted asset.', { successRecord, successfulJob });
  const assetResponse = await fetch(`${baseUrl}${successfulJob.resultUrls[0]}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(assetResponse.ok, 'Persisted successful job asset was not fetchable.', { status: assetResponse.status, url: successfulJob.resultUrls[0] });
  assert(String(assetResponse.headers.get('content-type') || '').startsWith('image/png'), 'Persisted successful job asset did not return image/png.', { contentType: assetResponse.headers.get('content-type') });
  assert((await assetResponse.arrayBuffer()).byteLength > 0, 'Persisted successful job asset was empty.', successfulJob.resultUrls[0]);

  const createdFailJob = await request('/studio-api/generation-jobs', {
    method: 'POST',
    body: JSON.stringify({
      apiKey: secret,
      gatewayBaseUrl,
      request: {
        id: 'failjob1',
        clientRequestId: 'failjob1-client',
        sessionId: 'smoke-session',
        mode: 'image',
        route: 'generations',
        model: 'gpt-image-2',
        providerId: 'openai-compatible',
        providerFamily: 'openai-compatible',
        providerLabel: 'Manual compatible gateway',
        apiKeySource: 'manual',
        prompt: 'failed job prompt',
        generationPrompt: 'failed job generation prompt',
        size: '1024x1024',
        quality: 'high',
        outputFormat: 'png',
        moderation: 'auto',
        count: 1
      }
    })
  });
  assert(createdFailJob.job?.id === 'failjob1', 'Failed generation job was not created.', createdFailJob.job);
  const failedJob = await waitForJob('failjob1', (job) => job?.status === 'failed', 'job to persist failed state');
  assert(failedJob.error?.code === 'HTTP_403', 'Failed job did not keep HTTP_403 error code.', failedJob);
  assert(failedJob.error?.requestId === 'req-failjob1', 'Failed job did not keep gateway request id.', failedJob);
  assert(String(failedJob.error?.message || '').includes('ORIGIN_NOT_ALLOWED'), 'Failed job did not keep upstream error message.', failedJob);
  assert(!failedJob.resultUrls?.length, 'Failed job should not persist result URLs.', failedJob);

  const failureHistory = await request('/studio-api/history?limit=20');
  const failureRecord = failureHistory.records?.find?.((record) => record.id === 'failjob1');
  assert(!failureRecord, 'Failed job should not write a successful history record.', failureRecord);

  const createdEditJob = await request('/studio-api/generation-jobs', {
    method: 'POST',
    body: JSON.stringify({
      apiKey: secret,
      gatewayBaseUrl,
      images: [{
        name: 'reference.png',
        type: 'image/png',
        dataUrl: tinyPngDataUrl
      }],
      mask: {
        name: 'mask.png',
        type: 'image/png',
        dataUrl: tinyPngDataUrl
      },
      request: {
        id: 'editjob1',
        clientRequestId: 'editjob1-client',
        sessionId: 'smoke-session',
        mode: 'edit',
        route: 'edits',
        model: 'gpt-image-2',
        providerId: 'openai-compatible',
        providerFamily: 'openai-compatible',
        providerLabel: 'Manual compatible gateway',
        apiKeySource: 'manual',
        prompt: 'edit job prompt',
        generationPrompt: 'edit job generation prompt',
        size: '1024x1024',
        quality: 'high',
        outputFormat: 'png',
        moderation: 'auto',
        count: 1
      }
    })
  });
  assert(createdEditJob.job?.id === 'editjob1', 'Edit generation job was not created.', createdEditJob.job);
  assert(createdEditJob.job?.route === 'edits', 'Edit job did not preserve edits route.', createdEditJob.job);
  assert(createdEditJob.job?.endpoint === '/v1/images/edits', 'Edit job did not expose the edits endpoint.', createdEditJob.job);
  const editJob = await waitForJob('editjob1', (job) => job?.status === 'succeeded', 'edit job to persist succeeded state');
  assert(editJob.resultUrls?.length === 1, 'Edit job did not persist one result URL.', editJob);
  assert(editJob.requestIds?.includes('req-editjob1'), 'Edit job did not persist gateway request id.', editJob);
  assert(editJob.usage?.route === 'edits', 'Edit job did not persist edits usage metadata.', editJob);
  assert(editRequests.length === 1, 'Edit job did not call the upstream /v1/images/edits endpoint exactly once.', editRequests);
  assert(editRequests[0].clientRequestId === 'editjob1-client', 'Edit job did not forward the client request id.', editRequests[0]);
  assert(editRequests[0].body.includes('name="model"'), 'Edit job multipart body is missing model.', editRequests[0]);
  assert(editRequests[0].body.includes('name="prompt"'), 'Edit job multipart body is missing prompt.', editRequests[0]);
  assert(editRequests[0].body.includes('edit job generation prompt'), 'Edit job multipart body did not use generationPrompt.', editRequests[0]);
  assert(editRequests[0].body.includes('name="image"'), 'Edit job multipart body is missing reference image.', editRequests[0]);
  assert(editRequests[0].body.includes('name="mask"'), 'Edit job multipart body is missing mask.', editRequests[0]);
  const editHistory = await request('/studio-api/history?limit=20');
  const editRecord = editHistory.records?.find?.((record) => record.id === 'editjob1');
  assert(editRecord?.generationPrompt === 'edit job generation prompt', 'Edit job did not write a history record with generation prompt.', editRecord);
  assert(editRecord?.mode === 'edit', 'Edit job history record did not preserve edit mode.', editRecord);

  const createdJob = await request('/studio-api/generation-jobs', {
    method: 'POST',
    body: JSON.stringify({
      apiKey: secret,
      gatewayBaseUrl,
      request: {
        id: 'servicejob1',
        clientRequestId: 'servicejob1-client',
        sessionId: 'smoke-session',
        mode: 'image',
        route: 'generations',
        model: 'gpt-image-2',
        prompt: 'job prompt',
        generationPrompt: 'job generation prompt',
        size: '1024x1024',
        quality: 'high',
        outputFormat: 'png',
        count: 1
      }
    })
  });
  assert(createdJob.job?.id === 'servicejob1', 'Generation job was not created.', createdJob.job);

  await waitForJob('servicejob1', (job) => ['dispatching', 'gateway', 'upstream'].includes(job?.status), 'job to reach active gateway state');
  const canceledJob = await request('/studio-api/generation-jobs/servicejob1', { method: 'DELETE' });
  assert(canceledJob.job?.status === 'unknown', 'DELETE did not mark the dispatched job as unknown.', canceledJob.job);
  const persistedCanceledJob = await waitForJob('servicejob1', (job) => job?.status === 'unknown', 'job to persist unknown cancellation state');
  assert(persistedCanceledJob.error?.code === 'JOB_CANCELED_UPSTREAM_UNKNOWN', 'Dispatched cancellation did not keep its reconciliation error code.', persistedCanceledJob);

  const files = await readAllJsonFiles(dataDir);
  const allJson = files.map((item) => item.raw).join('\n');
  assert(!allJson.includes(secret), 'API key leaked into persisted JSON files.', files.map((item) => item.path));
  assert(!allJson.includes('trailing-corruption'), 'Trailing JSON corruption was not removed after atomic rewrites.', files.map((item) => item.path));
  assert(allJson.includes('record generation prompt'), 'Persisted JSON is missing record generation prompt.', files.map((item) => item.path));
  assert(allJson.includes('node generation prompt'), 'Persisted JSON is missing node generation prompt.', files.map((item) => item.path));

  console.log(JSON.stringify({
    ok: true,
    dataDir,
    files: files.map((item) => path.relative(dataDir, item.path))
  }, null, 2));
} finally {
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  for (const timer of gatewayTimers) clearTimeout(timer);
  gatewayTimers.clear();
  await new Promise((resolve) => slowGateway.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
  if (child.exitCode && child.exitCode !== 0 && !String(stderr).includes('EADDRINUSE')) {
    console.error(stdout);
    console.error(stderr);
  }
}
