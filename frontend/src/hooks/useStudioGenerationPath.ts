export type GenerationPath = 'skeleton_assembly' | 'blank_canvas';

export function normalizeGenerationPath(value: unknown): GenerationPath {
  return value === 'blank_canvas' ? 'blank_canvas' : 'skeleton_assembly';
}
