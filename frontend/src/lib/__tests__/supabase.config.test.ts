// @vitest-environment jsdom
//
// Regression test for the OAuth "returns to login screen" bug: signInWithOAuth's
// PKCE redirect lands back on this app with ?code=... in the URL, and it is
// detectSessionInUrl:true that tells the Supabase client to exchange that code
// for a session on load. Nothing else in the app calls exchangeCodeForSession
// manually, so if this regresses to false again, Google sign-in silently never
// creates a session and AuthGate falls through to the login page every time —
// exactly what happened once already (see git history of lib/supabase.ts).
import { describe, expect, it, vi } from 'vitest';

const createClientMock = vi.hoisted(() => vi.fn(
  (_url: string, _key: string, _options: { auth: Record<string, unknown> }) => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }),
));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

describe('supabase client auth config', () => {
  it('enables detectSessionInUrl so the PKCE OAuth redirect code gets exchanged for a session', async () => {
    await import('../supabase');

    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [, , options] = createClientMock.mock.calls[0];
    expect(options.auth.detectSessionInUrl).toBe(true);
    expect(options.auth.flowType).toBe('pkce');
  });
});
