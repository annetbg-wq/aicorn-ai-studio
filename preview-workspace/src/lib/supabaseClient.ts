// Supabase client — placeholder
// In production, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

// Minimal mock when env vars are not set
function createMockClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
      upsert: async () => ({ error: null }),
    }),
  };
}

// Always use mock in preview — Supabase env vars are not configured
export const supabase = createMockClient();
