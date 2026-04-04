/**
 * external_services.ts — Centralized API key config for AI Posture Coach.
 *
 * SETUP: Replace all 'REPLACE_ME' values before going to production.
 * The app works in DEMO MODE with mock data until keys are filled.
 */

export const CONFIG = {

  OPENAI: {
    API_KEY: 'sk-REPLACE_ME',            // get at: https://platform.openai.com/api-keys
    MODEL:   'gpt-4o',                   // Vision-capable model (gpt-4o or gpt-4-vision-preview)
    MAX_TOKENS: 300,                      // Vision response is short JSON
  },

  SUPABASE: {
    URL:      import.meta.env.VITE_SUPABASE_URL      ?? '', // Supabase Dashboard → Settings → API
    ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '', // same page, "anon public" key
  },

  POSTURE: {
    SNAPSHOT_INTERVAL_MS: 60_000,  // webcam capture every 60 seconds
    ALERT_SCORE_THRESHOLD: 60,     // score below this → show alert + browser notification
    FREE_TIER_HOURS_PER_DAY: 1,    // free plan daily limit
    IMAGE_QUALITY: 0.85,           // JPEG quality for snapshot (0.0–1.0)
    IMAGE_DETAIL: 'low' as const,  // OpenAI Vision detail level ('low' = cheaper, enough for posture)
  },

} as const;
