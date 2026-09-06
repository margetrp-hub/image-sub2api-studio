const ACTIVE_SERVER_JOB_STATUSES = new Set(['queued', 'dispatching', 'gateway', 'upstream', 'image', 'video', 'saving']);
const FINAL_SERVER_JOB_STATUSES = new Set(['succeeded', 'failed', 'unknown', 'canceled']);
const QUEUE_STATUSES = new Set(['queued', 'running', 'failed', 'canceled', 'unknown', 'done']);

export const GENERATION_STALL_NOTICE_MS = 90 * 1000;
export const GENERATION_TIMEOUT_MS = 45 * 60 * 1000;
// Zero means no artificial Workbench queue/concurrency cap. Provider limits
// are still surfaced as real upstream errors.
export const GENERATION_QUEUE_LIMIT = 0;
export const GENERATION_CONCURRENCY = 0;
export const VISIBLE_GENERATION_QUEUE_STATUSES = ['queued', 'running', 'failed', 'canceled', 'unknown', 'done'];
export const CURRENT_PROJECT_QUEUE_STATUSES = new Set(VISIBLE_GENERATION_QUEUE_STATUSES);

export function normalizeQueueStatus(status, fallback = 'queued') {
  const value = String(status || '').trim();
  return QUEUE_STATUSES.has(value) ? value : fallback;
}

export function isActiveServerJobStatus(status) {
  return ACTIVE_SERVER_JOB_STATUSES.has(String(status || ''));
}

export function isFinalServerJobStatus(status) {
  return FINAL_SERVER_JOB_STATUSES.has(String(status || ''));
}

function compactFingerprintValue(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

const fileIdentities = new WeakMap();
let nextFileIdentity = 0;

function referenceIdentity(value) {
  if (!value) return '';
  const file = value.file || value;
  // Files are immutable. Distinguish replacement files even when their names,
  // sizes and timestamps happen to match; the server compares actual bytes.
  if (typeof Blob !== 'undefined' && file instanceof Blob) {
    if (!fileIdentities.has(file)) fileIdentities.set(file, ++nextFileIdentity);
    return `file:${fileIdentities.get(file)}`;
  }
  const source = String(value.dataUrl || value.url || value.src || value);
  let a = 2166136261;
  let b = 5381;
  for (let index = 0; index < source.length; index += 1) {
    a = Math.imul(a ^ source.charCodeAt(index), 16777619);
    b = Math.imul(b, 33) ^ source.charCodeAt(index);
  }
  return `${source.length}:${a >>> 0}:${b >>> 0}`;
}

export function generationTaskFingerprint(value = {}) {
  const prompt = compactFingerprintValue(value.generationPrompt || value.prompt);
  if (!prompt) return '';
  const selectedNodeId = compactFingerprintValue(value.selectedCanvasNodeId || value.parentCanvasNodeId);
  const referenceCount = Number(value.referenceCount ?? value.inputSummary?.referenceCount ?? value.referenceItems?.length ?? 0) || 0;
  const hasMask = Boolean(value.hasMask ?? value.inputSummary?.hasMask ?? value.maskFile);
  return JSON.stringify([
    compactFingerprintValue(value.sessionId),
    compactFingerprintValue(value.mode || 'image'),
    compactFingerprintValue(value.route || ''),
    compactFingerprintValue(value.providerId || value.providerFamily || ''),
    compactFingerprintValue(value.providerProfileId),
    compactFingerprintValue(value.apiKeySource || ''),
    compactFingerprintValue(value.model),
    prompt,
    compactFingerprintValue(value.size || value.customSize),
    compactFingerprintValue(value.quality),
    compactFingerprintValue(value.resolutionTier),
    compactFingerprintValue(value.outputFormat),
    compactFingerprintValue(value.moderation),
    String(Number(value.count || value.n || 1) || 1),
    compactFingerprintValue(value.batchKey),
    selectedNodeId,
    String(referenceCount),
    hasMask ? 'mask' : '',
    (value.referenceItems || value.images || []).map((reference) => [referenceIdentity(reference), reference?.role || '']),
    referenceIdentity(value.canvasReference),
    referenceIdentity(value.maskFile || value.mask),
    ...(value.mode === 'video' ? [
      value.duration, value.fps, value.width, value.height,
      value.motion, value.style, value.negativePrompt
    ].map(compactFingerprintValue) : [])
  ]);
}

export function findDuplicateActiveGenerationTask(queue, fingerprint) {
  if (!fingerprint || !Array.isArray(queue)) return null;
  return queue.find((item) => (
    item?.fingerprint === fingerprint
    && (item.status === 'queued' || item.status === 'running')
  )) || null;
}

export function queueStatusFromServerJob(job) {
  const status = String(job?.status || job?.stage || '').trim();
  if (status === 'succeeded') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'canceled') return 'canceled';
  if (status === 'unknown') return 'unknown';
  if (status === 'queued' || status === 'dispatching') return 'queued';
  return 'running';
}

