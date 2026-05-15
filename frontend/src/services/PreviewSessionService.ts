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
