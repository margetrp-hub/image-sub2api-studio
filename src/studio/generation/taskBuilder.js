// Pure generation-task logic. These functions own no React state and produce
// no side effects beyond the async work their callers drive — they're the
// domain layer of the generation pipeline, extracted so the task shape,
// the server-job polling loop, and the reference-file normalization can be
// unit-tested and reused independently of CreationDesk's render lifecycle.

import {
  createGenerationTaskId,
  generationTaskFingerprint,
  isFinalServerJobStatus,
  serverJobMessage,
  serverJobProgress
} from '../util/generationJobs.js';
import { fileToDataUrl } from '../util/mask.js';

// Build a queued generation task snapshot from the desk's current parameter
// state. `params` carries the ~25 closure values the desk already tracks
// (mode, prompt, model, sizes, reference items, etc.); `overrides` lets a
// caller substitute prompt/mode/referenceItems/selectedCanvasNodeId per
// call. `composedPrompt` is computed by the caller (it depends on canvas
// selection) and passed in via overrides.prompt when not overridden.
export function buildGenerationTask(params, overrides = {}) {
  const {
    mode,
    model,
    aspect,
    customSize,
    size,
    quality,
    resolutionTier,
    outputFormat,
    moderation,
    countValue,
    videoModel,
    videoAspect,
    videoDuration,
    videoFps,
    videoMotion,
    videoStyle,
    videoQuality,
    negativePrompt,
    referenceItems,
    videoReferenceFiles,
    selectedCanvasNode,
    selectedCanvasNodeId,
    sessionId,
    providerSettings,
    layoutSectionsReferences,
    maskFile,
    fallbackPrompt,
    batchId = '',
    batchIndex = 0,
    batchTotal = 1
  } = params;

  const basePrompt = typeof overrides.prompt === 'string'
    ? overrides.prompt
    : (fallbackPrompt || '');
  const taskMode = overrides.mode || mode;
  const taskReferenceItems = Array.isArray(overrides.referenceItems)
    ? overrides.referenceItems
    : referenceItems;
  const taskSelectedCanvasNode = overrides.selectedCanvasNodeSnapshot
    || (selectedCanvasNode ? { ...selectedCanvasNode } : null);

  return {
    id: createGenerationTaskId(),
    status: 'queued',
    createdAt: Date.now(),
    mode: taskMode,
    prompt: basePrompt,
    rawPrompt: typeof overrides.rawPrompt === 'string' ? overrides.rawPrompt : '',
    workflow: overrides.workflow || null,
    model,
    aspect,
    aspectRatio: aspect,
    customSize,
    size,
    quality,
    resolutionTier,
    outputFormat,
    moderation,
    count: countValue,
    videoModel,
    videoAspect,
    videoAspectRatio: videoAspect,
    videoDuration,
    duration: videoDuration,
    videoFps,
    fps: videoFps,
    videoMotion,
    videoStyle,
    videoQuality,
    negativePrompt,
    referenceItems: taskReferenceItems,
    videoReferenceFiles,
    maskFile: taskMode === 'mask' ? (maskFile || null) : null,
    batchId: String(overrides.batchId || batchId || ''),
    batchIndex: Number.isInteger(overrides.batchIndex) ? overrides.batchIndex : batchIndex,
    batchTotal: Number(overrides.batchTotal || batchTotal) || 1,
    selectedCanvasNodeId: overrides.selectedCanvasNodeId ?? selectedCanvasNodeId,
    selectedCanvasNodeSnapshot: taskSelectedCanvasNode,
    referencesOpen: overrides.referencesOpen ?? layoutSectionsReferences,
    fingerprint: generationTaskFingerprint({
      sessionId,
      mode: taskMode,
      route: taskMode === 'edit' || taskMode === 'mask' ? 'edits' : 'generations',
      providerId: providerSettings.providerId,
      providerProfileId: providerSettings.providerProfileId,
      apiKeySource: providerSettings.apiKeySource,
      model: taskMode === 'video' ? videoModel : model,
      prompt: basePrompt,
      size: taskMode === 'video' ? videoAspect : size,
      quality: taskMode === 'video' ? videoQuality : quality,
      resolutionTier,
      outputFormat,
      moderation,
      count: countValue,
      batchKey: overrides.batchId ? `${overrides.batchId}:${overrides.batchIndex}` : batchId ? `${batchId}:${batchIndex}` : '',
      selectedCanvasNodeId: overrides.selectedCanvasNodeId ?? selectedCanvasNodeId,
      canvasReference: (taskMode === 'edit' || taskMode === 'mask') && taskSelectedCanvasNode?.kind !== 'video'
        ? taskSelectedCanvasNode?.url : '',
      referenceCount: taskMode === 'video' ? Math.min(1, (videoReferenceFiles || []).length) : taskReferenceItems.length,
      referenceItems: taskMode === 'video' ? (videoReferenceFiles || []).slice(0, 1) : taskReferenceItems,
      maskFile: taskMode === 'mask' ? maskFile : null,
      hasMask: taskMode === 'mask',
      duration: videoDuration,
      fps: videoFps,
      motion: videoMotion,
      style: videoStyle,
      negativePrompt
    }),
    summary: basePrompt || fallbackPrompt || selectedCanvasNode?.prompt?.trim() || '未填写提示词'
  };
}

// Poll a server generation job until it reaches a final status, invoking
// caller-supplied callbacks for progress/message/timing updates. Pure-ish:
// the only side effect is the await on historyClient + the delay; all state
// feedback flows through the callbacks so the caller stays in charge of
// React setState. `onMessage` receives the translator `t` so the caller
// doesn't have to close over it. Returns the final job (or null if interrupted).
export async function waitForServerJob(historyClient, jobId, { signal, total, delayMs = 1400, t, onProgress, onMessage, onTiming, sleep = defaultSleep }) {
  let latest = await historyClient.getGenerationJob(jobId);
  while (latest && !isFinalServerJobStatus(latest.status)) {
    if (onProgress) onProgress(serverJobProgress(latest, total));
    if (onMessage) onMessage(serverJobMessage(latest, t));
    if (onTiming && latest?.timing) onTiming(latest);
    await sleep(delayMs, signal);
    latest = await historyClient.getGenerationJob(jobId);
  }
  if (latest) {
    if (onProgress) onProgress(serverJobProgress(latest, total));
    if (onMessage) onMessage(serverJobMessage(latest, t));
    if (onTiming && latest?.timing) onTiming(latest);
  }
  return latest;
}

// Normalize an arbitrary list of File objects into the { name, type, dataUrl }
// shape the image-edits endpoint expects, capping at `limit` references.
export async function generationFilesForJob(files, limit, toDataUrl = fileToDataUrl) {
  const source = Array.isArray(files) ? files.slice(0, limit) : [];
  return Promise.all(source.map(async (file, index) => ({
    name: file?.name || `reference-${index + 1}.png`,
    type: file?.type || 'image/png',
    dataUrl: await toDataUrl(file)
  })));
}

function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
