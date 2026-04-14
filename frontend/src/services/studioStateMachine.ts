import type { StudioCommand } from '../types/studioCommands';

// ── Phases ───────────────────────────────────────────────────────────────────

export type StudioPhase =
  | 'idle'
  | 'clarifying'
  | 'planning'
  | 'awaiting-approval'
  | 'generating'
  | 'compiling'
  | 'preview-ready'
  | 'preview-failed'
  | 'error';

// ── State ────────────────────────────────────────────────────────────────────

export interface StudioState {
  phase: StudioPhase;
  planId?: string;
  revisionId?: string;
  error?: string;
}

export const INITIAL_STATE: StudioState = { phase: 'idle' };

// ── Transition (pure) ────────────────────────────────────────────────────────

export function transition(state: StudioState, command: StudioCommand): StudioState {
  switch (state.phase) {
    // ── idle ──────────────────────────────────────────────────────────────
    case 'idle':
      switch (command.type) {
        case 'START_GENERATION':
          return { phase: 'planning', planId: undefined };
        default:
          return state;
      }

    // ── clarifying ───────────────────────────────────────────────────────
    case 'clarifying':
      switch (command.type) {
        case 'START_GENERATION':
          return { phase: 'planning', planId: undefined };
        default:
          return state;
      }

    // ── planning ─────────────────────────────────────────────────────────
    case 'planning':
      switch (command.type) {
        case 'SHOW_BLUEPRINT':
          return { phase: 'awaiting-approval', planId: command.planId };
        case 'GENERATION_COMPLETE':
          return { phase: 'compiling', planId: state.planId };
        case 'GENERATION_FAILED':
          return { phase: 'error', error: command.error };
        default:
          return state;
      }

    // ── awaiting-approval ────────────────────────────────────────────────
    case 'awaiting-approval':
      switch (command.type) {
        case 'ACCEPT_BLUEPRINT':
          return { phase: 'generating', planId: command.planId };
        case 'REJECT_BLUEPRINT':
          return { phase: 'idle' };
        case 'GENERATION_FAILED':
          return { phase: 'error', planId: state.planId, error: command.error };
        default:
          return state;
      }

    // ── generating ───────────────────────────────────────────────────────
    case 'generating':
      switch (command.type) {
        case 'GENERATION_COMPLETE':
          return { phase: 'compiling', planId: state.planId };
        case 'GENERATION_FAILED':
          return { phase: 'error', planId: state.planId, error: command.error };
        default:
          return state;
      }

    // ── compiling ────────────────────────────────────────────────────────
    case 'compiling':
      switch (command.type) {
        case 'PREVIEW_READY':
          return { phase: 'preview-ready', planId: state.planId };
        case 'PREVIEW_FAILED':
          return { phase: 'preview-failed', planId: state.planId, error: command.error };
        default:
          return state;
      }

    // ── preview-ready ────────────────────────────────────────────────────
    case 'preview-ready':
      switch (command.type) {
        case 'START_GENERATION':
          return { phase: 'planning', planId: undefined };
        case 'EDIT_FILE':
          return { phase: 'compiling', planId: state.planId };
        case 'REQUEST_FIX':
          return { phase: 'generating', planId: state.planId };
        default:
          return state;
      }

    // ── preview-failed ───────────────────────────────────────────────────
    case 'preview-failed':
      switch (command.type) {
        case 'REQUEST_FIX':
          return { phase: 'generating', planId: state.planId };
        case 'START_GENERATION':
          return { phase: 'planning', planId: undefined };
        default:
          return state;
      }

    // ── error ────────────────────────────────────────────────────────────
    case 'error':
      switch (command.type) {
        case 'START_GENERATION':
          return { phase: 'planning', planId: undefined };
        case 'REQUEST_FIX':
          return { phase: 'generating', planId: state.planId };
        default:
          return state;
      }

    default:
      return state;
  }
}
