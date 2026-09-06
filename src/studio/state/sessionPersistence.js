function sessionUrlForServer(url, persistedUrl) {
  const value = String(url || '');
  if (value.startsWith('blob:') && persistedUrl) return persistedUrl;
  return value;
}

function serializeWorkflowState(workflow) {
  if (!workflow || typeof workflow !== 'object') return null;
  const lineage = Array.isArray(workflow.lineage)
    ? workflow.lineage
      .map((step, index) => ({
        index: Number(step?.index) || index + 1,
        jobId: String(step?.jobId || '').slice(0, 160),
        nodeId: String(step?.nodeId || '').slice(0, 160),
        mode: String(step?.mode || 'image').slice(0, 40),
        route: String(step?.route || '').slice(0, 80),
        prompt: String(step?.prompt || '')
      }))
      .filter((step) => step.prompt)
      .slice(-24)
    : [];
  const rootPrompt = String(workflow.rootPrompt || '');
  if (!rootPrompt && !lineage.length) return null;
  return { rootPrompt, lineage };
}

export function createCurrentSessionSerializers({
  generationQueueLimit,
  imageModels,
  videoModels,
  normalizeQueueStatus,
  normalizeSize,
  normalizeQuality,
  normalizeResolutionTier,
  normalizeOutputFormat,
  normalizeModeration,
  normalizeCount,
  normalizeVideoAspect,
  normalizeVideoDuration,
  normalizeVideoFps,
  normalizeVideoMotion,
  normalizeVideoStyle,
  normalizeVideoQuality
}) {
  function serializeGenerationQueueItem(item) {
    if (!item || typeof item !== 'object') return null;
    const safeStatus = normalizeQueueStatus(item.status);
    return {
      id: String(item.id || ''),
      status: safeStatus,
      createdAt: Number(item.createdAt || Date.now()),
      startedAt: item.startedAt ? Number(item.startedAt) : null,
      completedAt: item.completedAt ? Number(item.completedAt) : null,
      mode: item.mode || 'image',
      providerId: String(item.providerId || item.provider || ''),
      providerFamily: String(item.providerFamily || item.providerId || item.provider || ''),
      apiKeySource: String(item.apiKeySource || ''),
      providerLabel: String(item.providerLabel || ''),
      prompt: String(item.prompt || ''),
      rawPrompt: String(item.rawPrompt || ''),
      workflow: serializeWorkflowState(item.workflow),
      model: String(item.model || imageModels[0]),
      aspect: item.aspect || item.aspectRatio || '1:1',
      aspectRatio: item.aspectRatio || item.aspect || '1:1',
      customSize: normalizeSize(item.customSize || item.size),
      size: normalizeSize(item.size),
      quality: normalizeQuality(item.quality),
      resolutionTier: normalizeResolutionTier(item.resolutionTier),
      outputFormat: normalizeOutputFormat(item.outputFormat),
      moderation: normalizeModeration(item.moderation),
      count: normalizeCount(item.count),
      videoModel: item.videoModel || videoModels[0],
      videoAspect: normalizeVideoAspect(item.videoAspect || item.videoAspectRatio),
      videoAspectRatio: normalizeVideoAspect(item.videoAspectRatio || item.videoAspect),
      videoDuration: normalizeVideoDuration(item.videoDuration || item.duration),
      duration: normalizeVideoDuration(item.duration || item.videoDuration),
      videoFps: normalizeVideoFps(item.videoFps || item.fps),
      fps: normalizeVideoFps(item.fps || item.videoFps),
      videoMotion: normalizeVideoMotion(item.videoMotion),
      videoStyle: normalizeVideoStyle(item.videoStyle),
      videoQuality: normalizeVideoQuality(item.videoQuality),
      negativePrompt: String(item.negativePrompt || ''),
      selectedCanvasNodeId: String(item.selectedCanvasNodeId || ''),
      selectedCanvasNodeSnapshot: item.selectedCanvasNodeSnapshot || null,
      referencesOpen: Boolean(item.referencesOpen),
      fingerprint: String(item.fingerprint || '').slice(0, 16000),
      summary: String(item.summary || item.prompt || '').slice(0, 240),
      restorable: item.restorable !== false && !['edit', 'mask', 'video'].includes(item.mode),
      serverJobId: item.serverJobId || '',
      remote: Boolean(item.remote),
      restored: Boolean(item.restored),
      stage: String(item.stage || '').slice(0, 40),
      completed: Number(item.completed || 0),
      total: Number(item.total || item.count || 1),
      resultUrls: Array.isArray(item.resultUrls) ? item.resultUrls.slice(0, 4).map(String) : [],
      requestIds: Array.isArray(item.requestIds) ? item.requestIds.slice(0, 8).map(String) : [],
      error: item.error && typeof item.error === 'object'
        ? {
          code: String(item.error.code || '').slice(0, 120),
          status: item.error.status || null,
          requestId: String(item.error.requestId || '').slice(0, 160),
          message: String(item.error.message || '').slice(0, 1200)
        }
        : null
    };
  }

  function normalizeCachedCurrentSession(session) {
    if (!session || typeof session !== 'object') return null;
    const persistedResults = Array.isArray(session.persistedResults) ? session.persistedResults : [];
    const persistedVideoResults = Array.isArray(session.persistedVideoResults) ? session.persistedVideoResults : [];
    const restoredQueueStatus = (item) => {
      if (item?.remote || item?.serverJobId) return item?.status;
      if (
        item?.status === 'queued'
        && item?.restorable !== false
        && !['edit', 'mask', 'video'].includes(item?.mode)
      ) {
        return 'queued';
      }
      if (item?.status === 'running') return 'failed';
      if (item?.status === 'queued') return 'failed';
      return item?.status;
    };
    const generationQueue = Array.isArray(session.generationQueue)
      ? session.generationQueue
        .filter((item) => item && typeof item === 'object')
        .slice(generationQueueLimit > 0 ? -generationQueueLimit : 0)
        .map((item) => ({
          ...item,
          status: restoredQueueStatus(item),
          restored: true,
          summary: String(item.summary || item.prompt || '').slice(0, 240)
        }))
      : [];
    return {
      ...session,
      results: Array.isArray(session.results)
        ? session.results.map((url, index) => sessionUrlForServer(url, persistedResults[index]))
        : [],
      videoResults: Array.isArray(session.videoResults)
        ? session.videoResults.map((url, index) => sessionUrlForServer(url, persistedVideoResults[index]))
        : [],
      canvasNodes: Array.isArray(session.canvasNodes)
        ? session.canvasNodes.map((node) => ({
          ...node,
          url: sessionUrlForServer(node?.url, node?.persistedUrl)
        }))
        : [],
      generationQueue
    };
  }

  function prepareCurrentSessionForServer(session) {
    if (!session || typeof session !== 'object') return null;
    const normalized = normalizeCachedCurrentSession(session);
    const persistedResults = Array.isArray(normalized.persistedResults) ? normalized.persistedResults : [];
    const persistedVideoResults = Array.isArray(normalized.persistedVideoResults) ? normalized.persistedVideoResults : [];
    const {
      persistedResults: _persistedResults,
      persistedVideoResults: _persistedVideoResults,
      updatedAt: _updatedAt,
      ...rest
    } = normalized;
    return {
      ...rest,
      results: Array.isArray(normalized.results)
        ? normalized.results.map((url, index) => sessionUrlForServer(url, persistedResults[index]))
        : [],
      videoResults: Array.isArray(normalized.videoResults)
        ? normalized.videoResults.map((url, index) => sessionUrlForServer(url, persistedVideoResults[index]))
        : [],
      canvasNodes: Array.isArray(normalized.canvasNodes)
        ? normalized.canvasNodes.map(({ persistedUrl, ...node }) => ({
          ...node,
          url: sessionUrlForServer(node.url, persistedUrl)
        }))
        : [],
      generationQueue: Array.isArray(normalized.generationQueue)
        ? normalized.generationQueue.map(serializeGenerationQueueItem).filter(Boolean)
        : []
    };
  }

  function serializeAssistantMessage(item) {
    if (!item || typeof item !== 'object') return null;
    const role = item.role === 'assistant' ? 'assistant' : 'user';
    return {
      id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      role,
      content: String(item.content || '').slice(0, 8000),
      finalPrompt: String(item.finalPrompt || ''),
      pending: Boolean(item.pending),
      failed: Boolean(item.failed)
    };
  }

  function serializePromptSuggestion(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      subject: String(value.subject || '').slice(0, 2000),
      scene: String(value.scene || '').slice(0, 2000),
      composition: String(value.composition || '').slice(0, 2000),
      style: String(value.style || '').slice(0, 2000),
      lighting: String(value.lighting || '').slice(0, 2000),
      details: String(value.details || '').slice(0, 3000),
      textRules: String(value.textRules || '').slice(0, 2000),
      constraints: String(value.constraints || '').slice(0, 3000),
      finalPrompt: String(value.finalPrompt || ''),
      raw: String(value.raw || '').slice(0, 16000)
    };
  }

  return {
    normalizeCachedCurrentSession,
    prepareCurrentSessionForServer,
    serializeAssistantMessage,
    serializePromptSuggestion,
    serializeGenerationQueueItem
  };
}
