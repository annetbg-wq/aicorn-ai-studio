// chat.ts — Normalized chat message types + reducer
// Migration-safe: normalizeMessage preserves all unknown fields
// and assigns stable ids to messages that lack them.

export type ChatMessageRole = 'user' | 'assistant' | 'system';
export type ChatMessageType =
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
  blueprintText?: string;
  plan?: any;
  theme?: string;

  // generation-report fields
  report?: any;

  // clarification fields
  questions?: string[];

  [key: string]: any;
}

// ── helpers ───────────────────────────────────────────────────────────────────

export function createMessageId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalize a raw message object from localStorage or in-memory:
 * - Ensures id, role, type, content, timestamp exist
 * - Spreads all original fields first so unknown fields are preserved
 * - id is always guaranteed (generated if missing)
 */
export function normalizeMessage(raw: any, index = 0): ChatMessage {
  return {
    ...raw,
    id: raw?.id ?? createMessageId(),
    role: raw?.role ?? 'assistant',
    type: raw?.type ?? 'text',
    content: raw?.content ?? '',
    timestamp:
      typeof raw?.timestamp === 'number'
        ? raw.timestamp
        : Date.now() + index,
  };
}

export function normalizeMessages(raw: any[]): ChatMessage[] {
  return Array.isArray(raw) ? raw.map((m, i) => normalizeMessage(m, i)) : [];
}

// ── reducer ───────────────────────────────────────────────────────────────────

export type ChatAction =
  | { type: 'LOAD_HISTORY'; payload: any[] }
  | { type: 'RESET'; payload?: any[] }
  | { type: 'APPEND'; payload: any }
  | { type: 'APPEND_MANY'; payload: any[] }
  | { type: 'UPDATE_BY_ID'; id: string; patch: Partial<ChatMessage> }
  | { type: 'UPDATE_STEPS'; id: string; stepId: string; stepStatus: string }
  | { type: 'PATCH_LAST'; patch: Partial<ChatMessage>; when?: (msg: ChatMessage) => boolean }
  | { type: 'REMOVE_BY_TYPE'; msgType: string }
  | { type: 'FILTER'; predicate: (msg: ChatMessage) => boolean };

export function chatReducer(state: ChatMessage[], action: ChatAction): ChatMessage[] {
  switch (action.type) {
    case 'LOAD_HISTORY':
      return normalizeMessages(action.payload);
    case 'RESET':
      return normalizeMessages(action.payload ?? []);
    case 'APPEND':
      return [...state, normalizeMessage(action.payload, state.length)];
    case 'APPEND_MANY':
      return [...state, ...normalizeMessages(action.payload)];
    case 'UPDATE_BY_ID':
      return state.map(msg =>
        msg.id === action.id ? { ...msg, ...action.patch } : msg
      );
    case 'UPDATE_STEPS':
      return state.map(msg => {
        if (msg.id !== action.id) return msg;
        return {
          ...msg,
          steps: (msg.steps ?? []).map((s: any) =>
            s.id === action.stepId ? { ...s, status: action.stepStatus } : s
          ),
        };
      });
    case 'PATCH_LAST': {
      if (state.length === 0) return state;
      const last = state[state.length - 1];
      if (action.when && !action.when(last)) return state;
      return [...state.slice(0, -1), { ...last, ...action.patch }];
    }
    case 'REMOVE_BY_TYPE':
      return state.filter(msg => msg.type !== action.msgType);
    case 'FILTER':
      return state.filter(action.predicate);
    default:
      return state;
  }
}
