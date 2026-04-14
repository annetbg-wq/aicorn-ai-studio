// chat.reducer.test.ts — race-scenario coverage for chatReducer
import { describe, it, expect } from 'vitest';
import { chatReducer, ChatMessage } from './chat';

// ── helpers ────────────────────────────────────────────────────────────────────

function msg(overrides: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    role: 'assistant',
    type: 'text',
    content: '',
    timestamp: 1000,
    ...overrides,
  };
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('chatReducer', () => {
  // 1. APPEND -> APPEND -> RESET -> стейт пустой
  it('RESET clears state after two APPENDs', () => {
    let state: ChatMessage[] = [];
    state = chatReducer(state, { type: 'APPEND', payload: msg({ id: 'a', role: 'user' }) });
    state = chatReducer(state, { type: 'APPEND', payload: msg({ id: 'b', role: 'assistant' }) });
    state = chatReducer(state, { type: 'RESET' });
    expect(state).toHaveLength(0);
  });

  // 2. APPEND {id:1} -> APPEND {id:1} -> в стейте 1 элемент, не 2
  it('APPEND deduplicates by id', () => {
    let state: ChatMessage[] = [];
    const payload = msg({ id: 'dup-1', role: 'user', content: 'hello' });
    state = chatReducer(state, { type: 'APPEND', payload });
    state = chatReducer(state, { type: 'APPEND', payload });
    expect(state).toHaveLength(1);
  });

  // 3. [user, blueprint, assistant] + PATCH_LAST -> меняется только assistant
  it('PATCH_LAST skips blueprint and patches assistant', () => {
    const userMsg      = msg({ id: 'u1', role: 'user',      type: 'text',      content: 'hi' });
    const blueprintMsg = msg({ id: 'b1', role: 'assistant', type: 'blueprint', content: '' });
    const assistantMsg = msg({ id: 'a1', role: 'assistant', type: 'text',      content: 'original' });

    let state: ChatMessage[] = [userMsg, blueprintMsg, assistantMsg];
    state = chatReducer(state, { type: 'PATCH_LAST', patch: { content: 'patched' } });

    expect(state[0].content).toBe('hi');           // user — untouched
    expect(state[1].content).toBe('');             // blueprint — untouched
    expect(state[2].content).toBe('patched');      // assistant — patched
  });

  // 4. RESET + APPEND в одном тике -> побеждает APPEND (два dispatch подряд)
  it('RESET followed immediately by APPEND results in one message', () => {
    let state: ChatMessage[] = [
      msg({ id: 'old-1', role: 'user', content: 'old' }),
    ];
    // Simulate two synchronous dispatches in a single tick
    state = chatReducer(state, { type: 'RESET' });
    state = chatReducer(state, { type: 'APPEND', payload: msg({ id: 'new-1', role: 'assistant', content: 'fresh' }) });

    expect(state).toHaveLength(1);
    expect(state[0].id).toBe('new-1');
    expect(state[0].content).toBe('fresh');
  });

  // 5. REMOVE_BY_TYPE 'blueprint' -> удаляет только blueprint, порядок остальных не меняется
  it('REMOVE_BY_TYPE removes only blueprint messages and preserves order', () => {
    const m1 = msg({ id: '1', role: 'user',      type: 'text',      content: 'A' });
    const m2 = msg({ id: '2', role: 'assistant', type: 'blueprint', content: 'B' });
    const m3 = msg({ id: '3', role: 'assistant', type: 'text',      content: 'C' });
    const m4 = msg({ id: '4', role: 'assistant', type: 'blueprint', content: 'D' });
    const m5 = msg({ id: '5', role: 'user',      type: 'text',      content: 'E' });

    const state = chatReducer([m1, m2, m3, m4, m5], { type: 'REMOVE_BY_TYPE', msgType: 'blueprint' });

    expect(state).toHaveLength(3);
    expect(state.map(m => m.id)).toEqual(['1', '3', '5']);
  });
});