export function isVisibleServerJob(job) {
  return isActiveServerJobStatus(job?.status)
    || ['failed', 'unknown', 'canceled'].includes(String(job?.status || ''));
}

export function isRestorableQueueItem(item) {
  const status = normalizeQueueStatus(item?.status, '');
  return Boolean(
    item?.serverJobId
    && (item.remote || status === 'running' || status === 'queued')
    && !['failed', 'canceled', 'unknown', 'done'].includes(status)
  );
}

export function normalizeServerJobError(job) {
  const error = job?.error && typeof job.error === 'object' ? job.error : {};
  const requestIds = Array.isArray(job?.requestIds) ? job.requestIds.filter(Boolean) : [];
  const requestId = error.requestId || requestIds[0] || '';
  const message = error.message || (job?.status === 'unknown'
    ? 'GENERATION_JOB_UNKNOWN'
    : job?.status === 'canceled'
      ? 'JOB_CANCELED'
      : '');
  if (!message && !error.code && !error.status && !requestId) return null;
  return {
    code: String(error.code || job?.status || '').slice(0, 120),
    status: error.status || null,
    requestId: String(requestId).slice(0, 160),
    message: String(message).slice(0, 1200)
  };
}

export function activeGenerationQueueCount(queue) {
  return Array.isArray(queue)
    ? queue.filter((item) => item?.status === 'queued' || item?.status === 'running').length
    : 0;
}

export function firstQueuedGenerationTask(queue) {
  return Array.isArray(queue) ? queue.find((item) => item?.status === 'queued') || null : null;
}

export function replaceGenerationQueueItem(queue, id, patch) {
  return Array.isArray(queue)
    ? queue.map((item) => (item?.id === id ? { ...item, ...patch } : item))
    : [];
}

export function removeGenerationQueueItem(queue, id) {
  return Array.isArray(queue) ? queue.filter((item) => item?.id !== id) : [];
}

function limitGenerationQueueItems(queue, limit, direction = 'tail') {
  const source = Array.isArray(queue) ? queue : [];
  const normalizedLimit = Number(limit);
  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) return source;
  return direction === 'head'
    ? source.slice(0, normalizedLimit)
    : source.slice(-normalizedLimit);
}

export function appendGenerationQueueTask(queue, task, limit = GENERATION_QUEUE_LIMIT) {
  const source = Array.isArray(queue) ? queue : [];
  return limitGenerationQueueItems([...source, task], limit);
}

export function retryGenerationQueueTask(queue, id, {
  createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  now = Date.now(),
  fallbackSummary = 'Retry generation task',
  limit = GENERATION_QUEUE_LIMIT
} = {}) {
  const source = Array.isArray(queue) ? queue : [];
  const target = source.find((item) => item?.id === id);
  if (!target) return { queue: source, target: null, retryTask: null, blocked: true };
  if (target.remote || target.restorable === false) {
    return { queue: source, target, retryTask: null, blocked: true };
  }
  const retryTask = {
    ...target,
    id: createId(),
    status: 'queued',
    createdAt: now,
    startedAt: null,
    completedAt: null,
    restored: false,
    summary: target.prompt || target.summary || fallbackSummary
  };
  return {
    queue: limitGenerationQueueItems([
      retryTask,
      ...source.filter((item) => item?.id !== id)
    ], limit, 'head'),
    target,
    retryTask,
    blocked: false
  };
}

