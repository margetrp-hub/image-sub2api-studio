import { buildPromptSlug, sanitizeProvider } from './filename.js';

export const QUALITY_LABELS = {
  auto: '自动',
  low: '低',
  medium: '中',
  high: '高'
};

export const RESOLUTION_TIER_LABELS = {
  '1k': '1K',
  '2k': '2K',
  '4k': '4K'
};

export const OUTPUT_FORMAT_LABELS = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP'
};

function shortId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 8) || Math.random().toString(36).slice(2, 10);
}

function formatDownloadStamp(value) {
  const date = new Date(value || Date.now());
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (number) => String(number).padStart(2, '0');
  return [
    safeDate.getFullYear(),
    pad(safeDate.getMonth() + 1),
    pad(safeDate.getDate())
  ].join('') + '-' + [
    pad(safeDate.getHours()),
    pad(safeDate.getMinutes()),
    pad(safeDate.getSeconds())
  ].join('');
}

export function buildStudioDownloadFilename({
  mode = 'image',
  providerId = 'gateway-account',
  createdAt,
  prompt,
  id,
  index = 0,
  extension = 'png'
} = {}) {
  const type = mode === 'video' ? 'video' : 'image';
  const provider = sanitizeProvider(providerId);
  const stamp = formatDownloadStamp(createdAt);
  const slug = buildPromptSlug(prompt);
  const suffix = shortId(id || `${stamp}-${slug}-${index}`);
  const seq = String(Math.max(1, (Number.isFinite(index) ? (index | 0) : 0) + 1)).padStart(2, '0');
  const ext = String(extension || (type === 'video' ? 'mp4' : 'png')).toLowerCase().replace(/[^a-z0-9]+/g, '') || (type === 'video' ? 'mp4' : 'png');
  return `ai-image-workbench-${type}-${provider}-${stamp}-${slug}-${suffix}-${seq}.${ext}`;
}

export function downloadMetaFromHistoryItem(item, isVideo = false) {
  return {
    mode: isVideo ? 'video' : 'image',
    providerId: item?.providerId || item?.provider || item?.route || item?.model || 'gateway-account',
    model: item?.model || item?.providerId || item?.provider || '',
    createdAt: item?.createdAt,
    prompt: item?.prompt || item?.case?.title || '',
    generationPrompt: item?.generationPrompt || item?.prompt || item?.case?.title || '',
    negativePrompt: item?.negativePrompt || '',
    aspectRatio: item?.aspectRatio || item?.aspect || '',
    size: item?.size || '',
    quality: item?.quality || '',
    resolutionTier: item?.resolutionTier || '',
    outputFormat: item?.outputFormat || '',
    count: item?.count || '',
    referenceCount: item?.referenceCount || '',
    id: item?.taskId || item?.id || item?.createdAt
  };
}

export function resultVideoExtension(url) {
  const clean = String(url || '').split('?')[0];
  const match = clean.match(/\.([a-z0-9]+)$/i);
  return match?.[1] || 'mp4';
}

export function resultExtension(url, fallback = 'png') {
  const dataMatch = String(url || '').match(/^data:image\/([^;]+)/i);
  if (dataMatch?.[1]) return dataMatch[1] === 'jpeg' ? 'jpg' : dataMatch[1];
  return fallback === 'jpeg' ? 'jpg' : fallback;
}

export function formatHistoryTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
