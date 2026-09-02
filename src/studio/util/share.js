import { displayResultUrl } from './assets.js';

const SHARE_PARAMETER_LABELS = [
  ['model', '模型'],
  ['providerId', '提供方'],
  ['routeLabel', '接口'],
  ['size', '尺寸'],
  ['aspectRatio', '比例'],
  ['quality', '画质'],
  ['resolutionTier', '分辨率'],
  ['outputFormat', '格式'],
  ['moderation', '审核'],
  ['count', '数量'],
  ['referenceCount', '参考图']
];

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function cleanMultiline(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function labelValue(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  return clean(value);
}

export function buildGenerationShareText(meta = {}, { index = 0, title = 'AI 生图' } = {}) {
  const prompt = cleanMultiline(meta.prompt || meta.rawPrompt);
  const generationPrompt = cleanMultiline(meta.generationPrompt);
  const lines = [title, `结果 ${Math.max(1, Number(index) + 1)}`];
  const parameters = SHARE_PARAMETER_LABELS
    .map(([key, label]) => [label, labelValue(meta[key])])
    .filter(([label, value]) => value && !(label === '提供方' && value === clean(meta.model)));

  if (parameters.length) {
    lines.push('', '生成参数', ...parameters.map(([label, value]) => `${label}：${value}`));
  }
  if (prompt) lines.push('', '提示词', prompt);
  if (generationPrompt && generationPrompt !== prompt) {
    lines.push('', '实际发送提示词', generationPrompt);
  }
  if (meta.negativePrompt) lines.push('', '负面提示词', cleanMultiline(meta.negativePrompt));
  return lines.join('\n');
}

async function fileForShare(url, index, extension = 'png') {
  if (!url || typeof fetch !== 'function' || typeof File === 'undefined') return null;
  try {
    const response = await fetch(displayResultUrl(url));
    if (!response.ok) return null;
    const blob = await response.blob();
    const type = blob.type || `image/${extension === 'jpg' ? 'jpeg' : extension}`;
    const mimeExtension = type.split('/')[1]?.split(';')[0]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    const fileExtension = mimeExtension || extension;
    const mediaType = type.startsWith('video/') ? 'video' : 'image';
    return new File([blob], `ai-${mediaType}-${Math.max(1, Number(index) + 1)}.${fileExtension}`, { type });
  } catch {
    return null;
  }
}

export async function shareGenerationResult({ url = '', index = 0, outputFormat = 'png', meta = {}, title = 'AI 生图' } = {}) {
  const text = buildGenerationShareText(meta, { index, title });
  const share = typeof navigator !== 'undefined' ? navigator.share : null;
  if (typeof share === 'function') {
    const file = await fileForShare(url, index, outputFormat === 'jpeg' ? 'jpg' : outputFormat);
    const data = { title, text };
    if (file && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      data.files = [file];
    } else if (/^https?:\/\//i.test(String(url))) {
      data.url = displayResultUrl(url);
    }
    await share.call(navigator, data);
    return 'shared';
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return 'copied';
  }
  return 'unavailable';
}