export function upsertRemoteGenerationJobTask(queue, job, {
  defaultModel = 'gpt-image-2',
  now = Date.now(),
  fallbackSummary = 'Server job',
  limit = GENERATION_QUEUE_LIMIT
} = {}) {
  if (!job?.id) return Array.isArray(queue) ? queue : [];
  const source = Array.isArray(queue) ? queue : [];
  const existingTask = source.find((item) => item?.serverJobId === job.id || item?.id === `remote-${job.id}`);
  if (existingTask?.status === 'canceled' && isActiveServerJobStatus(job.status)) return source;
  const inheritedPrompt = job.generationPrompt || job.request?.generationPrompt || job.prompt || existingTask?.prompt || existingTask?.summary || '';
  const requestIds = Array.isArray(job.requestIds) ? job.requestIds.filter(Boolean).slice(0, 8) : [];
  const remoteTask = {
    id: `remote-${job.id}`,
    serverJobId: job.id,
    remote: true,
    status: queueStatusFromServerJob(job),
    createdAt: Date.parse(job.createdAt || '') || now,
    startedAt: Date.parse(job.startedAt || '') || null,
    completedAt: Date.parse(job.completedAt || '') || null,
    mode: job.mode || 'image',
    providerId: job.providerId || job.providerFamily || '',
    providerFamily: job.providerFamily || job.providerId || '',
    apiKeySource: job.apiKeySource || '',
    providerLabel: job.providerLabel || '',
    prompt: inheritedPrompt,
    rawPrompt: job.rawPrompt || job.request?.rawPrompt || existingTask?.rawPrompt || '',
    workflow: job.workflow || job.request?.workflow || existingTask?.workflow || null,
    model: job.model || defaultModel,
    size: job.size || 'auto',
    quality: job.quality || 'auto',
    count: job.count || 1,
    stage: job.stage || job.status || '',
    completed: Number(job.completed || 0),
    total: Number(job.total || job.count || 1),
    resultUrls: Array.isArray(job.resultUrls) ? job.resultUrls.filter(Boolean).slice(0, 10) : [],
    requestIds,
    error: normalizeServerJobError(job),
    selectedCanvasNodeId: job.parentCanvasNodeId || '',
    fingerprint: job.fingerprint || '',
    summary: inheritedPrompt || job.error?.message || `${fallbackSummary} ${job.id}`,
    restorable: false
  };
  return limitGenerationQueueItems([
    remoteTask,
    ...source.filter((item) => item?.id !== remoteTask.id && item?.serverJobId !== job.id)
  ], limit, 'head');
}

export function markRemoteGenerationJobTask(queue, jobId, status = 'done', now = Date.now()) {
  if (!jobId) return Array.isArray(queue) ? queue : [];
  return replaceGenerationQueueItemByPredicate(
    queue,
    (item) => item?.serverJobId === jobId || item?.id === `remote-${jobId}`,
    { status, completedAt: now }
  );
}

function replaceGenerationQueueItemByPredicate(queue, predicate, patch) {
  return Array.isArray(queue)
    ? queue.map((item) => (predicate(item) ? { ...item, ...patch } : item))
    : [];
}

function defaultTranslate(key, fallback, values) {
  if (!values) return fallback || key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), fallback || key);
}

export function errorRequestId(error, message = '') {
  const direct = error?.requestId
    || error?.request_id
    || error?.payload?.request_id
    || error?.payload?.requestId
    || error?.payload?.error?.request_id
    || error?.payload?.error?.requestId
    || error?.payload?.response?.request_id
    || error?.payload?.response?.requestId
    || error?.payload?.response?.error?.request_id
    || error?.payload?.response?.error?.requestId;
  if (direct) return String(direct);

  const match = String(message).match(/request\s*id\s*[:：]?\s*([a-z0-9-]{12,})/i);
  return match?.[1] || '';
}

