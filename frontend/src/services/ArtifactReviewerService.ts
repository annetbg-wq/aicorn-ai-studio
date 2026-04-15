import type { ArtifactContract, ArtifactFile } from '../types/artifact';

export class ArtifactReviewerService {
  static review(artifact: ArtifactContract): ArtifactContract {
    const cleanedFiles = artifact.files
      .map((file): ArtifactFile | null => {
        const trimmed = file.content.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            const nested = JSON.parse(trimmed) as { files?: unknown };
            if (nested && typeof nested === 'object' && Array.isArray(nested.files)) {
              return null;
            }
          } catch {
            // Keep original file content when JSON parsing fails.
          }
        }
        return file;
      })
      .filter((file): file is ArtifactFile => Boolean(file));

    if (cleanedFiles.length === 0) {
      throw new Error('REVIEWER_FAIL: 0 files after cleaning');
    }

    if (!artifact.entry || !cleanedFiles.find((file) => file.path === artifact.entry)) {
      throw new Error('REVIEWER_FAIL: invalid entry point');
    }

    return {
      ...artifact,
      files: cleanedFiles,
    };
  }
}
