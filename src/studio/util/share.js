import { displayResultUrl } from './assets.js';

const SHARE_PARAMETER_LABELS = [
  ['mode', '类型'],
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
  ['referenceCount', '参考图'],
  ['duration', '时长'],
  ['fps', '帧率'],
  ['width', '宽度'],
  ['height', '高度'],
  ['videoMotion', '运镜'],
  ['videoStyle', '视频风格'],
  ['videoQuality', '视频画质']
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

export function generationShareParameters(meta = {}) {
  return Object.fromEntries(SHARE_PARAMETER_LABELS
    .map(([key]) => [key, labelValue(meta[key])])
    .filter(([, value]) => value));
}

export function buildCommunityInspirationDraft({ url = '', index = 0, meta = {}, title = '' } = {}) {
  const prompt = cleanMultiline(meta.prompt || meta.rawPrompt || meta.generationPrompt);
  const generationPrompt = cleanMultiline(meta.generationPrompt || prompt);
  const parameters = generationShareParameters(meta);
  const titleFromPrompt = clean(prompt).slice(0, 52);
  return {
    draftKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: clean(title || meta.title || titleFromPrompt || `AI 作品 ${Math.max(1, Number(index) + 1)}`),
    category: 'Community Prompts',
    prompt,
    generationPrompt,
    note: cleanMultiline(meta.note),
    image: displayResultUrl(url),
    imageAlt: clean(meta.imageAlt || titleFromPrompt || '用户分享的 AI 生成作品'),
    generation: {
      ...parameters,
      generationPrompt,
      negativePrompt: cleanMultiline(meta.negativePrompt)
    }
  };
}

async function blobUrlToDataUrl(url) {
  if (!String(url).startsWith('blob:') || typeof fetch !== 'function' || typeof FileReader === 'undefined') return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return '';
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

export async function prepareCommunityInspirationDraft(options = {}) {
  const draft = buildCommunityInspirationDraft(options);
  return {
    ...draft,
    image: await blobUrlToDataUrl(draft.image)
  };
}
