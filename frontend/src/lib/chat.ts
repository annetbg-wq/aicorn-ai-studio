/**
 * lib/chat.ts — Single source of truth for chat state types and reducer.
 *
 * All chat mutations go through chatReducer(state, action).
 * No direct array mutations. No setMessages(). No setTimeout around dispatch().
 *
 * Action types:
 *   APPEND            — push one normalized message (deduped by id)
 *   APPEND_MANY       — push multiple normalized messages
 *   RESET             — replace entire list (e.g. new project, load history)
 *   LOAD_HISTORY      — alias for RESET used when restoring from storage
 *   PATCH_LAST        — update last user/assistant message (skips blueprint/plan)
 *   REMOVE_BY_TYPE    — filter out messages of a given type
 *   UPSERT_BY_ID      — update-or-insert by stable id
 *   UPDATE_BY_ID      — patch fields on message with matching id
 *   UPDATE_STEPS      — patch a step inside a generation-plan message
 *   SET_BLUEPRINT_VISIBLE — show/hide blueprint card without removing from DOM
 *   FILTER            — arbitrary predicate filter (escape hatch)
 */

export type ChatMessageRole = 'user' | 'assistant' | 'system';
export type ChatMessageType =
  | 'user'
  | 'assistant'
  | 'system'
  | 'text'
  | 'blueprint'
  | 'generation-plan'
  | 'generation-report'
  | 'clarification'
  | 'error'
  | 'info';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  type?: ChatMessageType;
  /** May be a string or a vision content array (image_url + text parts). */
  content: string | any[];
  timestamp: number;

  // generation-plan fields
  appName?: string;
  pages?: string[];
  steps?: any[];
  progress?: number;
  buildStatus?: 'generating' | 'building' | 'ready';
  streamingCode?: string;

  // blueprint fields
  blueprintVisible?: boolean;
  blueprintText?: string;
  plan?: any;
  theme?: string;

  // generation-report fields
  report?: any;

  // clarification fields
  questions?: string[];

  // error-handling fields
  retryable?: boolean;

  [key: string]: any;
}

// ── helpers ───────────────────────────────────────────────────────────────────

export function createMessageId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Guarantees msg.id is set. Mutates in place and returns the same object.
 * Call this at every APPEND site so ids are stable before React sees the message.
 */
export function ensureMessageId(msg: any): any {
  if (msg?.id) return msg;
  return { ...msg, id: createMessageId() };
}

/**
 * Normalize a raw message object from localStorage or in-memory:
 * - Ensures id, role, type, content, timestamp exist
 * - Spreads all original fields first so unknown fields are preserved
 * - id is always guaranteed (generated if missing)
 */
export function normalizeMessage(raw: any, index = 0): ChatMessage {
  return ensureMessageId({
    id: raw?.id ?? createMessageId(),
    timestamp:
      typeof raw?.timestamp === 'number'
        ? raw.timestamp
        : Date.now() + index,
    ...raw,
  }) as ChatMessage;
}

export function normalizeMessages(raw: any[]): ChatMessage[] {
  return Array.isArray(raw) ? raw.map((m, i) => normalizeMessage(m, i)) : [];
}

// ── action types ──────────────────────────────────────────────────────────────

export type ChatAction =
  | { type: 'LOAD_HISTORY'; payload: any[] }
  | { type: 'RESET'; payload?: any[] }
  | { type: 'APPEND'; payload: any }
  | { type: 'APPEND_MANY'; payload: any[] }
  | { type: 'CLEAR_PENDING_PLANS' }
  | { type: 'UPDATE_BY_ID'; id: string; patch: Partial<ChatMessage> }
  | { type: 'UPSERT_BY_ID'; payload: any }
  | { type: 'UPDATE_STEPS'; id: string; stepId: string; stepStatus: string }
  | { type: 'PATCH_LAST'; patch: Partial<ChatMessage>; when?: (msg: ChatMessage) => boolean }
  | { type: 'REMOVE_BY_TYPE'; msgType: string }
  | { type: 'SET_BLUEPRINT_VISIBLE'; id: string; visible: boolean }
  | { type: 'FILTER'; predicate: (msg: ChatMessage) => boolean };

// ── reducer ───────────────────────────────────────────────────────────────────

/**
 * Pure reducer — all chat state transitions go through here.
 *
 * Invariants:
 *   - No side-effects (no localStorage, no commandBus, no setTimeout)
 *   - APPEND is idempotent: duplicate ids are silently dropped
 *   - PATCH_LAST skips blueprint/generation-plan/system messages
 *   - Actions are applied in call order; React batches them within an event
 */
export function chatReducer(state: ChatMessage[], action: ChatAction): ChatMessage[] {
  switch (action.type) {

    case 'LOAD_HISTORY':
      return normalizeMessages(action.payload);

    case 'RESET':
      return normalizeMessages(action.payload ?? []);

    case 'APPEND': {
      const normalized = ensureMessageId(normalizeMessage(action.payload, state.length));
      // Idempotency guard — drop duplicates by stable id
      if (state.some(msg => msg.id === normalized.id)) return state;
      return [...state, normalized];
    }

    case 'APPEND_MANY':
      return [...state, ...normalizeMessages(action.payload)];

    case 'CLEAR_PENDING_PLANS':
      return state.map(msg => ({ ...msg, isPending: false }));

    case 'UPDATE_BY_ID':
      return state.map(msg =>
        msg.id === action.id ? { ...msg, ...action.patch } : msg,
      );

    case 'UPSERT_BY_ID': {
      const upserted = ensureMessageId(normalizeMessage(action.payload, state.length));
      const exists = state.some(msg => msg.id === upserted.id);
      if (exists) {
        return state.map(msg => msg.id === upserted.id ? { ...msg, ...upserted } : msg);
      }
      return [...state, upserted];
    }

    case 'SET_BLUEPRINT_VISIBLE':
      return state.map(msg =>
        msg.id === action.id ? { ...msg, blueprintVisible: action.visible } : msg,
      );

    case 'UPDATE_STEPS':
      return state.map(msg => {
        if (msg.id !== action.id) return msg;
        return {
          ...msg,
          steps: (msg.steps ?? []).map((s: any) =>
            s.id === action.stepId ? { ...s, status: action.stepStatus } : s,
          ),
        };
      });

    case 'PATCH_LAST': {
      // Skip blueprint/generation-plan/system cards — only patch real user/assistant turns.
      const SYSTEM_TYPES = new Set(['generation-plan', 'blueprint', 'system']);
      const idx = [...state].reverse().findIndex(
        msg =>
          !SYSTEM_TYPES.has(msg.type ?? '') &&
          (msg.role === 'user' || msg.role === 'assistant'),
      );
      if (idx === -1) return state;
      const targetIdx = state.length - 1 - idx;
      const target = state[targetIdx];
      if (action.when && !action.when(target)) return state;
      return [
        ...state.slice(0, targetIdx),
        { ...target, ...action.patch },
        ...state.slice(targetIdx + 1),
      ];
    }

    case 'REMOVE_BY_TYPE':
      return state.filter(msg => msg.type !== action.msgType);

    case 'FILTER':
      return state.filter(action.predicate);

    default:
      return state;
  }
}
