// Registry Layer Types - Version 1
// Strict TypeScript definitions for the new registry layer

export type ProjectStatus = 'active' | 'archived' | 'broken' | 'exported';
export type RevisionStatus = 'draft' | 'validated' | 'failed' | 'active-preview';
export type PreviewStatus = 'pending' | 'ready' | 'failed';
export type ExportStatus = 'pending' | 'success' | 'failed';

export interface RegistryProjectMeta {
  version: 1;
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  branches: BranchMeta[];
}

export interface BranchMeta {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  revisions: RevisionMeta[];
}

export interface RevisionMeta {
  id: string;
  branchId: string;
  number: number;
  status: RevisionStatus;
  createdAt: string;
  updatedAt: string;
  preview?: PreviewMeta;
  export?: ExportMeta;
}

export interface PreviewMeta {
  id: string;
  revisionId: string;
  status: PreviewStatus;
  url?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface ExportMeta {
  id: string;
  revisionId: string;
  status: ExportStatus;
  url?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface ProjectsIndex {
  version: 1;
  projects: RegistryProjectMeta[];
  lastSync: string;
}
