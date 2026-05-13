import fs from 'fs';
import path from 'path';
import { analyzeOutputTruth, type OutputTruthResult } from '../frontend/src/shared/outputTruth';

const PREVIEW_SRC_ROOT = path.join(process.cwd(), 'preview-workspace', 'src');
const SKELETONS_ROOT = path.join(process.cwd(), 'skeletons');
const SKELETON_MANIFESTS_ROOT = path.join(process.cwd(), 'frontend', 'src', 'services', 'skeleton-manifests');
const CODE_FILE_PATTERN = /\.(?:tsx?|jsx?|css|json)$/i;
const IGNORED_PREVIEW_FILES = new Set(['__build_id.ts', 'route-manifest.json']);

export interface EditableFileStatus {
  path: string;
  presentInWorkspace: boolean;
  modifiedFromSkeleton: boolean;
  workspaceBytes: number;
  skeletonBytes: number;
}

export interface LivePreviewWorkspaceSnapshot {
  skeletonId: string | null;
  routeCount: number;
  workspaceFiles: Record<string, string>;
  deltaFiles: Record<string, string>;
  outputTruth: OutputTruthResult;
  /** Per-file delta status for each declared editable skeleton file. Useful for diagnosing why code-delta sees 0 meaningful files. */
  editableFilesStatus: EditableFileStatus[];
}

function toProjectPath(root: string, fullPath: string): string {
  return `src/${path.relative(root, fullPath).replace(/\\/g, '/')}`;
}

function readTreeFiles(root: string): Record<string, string> {
  if (!fs.existsSync(root)) return {};

  const files: Record<string, string> = {};
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!CODE_FILE_PATTERN.test(entry.name) || IGNORED_PREVIEW_FILES.has(entry.name)) {
        continue;
      }
      files[toProjectPath(root, fullPath)] = fs.readFileSync(fullPath, 'utf8');
    }
  }

  return files;
}

function readRouteManifest(): { skeletonId: string | null; routeCount: number } {
  const manifestPath = path.join(PREVIEW_SRC_ROOT, 'route-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { skeletonId: null, routeCount: 0 };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      skeletonId?: unknown;
      routes?: unknown[];
    };
    return {
      skeletonId: typeof parsed.skeletonId === 'string' ? parsed.skeletonId : null,
      routeCount: Array.isArray(parsed.routes) ? parsed.routes.length : 0,
    };
  } catch {
    return { skeletonId: null, routeCount: 0 };
  }
}

function readSkeletonFiles(skeletonId: string | null): Record<string, string> {
  if (!skeletonId) return {};
  const skeletonSrcRoot = path.join(SKELETONS_ROOT, skeletonId, `skeleton-${skeletonId}`, 'src');
  return readTreeFiles(skeletonSrcRoot);
}

function readSkeletonEditableFilePaths(skeletonId: string | null): string[] {
  if (!skeletonId) return [];
  const manifestPath = path.join(SKELETON_MANIFESTS_ROOT, skeletonId, 'skeleton.manifest.json');
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { editableFiles?: unknown };
    return Array.isArray(manifest.editableFiles) ? (manifest.editableFiles as string[]) : [];
  } catch {
    return [];
  }
}

export function inspectLivePreviewWorkspace(): LivePreviewWorkspaceSnapshot {
  const { skeletonId, routeCount } = readRouteManifest();
  const workspaceFiles = readTreeFiles(PREVIEW_SRC_ROOT);
  const skeletonFiles = readSkeletonFiles(skeletonId);
  const deltaFiles = Object.fromEntries(
    Object.entries(workspaceFiles).filter(([filePath, content]) => skeletonFiles[filePath] !== content),
  );
  const outputTruth = analyzeOutputTruth({
    files: workspaceFiles,
    changedPaths: Object.keys(deltaFiles),
    routeCount,
    previewEntryFile: 'src/App.tsx',
    skeletonId,
    skeletonPaths: Object.keys(skeletonFiles),
  });

  const editableFilePaths = readSkeletonEditableFilePaths(skeletonId);
  const editableFilesStatus: EditableFileStatus[] = editableFilePaths.map((filePath) => {
    const workspaceContent = workspaceFiles[filePath];
    const skeletonContent = skeletonFiles[filePath];
    return {
      path: filePath,
      presentInWorkspace: workspaceContent !== undefined,
      modifiedFromSkeleton: workspaceContent !== undefined && workspaceContent !== skeletonContent,
      workspaceBytes: workspaceContent ? Buffer.byteLength(workspaceContent, 'utf8') : 0,
      skeletonBytes: skeletonContent ? Buffer.byteLength(skeletonContent, 'utf8') : 0,
    };
  });

  return {
    skeletonId,
    routeCount,
    workspaceFiles,
    deltaFiles,
    outputTruth,
    editableFilesStatus,
  };
}
