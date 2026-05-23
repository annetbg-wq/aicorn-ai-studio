export interface JsonSchemaValidationResult {
  ok: boolean;
  reason?: string;
}

export interface ExtractJsonObjectFromModelTextOptions {
  validate?: (value: unknown) => JsonSchemaValidationResult;
}

export type ExtractJsonObjectFromModelTextResult =
  | {
      ok: true;
      jsonText: string;
      value: unknown;
      rawSnippet: string;
      candidateCount: number;
      selectedCandidateIndex: number;
    }
  | {
      ok: false;
      error: string;
      rawSnippet: string;
      candidateCount: number;
      candidateJsonText?: string;
      candidateSnippet?: string;
      parseError?: string;
      schemaError?: string;
    };

interface JsonCandidate {
  jsonText: string;
}

const DEFAULT_SNIPPET_LENGTH = 280;

export function safeModelTextSnippet(raw: string, maxLength = DEFAULT_SNIPPET_LENGTH): string {
  const normalized = raw
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '(empty)';
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(1, maxLength - 3))}...`
    : normalized;
}

export function extractJsonObjectFromModelText(
  raw: string,
  options: ExtractJsonObjectFromModelTextOptions = {},
): ExtractJsonObjectFromModelTextResult {
  const normalized = normalizeModelText(raw);
  const candidates = collectJsonObjectCandidates(normalized);
  const rawSnippet = safeModelTextSnippet(normalized);
  const parsedCandidates: Array<{ candidate: JsonCandidate; value: unknown; index: number }> = [];
  let firstParseFailure: { candidate: JsonCandidate; message: string } | null = null;
  let firstSchemaFailure: { candidate: JsonCandidate; reason: string } | null = null;

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    let value: unknown;
    try {
      value = JSON.parse(candidate.jsonText);
    } catch (error) {
      if (!firstParseFailure) {
        firstParseFailure = {
          candidate,
          message: error instanceof Error ? error.message : String(error),
        };
      }
      continue;
    }

    if (options.validate) {
      const validation = options.validate(value);
      if (validation.ok) {
        return {
          ok: true,
          jsonText: candidate.jsonText,
          value,
          rawSnippet,
          candidateCount: candidates.length,
          selectedCandidateIndex: index,
        };
      }

      if (!firstSchemaFailure) {
        firstSchemaFailure = {
          candidate,
          reason: validation.reason || 'schema rejected candidate',
        };
      }
      continue;
    }

    parsedCandidates.push({ candidate, value, index });
  }

  if (!options.validate) {
    if (parsedCandidates.length === 1) {
      const [selected] = parsedCandidates;
      return {
        ok: true,
        jsonText: selected.candidate.jsonText,
        value: selected.value,
        rawSnippet,
        candidateCount: candidates.length,
        selectedCandidateIndex: selected.index,
      };
    }

    if (parsedCandidates.length > 1) {
      const candidateJsonText = parsedCandidates[0].candidate.jsonText;
      return {
        ok: false,
        error: 'Multiple JSON objects found; unable to choose a single candidate safely',
        rawSnippet,
        candidateCount: candidates.length,
        candidateJsonText,
        candidateSnippet: safeModelTextSnippet(candidateJsonText),
      };
    }
  }

  if (firstSchemaFailure) {
    return {
      ok: false,
      error: `JSON parsed but schema validation failed: ${firstSchemaFailure.reason}`,
      rawSnippet,
      candidateCount: candidates.length,
      candidateJsonText: firstSchemaFailure.candidate.jsonText,
      candidateSnippet: safeModelTextSnippet(firstSchemaFailure.candidate.jsonText),
      schemaError: firstSchemaFailure.reason,
    };
  }

  if (firstParseFailure) {
    return {
      ok: false,
      error: `JSON candidate could not be parsed: ${firstParseFailure.message}`,
      rawSnippet,
      candidateCount: candidates.length,
      candidateJsonText: firstParseFailure.candidate.jsonText,
      candidateSnippet: safeModelTextSnippet(firstParseFailure.candidate.jsonText),
      parseError: firstParseFailure.message,
    };
  }

  return {
    ok: false,
    error: 'No JSON object found in model output',
    rawSnippet,
    candidateCount: 0,
  };
}

export function validateArchitectJsonShape(
  value: unknown,
  options: { minFileEntries?: number } = {},
): JsonSchemaValidationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'top-level JSON must be an object' };
  }

  const obj = value as Record<string, unknown>;
  if (typeof obj.appName !== 'string' || obj.appName.trim().length === 0) {
    return { ok: false, reason: 'missing non-empty appName' };
  }

  const skeleton =
    typeof obj.skeleton === 'string'
      ? obj.skeleton
      : typeof obj.skeletonId === 'string'
      ? obj.skeletonId
      : '';
  if (!skeleton.trim()) {
    return { ok: false, reason: 'missing non-empty skeleton' };
  }

  const fileTreeCount = countUsableFileTreeEntries(obj.fileTree);
  const legacyDeltaCount = countUsableDeltaEntries(obj.deltaFiles);
  const usableFileCount = Math.max(fileTreeCount, legacyDeltaCount);
  if (usableFileCount === 0) {
    return { ok: false, reason: 'missing usable fileTree or deltaFiles entries' };
  }

  if (options.minFileEntries && usableFileCount < options.minFileEntries) {
    return {
      ok: false,
      reason: `expected at least ${options.minFileEntries} usable fileTree/deltaFiles entries, got ${usableFileCount}`,
    };
  }

  return { ok: true };
}

function normalizeModelText(raw: string): string {
  return raw.replace(/^\uFEFF/, '').trim();
}

function collectJsonObjectCandidates(raw: string): JsonCandidate[] {
  const candidates: JsonCandidate[] = [];
  const seen = new Set<string>();

  const add = (jsonText: string | null) => {
    if (!jsonText) return;
    const normalized = jsonText.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push({ jsonText: normalized });
  };

  if (looksLikeWholeJsonObject(raw)) {
    add(raw);
  }
  add(extractWholeFenceContent(raw));
  for (const candidate of collectBalancedObjectCandidates(raw)) {
    add(candidate);
  }

  return candidates;
}

function extractWholeFenceContent(raw: string): string | null {
  const match = /^```(?:json)?[^\S\r\n]*(?:\r?\n)?([\s\S]*?)\r?\n?\s*```$/i.exec(raw);
  if (!match) return null;
  const content = match[1]?.trim() ?? '';
  return content || null;
}

function looksLikeWholeJsonObject(raw: string): boolean {
  return raw.startsWith('{') && raw.endsWith('}');
}

function collectBalancedObjectCandidates(raw: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }

    if (ch !== '}') continue;
    if (depth === 0) continue;

    depth--;
    if (depth === 0 && start !== -1) {
      candidates.push(raw.slice(start, i + 1));
      start = -1;
    }
  }

  return candidates;
}

function countUsableFileTreeEntries(fileTree: unknown): number {
  if (!fileTree || typeof fileTree !== 'object' || Array.isArray(fileTree)) return 0;
  return Object.entries(fileTree as Record<string, unknown>).filter(([path, purpose]) => (
    path.trim().length > 0 &&
    typeof purpose === 'string' &&
    purpose.trim().length > 0
  )).length;
}

function countUsableDeltaEntries(deltaFiles: unknown): number {
  if (!Array.isArray(deltaFiles)) return 0;
  return deltaFiles.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as Record<string, unknown>;
    return (
      typeof candidate.path === 'string' &&
      candidate.path.trim().length > 0 &&
      typeof candidate.purpose === 'string' &&
      candidate.purpose.trim().length > 0
    );
  }).length;
}
