export function text(value, length) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, length);
}

export function multilineText(value, length) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, length);
}
