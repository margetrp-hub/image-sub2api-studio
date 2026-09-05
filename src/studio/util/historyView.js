import { isProtectedStudioAsset } from './assets.js';
import { downloadMetaFromHistoryItem } from './resultFiles.js';

const DEFAULT_VISIBLE_QUEUE_STATUSES = ['queued', 'running', 'failed', 'canceled', 'unknown', 'done'];

function dedupeHistoryResultItems(items = []) {
  const map = new Map();
  for (const item of items) {
    const key = `${item.recordId || ''}:${item.url || item.displayUrl || ''}:${item.index ?? ''}`;
    if (!key.replace(/[:]/g, '')) continue;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function historySessionKey(item) {
  if (item?.sessionId || item?.conversationId || item?.batchId) {
    return String(item.sessionId || item.conversationId || item.batchId);
  }
  const createdAt = Date.parse(item?.createdAt || '') || Number(String(item?.id || '').split('-')[0]) || Date.now();
  const bucket = Math.floor(createdAt / (24 * 60 * 60 * 1000));
  const mode = item?.mode || item?.kind || 'image';
  const model = item?.model || item?.providerId || '';
  const caseId = item?.case?.id || item?.caseId || '';
  const promptBasis = String(item?.prompt || item?.generationPrompt || item?.case?.promptPreview || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96);
  return `legacy-session:${mode}:${model}:${caseId}:${bucket}:${promptBasis}`;
}

export function historyResultUrls(item) {
  return Array.isArray(item?.displayResultUrls) && item.displayResultUrls.length
    ? item.displayResultUrls
    : Array.isArray(item?.resultUrls)
      ? item.resultUrls
      : [];
}

export function historyResultItems(item) {
  if (Array.isArray(item?.resultItems) && item.resultItems.length) {
    return item.resultItems.map((result, index) => ({
      ...downloadMetaFromHistoryItem({ ...item, ...result }, item.mode === 'video' || item.kind === 'video'),
      id: String(result.id || `${item?.id || 'history'}-${index}`),
      recordId: String(result.recordId || item?.id || ''),
      url: result.url || result.displayUrl || '',
      displayUrl: result.displayUrl || result.url || '',
      prompt: result.prompt || result.generationPrompt || item?.prompt || item?.generationPrompt || item?.case?.promptPreview || '',
      generationPrompt: result.generationPrompt || result.prompt || item?.generationPrompt || item?.prompt || item?.case?.promptPreview || '',
      workflow: result.workflow || item?.workflow || null,
      model: result.model || item?.model || '',
      providerId: result.providerId || item?.providerId || item?.provider || '',
      createdAt: result.createdAt || item?.createdAt || '',
      outputFormat: result.outputFormat || item?.outputFormat || '',
      index: Number.isFinite(result.index) ? result.index : index
    })).filter((result) => result.url || result.displayUrl);
  }

  const displayUrls = Array.isArray(item?.displayResultUrls) && item.displayResultUrls.length ? item.displayResultUrls : [];
  const resultUrls = Array.isArray(item?.resultUrls) ? item.resultUrls : [];
  const urls = displayUrls.length ? displayUrls : resultUrls;
  return urls.map((url, index) => ({
    ...downloadMetaFromHistoryItem(item, item.mode === 'video' || item.kind === 'video'),
    id: `${item?.id || 'history'}-${index}`,
    recordId: item?.id || '',
    url: resultUrls[index] || url,
    displayUrl: displayUrls[index] || url,
    prompt: item?.prompt || item?.generationPrompt || item?.case?.promptPreview || '',
    generationPrompt: item?.generationPrompt || item?.prompt || item?.case?.promptPreview || '',
    workflow: item?.workflow || null,
    model: item?.model || '',
    providerId: item?.providerId || item?.provider || '',
    createdAt: item?.createdAt || '',
    outputFormat: item?.outputFormat || '',
    index
  })).filter((result) => result.url || result.displayUrl);
}

export function groupHistorySessions(items = []) {
  const map = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    const key = historySessionKey(item);
    const urls = historyResultUrls(item);
    const displayUrls = Array.isArray(item.displayResultUrls) && item.displayResultUrls.length ? item.displayResultUrls : urls;
    const resultItems = historyResultItems(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...item,
        id: key || item.id,
        sessionId: item.sessionId || key,
        recordIds: [item.id],
        resultUrls: urls,
        displayResultUrls: displayUrls,
        resultItems,
        sessionCount: 1
      });
      continue;
    }
    const existingTime = Date.parse(existing.createdAt || '') || 0;
    const itemTime = Date.parse(item.createdAt || '') || 0;
    const mergedResultItems = dedupeHistoryResultItems([...(existing.resultItems || []), ...resultItems]);
    map.set(key, {
      ...(itemTime >= existingTime ? { ...existing, ...item } : existing),
      id: existing.id,
      sessionId: existing.sessionId || item.sessionId || existing.id,
      recordIds: [...new Set([...(existing.recordIds || []), item.id])],
      resultUrls: [...new Set([...(existing.resultUrls || []), ...urls])],
      displayResultUrls: [...new Set([...(existing.displayResultUrls || []), ...displayUrls])],
      resultItems: mergedResultItems,
      sessionCount: existing.sessionCount + 1
    });
  }
  return [...map.values()].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || '') || 0;
    const rightTime = Date.parse(right.createdAt || '') || 0;
    return rightTime - leftTime;
  });
}

