/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import type { WebSocketLikeConstructor } from '@supabase/realtime-js';

// Primary: env vars (build time)
// Fallback: localStorage (persisted from Settings UI)
// Last resort: hardcoded dev values

// Guard: localStorage is not available in Node/Vitest environments
const _localStorage: Storage | undefined =
  typeof localStorage !== 'undefined' ? localStorage : undefined;

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  _localStorage?.getItem('SUPABASE_URL') ||
  'https://zdzuaodphrlpvorutpyc.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  _localStorage?.getItem('SUPABASE_ANON_KEY') ||
  '';

// Persist to localStorage so it survives .env changes
if (_localStorage && SUPABASE_URL && !SUPABASE_URL.includes('placeholder')) {
  try {
    _localStorage.setItem('SUPABASE_URL', SUPABASE_URL);
    _localStorage.setItem('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY);
  } catch { /* quota / blocked */ }
}

// Node.js < 22 has no native WebSocket. Supabase realtime-js throws at
// createClient() time if no transport is provided. Supply a no-op stub so
// module import succeeds in CI/Vitest node environments — the realtime client
// never actually connects in tests (no .channel().subscribe() calls).
// In browsers and Node 22+, WebSocket is always available and this is unused.
const _realtimeTransport: WebSocketLikeConstructor | undefined =
  typeof WebSocket === 'undefined'
    ? (class _NoopWS {
        readyState = 3;
        url = '';
        protocol = '';
        onopen:    ((this: any, ev: Event) => any) | null = null;
        onmessage: ((this: any, ev: MessageEvent) => any) | null = null;
        onclose:   ((this: any, ev: CloseEvent) => any) | null = null;
        onerror:   ((this: any, ev: Event) => any) | null = null;
        CONNECTING = 0; OPEN = 1; CLOSING = 2; CLOSED = 3;
        constructor(_url: string | URL) {}
        close(_code?: number, _reason?: string): void {}
        send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {}
        addEventListener(_type: string, _listener: EventListener): void {}
        removeEventListener(_type: string, _listener: EventListener): void {}
      } as unknown as WebSocketLikeConstructor)
    : undefined;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Full navigator.locks bypass for iframe/sandbox previews.
    lock: async (_name: string, _acquireTimeout: number = 0, fn: () => Promise<any>) => {
      return await fn();
    },
    flowType:           'pkce',
    autoRefreshToken:   true,
    persistSession:     true,
    // Must be true: signInWithOAuth's PKCE redirect lands back on this app with
    // ?code=... in the URL. This is what tells the client to exchange it for a
    // session on load. Nothing else in the app calls exchangeCodeForSession
    // manually — with this false, the code is never exchanged, no session is
    // ever created, and AuthGate falls through to the login screen every time.
    detectSessionInUrl: true,
    storage:            _localStorage,
  },
  ...(_realtimeTransport ? { realtime: { transport: _realtimeTransport } } : {}),
});

console.log('[Supabase] Connected to:', SUPABASE_URL);

// Типы для удобства
export type SupabaseUser = {
  id:          string;
  email?:      string;
  name?:       string;
  avatar_url?: string;
  provider?:   string;
  role?:       string | null;
};

export function getUserFromSession(session: any): SupabaseUser | null {
  const user = session?.user;
  if (!user) return null;
  return {
    id:         user.id,
    email:      user.email,
    name:       user.user_metadata?.full_name ?? user.email,
    avatar_url: user.user_metadata?.avatar_url,
    provider:   user.app_metadata?.provider,
    role:       user.role ?? user.app_metadata?.role ?? null,
  };
}
