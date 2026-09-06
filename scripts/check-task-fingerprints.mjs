import assert from 'node:assert/strict';
import { generationTaskFingerprint } from '../src/studio/util/generationJobs.js';
import { buildGenerationTask } from '../src/studio/generation/taskBuilder.js';
import { serverJobFingerprint } from './studio-service/jobFingerprint.js';
import { PROMPT_MAX_LENGTH, promptText } from './studio-service/text.js';
import { PROMPT_MAX_LENGTH as clientLimit } from '../src/studio/util/promptLimits.js';

const task = { prompt: 'Subject\n  preserve spacing', mode: 'video', model: 'video-a', duration: 5, fps: 24, referenceItems: [new File(['one'], 'same.png')] };
const fingerprint = generationTaskFingerprint(task);
assert.equal(fingerprint, generationTaskFingerprint({ ...task }));
for (const changes of [
  { referenceItems: [new File(['two'], 'same.png')] }, { referenceItems: ['data:image/png;base64,b25l'] },
  { maskFile: new File(['mask'], 'mask.png') }, { model: 'video-b' }, { duration: 8 }, { fps: 30 },
  { motion: 'pan' }, { style: 'film' }, { negativePrompt: 'blur' }, { providerProfileId: 'other' },
  { prompt: 'Subject\n preserve spacing' }, { batchKey: 'batch:1' }, { canvasReference: 'blob:changed' }
]) assert.notEqual(fingerprint, generationTaskFingerprint({ ...task, ...changes }), JSON.stringify(changes));
assert.notEqual(generationTaskFingerprint({ prompt: 'a'.repeat(12000) + 'one' }), generationTaskFingerprint({ prompt: 'a'.repeat(12000) + 'two' }));
assert.notEqual(generationTaskFingerprint({ model: 'a|b', prompt: 'c' }), generationTaskFingerprint({ model: 'a', prompt: 'b|c' }));
const params = { mode: 'video', videoModel: 'video-a', videoAspect: '3:4', videoDuration: 5, videoFps: 24, videoReferenceFiles: [], referenceItems: [], providerSettings: {}, fallbackPrompt: 'Video fixture' };
assert.notEqual(buildGenerationTask(params).fingerprint, buildGenerationTask({ ...params, videoDuration: 8 }).fingerprint);
assert.equal(buildGenerationTask(params).fingerprint, buildGenerationTask({ ...params, referenceItems: [new File(['ignored'], 'image.png')] }).fingerprint);
const canvasTask = { ...params, mode: 'edit', selectedCanvasNodeId: 'same-node', selectedCanvasNode: { id: 'same-node', url: 'blob:one' } };
assert.notEqual(buildGenerationTask(canvasTask).fingerprint, buildGenerationTask({ ...canvasTask, selectedCanvasNode: { id: 'same-node', url: 'blob:two' } }).fingerprint);
const referenceFile = new File(['same'], 'reference.png');
assert.notEqual(generationTaskFingerprint({ prompt: 'edit', referenceItems: [{ file: referenceFile, role: 'style' }] }), generationTaskFingerprint({ prompt: 'edit', referenceItems: [{ file: referenceFile, role: 'subject' }] }));
const job = { mode: 'image', prompt: 'fixture', route: 'edits' };
const runtime = { apiKey: 'fixture-key', gatewayBaseUrl: 'https://example.invalid/v1', plan: { body: { quality: 'high' } }, images: [{ mime: 'image/png', buffer: Buffer.from('one') }] };
const serverFingerprint = serverJobFingerprint(job, runtime);
assert.equal(serverFingerprint, serverJobFingerprint(job, structuredClone(runtime)));
for (const changes of [
  { images: [{ mime: 'image/png', buffer: Buffer.from('two') }] },
  { mask: { mime: 'image/png', buffer: Buffer.from('mask') } },
  { apiKey: 'different-key' }, { gatewayBaseUrl: 'https://other.invalid/v1' },
  { plan: { body: { quality: 'low' } } }
]) assert.notEqual(serverFingerprint, serverJobFingerprint(job, { ...runtime, ...changes }));
assert.notEqual(serverFingerprint, serverJobFingerprint(job, runtime, { batchId: 'batch', batchIndex: 1 }));
assert.equal(PROMPT_MAX_LENGTH, clientLimit);
assert.equal(promptText('x'.repeat(clientLimit)).length, clientLimit);
assert.throws(() => promptText('x'.repeat(clientLimit + 1)), /PROMPT_TOO_LONG/);
console.log('Task fingerprint and prompt boundary checks passed.');
