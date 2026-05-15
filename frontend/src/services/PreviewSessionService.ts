const PREVIEW_SESSION_STORAGE_KEY = 'AIC_PREVIEW_SESSION_ID';

let inMemoryPreviewSessionToken: string | null = null;

function isUsablePreviewSessionToken(value: string | null): value is string {
  if (typeof value !== 'string') return false;
  const token = value.trim();
  return token.length >= 16 && token.length <= 200;
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createPreviewSessionToken(): string {
  const cryptoSource = globalThis.crypto;
  if (typeof cryptoSource?.randomUUID === 'function') {
    return cryptoSource.randomUUID();
  }

  if (typeof cryptoSource?.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    cryptoSource.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  const randomParts = Array.from(
    { length: 4 },
    () => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36),
  );
  return `${Date.now().toString(36)}-${randomParts.join('-')}`;
}

export function getPreviewSessionToken(): string {
  const storage = getSessionStorage();
  const storedToken = storage?.getItem(PREVIEW_SESSION_STORAGE_KEY) ?? null;
  if (isUsablePreviewSessionToken(storedToken)) {
    const token = storedToken.trim();
    inMemoryPreviewSessionToken = token;
    return token;
  }

  if (isUsablePreviewSessionToken(inMemoryPreviewSessionToken)) {
    return inMemoryPreviewSessionToken.trim();
  }

  const token = createPreviewSessionToken();
  inMemoryPreviewSessionToken = token;
  try {
    storage?.setItem(PREVIEW_SESSION_STORAGE_KEY, token);
  } catch {
    // Keep the in-memory token for environments where sessionStorage is blocked.
  }
  return token;
}

export function appendPreviewSessionToUrl(url: string): string {
  if (!url) return url;

  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : 'http://aic-preview.local';
  const isAbsolute = /^[a-z][a-z\d+\-.]*:/i.test(url) || url.startsWith('//');

  try {
    const parsed = new URL(url, baseUrl);
    if (parsed.searchParams.has('previewSession')) {
      return url;
    }

    parsed.searchParams.set('previewSession', getPreviewSessionToken());
    return isAbsolute
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const hashIndex = url.indexOf('#');
    const pathAndSearch = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
    if (/(^|[?&])previewSession=/.test(pathAndSearch)) {
      return url;
    }
    const separator = pathAndSearch.includes('?') ? '&' : '?';
    return `${pathAndSearch}${separator}previewSession=${encodeURIComponent(getPreviewSessionToken())}${hash}`;
  }
}
