/**
 * ProjectExportService — single export orchestration layer.
 *
 * All export paths (ZIP download, repo push, file-tree extraction) flow
 * through this service.  UI components call these methods instead of
 * constructing ProjectGraph + calling ExportAdapter directly.
 *
 * Architecture:
 *   UI button
 *     → ProjectExportService.downloadProjectZip(files, opts)
 *         → fileMapToProjectGraph(...)           [shared/projectModel]
 *         → ExportAdapter.downloadZip(graph)     [adapters/ExportAdapter]
 *
 *   UI push-to-repo
 *     → ProjectExportService.buildRepoPushPayload(files, opts)
 *         → fileMapToProjectGraph(...)
 *         → ExportAdapter.toFileTree(graph)
 *         → return { fileTree, options }
 *     → GitHubSyncService.pushProject(fileTree, options)
 *
 * Keeps ExportAdapter as the low-level adapter (graph → file tree / zip).
 * Keeps GitHubSyncService as the sync seam (file tree → remote repo).
 */

import {
  fileMapToProjectGraph,
  type ProjectGraph,
  type ProductManifest,
} from '../shared/projectModel';
import {
  ExportAdapter,
  type ExportFileTree,
  type ExportProjection,
} from './adapters/ExportAdapter';
import type {
  PushProjectOptions,
} from './GitHubSyncService';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExportIdentity {
  /** Project ID (falls back to 'local' for unsaved projects). */
  projectId?: string;
  /** Human-readable project name used as ZIP filename and manifest.name. */
  projectName?: string;
  /** Revision tag — defaults to 'head'. */
  revisionId?: string;
}

export interface RepoPushPayload {
  fileTree: ExportFileTree;
  graph:    ProjectGraph;
}

// ── Service ──────────────────────────────────────────────────────────────────

export const ProjectExportService = {
  /**
   * Build a ProjectGraph from a FileMap, suitable for export.
   *
   * This is the single place that calls fileMapToProjectGraph for export
   * purposes — UI components must not call it directly.
   */
  buildExportGraph(
    files:    Record<string, string>,
    identity: ExportIdentity = {},
  ): ProjectGraph {
    const {
      projectId   = 'local',
      projectName = 'my-app',
      revisionId  = 'head',
    } = identity;

    const manifestOverride: Partial<Pick<ProjectGraph, 'manifest'>> = {
      manifest: {
        version:         1,
        id:              `manifest-${projectId}`,
        name:            projectName,
        description:     '',
        intent:          '',
        targetPlatforms: ['web'],
        techStack: {
          framework:       'react',
          language:        'typescript',
          styling:         'tailwind',
          bundler:         'vite',
          backend:         null,
          stateManagement: null,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies ProductManifest,
    };

    return fileMapToProjectGraph(files, projectId, revisionId, manifestOverride);
  },

  /**
   * Build the complete file tree (source + synthesised toolchain files)
   * ready for download or repo push.
   */
  buildExportFileTree(
    files:    Record<string, string>,
    identity?: ExportIdentity,
  ): ExportProjection {
    const graph = ProjectExportService.buildExportGraph(files, identity);
    return ExportAdapter.toFileTree(graph);
  },

  /**
   * Download the project as a ZIP archive.
   * This is the canonical handler for all "Export ZIP" buttons.
   */
  downloadProjectZip(
    files:    Record<string, string>,
    identity?: ExportIdentity,
  ): void {
    const name  = identity?.projectName || 'my-app';
    const graph = ProjectExportService.buildExportGraph(files, identity);
    ExportAdapter.downloadZip(graph, name);
  },

  /**
   * Prepare the payload for GitHubSyncService.pushProject().
   *
   * Returns the file tree and the graph so the caller can pass the tree
   * to GitHubSyncService.pushProject(payload.fileTree, pushOptions).
   */
  buildRepoPushPayload(
    files:    Record<string, string>,
    identity?: ExportIdentity,
  ): RepoPushPayload {
    const graph    = ProjectExportService.buildExportGraph(files, identity);
    const { fileTree } = ExportAdapter.toFileTree(graph);
    return { fileTree, graph };
  },
};
