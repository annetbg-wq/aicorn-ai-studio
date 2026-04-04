/**
 * @description AI Posture Analysis via OpenAI Vision API.
 * Accepts a base64 JPEG webcam snapshot and returns a structured
 * posture assessment: score 0-100, issue list, corrective tips.
 *
 * Falls back to realistic mock data if API key is not configured,
 * so the Phase 1 UI works immediately without any keys.
 *
 * @example
 *   const frame = cameraService.captureFrame();
 *   if (frame) {
 *     const result = await PostureAnalysisService.analyze(frame);
 *     console.log(result.score, result.issues);
 *   }
 */

import { CONFIG } from '../config/external_services';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PostureResult {
  score:       number;             // 0–100 (100 = perfect posture)
  issues:      string[];           // e.g. ["Neck tilted forward 15°", "Left shoulder raised"]
  tips:        string[];           // corrective suggestions
  confidence:  'high' | 'medium' | 'low';
  isMock?:     boolean;            // true when returned from dev fallback
}

// ── System prompt (sent to Vision model) ──────────────────────────────────────

const VISION_SYSTEM_PROMPT = `You are a posture analysis expert.
Analyze the person's posture in the image and return ONLY valid JSON — no prose, no markdown.

JSON schema:
{
  "score": <integer 0-100>,
  "issues": ["<short issue description>", ...],
  "tips": ["<actionable correction>", ...],
  "confidence": "high" | "medium" | "low"
}

Score rubric:
  90-100 = Excellent posture
  70-89  = Good, minor issues
  50-69  = Moderate — alerts recommended
  0-49   = Poor — immediate correction needed

Look for: head forward/tilt, shoulder alignment and height asymmetry,
spine curvature, screen distance, chin position, core engagement.

If no person is visible or image is too dark/blurry, return:
{ "score": -1, "issues": ["Person not detected"], "tips": [], "confidence": "low" }`;

// ── Mock data pool (used when no API key is configured) ───────────────────────

const MOCK_POOL: PostureResult[] = [
  { score: 82, issues: ['Chin slightly forward'],             tips: ['Tuck chin gently, imagine a string pulling the top of your head up'], confidence: 'low', isMock: true },
  { score: 65, issues: ['Neck tilted forward ~15°', 'Left shoulder raised'], tips: ['Raise monitor 5 cm', 'Drop shoulders on exhale'], confidence: 'low', isMock: true },
  { score: 91, issues: [],                                    tips: ['Great posture — keep it up!'], confidence: 'low', isMock: true },
  { score: 48, issues: ['Severe forward head posture', 'Rounded upper back', 'Screen too low'], tips: ['Raise monitor to eye level', 'Sit back in chair', 'Add lumbar support'], confidence: 'low', isMock: true },
  { score: 74, issues: ['Slight shoulder asymmetry'],         tips: ['Check chair height — feet should rest flat on floor'], confidence: 'low', isMock: true },
];

// ── Service ───────────────────────────────────────────────────────────────────

export const PostureAnalysisService = {

  /**
   * Analyze a webcam snapshot for posture quality.
   * Returns mock data if API key is missing — never throws.
   */
  async analyze(base64ImageUrl: string): Promise<PostureResult> {
    const key = CONFIG.OPENAI.API_KEY;

    // ── Dev mode: no key configured → return mock result ──────────────────
    if (!key || key.includes('REPLACE_ME')) {
      return this.mockResult();
    }

    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:           CONFIG.OPENAI.MODEL,
          max_tokens:      CONFIG.OPENAI.MAX_TOKENS,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: VISION_SYSTEM_PROMPT },
            {
              role:    'user',
              content: [
                {
                  type:      'image_url',
                  image_url: { url: base64ImageUrl, detail: CONFIG.POSTURE.IMAGE_DETAIL },
                },
              ],
            },
          ],
        }),
      });

      if (!resp.ok) {
        console.warn(`[PostureAnalysis] API error ${resp.status}`);
        return this.mockResult();
      }

      const data   = await resp.json();
      const raw    = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');

      // Person not detected → return null-ish result
      if (raw.score === -1 || raw.score === null) {
        return { score: -1, issues: raw.issues ?? ['Person not detected'], tips: [], confidence: 'low' };
      }

      return {
        score:      Math.max(0, Math.min(100, Number(raw.score ?? 50))),
        issues:     Array.isArray(raw.issues)     ? raw.issues     : [],
        tips:       Array.isArray(raw.tips)       ? raw.tips       : [],
        confidence: ['high','medium','low'].includes(raw.confidence) ? raw.confidence : 'medium',
      };

    } catch (err) {
      console.warn('[PostureAnalysis] Unexpected error:', err);
      return this.mockResult();
    }
  },

  /**
   * Return a random realistic mock result.
   * Cycles through the pool so the UI shows varied data in dev mode.
   */
  mockResult(): PostureResult {
    return { ...MOCK_POOL[Math.floor(Math.random() * MOCK_POOL.length)] };
  },

  /**
   * Classify a score into a human-readable label and alert color.
   * Used by the UI to decide badge color and notification urgency.
   */
  classify(score: number): { label: string; color: string; shouldAlert: boolean } {
    if (score >= 90) return { label: 'Excellent', color: '#4ade80', shouldAlert: false };
    if (score >= 70) return { label: 'Good',      color: '#a3e635', shouldAlert: false };
    if (score >= CONFIG.POSTURE.ALERT_SCORE_THRESHOLD)
                     return { label: 'Fair',       color: '#fbbf24', shouldAlert: false };
    if (score >= 40) return { label: 'Poor',       color: '#f97316', shouldAlert: true  };
    return           { label: 'Critical',          color: '#ef4444', shouldAlert: true  };
  },
};
