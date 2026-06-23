/**
 * DocumentPackageRegistry
 *
 * Topic-keyed store of generated product-document packages so the studio does not
 * regenerate a package for a topic it has already produced. Keyed by the package's
 * TopicMarker.key (see ProductDocumentSet.computeTopicMarker) — equal keys mean the
 * same topic, so the existing package is taken into work instead of a new one.
 *
 * Storage: localStorage. Each package lives under its own key (the doc files can be
 * sizeable); a small index lists what exists for fast lookup + LRU eviction.
 */
import type { ProductDocumentSetResult, TopicMarker } from './ProductDocumentSet';

const INDEX_KEY = 'AIC_DOC_PKG_INDEX';
const ENTRY_PREFIX = 'AIC_DOC_PKG_';
const MAX_PACKAGES = 40;

export interface StoredDocPackage {
  marker:  TopicMarker;
  savedAt: string;
  /** The full materialized result, so a reuse returns an identical shape. */
  result:  ProductDocumentSetResult;
}

interface IndexEntry {
  key:       string;
  label:     string;
  appName:   string;
  savedAt:   string;
  fileCount: number;
}

function readIndex(): IndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(index: IndexEntry[]): void {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(index)); } catch { /* quota — best effort */ }
}

function entryKey(topicKey: string): string {
  return `${ENTRY_PREFIX}${topicKey}`;
}

export const DocumentPackageRegistry = {
  /** Returns the stored package for a topic key, or null if none exists. */
  findByTopic(topicKey: string): StoredDocPackage | null {
    if (!topicKey) return null;
    try {
      const raw = localStorage.getItem(entryKey(topicKey));
      return raw ? (JSON.parse(raw) as StoredDocPackage) : null;
    } catch {
      return null;
    }
  },

  /** True when a package already exists for this topic. */
  has(topicKey: string): boolean {
    return Boolean(topicKey) && localStorage.getItem(entryKey(topicKey)) !== null;
  },

  /**
   * Stores a package under its topic key. Re-saving the same key refreshes it
   * (kept most-recent). Evicts the least-recently-saved package past the cap.
   */
  save(pkg: StoredDocPackage): void {
    const topicKey = pkg.marker.key;
    if (!topicKey) return;
    try {
      localStorage.setItem(entryKey(topicKey), JSON.stringify(pkg));
    } catch {
      return; // quota — do not corrupt the index if the body did not persist
    }
    const index = readIndex().filter(e => e.key !== topicKey);
    index.push({
      key:       topicKey,
      label:     pkg.marker.label,
      appName:   pkg.result.productDocs.productVision.appName,
      savedAt:   pkg.savedAt,
      fileCount: Object.keys(pkg.result.files).length,
    });
    index.sort((a, b) => a.savedAt.localeCompare(b.savedAt)); // oldest first
    while (index.length > MAX_PACKAGES) {
      const evicted = index.shift();
      if (evicted) { try { localStorage.removeItem(entryKey(evicted.key)); } catch { /* ignore */ } }
    }
    writeIndex(index);
  },

  /** Lightweight listing of stored packages (newest first). */
  list(): IndexEntry[] {
    return readIndex().slice().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },

  /** Test/maintenance helper. */
  clear(): void {
    for (const e of readIndex()) { try { localStorage.removeItem(entryKey(e.key)); } catch { /* ignore */ } }
    try { localStorage.removeItem(INDEX_KEY); } catch { /* ignore */ }
  },
};
