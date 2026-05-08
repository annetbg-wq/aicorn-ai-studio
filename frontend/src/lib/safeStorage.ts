/**
 * safeStorage.ts — localStorage wrapper that handles QuotaExceededError.
 *
 * On quota exceeded: clears screenshot cache and old snapshots, then retries once.
 */

const SCREENSHOT_PREFIX = 'screenshot_';

/** Clear screenshot cache entries from localStorage. */
function clearScreenshotCache(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(SCREENSHOT_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}

/** Remove oldest snapshots, keeping only the last 5. */
function pruneOldSnapshots(): void {
  try {
    const raw = localStorage.getItem('SNAPSHOTS');
    if (!raw) return;
    const all: unknown[] = JSON.parse(raw);
    if (all.length > 5) {
      localStorage.setItem('SNAPSHOTS', JSON.stringify(all.slice(-5)));
    }
  } catch { /* best-effort */ }
}

/** Aggressively free space: remove large expendable keys. */
function aggressiveCleanup(skipKey: string): void {
  const expendable = ['LAST_CODE', 'LAST_FILES'];
  for (const k of expendable) {
    if (k !== skipKey) localStorage.removeItem(k);
  }
  // Truncate chat history to last 10 messages if present
  try {
    const chatRaw = localStorage.getItem('CHAT_HISTORY');
    if (chatRaw) {
      const msgs: unknown[] = JSON.parse(chatRaw);
      if (msgs.length > 10) {
        localStorage.setItem('CHAT_HISTORY', JSON.stringify(msgs.slice(-10)));
      }
    }
  } catch { /* best-effort */ }
}

/**
 * Safe wrapper around localStorage.setItem.
 * On QuotaExceededError: purges expendable caches and retries once.
 * Returns true if the write succeeded, false otherwise.
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[safeStorage] QuotaExceededError — clearing caches and retrying…');
      clearScreenshotCache();
      pruneOldSnapshots();
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        // Still over quota — try aggressive cleanup
        aggressiveCleanup(key);
        try {
          localStorage.setItem(key, value);
          return true;
        } catch {
          console.error('[safeStorage] Still over quota after cleanup for key:', key);
          return false;
        }
      }
    }
    // Non-quota error (storage blocked, etc.)
    return false;
  }
}
