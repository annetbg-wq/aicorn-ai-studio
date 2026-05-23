export const DEV_BYPASS_KEY = 'AIC_DEV_AUTH_BYPASS';

function resolveHostname(hostname?: string): string {
  if (typeof hostname === 'string') {
    return hostname.trim().toLowerCase();
  }
  if (typeof window === 'undefined') {
    return '';
  }
  return window.location.hostname.trim().toLowerCase();
}

export function normalizeEmail(email?: string | null): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isLocalDevHost(hostname?: string): boolean {
  const host = resolveHostname(hostname);
  return host === 'localhost' || host === '127.0.0.1';
}

export function canUseDevAuthBypass(
  hostname?: string,
  bypassValue?: string | null,
): boolean {
  const effectiveBypassValue = typeof bypassValue === 'string'
    ? bypassValue
    : typeof localStorage !== 'undefined'
      ? localStorage.getItem(DEV_BYPASS_KEY)
      : null;

  return isLocalDevHost(hostname) && effectiveBypassValue === '1';
}

const DEFAULT_FOUNDER_ADMIN_EMAILS: string[] = [
  'annetdenr@gmail.com',
  'vkdevproai@gmail.com',
];

export function isFounderAdminEmail(email?: string | null): boolean {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  const rawEnvEmails = String(import.meta.env.VITE_FOUNDER_ADMIN_EMAILS ?? '');
  const envEmails = rawEnvEmails
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter((entry): entry is string => entry !== null);

  const allFounderEmails = new Set([
    ...DEFAULT_FOUNDER_ADMIN_EMAILS,
    ...envEmails,
  ]);

  return allFounderEmails.has(normalizedEmail);
}

export function isCreatorMode(): boolean {
  return canUseDevAuthBypass();
}