export function generationErrorMessage(error, t = defaultTranslate, compactText = (value) => String(value || '').slice(0, 180)) {
  const message = String(
    error?.payload?.error?.message
      || error?.payload?.message
      || error?.payload?.response?.error?.message
      || error?.message
      || t('errors.generationFailed', '生成失败')
  );

  const lowered = message.toLowerCase();
  const requestId = errorRequestId(error, message);
  const requestSuffix = requestId ? t('errors.requestIdSuffix', ' 请求 ID：{requestId}', { requestId }) : '';
  if (error?.code === 'PROMPT_TOO_LONG' || lowered.includes('prompt_too_long')) {
    return t('prompt.tooLong', '提示词超过 100,000 字符，请缩短后重试；原文未被截断。');
  }
  if (error?.code === 'GENERATION_STOPPED' || lowered.includes('generation_stopped')) {
    return t('errors.stopped', '已停止本页等待。若请求已经到达上游，仍可能继续处理或产生扣费；请先查看当前画布/历史图库，确认没有新结果后再重试。');
  }
  if (error?.code === 'SERVICE_QUEUE_UNAVAILABLE' || lowered.includes('service_queue_unavailable')) {
    return t('errors.serviceQueueUnavailable', '服务端生成队列暂不可用，这次没有切换到浏览器直连。请检查 /studio-api/generation-jobs、history/session 服务和来源白名单后再试。');
  }
  if (error?.code === 'GENERATION_TIMEOUT' || error?.code === 'JOB_TIMEOUT' || lowered.includes('generation_timeout') || lowered.includes('job_timeout') || lowered.includes('timed out') || lowered.includes('timeout')) {
    return `${t('errors.timeout', '前端等待超时，这次页面已结束等待；这不代表上游已经取消。本次请求可能仍在处理、排队或已经扣费，请稍后查看历史图库/当前画布，再决定是否重试。')}${requestSuffix}`;
  }
  if (lowered.includes('origin_not_allowed') || lowered.includes('origin not allowed')) {
    return t('errors.originNotAllowed', '生成请求被创作台服务拦截：当前页面来源没有加入 STUDIO_ALLOWED_ORIGINS 白名单。请更新并重启 history/session 服务，或把当前访问地址加入允许来源后再试。');
  }
  if (
    error?.code === 'GATEWAY_DISPATCH_FAILED'
    && (
      lowered.includes('did not return a final response')
      || lowered.includes('upstream image request')
      || lowered.includes('still be processing')
      || lowered.includes('queued, or billed')
      || lowered.includes('context canceled')
    )
  ) {
    return `${t('errors.gatewayNoFinalResponse', '请求已经送到网关，但上游在工作站等待时间内没有返回最终图片。它可能仍在上游排队、处理中，或已经产生扣费；请先按请求 ID 查后台/历史图库，再决定是否重试。')}${requestSuffix}`;
  }
  if (error?.code === 'GATEWAY_DISPATCH_FAILED' || lowered.includes('could not deliver this request to the gateway')) {
    return t('errors.gatewayDispatchFailed', '工作站服务没能把请求送到网关，所以后台可能没有调用记录。请检查接口地址、服务端网络、允许来源和防火墙后再试。');
  }
  if (
    lowered.includes('request was rejected by the safety system')
    || lowered.includes('rejected by the safety system')
    || lowered.includes('safety system')
    || lowered.includes('content policy')
    || lowered.includes('content moderation')
    || lowered.includes('content_moderation')
    || lowered.includes('moderation')
    || lowered.includes('safety policy')
    || lowered.includes('policy_violation')
  ) {
    if (lowered.includes('content moderation') || lowered.includes('content_moderation') || lowered.includes('moderation')) {
      return `${t('errors.contentModeration', '上游内容审核拒绝了这次请求，生成已停止。请换一版更中性的提示词或参考图后重试。')}${requestSuffix}`;
    }
    return `${t('errors.safety', '提示词或参考图触发了上游安全策略，生成已被拒绝。请弱化敏感描述，去掉真实人物、未成年人、暴力色情、仿冒名人等高风险内容后重试。')}${requestSuffix}`;
  }
  if (lowered.includes('no images') || lowered.includes('returned_no_images') || lowered.includes('没有返回图片')) {
    return `${t('errors.noImages', '上游请求结束，但没有返回可用图片。通常是模型拒绝、参数不兼容或网关没有透传结果，请换一版提示词或调整模型/尺寸后重试。')}${requestSuffix}`;
  }
  if (lowered.includes('upstream request failed') || lowered.includes('upstream response failed') || lowered.includes('upstream') || lowered.includes('context canceled')) {
    return `${t('errors.upstream', '请求已经进入中转站，但上游模型服务没有正常返回图片。请在后台按请求 ID 查看最终状态；如果只有重试/切换日志没有成功记录，建议换 Key、降低数量或稍后重试。')}${requestSuffix}`;
  }
  if (error?.status === 400 || lowered.includes('invalid request') || lowered.includes('invalid_request') || lowered.includes('invalid parameter') || lowered.includes('invalid_value')) {
    if (lowered.includes('size') || lowered.includes('quality') || lowered.includes('model')) {
      return `${t('errors.unsupportedParams', '请求参数不被当前模型支持，请检查模型、尺寸、质量或数量设置。')}${requestSuffix}`;
    }
    return `${t('errors.invalidParams', '请求参数有误，生成已停止。请检查提示词、模型、尺寸、数量和参考图设置。')}${requestSuffix}`;
  }
  if (error?.status === 401 || lowered.includes('unauthorized') || lowered.includes('invalid token') || lowered.includes('invalid api key') || lowered.includes('incorrect api key')) {
    return t('errors.unauthorized', '账号登录或密钥已失效，请重新登录或更换密钥。');
  }
  if (error?.status === 402 || lowered.includes('insufficient') || lowered.includes('balance') || lowered.includes('quota') || lowered.includes('credit') || lowered.includes('billing')) {
    return t('errors.billing', '当前账号余额或额度不足，生成已停止。');
  }
  if (error?.status === 403 || lowered.includes('forbidden') || lowered.includes('permission') || lowered.includes('not allowed') || lowered.includes('model_not_found')) {
    return t('errors.forbidden', '当前账号没有调用该模型或接口的权限，生成已停止。');
  }
  if (lowered.includes('video request not found') || lowered.includes('video task not found')) {
    return `${t('errors.videoRequestNotFound', '上游视频任务已找不到，可能是网关没有保留任务状态或接口协议不匹配。请检查视频供应商类型和网关地址后重试。')}${requestSuffix}`;
  }
  if (error?.status === 404 || lowered.includes('not found')) {
    return `${t('errors.notFound', '接口或模型不存在。请确认网关地址、接口类型和模型名称是否正确。')}${requestSuffix}`;
  }
  if (error?.status === 408 || error?.status === 504 || lowered.includes('gateway timeout') || lowered.includes('upstream timeout')) {
    return `${t('errors.gatewayTimeout', '网关响应超时，本页没有继续收到结果；如果请求已经提交上游，仍可能产生扣费。请稍后查看历史图库，再决定是否降低数量/质量重试。')}${requestSuffix}`;
  }
  if (error?.status === 429 || lowered.includes('rate limit') || lowered.includes('too many requests')) {
    return t('errors.rateLimit', '当前账号或接口触发限流，生成已停止。请稍后重试。');
  }
  if (error?.status >= 500 || lowered.includes('internal server error') || lowered.includes('bad gateway') || lowered.includes('service unavailable')) {
    return `${t('errors.serviceUnavailable', '上游服务暂时不可用，生成已停止。请稍后重试；如果反复出现，可能是中转站或模型服务异常。')}${requestSuffix}`;
  }
  if (lowered.includes('failed to fetch') || lowered.includes('fetch failed') || lowered.includes('networkerror') || lowered.includes('network error')) {
    return t('errors.network', '网络连接中断，本页没有收到完整结果；如果请求已经发出，上游可能仍在处理或已经计费。请先检查历史图库/当前画布，再决定是否重试。');
  }
  if (error?.name === 'AbortError') {
    return t('errors.abort', '本页监听已停止；如果请求已经到达上游，仍可能继续处理或产生扣费。');
  }
  if (/^[\u0000-\u007F]*$/.test(message) && /[A-Za-z]/.test(message)) {
    return t('errors.unknownEnglish', '生成失败。上游返回了未识别的英文错误，请稍后重试，或调整模型/尺寸/数量后再试。原始信息：{message}', { message: compactText(message, 180) });
  }
  return message;
}

