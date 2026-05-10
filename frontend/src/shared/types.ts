// ── Shared types used across platform modules ─────────────────────────────

export type ModuleId =
  | 'engine'
  | 'architect'
  | 'figma'
  | 'agentlab'
  | 'analytics'
  | 'benchmark'
  | 'quality'
  | 'cloud'
  | 'package'
  | 'growth'
  | 'projects'
  | 'trend-niches'
  | 'code-studio'
  | 'terminal'
  | 'db-console';

export type ViewId = 'dashboard' | ModuleId;
