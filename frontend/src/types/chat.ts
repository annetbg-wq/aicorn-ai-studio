/**
 * types/chat.ts — backward-compat re-export barrel.
 *
 * Canonical source of truth has moved to lib/chat.ts.
 * All chat types, helpers and the reducer are defined there.
 * This file exists only so existing import paths keep working.
 */
export {
  createMessageId,
  ensureMessageId,
  normalizeMessage,
  normalizeMessages,
  chatReducer,
} from '../lib/chat';

export type {
  ChatMessageRole,
  ChatMessageType,
  ChatMessage,
  ChatAction,
} from '../lib/chat';