export function currentSessionProject(session, queueStatuses = DEFAULT_VISIBLE_QUEUE_STATUSES) {
  const visibleStatuses = queueStatuses instanceof Set ? queueStatuses : new Set(queueStatuses);
  const queueItems = Array.isArray(session?.generationQueue)
    ? session.generationQueue.filter((item) => visibleStatuses.has(item?.status))
    : [];
  const messages = Array.isArray(session?.assistantMessages) ? session.assistantMessages : [];
  const hasConversation = Boolean(String(session?.prompt || '').trim()) || messages.length > 0;
  if (!session?.canvasNodes?.length && !queueItems.length && !hasConversation) return null;
  const nodes = session.canvasNodes || [];
  const imageNodes = nodes.filter((node) => node.kind !== 'video');
  const recordIds = [...new Set(nodes.map((node) => node?.downloadMeta?.id).filter(Boolean))];
  const firstNode = nodes[0] || {};
  const firstQueueItem = queueItems[0] || {};
  const sessionId = session.sessionId || 'current-session';
  return {
    id: sessionId,
    sessionId,
    current: true,
    titleKey: 'rail.currentSession',
    title: '当前会话',
    prompt: session.prompt || firstNode.prompt || firstQueueItem.prompt || '',
    createdAt: session.createdAt || session.timing?.startedAt || session.updatedAt || Date.now(),
    updatedAt: session.updatedAt || session.timing?.startedAt || session.createdAt || Date.now(),
    model: session.model,
    resultUrls: nodes.map((node) => node.url).filter(Boolean),
    displayResultUrls: nodes.map((node) => node.url).filter(Boolean),
    resultItems: nodes.map((node, index) => ({
      ...(node.downloadMeta || {}),
      id: node.id || `${sessionId}-${index}`,
      recordId: node?.downloadMeta?.id || '',
      url: node.url,
      displayUrl: node.url,
      prompt: node.prompt || '',
      generationPrompt: node.generationPrompt || node.downloadMeta?.generationPrompt || node.prompt || '',
      workflow: node.workflow || null,
      model: node?.downloadMeta?.model || session.model || '',
      createdAt: node.createdAt || session.updatedAt || '',
      index
    })).filter((item) => item.url || item.displayUrl),
    recordIds,
    canvasCount: nodes.length,
    imageCount: imageNodes.length,
    queueCount: queueItems.length,
    messageCount: messages.length,
    mode: session.mode || 'image'
  };
}

export function safeImageCandidate(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (isProtectedStudioAsset(value)) return value;
  if (/^(https?:|data:image\/|blob:)/i.test(value)) return value;
  if (/\.(png|jpe?g|webp|gif|avif|svg)(?:[?#].*)?$/i.test(value)) return value;
  return '';
}
