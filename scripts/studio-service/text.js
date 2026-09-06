export function text(value, length) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length);
}

export function multilineText(value, length) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, length);
}

export const PROMPT_MAX_LENGTH = 100000;

export function promptText(value) {
  const result = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  if (result.length > PROMPT_MAX_LENGTH) {
    const error = new Error('PROMPT_TOO_LONG');
    error.status = 400;
    throw error;
  }
  return result;
}

// Validate before writing assets or other parts of a submitted snapshot.
export function validatePromptLengths(value) {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, item] of Object.entries(current)) {
      if (/^(?:prompt|basePrompt|rawPrompt|generationPrompt|negativePrompt|rootPrompt|finalPrompt)$/.test(key)) promptText(item);
      if (item && typeof item === 'object') pending.push(item);
    }
  }
  return value;
}
