// Keep in sync with scripts/studio-service/text.js (covered by regression tests).
export const PROMPT_MAX_LENGTH = 100000;

export function promptLengthError(value, t = (key, fallback) => fallback) {
  if (String(value ?? '').length <= PROMPT_MAX_LENGTH) return '';
  return t('prompt.tooLong', '提示词超过 100,000 字符，请缩短后重试；原文未被截断。');
}
