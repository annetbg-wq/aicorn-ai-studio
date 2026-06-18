// Baseline compatibility shim for useStudio typing.
// This intentionally provides only shared types and no persistence behavior.
export interface DocumentationPackFile {
  path: string;
  title?: string;
  content?: string;
  summary?: string;
}

export interface DocumentationPack {
  id?: string;
  title?: string;
  summary?: string;
  files?: DocumentationPackFile[];
  [key: string]: unknown;
}
