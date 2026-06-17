export type RestoredGenerationPath = 'skeleton_assembly' | 'blank_canvas';

export function restoreGenerationPath(
  project: { generationPath?: string | null } | null | undefined,
): RestoredGenerationPath {
  return project?.generationPath === 'blank_canvas' ? 'blank_canvas' : 'skeleton_assembly';
}
