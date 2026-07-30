export function normalizeApiBaseUrl(value?: string): string {
  const raw = value?.trim() || '/api';

  if (raw.startsWith('/')) return raw.replace(/\/$/, '');
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '');

  return `https://${raw}`.replace(/\/$/, '');
}
