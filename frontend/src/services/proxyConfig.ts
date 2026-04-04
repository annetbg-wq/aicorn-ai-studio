/**
 * proxyConfig — Supabase Edge Function coordinates for the Figma Proxy Engine.
 *
 * The anon key is intentionally public-safe — it is Supabase's anon role key
 * that can only read/call public functions. The FIGMA_MASTER_TOKEN and
 * FIGMA_CLIENT_SECRET never leave the Edge Function environment.
 */

export const FIGMA_PROXY_URL  = 'https://zdzuaodphrlpvorutpyc.supabase.co/functions/v1/figma-proxy';
export const FIGMA_PROXY_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkenVhb2RwaHJscHZvcnV0cHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDIyMTIsImV4cCI6MjA4NzUxODIxMn0.7L5sYMedvIKnU7o0X280Y92rUTAs86Q4RwBJsppuFxI';

/** POST helper — wraps every Edge Function call with the correct headers. */
export async function proxyPost(body: Record<string, unknown>): Promise<Response> {
  return fetch(FIGMA_PROXY_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${FIGMA_PROXY_ANON}`,
    },
    body: JSON.stringify(body),
  });
}
