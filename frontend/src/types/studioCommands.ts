import type { GenerationResult } from '../shared/projectModel';

export type StudioCommand =
  | { type: 'PLAN_APPROVED'; payload: object }
  | { type: 'ACCEPT_BLUEPRINT'; planId: string }
  | { type: 'REJECT_BLUEPRINT'; planId: string }
  | { type: 'SHOW_BLUEPRINT'; planId: string }
  | { type: 'START_GENERATION'; intent: string; plan: object }
  | { type: 'GENERATION_COMPLETE'; result: GenerationResult }
  | { type: 'GENERATION_FAILED'; error: string }
  | { type: 'PREVIEW_READY'; payload: { url: string } }
  | { type: 'PREVIEW_FAILED'; error: string }
  | { type: 'EDIT_FILE'; path: string; content: string }
  | { type: 'REQUEST_FIX'; error: string }
  | { type: 'REQUEST_PLAN_REVISION'; payload: string };