export function serverJobProgress(job, fallbackTotal = 1) {
  const total = Math.max(1, Number(job?.total || job?.count || fallbackTotal || 1));
  const completed = Math.max(0, Number(job?.completed || 0));
  const stage = job?.stage || job?.status || 'queued';
  const basePercent = {
    queued: 12,
    dispatching: 22,
    gateway: 38,
    upstream: 52,
    image: 76,
    video: 84,
    saving: 88,
    succeeded: 100,
    failed: 0,
    canceled: 0,
    unknown: 12
  }[stage] ?? 18;
  return {
    stage,
    completed,
    total,
    percent: stage === 'upstream' && total > 1
      ? Math.min(96, Math.max(basePercent, Math.round((completed / total) * 86)))
      : basePercent
  };
}

export function serverJobMessage(job, t = defaultTranslate) {
  const status = job?.status || job?.stage;
  if (status === 'queued') return t('jobs.queued', '已进入服务端队列，刷新页面也会继续保留状态。');
  if (status === 'dispatching') return t('jobs.dispatching', '服务端正在提交到上游网关。');
  if (status === 'gateway') return t('jobs.gateway', '服务端已发出请求，正在等待网关同步返回。');
  if (status === 'upstream') return t('jobs.upstream', '上游正在生成，服务端会继续等待并保存结果。');
  if (status === 'image') return t('jobs.image', '已收到图片，正在写入当前任务。');
  if (status === 'saving') return t('jobs.saving', '正在保存生成结果。');
  if (status === 'succeeded') return t('jobs.succeeded', '生成完成，结果已保存到服务端。');
  if (status === 'unknown') return t('jobs.unknown', '服务端等待中断，结果未知；请稍后查看历史图库后再决定是否重试。');
  if (status === 'canceled') return t('jobs.canceled', '任务已在本地取消。');
  if (status === 'failed') return generationErrorMessage({
    ...(job?.error || {}),
    message: job?.error?.message || 'GENERATION_JOB_FAILED',
    status: job?.error?.status,
    requestId: job?.error?.requestId || job?.requestIds?.[0] || ''
  }, t);
  return t('jobs.processing', '服务端任务处理中。');
}

