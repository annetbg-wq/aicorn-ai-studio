export interface ArtifactFile {
  path: string;
  content: string;
  role?: 'entry' | 'page' | 'component' | 'hook' | 'context' | 'data' | 'style' | 'util';
}

export interface ArtifactContract {
  revisionId: string;
  entry: string;
  files: ArtifactFile[];
  routes?: string[];
  dependencies?: string[];
  theme?: string;
}

export interface ArtifactParseResult {
  success: boolean;
  artifact?: ArtifactContract;
  fallbackUsed: boolean;
  error?: string;
}
