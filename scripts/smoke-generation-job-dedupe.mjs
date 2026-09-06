import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
await fs.mkdir(path.join(root, 'tmp'), { recursive: true });
const dataDir = await fs.mkdtemp(path.join(root, 'tmp', 'job-dedupe-'));
const token = 'generation-job-dedupe-smoke-token';
const port = 23000 + Math.floor(Math.random() * 1000);
const gatewayPort = port + 1000;
const baseUrl = `http://127.0.0.1:${port}`;
const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}/v1`;
const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
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

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  }).catch((error) => { throw new Error(`${options.method || 'GET'} ${pathname}: ${error.message}`, { cause: error }); });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP_${response.status}`);
  }
  return payload;
}

let gatewayHits = 0;
const gateway = http.createServer((req, res) => {
  if (req.url === '/v1/images/generations') {
    gatewayHits += 1;
    setTimeout(() => {
      if (res.destroyed) return;
      res.writeHead(200, { 'Content-Type': 'application/json', 'x-request-id': `dedupe-${gatewayHits}` });
      res.end(JSON.stringify({ data: [{ b64_json: tinyPngBase64 }] }));
    }, 700);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'not found' } }));
});

await new Promise((resolve) => gateway.listen(gatewayPort, '127.0.0.1', resolve));

const child = spawn(process.execPath, ['scripts/image-sub2api-studio-history-service.mjs'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: {
    ...process.env,
    PORT: String(port),
    STUDIO_HISTORY_PORT: String(port),
    STUDIO_HISTORY_HOST: '127.0.0.1',
    STUDIO_AUTH_MODE: 'local',
    STUDIO_DATA_DIR: dataDir,
    STUDIO_ALLOWED_ORIGINS: 'http://127.0.0.1',
    STUDIO_JOB_CONCURRENCY: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

try {
  await waitForHealth();
  const body = {
    apiKey: 'dedupe-smoke-key',
    gatewayBaseUrl,
    images: [{ dataUrl: `data:image/png;base64,${tinyPngBase64}` }],
    request: {
      id: 'dedupejob1',
      clientRequestId: 'dedupejob1-client',
      sessionId: 'dedupe-session',
      providerId: 'openai-compatible',
      apiKeySource: 'manual',
      mode: 'image',
      route: 'generations',
      fingerprint: 'dedupe-session|image|generations|gpt-image-2|same-prompt',
      model: 'gpt-image-2',
      prompt: 'same prompt\n  with indented details',
      generationPrompt: 'same prompt\n  with indented details\n\nOutput requirements',
      size: '1024x1024',
      resolutionTier: '1K',
      quality: 'medium',
      n: 1,
      count: 1
    }
  };

  const first = await request('/studio-api/generation-jobs', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  const second = await request('/studio-api/generation-jobs', {
    method: 'POST',
    body: JSON.stringify({
      ...body,
      request: {
        ...body.request,
        id: 'dedupejob2',
        clientRequestId: 'dedupejob2-client'
      }
    })
  });

  assert(first.job?.id === 'dedupejob1', 'First request should create the original job.', first);
  assert(second.duplicate === true, 'Second active duplicate should be marked as duplicate.', second);
  assert(second.job?.id === first.job?.id, 'Duplicate response should return the original active job.', { first, second });

  const backup = await request('/studio-api/backup');
  const restoreWhileActive = await fetch(`${baseUrl}/studio-api/backup/restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(backup)
  });
  assert(restoreWhileActive.status === 409, 'Restore must not replace data while a generation is active.');
  assert((await restoreWhileActive.json()).error === 'BACKUP_RESTORE_JOBS_ACTIVE', 'Restore should explain the active job conflict.');
  await Promise.all(Array.from({ length: 8 }, (_, index) => request('/studio-api/history', {
    method: 'POST',
    body: JSON.stringify({ id: `dedupe-history-${index}`, prompt: `Concurrent history ${index}` })
  })));

  await new Promise((resolve) => setTimeout(resolve, 1200));
  const jobs = await request('/studio-api/generation-jobs?sessionId=dedupe-session');
  assert(jobs.jobs.length === 1, 'Only one persisted job should exist for duplicate active submissions.', jobs);
  assert(gatewayHits === 1, 'Duplicate active submissions should hit the gateway once.', { gatewayHits });
  const history = await request('/studio-api/history');
  assert(history.records.length === 9, 'Job completion and concurrent history saves must all persist.', history);
  const generated = history.records.find((record) => record.id === first.job.id);
  assert(generated?.prompt === body.request.prompt, 'Completed generation must retain multiline prompt.');
  assert(generated?.generationPrompt === body.request.generationPrompt, 'Completed generation must retain actual generation prompt.');
  assert(generated?.resolutionTier === '1K', 'Completed generation must retain resolution tier.');
  assert(generated?.referenceCount === 1, 'Completed generation must retain reference count.');

  const changedSubmissions = [
    {},
    { images: [{ dataUrl: `data:image/png;base64,${Buffer.concat([Buffer.from(tinyPngBase64, 'base64'), Buffer.from('different')]).toString('base64')}` }] },
    { request: { quality: 'high' } },
    { request: { mode: 'video', route: 'video', model: 'sora-2', duration: 4 } },
    { request: { mode: 'video', route: 'video', model: 'sora-2', duration: 8 } }
  ];
  const changedJobs = [];
  for (let index = 0; index < changedSubmissions.length; index++) {
    const changes = changedSubmissions[index];
    const payload = {
      ...body, ...changes,
      request: {
        ...body.request, ...changes.request,
        sessionId: 'changed-input-session',
        id: `changed-input-${index}`,
        clientRequestId: `changed-input-client-${index}`
      }
    };
    const result = await request('/studio-api/generation-jobs', { method: 'POST', body: JSON.stringify(payload) });
    assert(!result.duplicate && result.job.id === payload.request.id, 'Different media or normalized parameters must not be collapsed by the same client fingerprint.', { index, result });
    changedJobs.push(result.job.id);
  }
  assert(new Set(changedJobs).size === changedSubmissions.length, 'All distinct inputs should create distinct jobs.');
  // Mock-only queued fixtures: cancel them so they cannot outlive this test.
  for (const jobId of changedJobs) await request(`/studio-api/generation-jobs/${jobId}`, { method: 'DELETE' });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await request('/studio-api/health');
  assert(child.exitCode === null, 'Canceling queued or dispatching jobs must not terminate the service.');

  console.log(JSON.stringify({
    ok: true,
    createdJobId: first.job.id,
    duplicateJobId: second.job.id,
    gatewayHits,
    jobCount: jobs.jobs.length,
    distinctInputJobs: changedJobs.length
  }, null, 2));
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  await new Promise((resolve) => gateway.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
}

if (stderr.trim()) {
  console.error(stderr.trim());
}
