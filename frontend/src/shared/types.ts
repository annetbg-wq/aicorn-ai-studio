// ── Shared types used across platform modules ─────────────────────────────

export type ModuleId =
  | 'engine'
  | 'architect'
  | 'figma'
  | 'agentlab'
  | 'analytics'
  | 'cloud'
  | 'package'
  | 'growth'
  | 'projects';

export type ViewId = 'dashboard' | ModuleId;
