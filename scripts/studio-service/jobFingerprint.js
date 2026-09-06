import { createHash } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest('hex');

// Authoritative deduplication uses normalized outbound parameters and media
// bytes, never the client's truncated or incomplete fingerprint.
export function serverJobFingerprint(job, runtime, request = {}) {
  return `v2:${digest(JSON.stringify({
    sessionId: job.sessionId,
    parentCanvasNodeId: job.parentCanvasNodeId,
    mode: job.mode,
    route: job.route,
    gateway: runtime.gatewayBaseUrl,
    credential: digest(runtime.apiKey || ''),
    profile: request.providerProfileId || '',
    prompt: job.generationPrompt || job.prompt,
    plan: runtime.plan,
    batchId: request.batchId || '',
    batchIndex: request.batchId ? request.batchIndex || 0 : 0,
    images: runtime.images.map((image) => [image.mime, digest(image.buffer)]),
    mask: runtime.mask ? [runtime.mask.mime, digest(runtime.mask.buffer)] : null
  }))}`;
}