export function serverJobTimingPatch(job, current = {}) {
  if (!job?.timing || typeof job.timing !== 'object') return null;
  const completedAt = Number(job.timing.completedAt) || Date.parse(job.completedAt || '') || null;
  return {
    ...(current || {}),
    ...job.timing,
    status: isFinalServerJobStatus(job.status) ? (job.status === 'succeeded' ? 'completed' : 'failed') : 'running',
    startedAt: Number(job.timing.startedAt) || current?.startedAt || Date.parse(job.startedAt || '') || Date.now(),
    completedAt,
    model: job.model || current?.model || '',
    spec: current?.spec || [job.size, job.quality].filter(Boolean).join(' · ')
  };
}

// True if the local queue contains tasks that were restored from a previous
// session (`restored: true`) and are still safely re-runnable from this
// browser. The startup effect uses this to decide whether to auto-resume the
// runner on cold load. Remote-only items are excluded — those are tracked
// server-side and resumed by the polling effect instead.
export function hasRestorableLocalQueueTask(queue) {
  return Array.isArray(queue) && queue.some((item) => (
    item?.status === 'queued'
    && item.restored
    && item.restorable !== false
    && !item.remote
  ));
}

// Returns the `serverJobId`s of queue items that look active locally but
// aren't present in the server's last-N jobs listing — i.e. jobs we need to
// fetch individually so the queue UI matches reality. Used by the remote
// session sync effect.
export function restorableRemoteJobIds(queue, knownJobIds) {
  if (!Array.isArray(queue)) return [];
  const known = knownJobIds instanceof Set ? knownJobIds : new Set(knownJobIds || []);
  return queue
    .filter((item) => item?.serverJobId && item.remote && (item.status === 'queued' || item.status === 'running'))
    .map((item) => item.serverJobId)
    .filter((jobId) => !known.has(jobId));
}

// Stable-enough id for an in-memory queue item. We don't need crypto
// uniqueness — these only need to disambiguate items in the current queue.
export function createGenerationTaskId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
