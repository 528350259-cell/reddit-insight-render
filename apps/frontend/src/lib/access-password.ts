const STORAGE_KEY = 'reddit-insight-access-password';

export function getAccessPassword(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem(STORAGE_KEY)?.trim() || undefined;
}

export function clearAccessPassword() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function ensureAccessPassword(): string | undefined {
  if (import.meta.env.PUBLIC_APP_PASSWORD_REQUIRED !== 'true') return undefined;
  if (typeof window === 'undefined') return undefined;

  const existing = getAccessPassword();
  if (existing) return existing;

  const password = window.prompt('请输入团队访问口令');
  if (!password?.trim()) return undefined;

  window.localStorage.setItem(STORAGE_KEY, password.trim());
  return password.trim();
}
