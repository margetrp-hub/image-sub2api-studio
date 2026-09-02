// Image-generation parameter vocabularies and the normalizers that snap
// arbitrary input back onto the supported set. Keeping these together means
// the UI, persistence layer, and request builders all agree on what values
// are legal — drift here was the original reason for splitting them out of
// the studio.jsx monolith.

export const SIZES = Object.freeze(['auto', '1024x1024', '1536x1024', '1024x1536']);

export const ASPECT_OPTIONS = Object.freeze([
  { value: '1:1', label: '1:1', size: '1024x1024' },
  { value: '3:4', label: '3:4', size: '1024x1536' },
  { value: '16:9', label: '16:9', size: '1536x1024' },
  { value: '9:16', label: '9:16', size: '1024x1536' },
  { value: 'custom', label: '手动', size: '1024x1024' }
]);

export const CUSTOM_SIZE_OPTIONS = Object.freeze([
  { value: 'auto', label: '自动' },
  { value: '1024x1024', label: '1024 x 1024' },
  { value: '1536x1024', label: '1536 x 1024' },
  { value: '1024x1536', label: '1024 x 1536' }
]);

export const QUALITY = Object.freeze(['auto', 'low', 'medium', 'high']);

export const RESOLUTION_TIERS = Object.freeze([
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' }
]);

export const OUTPUT_FORMATS = Object.freeze(['png', 'jpeg', 'webp']);
export const MODERATION = Object.freeze(['auto', 'low']);

export const MODERATION_LABELS = Object.freeze({
  auto: '自动',
  low: '低'
});

export function normalizeSize(value) {
  return SIZES.includes(value) ? value : '1024x1024';
}

export function normalizeAspect(value, size) {
  if (ASPECT_OPTIONS.some((item) => item.value === value)) return value;
  const matched = ASPECT_OPTIONS.find((item) => item.value !== 'custom' && item.size === size);
  return matched?.value || '1:1';
}

export function sizeFromAspect(aspect, customSize) {
  if (aspect === 'custom') return normalizeSize(customSize);
  return ASPECT_OPTIONS.find((item) => item.value === aspect)?.size || '1024x1024';
}

// `auto` is a legal selection for some routes but the request builder needs a
// concrete tier — fall back to `medium` rather than letting `auto` leak out.
export function normalizeQuality(value) {
  return QUALITY.includes(value) && value !== 'auto' ? value : 'medium';
}

export function normalizeResolutionTier(value) {
  return RESOLUTION_TIERS.some((item) => item.value === value) ? value : '1k';
}

// Appends a localized resolution hint (e.g. "请输出 4K 高清图") to the prompt so
// downstream models that don't read structured params still get the cue.
export function withResolutionHint(prompt, resolutionTier, t = (key, fallback) => fallback || key) {
  const normalizedTier = normalizeResolutionTier(resolutionTier);
  const hint = t(`params.resolutionPromptHints.${normalizedTier}`, '');
  return hint ? `${prompt}\n\n${hint}` : prompt;
}

// The reference roles the rail lets a user assign per image. Kept here (rather
// than in studio.jsx) so the hint builder and any request-layer consumer agree
// on the legal set without importing the UI monolith.
export const REFERENCE_ROLE_VALUES = Object.freeze(['identity', 'style', 'composition', 'product']);

export function normalizeReferenceRole(value) {
  return REFERENCE_ROLE_VALUES.includes(value) ? value : 'identity';
}

// Turn the ordered reference list into a localized instruction block so models
// that only read the free-text prompt (not structured params) still learn how
// each attached image should be used — e.g. "参考图1：沿用其主体/人物身份".
// `referenceItems` is the rail's `[{ file, role }]` shape; items without a file
// are skipped so the numbering matches what actually gets uploaded. Returns the
// prompt unchanged when there are no usable references, so callers can wrap it
// unconditionally the same way `withResolutionHint` is used.
export function withReferenceRoleHint(prompt, referenceItems, t = (key, fallback) => fallback || key) {
  const usable = (Array.isArray(referenceItems) ? referenceItems : []).filter((item) => item?.file);
  if (!usable.length) return prompt;
  const lines = usable.map((item, index) => {
    const role = normalizeReferenceRole(item?.role);
    const roleHint = t(`references.rolePromptHints.${role}`, '');
    const label = t('references.referenceIndex', '参考 {index}', { index: index + 1 });
    return roleHint ? `- ${label}: ${roleHint}` : '';
  }).filter(Boolean);
  if (!lines.length) return prompt;
  const heading = t('references.rolePromptHeading', '参考图使用说明（按顺序）：');
  return `${prompt}\n\n${heading}\n${lines.join('\n')}`;
}

export function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.includes(value) ? value : 'png';
}

export function normalizeModeration(value) {
  return MODERATION.includes(value) ? value : 'auto';
}

// Image counts are clamped to [1, 10]; non-numeric input falls back to 1 so a
// stray empty string or `null` from the form never produces a NaN request.
export function normalizeCount(value) {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return 1;
  return Math.min(10, Math.max(1, next));
}
