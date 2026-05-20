/**
 * useStudio.ts — v4 DECOMPOSED
 *
 * Domain hooks extracted:
 *   useFigmaState    — Figma identity, sync, Design DNA, Project Hub, Engine
 *   useSettingsState  — API keys, models, theme, auto-route, agent configs
 *
 * This file remains the public facade — all consumers still call useStudio()
 * and get the same return shape.
 */

import { useState, useEffect, useRef, useCallback, useMemo, startTransition, useReducer } from 'react';
import type { LogEntry } from '../components/StudioTerminal';
import {
  createMessageId,
  chatReducer,
  normalizeMessages,
  normalizeMessage,
  type ChatMessage,
  type ChatAction,
} from '../lib/chat';
import { supabase } from '../lib/supabase';
import {
  Orchestrator,  // kept for applyOperations / resetSession — NOT for run() or planTask()
  applyOperations,
  type FileOperation,
  type PhaseEvent,
  type UsageData,
} from '../services/Orchestrator';
import { SimpleGeneration as GenerationPipeline } from '../services/SimpleGeneration';
import type { ProjectPlan } from '../services/SimpleGeneration';
import {
  classifyIdea,
  fallbackClassify,
  buildDesignSystemPrompt,
  type ClassificationResult,
} from '../services/designSystem';
import { ResourceManager } from '../services/ai/resourceManager';
import { CollabService } from '../services/CollabService';
import { ConfigService } from '../services/ConfigService';
import { FigmaService } from '../services/FigmaService';
import { useAuth } from '../contexts/AuthContext';
import { commandBus } from '../services/studioCommandBus';
import { transition, INITIAL_STATE, type StudioState as MachineState } from '../services/studioStateMachine';
import { ScannerService } from '../services/ScannerService';
import type { ComponentRegistry } from '../services/ScannerService';
import { ProjectStorage } from '../services/ProjectStorage';
import type { ProjectMeta, StoredProject, ProjectRevision } from '../services/ProjectStorage';
import { draftArtifactJournal } from '../services/DraftArtifactJournal';
import { ProjectManager } from '../services/ProjectManager';
import type { Project } from '../services/ProjectManager';
import { ProjectRepository, getCanonicalProjectName } from '../services/ProjectRepository';
import { BenchmarkService } from '../services/benchmark/BenchmarkService';
import { revisionManager } from '../services/RevisionManager';
import { previewController } from '../services/PreviewController';
import { appendPreviewSessionToUrl, getPreviewSessionToken } from '../services/PreviewSessionService';
import { normalizePath } from '../services/PreviewWriteGateway';
import { generationTracer } from '../services/GenerationTracer';
import {
  UserProjectSettingsService,
  type EffectiveSettings,
  type ProjectSettingsOverride,
} from '../services/UserProjectSettingsService';
import { safeSetItem } from '../lib/safeStorage';
import { getLocalDevAgentProvider, isLocalDevAgentEnabled } from '../services/devAgentMode';
import { buildFileDiff, type FileDiff } from '../components/DiffPreview';
import { EditAdmissionService } from '../services/EditAdmissionService';
import type { AdmissionDecision } from '../services/EditAdmissionService';
import {
  buildBranchGenerationGuidance,
  buildBranchTrustUiSummary,
} from '../services/BranchArchitectureOrchestrationService';
import {
  DEFAULT_PROJECT_BRANCH_ID,
  createProjectBranchArchitecture,
  projectGraphToFileMap,
  fileMapToProjectGraph,
  type GenerationReport,
  type GenerationRunTelemetry,
  type GenerationResult,
  type ProjectGraph,
  type PreviewLifecycleStage,
  type TraceRouteRecord,
  type TraceRunSummary,
  type TraceStepKind,
} from '../shared/projectModel';
import { analyzeOutputTruth } from '../shared/outputTruth';
import { useFigmaState } from './useFigmaState';
import { useSettingsState } from './useSettingsState';
import { getSkeletonSaveFiles, resolveReloadCompleteSaveFiles } from './useStudioSaveFiles';
import {
  ArchitectPlannerService,
  applyKickoffSelectionToBuildPlan,
  assertKickoffScopeApplied,
  type ArchitectBlockingQuestion,
  type ArchitectKickoffPlan,
  type KickoffBuildScopeId,
} from '../services/ArchitectPlannerService';
import { ChatArchitectureService } from '../services/ChatArchitectureService';
import { refreshArchitectureAfterBuild } from '../services/BranchArchitectureOrchestrationService';
import { resolveStandardRoute } from '../services/buildAgentRouting';
import type { AgentExecutionRoute } from '../services/buildAgentRouting';
import { showToast } from '../services/toastBus';

export type DeviceType = 'desktop' | 'iphone' | 'pixel' | 'ipad';
export type FileMap     = Record<string, string>;

/**
 * Snapshot status lifecycle (mirrors RevisionManager glossary):
 *   candidate → stable
 *
 *   candidate — AI generation wrote this snapshot; preview iframe has NOT
 *               confirmed it. Never used as crash-recovery fallback.
 *   stable    — The iframe mounted without errors (markSnapshotStable called).
 *               Eligible as crash-recovery fallback on next startup.
 *   undefined — Legacy snapshot (pre-status-tracking). Treated as stable.
 */
export type SnapshotStatus = 'candidate' | 'stable';

/**
 * Explicit kickoff lifecycle for genesis (first-build) flows.
 *
 * idle               — no kickoff in progress (default, all non-genesis runs)
 * prompt_received    — genesis prompt submitted; existingCodeCount === 0 confirmed
 * analyzing          — ArchitectPlannerService.analyze() running
 * awaiting_confirmation — pendingPlan set; system is blocked waiting for user
 * build_starting     — confirmPlan() fired; preparing build plan
 * building           — GenerationPipeline past confirmation; code phase active
 */
export type KickoffPhase =
  | 'idle'
  | 'prompt_received'
  | 'analyzing'
  | 'awaiting_confirmation'
  | 'build_starting'
  | 'building';

/** Returns true if a snapshot is considered stable (explicit or legacy). */
export function isSnapshotStable(s: Snapshot): boolean {
  return !s.status || s.status === 'stable';
}

export interface Snapshot {
  id:        string;
  files:     FileMap;
  label:     string;
  createdAt: string;
  /** 1-indexed position in the undo/redo history (= historyIndex + 1). */
  version:   number;
  /** See SnapshotStatus type for canonical lifecycle. */
  status?:   SnapshotStatus;
  /** RevisionManager revision id — enables preview restore on undo/redo. */
  revisionId?: string;
}

export interface Attachment {
  id:           string;
  name:         string;
  type:         'image' | 'text' | 'code' | 'pdf';
  data:         string;           // base64 data URI for images/PDFs, raw text for others
  mimeType:     string;
  textContent?: string;           // extracted text for PDFs
}

type GenerationSource = 'chat' | 'weekly-feed' | 'niche' | 'trend-niche';
type ComposerContextSource = 'weekly-feed' | 'niche' | 'trend-niche' | 'dashboard' | 'manual';

export interface ComposerContextItem {
  id:        string;
  source:    ComposerContextSource;
  title:     string;
  intent:    string;
  summary:   string;
  createdAt: number;
  plan?:     ProjectPlan;
}

export interface ActiveProjectContext {
  id: string;
  source: ComposerContextSource;
  title: string;
  intent: string;
  summary: string;
  plan: ProjectPlan;
  createdAt: number;
}

type PackagedLaunchContext = {
  id: string;
  source: Exclude<GenerationSource, 'chat'>;
  plan: ProjectPlan;
};

type DraftSessionSource =
  | 'new-project'
  | 'startup'
  | 'external-chat'
  | 'trend-niche-chat'
  | 'trend-niche-build';

interface CreateNewProjectOptions {
  autoSaveCurrentProject?: boolean;
  sessionSource?: DraftSessionSource;
}

type PlanApprovalDecision = {
  confirmed: boolean;
  approvedPlan?: ProjectPlan;
  requiredKickoffScopeId?: KickoffBuildScopeId;
};

export const KICKOFF_FAST_START_GRACE_MS = 3_500;

export interface PendingArchitectKickoffSelection {
  projectId: string;
  plan: ArchitectKickoffPlan;
  branchId: string;
  selectedOptionId: KickoffBuildScopeId;
  proposedSnapshotId?: string | null;
}

export interface PendingBlueprintPlan {
  id: string;
  plan: ProjectPlan;
  blueprintText: string;
  technicalBlueprint?: object | null;
  appName: string;
  theme: string;
  pages: string[];
  architectKickoff?: PendingArchitectKickoffSelection | null;
}

type GeneratedPlanPreview = Awaited<ReturnType<typeof GenerationPipeline.generatePlan>>;

export function scheduleKickoffFastStart(input: {
  pendingPlan: PendingBlueprintPlan | null;
  confirmPlan: () => void;
  addLog: (msg: string) => void;
  delayMs?: number;
}): (() => void) | null {
  const {
    pendingPlan,
    confirmPlan,
    addLog,
    delayMs = KICKOFF_FAST_START_GRACE_MS,
  } = input;

  if (!pendingPlan?.architectKickoff) return null;

  let cancelled = false;
  const selectedOptionId = pendingPlan.architectKickoff.selectedOptionId ?? 'core';
  const timer = window.setTimeout(() => {
    if (cancelled) return;
    addLog(`[Kickoff] kickoff_scope_defaulted: ${selectedOptionId} (fast-start auto-confirm)`);
    confirmPlan();
  }, delayMs);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

export function useKickoffFastStart(input: {
  pendingPlan: PendingBlueprintPlan | null;
  confirmPlan: () => void;
  addLog: (msg: string) => void;
  delayMs?: number;
}): void {
  const { pendingPlan, confirmPlan, addLog, delayMs } = input;

  useEffect(() => {
    const cleanup = scheduleKickoffFastStart({
      pendingPlan,
      confirmPlan,
      addLog,
      delayMs,
    });

    return () => {
      cleanup?.();
    };
  }, [pendingPlan, confirmPlan, addLog, delayMs]);
}

export function resolveStudioKickoffContext(
  currentProjectId: string | null,
  currentProject: Pick<Project, 'id' | 'activeBranchId'> | null | undefined,
): { projectId: string | null; branchId: string } {
  const resolved = ProjectManager.resolveKickoffContext(currentProjectId ?? currentProject?.id ?? null);
  return {
    projectId: resolved.projectId ?? currentProjectId ?? currentProject?.id ?? null,
    branchId: currentProject?.activeBranchId ?? resolved.branchId,
  };
}

export async function prepareKickoffBuildApproval(input: {
  pendingPlan: PendingBlueprintPlan;
  now?: string;
  language?: string;
  persistKickoffSnapshot?: boolean;
}): Promise<{ approvedPlan: ProjectPlan; kickoffSnapshotId: string | null }> {
  const { pendingPlan } = input;
  const now = input.now ?? new Date().toISOString();

  if (!pendingPlan.architectKickoff) {
    return {
      approvedPlan: pendingPlan.plan,
      kickoffSnapshotId: null,
    };
  }

  if (input.persistKickoffSnapshot === false) {
    const selectedOption = pendingPlan.architectKickoff.plan.scopeOptions.find(
      option => option.id === pendingPlan.architectKickoff!.selectedOptionId,
    );
    let approvedPlan: ProjectPlan;
    try {
      approvedPlan = assertKickoffScopeApplied(
        applyKickoffSelectionToBuildPlan(
          pendingPlan.plan,
          pendingPlan.architectKickoff.plan,
          pendingPlan.architectKickoff.selectedOptionId,
        ),
        pendingPlan.architectKickoff.selectedOptionId,
      );
    } catch {
      approvedPlan = {
        ...(pendingPlan.plan as ProjectPlan),
        kickoffScope: {
          id: pendingPlan.architectKickoff.selectedOptionId,
          label: selectedOption?.label ?? pendingPlan.architectKickoff.selectedOptionId,
          description: selectedOption?.description ?? 'Session-only kickoff scope',
          selectedCapabilityIds: selectedOption?.capabilityIds ?? [],
          deferredCapabilityIds: [],
        },
      };
    }
    return {
      approvedPlan,
      kickoffSnapshotId: null,
    };
  }

  const preparation = await ArchitectPlannerService.prepareBuildFromKickoff(
    pendingPlan.architectKickoff.projectId,
    pendingPlan.architectKickoff.branchId,
    pendingPlan.architectKickoff.plan,
    pendingPlan.architectKickoff.selectedOptionId,
    pendingPlan.plan,
    now,
    input.language,
  );

  if ((preparation.buildPlan as { kickoffScope?: { id?: string } }).kickoffScope?.id
    !== pendingPlan.architectKickoff.selectedOptionId) {
    throw new Error(
      `[Architect] Kickoff scope handoff failed before confirmation: expected ${pendingPlan.architectKickoff.selectedOptionId}`,
    );
  }

  return {
    approvedPlan: preparation.buildPlan,
    kickoffSnapshotId: preparation.snapshot.id,
  };
}

export function recoverKickoffApprovalFailure(
  message: string,
  pendingPlanId: string | null | undefined,
  callbacks: {
    addLog: (msg: string) => void;
    appendErrorMessage: (content: string) => void;
    resolvePendingConfirmation?: (decision: PlanApprovalDecision) => void;
    rejectBlueprint: (planId: string) => void;
  },
): PlanApprovalDecision {
  const decision: PlanApprovalDecision = { confirmed: false };
  callbacks.addLog(`[Architect] Kickoff approval failed: ${message}`);
  callbacks.appendErrorMessage(`⚠️ Architect kickoff draft was not saved. Build not started.\n\n${message}`);
  callbacks.resolvePendingConfirmation?.(decision);
  callbacks.rejectBlueprint(pendingPlanId ?? '');
  return decision;
}

/** Builds a simplified unified-style diff string (lines prefixed with +/-/ ) */
function buildLineDiff(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const result: string[] = [];
  const maxCtx = 3;
  // Very simple LCS-free diff: compare line by line with a small window look-ahead
  let ai = 0, bi = 0;
  while (ai < a.length || bi < b.length) {
    if (ai < a.length && bi < b.length && a[ai] === b[bi]) {
      result.push(' ' + a[ai]);
      ai++; bi++;
    } else {
      // Collect changed block
      const aBlock: string[] = [];
      const bBlock: string[] = [];
      let found = false;
      for (let w = 1; w <= maxCtx + 1; w++) {
        if (ai + w < a.length && bi < b.length && a[ai + w] === b[bi]) {
          for (let k = 0; k < w; k++) aBlock.push('-' + a[ai + k]);
          found = true; ai += w; break;
        }
        if (bi + w < b.length && ai < a.length && a[ai] === b[bi + w]) {
          for (let k = 0; k < w; k++) bBlock.push('+' + b[bi + k]);
          found = true; bi += w; break;
        }
      }
      if (!found) {
        if (ai < a.length) { aBlock.push('-' + a[ai]); ai++; }
        if (bi < b.length) { bBlock.push('+' + b[bi]); bi++; }
      }
      result.push(...aBlock, ...bBlock);
    }
  }
  return result.join('\n');
}

export function buildGenerationReport(input: {
  result: Pick<GenerationResult, 'operations' | 'planTheme' | 'visualQualitySummary' | 'visualPolishSummary'>;
  filesSnapshot: FileMap;
  finalFiles: FileMap;
  startMs: number;
}): GenerationReport {
  const isEditMode = Object.keys(input.filesSnapshot).filter(
    k => /\.(tsx?|jsx?)$/.test(k) && !k.startsWith('_'),
  ).length > 0;
  const reportableFiles = Object.keys(input.finalFiles).filter(k => !k.startsWith('_'));
  const touchedNames: string[] = [];

  for (const op of input.result.operations) {
    if (op.op !== 'rename' && !op.name.startsWith('_')) {
      touchedNames.push(op.name);
    }
  }

  return {
    mode: isEditMode ? 'EDIT' : 'NEW',
    theme: input.result.planTheme ?? 'default',
    filesCreated: isEditMode
      ? touchedNames.filter(f => !input.filesSnapshot[f])
      : reportableFiles,
    filesModified: isEditMode
      ? touchedNames.filter(f => !!input.filesSnapshot[f])
      : [],
    pageCount: reportableFiles.filter(f => f.includes('pages/')).length,
    duration: Math.round((Date.now() - input.startMs) / 1000),
    visualQuality: input.result.visualQualitySummary,
    visualPolish: input.result.visualPolishSummary,
    fileDiffs: isEditMode
      ? Object.fromEntries(
          touchedNames
            .filter(f => !!input.filesSnapshot[f] && !!input.finalFiles[f])
            .map(f => [f, buildLineDiff(input.filesSnapshot[f] ?? '', input.finalFiles[f] ?? '')])
            .filter(([, d]) => d.length > 0),
        )
      : undefined,
  };
}

function buildTraceRouteRecord(role: string, route: AgentExecutionRoute): TraceRouteRecord {
  return {
    role,
    provider: route.provider,
    model: route.modelId,
    slot: route.slot,
    route: `${route.provider}:${route.slot}`,
    fallbackReason: route.fallbackReason,
    reason: route.reason,
  };
}

function mapTelemetryStepToTraceKind(stepId: GenerationRunTelemetry['steps'][number]['id']): TraceStepKind {
  switch (stepId) {
    case 'clarify':
      return 'intent_understanding';
    case 'pack':
      return 'design_direction';
    case 'architect':
      return 'architect_plan';
    case 'coder':
      return 'coder_generation';
    case 'apply':
    case 'skeleton':
      return 'candidate_materialize';
    case 'build':
      return 'fast_gate';
    case 'preview':
      return 'ship_decision';
    default:
      return 'reviewer_result';
  }
}

function buildRunPathSummary(input: {
  testEnvironment: boolean;
  devAgentProvider: string;
  founderFastPath: boolean;
  usesRealLlm: boolean;
  usesRealRuntime: boolean;
  usedSavedPlan: boolean;
}): TraceRunSummary['path'] {
  const markers: string[] = [];
  if (input.testEnvironment) markers.push('test-env');
  if (input.devAgentProvider && input.devAgentProvider !== 'off') markers.push(`dev-agent:${input.devAgentProvider}`);
  if (input.founderFastPath) markers.push('packaged-founder-brief');
  if (input.usedSavedPlan) markers.push('saved-plan-reuse');
  const kind = input.testEnvironment ? 'test' : 'real';
  const summary = input.testEnvironment
    ? 'Test environment run with live generation telemetry.'
    : 'Real generation path with live compile and preview telemetry.';
  return {
    kind,
    summary,
    usesRealLlm: input.usesRealLlm,
    usesRealRuntime: input.usesRealRuntime,
    fixtureBacked: false,
    testEnvironment: input.testEnvironment,
    markers,
  };
}

function buildTraceRunSummary(input: {
  brief: string;
  telemetry?: GenerationRunTelemetry;
  filesSnapshot: FileMap;
  finalFiles?: FileMap;
  qualitySummary?: GenerationResult['qualitySummary'];
  visualQualitySummary?: GenerationResult['visualQualitySummary'];
  previewLifecycle: PreviewLifecycleStage;
  saveReady: boolean;
  path: TraceRunSummary['path'];
  noTelemetryReason?: string;
}): TraceRunSummary {
  const finalFiles = input.finalFiles ?? {};
  const visiblePaths = Object.keys(finalFiles).filter(path => !path.startsWith('_'));
  const filesCreated = visiblePaths.filter(path => input.filesSnapshot[path] === undefined);
  const filesUpdated = visiblePaths.filter(path => (
    input.filesSnapshot[path] !== undefined && input.filesSnapshot[path] !== finalFiles[path]
  ));
  const changedPaths = [...filesCreated, ...filesUpdated];
  const deltaSizeBytes = changedPaths.reduce((total, path) => total + (finalFiles[path]?.length ?? 0), 0);
  const derivedRouteCount = visiblePaths.filter(path => /\/(?:pages|screens|routes)\//.test(path)).length;
  const outputTruth = analyzeOutputTruth({
    files: finalFiles,
    changedPaths,
    routeCount: derivedRouteCount,
    previewEntryFile: 'src/App.tsx',
    skeletonId: input.telemetry?.skeletonId,
    skeletonPaths: input.telemetry?.skeletonFiles,
  });
  const previewMountStatus =
    input.previewLifecycle === 'blocked'
      ? 'blocked'
      : input.previewLifecycle === 'preview-ready'
        ? 'mounted'
        : input.telemetry?.finalPreviewMounted
          ? 'mounted'
          : input.previewLifecycle === 'materializing' || input.previewLifecycle === 'committing'
            ? 'pending'
            : 'missing';
  const quality = input.qualitySummary
    ? {
        verdict: (
          input.qualitySummary.severity === 'blocking'
            ? 'fail'
            : input.qualitySummary.severity === 'warning' || input.visualQualitySummary?.verdict === 'weak'
              ? 'partial'
              : 'pass'
        ) as 'pass' | 'partial' | 'fail',
        summary: [
          input.qualitySummary.summary,
          input.visualQualitySummary
            ? `Visual ${input.visualQualitySummary.verdict} (${input.visualQualitySummary.score})`
            : null,
        ].filter(Boolean).join(' · '),
        gates: [
          {
            id: 'architect-llm',
            label: 'Architect LLM',
            passed: !!input.telemetry?.steps.find(step => step.id === 'architect' && !!step.llm),
            source: 'real-llm' as const,
            detail: input.telemetry?.steps.find(step => step.id === 'architect')?.llm?.model,
          },
          {
            id: 'coder-llm',
            label: 'Coder LLM',
            passed: !!input.telemetry?.steps.find(step => step.id === 'coder' && !!step.llm),
            source: 'real-llm' as const,
            detail: input.telemetry?.steps.find(step => step.id === 'coder')?.llm?.model,
          },
          {
            id: 'entry-file',
            label: 'Preview entry present',
            passed: input.qualitySummary.checks.previewEntryPresent,
            source: 'real-runtime' as const,
          },
          {
            id: 'integrity',
            label: 'Integrity guard',
            passed: input.qualitySummary.checks.guardIntegrityPassed,
            source: 'real-runtime' as const,
          },
          {
            id: 'runtime',
            label: 'Runtime guard',
            passed: input.qualitySummary.checks.guardRuntimePassed,
            source: 'real-runtime' as const,
          },
          {
            id: 'output-proof',
            label: 'Output proof',
            passed: input.qualitySummary.checks.outputProofPassed,
            source: 'real-runtime' as const,
          },
          {
            id: 'structure-contract',
            label: 'Structure contract',
            passed: input.qualitySummary.checks.outputStructurePassed,
            source: 'real-runtime' as const,
          },
          {
            id: 'skeleton-delta',
            label: 'Skeleton vs delta',
            passed: input.qualitySummary.checks.deltaStructurePassed,
            source: 'real-runtime' as const,
          },
          {
            id: 'architectural-richness',
            label: 'Architectural richness',
            passed: input.qualitySummary.checks.architecturalRichnessPassed,
            source: 'real-runtime' as const,
          },
          {
            id: 'placeholder-block',
            label: 'Placeholder block',
            passed: input.qualitySummary.checks.placeholderStructureClean,
            source: 'real-runtime' as const,
          },
          {
            id: 'non-trivial-delta',
            label: 'Non-trivial delta',
            passed: input.qualitySummary.checks.nonTrivialDelta,
            source: 'real-runtime' as const,
          },
          {
            id: 'preview-mounted',
            label: 'Preview mounted',
            passed: previewMountStatus === 'mounted',
            source: 'real-runtime' as const,
            detail: previewMountStatus,
          },
          {
            id: 'save-ready',
            label: 'Save ready',
            passed: input.saveReady,
            source: 'real-runtime' as const,
            detail: input.saveReady ? 'ready' : 'locked',
          },
        ],
        blockers: input.qualitySummary.blockers ?? [],
        warnings: input.qualitySummary.warnings ?? [],
        visualVerdict: input.visualQualitySummary?.verdict,
        visualBand: input.visualQualitySummary?.band,
        visualReasons: input.visualQualitySummary?.reasons ?? [],
      }
    : undefined;
  const visualBank = input.telemetry?.visualBank;
  const fileCountsByClass = outputTruth.structure.buckets.map(bucket => ({
    id: bucket.id,
    label: bucket.label,
    totalCount: bucket.totalCount,
    deltaCount: bucket.deltaCount,
    keyPaths: bucket.keyPaths,
  }));
  const passedGates = quality?.gates.filter(gate => gate.passed).length ?? 0;
  const totalGates = quality?.gates.length ?? 0;
  const compileStatus = (input.telemetry?.compileCount ?? 0) > 0 ? 'compiled' : 'not-compiled';
  const runtimeStatus =
    previewMountStatus === 'mounted'
      ? 'runtime-ready'
      : previewMountStatus === 'pending'
        ? 'runtime-pending'
        : previewMountStatus === 'blocked'
          ? 'runtime-blocked'
          : 'runtime-missing';
  const strength: 'strong' | 'partial' | 'weak' =
    quality?.verdict === 'pass' && outputTruth.structure.richness === 'rich'
      ? 'strong'
      : quality?.verdict === 'fail' || outputTruth.structure.richness === 'weak'
        ? 'weak'
        : 'partial';

  return {
    brief: input.brief,
    appName: input.telemetry?.appName,
    skeleton: input.telemetry
      ? {
          id: input.telemetry.skeletonId,
          label: input.telemetry.skeletonLabel,
          archetypeId: input.telemetry.archetypeId,
          archetypeName: input.telemetry.archetypeName,
          domainId: input.telemetry.domainId,
          domainName: input.telemetry.domainName,
          domainPackId: input.telemetry.domainId,
          visualPackId: input.telemetry.visualBank?.selectedPackId,
          visualVariantId: input.telemetry.visualBank?.selectedVariantId,
        }
      : undefined,
    design: input.telemetry
      ? {
          themeName: input.telemetry.themeName,
          intent: input.telemetry.designIntent,
          architectSummary: input.telemetry.architectSummary,
          designSummary: input.telemetry.designSummary,
          productStructure: [
            outputTruth.structure.summary,
            `${outputTruth.skeletonDelta.skeletonFileCount} skeleton files installed`,
            `${changedPaths.length} delta files applied`,
            `${fileCountsByClass.filter(bucket => bucket.deltaCount > 0).length} output classes touched`,
          ],
          selectedSkeleton: input.telemetry.skeletonLabel,
          selectedDomainPack: input.telemetry.domainName ?? input.telemetry.domainId,
          selectedVisualPack: visualBank?.selectedPackId,
          selectedVisualVariant: visualBank?.selectedVariantId,
          selectedThemeFile: visualBank?.selectedThemeFile,
          purpose: visualBank?.purpose,
          whenToUse: visualBank?.whenToUse,
          requiredComponents: visualBank?.requiredComponents,
          allowedSurfaces: visualBank?.allowedSurfaces,
          linkedStyleFiles: visualBank?.linkedStyleFiles,
          linkedComponentFiles: visualBank?.linkedComponentFiles,
          layoutPresetFiles: visualBank?.layoutPresetFiles,
          motionPresetFiles: visualBank?.motionPresetFiles,
          assetReferenceFiles: visualBank?.assetReferenceFiles,
          materialFiles: visualBank?.materialFiles,
          materializedFiles: visualBank?.materializedFiles,
          deltaSummary: [
            `${filesCreated.length} created`,
            `${filesUpdated.length} updated`,
            `${visualBank?.materializedFiles?.length ?? 0} materialized design-pack files`,
          ],
        }
      : undefined,
    output: {
      skeletonFiles: input.telemetry?.skeletonFiles ?? [],
      deltaFiles: input.telemetry?.deltaFiles ?? changedPaths,
      filesCreated,
      filesUpdated,
      changedFileCount: changedPaths.length,
      createdFileCount: filesCreated.length,
      deltaSizeBytes,
      keyPaths: (changedPaths.length > 0 ? changedPaths : visiblePaths).slice(0, 8),
      fileCountsByClass,
      stylePackUsage: visualBank
        ? {
            selectedPackId: visualBank.selectedPackId,
            selectedVariantId: visualBank.selectedVariantId,
            selectedThemeFile: visualBank.selectedThemeFile,
            linkedStyleFiles: visualBank.linkedStyleFiles,
            linkedComponentFiles: visualBank.linkedComponentFiles,
            materialFiles: visualBank.materialFiles,
            materializedFiles: visualBank.materializedFiles ?? [],
          }
        : undefined,
      structure: {
        richness: outputTruth.structure.richness,
        summary: outputTruth.structure.summary,
        routeExpectation: outputTruth.structure.routeExpectation,
        requiredOutputClasses: outputTruth.structure.requiredOutputClasses,
        requiredDeltaClasses: outputTruth.structure.requiredDeltaClasses,
        missingOutputClasses: outputTruth.structure.missingOutputClasses,
        missingDeltaClasses: outputTruth.structure.missingDeltaClasses,
        buckets: outputTruth.structure.buckets,
      },
      skeletonDelta: outputTruth.skeletonDelta,
      compileCount: input.telemetry?.compileCount ?? 0,
      previewMountStatus,
      runtimeStatus,
      compileStatus,
      qualityGateSummary: { passed: passedGates, total: totalGates },
      strength,
      totalTimeToPreviewMs: input.telemetry?.timeToFirstRealPreviewMs,
      saveReady: input.saveReady,
    },
    path: input.path,
    quality,
    steps: input.telemetry?.steps ?? [],
    noTelemetryReason: input.noTelemetryReason,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_FILENAME = '/App.tsx';

const normalizeToFileMap = (raw: string | FileMap | null | undefined): FileMap => {
  if (!raw) return {};
  if (typeof raw === 'string') return raw ? { [DEFAULT_FILENAME]: raw } : {};
  return raw;
};

export const getPrimaryCode = (files: FileMap): string =>
  files[DEFAULT_FILENAME] ?? files[Object.keys(files)[0]] ?? '';

// ── Billing ───────────────────────────────────────────────────────────────────

const PRICE_MAP: Record<string, { in: number; out: number }> = {
  // prices in USD per 1M tokens
  'anthropic/claude-3.5-sonnet':              { in: 3.00,  out: 15.00 },
  'anthropic/claude-sonnet-4-5':              { in: 3.00,  out: 15.00 },
  'anthropic/claude-sonnet-4-6':              { in: 3.00,  out: 15.00 },
  'anthropic/claude-3-opus':                  { in: 15.00, out: 75.00 },
  'anthropic/claude-opus-4-6':               { in: 15.00, out: 75.00 },
  'anthropic/claude-3.5-haiku':               { in: 0.80,  out: 4.00  },
  'anthropic/claude-haiku-4-5-20251001':      { in: 0.80,  out: 4.00  },
  'openai/gpt-4o':                            { in: 2.50,  out: 10.00 },
  'openai/gpt-4o-mini':                       { in: 0.15,  out: 0.60  },
  'openai/o1-preview':                        { in: 15.00, out: 60.00 },
  'openai/o1-mini':                           { in: 3.00,  out: 12.00 },
  'openai/o3-mini':                           { in: 1.10,  out: 4.40  },
  'google/gemini-2.0-pro-exp-02-05:free':     { in: 0,     out: 0     },
  'google/gemini-2.0-flash-001':              { in: 0.10,  out: 0.40  },
  'deepseek/deepseek-r1':                     { in: 0.55,  out: 2.19  },
  'deepseek/deepseek-chat':                   { in: 0.14,  out: 0.28  },
  'deepseek/deepseek-v3':                     { in: 0.14,  out: 0.28  },
  'meta-llama/llama-3.3-70b-instruct':        { in: 0.59,  out: 0.79  },
  'meta-llama/llama-3.1-8b-instruct:free':    { in: 0,     out: 0     },
  'mistralai/mistral-large':                  { in: 2.00,  out: 6.00  },
  'qwen/qwen-2.5-coder-32b-instruct':         { in: 0.07,  out: 0.16  },
};

const calcCost = (model: string, usage: UsageData): number => {
  const p = PRICE_MAP[model];
  if (!p) return 0;
  return (usage.promptTokens * p.in + usage.completionTokens * p.out) / 1_000_000;
};

const loadBilling = (projectId: string) => {
  try {
    return JSON.parse(localStorage.getItem(`BILLING_${projectId}`) || 'null') ?? { cost: 0, tokens: 0 };
  } catch { return { cost: 0, tokens: 0 }; }
};

const repositoryMetaToProjectMeta = (
  meta: Awaited<ReturnType<typeof ProjectRepository.listProjects>>[number],
): ProjectMeta => ({
  id:          meta.id,
  name:        getCanonicalProjectName(meta),
  theme:       meta.theme,
  description: '',
  createdAt:   meta.updatedAt,
  updatedAt:   meta.updatedAt,
  activeBranchId: meta.activeBranchId,
  branchIds:      meta.branchIds,
  branchCount:    meta.branchCount,
});

// ── revision helper ─────────────────────────────────────────────────────────

const MAX_REVISIONS = 5;
const LINEAGE_RESET_REQUEST_RE =
  /(full redesign|rebuild|start over|overhaul|new structure|new navigation|new ia|re-architect|build from scratch|redo everything|remake completely|сделай всё заново|начни заново|с нуля|полностью переделай|перестрой всё)/i;
const CONTINUATION_REQUEST_RE =
  /^\s*(?:continue|resume|keep going|go on|carry on|proceed|continue working|продолжай|продолжить|продолжим|дальше|продолжай работу)\s*[.!?…]*\s*$/i;

type LineageStatus = 'current' | 'behind' | 'historical';

interface ReconciledProjectThread {
  history: ChatMessage[];
  revisions: ProjectRevision[];
  activeLineageId: string | null;
}

function addRevision(
  existing: StoredProject,
  patch: {
    prompt:      string;
    source:      GenerationSource;
    files:       Record<string, string>;
    modelId?:    string;
    durationMs?: number;
    pagesCount?: number;
    lineageId?: string | null;
    lineageRootMessageId?: string | null;
    reportMessageId?: string | null;
  },
): ProjectRevision[] | null {
  const current = existing.revisions ?? [];
  if (current.length >= MAX_REVISIONS) return null;

  const rev: ProjectRevision = {
    id:           crypto.randomUUID(),
    prompt:       patch.prompt,
    source:       patch.source,
    files:        patch.files,
    createdAt:    new Date().toISOString(),
    modelId:      patch.modelId,
    durationMs:   patch.durationMs,
    isBookmarked: false,
    pagesCount:   patch.pagesCount,
    lineageId: patch.lineageId ?? undefined,
    lineageRootMessageId: patch.lineageRootMessageId ?? undefined,
    reportMessageId: patch.reportMessageId ?? undefined,
  };
  return [rev, ...current];
}

function shouldStartNewLineage(intent: string, existingFileCount: number): boolean {
  return existingFileCount > 0 && LINEAGE_RESET_REQUEST_RE.test(intent);
}

function isExplicitContinuationPrompt(intent: string): boolean {
  return CONTINUATION_REQUEST_RE.test(intent.trim());
}

function buildContinuationPlanPreview(plan: ProjectPlan, fallbackIntent: string): GeneratedPlanPreview {
  const record = plan as Record<string, unknown>;
  const appName =
    typeof record.appName === 'string' && record.appName.trim()
      ? record.appName.trim()
      : 'Current Project';
  const pages = Array.isArray(record.pages) ? record.pages : [];
  const steps = Array.isArray(record.steps) && record.steps.length > 0
    ? record.steps
    : [
        { id: 'think', label: 'Review the interrupted task' },
        { id: 'architect', label: 'Reuse the saved project plan' },
        { id: 'code', label: 'Continue implementation' },
        { id: 'theme', label: 'Preserve the current product direction' },
        { id: 'save', label: 'Prepare the next result' },
      ];
  const summary =
    typeof record.summary === 'string' && record.summary.trim()
      ? record.summary.trim()
      : typeof record.description === 'string' && record.description.trim()
        ? record.description.trim()
        : `Continue working on ${appName}.`;
  const assumptions = Array.isArray(record.assumptions)
    ? record.assumptions.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    ...(plan as unknown as GeneratedPlanPreview),
    appName,
    summary: summary || fallbackIntent.trim() || `Continue working on ${appName}.`,
    pages,
    steps,
    assumptions,
  };
}

const E2E_BLUEPRINT_SHORTCUT_KEY = 'AIC_E2E_BLUEPRINT_SHORTCUT';
const E2E_LIVE_GENERATION_CANARY_KEY = 'AIC_E2E_LIVE_GENERATION_CANARY';

function readLocalFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(key) === '1';
}

function buildLineageId(rootMessageId: string): string {
  return `lineage:${rootMessageId}`;
}

function getMessageRevisionId(
  message: { report?: unknown; revisionId?: unknown } | null | undefined,
): string | null {
  const messageRevisionId = typeof message?.revisionId === 'string' ? message.revisionId.trim() : '';
  if (messageRevisionId) return messageRevisionId;
  const reportRevisionId =
    message?.report && typeof message.report === 'object' && typeof (message.report as any).revisionId === 'string'
      ? String((message.report as any).revisionId).trim()
      : '';
  return reportRevisionId || null;
}

function getMessageLineageId(
  message: { report?: unknown; lineageId?: unknown } | null | undefined,
): string | null {
  const messageLineageId = typeof message?.lineageId === 'string' ? message.lineageId.trim() : '';
  if (messageLineageId) return messageLineageId;
  const reportLineageId =
    message?.report && typeof message.report === 'object' && typeof (message.report as any).lineageId === 'string'
      ? String((message.report as any).lineageId).trim()
      : '';
  return reportLineageId || null;
}

function getMessageLineageRootId(
  message: { report?: unknown; lineageRootMessageId?: unknown } | null | undefined,
): string | null {
  const rootMessageId =
    typeof message?.lineageRootMessageId === 'string'
      ? message.lineageRootMessageId.trim()
      : '';
  if (rootMessageId) return rootMessageId;
  const reportRootMessageId =
    message?.report && typeof message.report === 'object' && typeof (message.report as any).lineageRootMessageId === 'string'
      ? String((message.report as any).lineageRootMessageId).trim()
      : '';
  return reportRootMessageId || null;
}

function getRevisionLineageId(revision: Partial<ProjectRevision> | null | undefined): string | null {
  return typeof revision?.lineageId === 'string' && revision.lineageId.trim()
    ? revision.lineageId.trim()
    : null;
}

function getRevisionLineageRootId(revision: Partial<ProjectRevision> | null | undefined): string | null {
  return typeof revision?.lineageRootMessageId === 'string' && revision.lineageRootMessageId.trim()
    ? revision.lineageRootMessageId.trim()
    : null;
}

function findLatestLineageId(history: ChatMessage[] | null | undefined): string | null {
  if (!Array.isArray(history)) return null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const lineageId = getMessageLineageId(history[index]);
    if (lineageId) return lineageId;
  }
  return null;
}

function findLineageRootMessageId(history: ChatMessage[] | null | undefined, lineageId: string | null | undefined): string | null {
  if (!lineageId || !Array.isArray(history)) return null;
  for (const message of history) {
    if (
      message.type === 'blueprint'
      && getMessageLineageId(message) === lineageId
      && (message.startsLineage !== false || message.id === getMessageLineageRootId(message))
    ) {
      return message.id;
    }
  }
  return null;
}

function linkLatestGenerationReportToRevision(
  history: ChatMessage[],
  revisionId: string | null,
  lineageId?: string | null,
  lineageRootMessageId?: string | null,
): ChatMessage[] {
  if (!revisionId) return history;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message.type !== 'generation-report') continue;
    const nextReport =
      message.report && typeof message.report === 'object'
        ? {
            ...message.report,
            revisionId,
            ...(lineageId ? { lineageId } : {}),
            ...(lineageRootMessageId ? { lineageRootMessageId } : {}),
          }
        : message.report;
    return history.map((entry, entryIndex) => (
      entryIndex === index
        ? {
            ...entry,
            revisionId,
            ...(lineageId ? { lineageId } : {}),
            ...(lineageRootMessageId ? { lineageRootMessageId } : {}),
            ...(nextReport ? { report: nextReport } : {}),
          }
        : entry
    ));
  }
  return history;
}

function fileMapSignature(files: FileMap | null | undefined): string {
  if (!files) return '';
  return JSON.stringify(
    Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function reconcileProjectChatHistory(params: {
  history: ChatMessage[];
  revisions: ProjectRevision[];
  currentFiles: FileMap;
  currentHeadRevisionId?: string | null;
  currentActiveLineageId?: string | null;
}): ReconciledProjectThread {
  const { history, revisions, currentFiles, currentHeadRevisionId, currentActiveLineageId } = params;
  const clonedHistory = history.map(message => ({ ...message }));
  const clonedRevisions = revisions.map(revision => ({ ...revision }));
  if (clonedHistory.length === 0) {
    return {
      history: clonedHistory,
      revisions: clonedRevisions,
      activeLineageId: currentActiveLineageId ?? getRevisionLineageId(clonedRevisions[0]) ?? null,
    };
  }

  const reportIndices = clonedHistory.reduce<number[]>((indexes, message, index) => {
    if (message.type === 'generation-report') indexes.push(index);
    return indexes;
  }, []);
  const chronologicalRevisions = [...clonedRevisions].reverse();
  const mappedReportIndices = reportIndices.slice(-chronologicalRevisions.length);
  const reportRevisionMap = new Map<number, ProjectRevision>();
  mappedReportIndices.forEach((reportIndex, index) => {
    const revision = chronologicalRevisions[index];
    if (revision) reportRevisionMap.set(reportIndex, revision);
  });

  let walkLineageId: string | null = currentActiveLineageId ?? null;
  let walkRootMessageId: string | null = null;
  clonedHistory.forEach((message, index) => {
    if (message.type === 'blueprint') {
      const explicitRootMessageId = getMessageLineageRootId(message);
      const startsLineage =
        typeof message.startsLineage === 'boolean'
          ? message.startsLineage
          : !explicitRootMessageId || explicitRootMessageId === message.id;
      const rootMessageId = explicitRootMessageId ?? (startsLineage ? message.id : walkRootMessageId ?? message.id);
      const lineageId = getMessageLineageId(message) ?? buildLineageId(rootMessageId);
      clonedHistory[index] = {
        ...message,
        lineageId,
        lineageRootMessageId: rootMessageId,
        startsLineage,
      };
      walkLineageId = lineageId;
      walkRootMessageId = rootMessageId;
      return;
    }

    if (message.type !== 'generation-report') return;

    const mappedRevision = reportRevisionMap.get(index);
    const rootMessageId =
      getMessageLineageRootId(message)
      ?? getRevisionLineageRootId(mappedRevision)
      ?? walkRootMessageId;
    const lineageId =
      getMessageLineageId(message)
      ?? getRevisionLineageId(mappedRevision)
      ?? (rootMessageId ? buildLineageId(rootMessageId) : walkLineageId);
    const revisionId = getMessageRevisionId(message) ?? mappedRevision?.id ?? null;
    const nextReport =
      message.report && typeof message.report === 'object'
        ? {
            ...message.report,
            ...(revisionId ? { revisionId } : {}),
            ...(lineageId ? { lineageId } : {}),
            ...(rootMessageId ? { lineageRootMessageId: rootMessageId } : {}),
          }
        : message.report;
    clonedHistory[index] = {
      ...message,
      ...(revisionId ? { revisionId } : {}),
      ...(lineageId ? { lineageId } : {}),
      ...(rootMessageId ? { lineageRootMessageId: rootMessageId } : {}),
      ...(nextReport ? { report: nextReport } : {}),
    };
    if (mappedRevision) {
      mappedRevision.lineageId = lineageId ?? mappedRevision.lineageId;
      mappedRevision.lineageRootMessageId = rootMessageId ?? mappedRevision.lineageRootMessageId;
      mappedRevision.reportMessageId = message.id ?? mappedRevision.reportMessageId;
    }
    if (lineageId) walkLineageId = lineageId;
    if (rootMessageId) walkRootMessageId = rootMessageId;
  });

  const revisionById = new Map(clonedRevisions.map(revision => [revision.id, revision]));
  const lineageLatestRevisionId = new Map<string, string>();
  clonedRevisions.forEach(revision => {
    const lineageId = getRevisionLineageId(revision);
    if (lineageId && !lineageLatestRevisionId.has(lineageId)) {
      lineageLatestRevisionId.set(lineageId, revision.id);
    }
  });

  const activeLineageId =
    currentActiveLineageId
    ?? getRevisionLineageId(currentHeadRevisionId ? revisionById.get(currentHeadRevisionId) : undefined)
    ?? findLatestLineageId(clonedHistory)
    ?? getRevisionLineageId(clonedRevisions[0])
    ?? null;

  const currentSignature = fileMapSignature(currentFiles);
  const matchesRevision = (revisionId: string | null | undefined): boolean => {
    if (!revisionId) return false;
    if (currentHeadRevisionId && currentHeadRevisionId === revisionId) return true;
    const revision = revisionById.get(revisionId);
    if (!revision) return false;
    return fileMapSignature(revision.files) === currentSignature;
  };

  const historyWithStatus = clonedHistory.map(message => {
    const lineageId = getMessageLineageId(message);
    const lineageRootMessageId = getMessageLineageRootId(message);
    if (message.type === 'generation-report') {
      const revisionId = getMessageRevisionId(message);
      const lineageStatus: LineageStatus | undefined = lineageId
        ? activeLineageId === lineageId
          ? (matchesRevision(revisionId) ? 'current' : 'behind')
          : 'historical'
        : undefined;
      return {
        ...message,
        ...(lineageId ? { lineageId } : {}),
        ...(lineageRootMessageId ? { lineageRootMessageId } : {}),
        ...(revisionId ? { revisionId } : {}),
        ...(lineageStatus ? { lineageStatus } : {}),
        restoreAvailable: !!revisionId && !matchesRevision(revisionId),
      };
    }

    if (
      message.type === 'blueprint'
      && lineageId
      && (message.startsLineage !== false || message.id === lineageRootMessageId)
    ) {
      const lastGoodRevisionId = lineageLatestRevisionId.get(lineageId) ?? null;
      const lineageStatus: LineageStatus = activeLineageId === lineageId
        ? (matchesRevision(lastGoodRevisionId) ? 'current' : 'behind')
        : 'historical';
      return {
        ...message,
        lineageId,
        lineageRootMessageId: lineageRootMessageId ?? message.id,
        startsLineage: message.startsLineage ?? true,
        ...(lastGoodRevisionId ? { lastGoodRevisionId } : {}),
        lineageStatus,
        restoreAvailable: !!lastGoodRevisionId && !matchesRevision(lastGoodRevisionId),
      };
    }

    return message;
  });

  return {
    history: historyWithStatus,
    revisions: clonedRevisions,
    activeLineageId,
  };
}

interface PendingProjectSave {
  projectId: string;
  projectTitle: string;
  finalFiles: FileMap;
  skeletonId?: string | null;
  chatHistoryToSave: any[];
  userPrompt: string;
  source: GenerationSource;
  effectiveModel: string;
  generationStartMs: number;
  generationLogs: string[];
  generationErrors: string[];
  plan: ProjectPlan | null;
  planTheme: string;
  reqUsage: UsageData;
  lineageId?: string | null;
  lineageRootMessageId?: string | null;
  reportMessageId?: string | null;
}

type PendingProjectSaveReason = 'manual-after-preview';

interface PendingProjectSaveMeta {
  projectId: string;
  projectTitle: string;
  previewReady: boolean;
}

/**
 * Canonical project lifecycle states:
 *   none         — no project or draft active (blank slate / idea mode)
 *   draft        — draft session active, generation in progress or paused
 *   preview-ready — generation complete, preview mounted, awaiting explicit Save
 *   exists        — persisted saved project loaded
 *   unknown       — id found in localStorage but not yet verified against storage
 *   missing       — id found but project data is gone (stale reference)
 */
type ProjectPersistenceState = 'none' | 'unknown' | 'exists' | 'missing' | 'draft' | 'preview-ready';

const LEGACY_CHAT_HISTORY_KEY = 'CHAT_HISTORY';
const DRAFT_CHAT_KEY_PREFIX = 'AIC_DRAFT_CHAT_';
const DRAFT_SESSION_ID_KEY = 'AIC_DRAFT_SESSION_ID';
const ACTIVE_PROJECT_PERSISTENCE_STATES: ReadonlySet<ProjectPersistenceState> = new Set(['exists', 'draft', 'preview-ready']);

type ComparableScopedSettings = {
  selectedModel?: string;
  engineModel?: string;
  autoRoute?: boolean;
  fullContext?: boolean;
  agentConfigs?: Record<string, { provider?: string; modelId?: string }>;
};

function normalizeComparableScopedSettings(input: ComparableScopedSettings): ComparableScopedSettings {
  const normalize = (value: string | undefined): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  };

  const normalizedAgentEntries = Object.entries(input.agentConfigs ?? {}).reduce<Array<[string, { provider?: string; modelId?: string }]>>(
    (acc, [agentId, cfg]) => {
      const provider = normalize(cfg.provider);
      const modelId = normalize(cfg.modelId);
      const normalizedCfg = {
        ...(provider !== undefined && { provider }),
        ...(modelId !== undefined && { modelId }),
      };
      if (Object.keys(normalizedCfg).length > 0) {
        acc.push([agentId, normalizedCfg]);
      }
      return acc;
    },
    [],
  ).sort((a, b) => a[0].localeCompare(b[0]));
  const normalizedAgentConfigs = Object.fromEntries(normalizedAgentEntries);

  return {
    ...(normalize(input.selectedModel) !== undefined && { selectedModel: normalize(input.selectedModel) }),
    ...(normalize(input.engineModel) !== undefined && { engineModel: normalize(input.engineModel) }),
    ...(typeof input.autoRoute === 'boolean' && { autoRoute: input.autoRoute }),
    ...(typeof input.fullContext === 'boolean' && { fullContext: input.fullContext }),
    ...(Object.keys(normalizedAgentConfigs).length > 0 && { agentConfigs: normalizedAgentConfigs }),
  };
}

function toComparableScopedSettings(
  input: EffectiveSettings | ProjectSettingsOverride | ComparableScopedSettings,
): ComparableScopedSettings {
  return normalizeComparableScopedSettings({
    selectedModel: input.selectedModel,
    engineModel: input.engineModel,
    autoRoute: input.autoRoute,
    fullContext: input.fullContext,
    agentConfigs: input.agentConfigs,
  });
}

function comparableSettingsSignature(
  input: EffectiveSettings | ProjectSettingsOverride | ComparableScopedSettings,
): string {
  return JSON.stringify(toComparableScopedSettings(input));
}

function getDraftChatStorageKey(draftId: string): string {
  return `${DRAFT_CHAT_KEY_PREFIX}${draftId}`;
}

function readDraftSessionId(): string | null {
  try {
    return sessionStorage.getItem(DRAFT_SESSION_ID_KEY) ?? localStorage.getItem(DRAFT_SESSION_ID_KEY);
  } catch {
    return null;
  }
}

function writeDraftSessionId(draftId: string): void {
  try { sessionStorage.setItem(DRAFT_SESSION_ID_KEY, draftId); } catch { /* ignore */ }
  try { localStorage.setItem(DRAFT_SESSION_ID_KEY, draftId); } catch { /* ignore */ }
}

function clearDraftSessionId(): void {
  try { sessionStorage.removeItem(DRAFT_SESSION_ID_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(DRAFT_SESSION_ID_KEY); } catch { /* ignore */ }
}

function readDraftChatHistory(draftId: string | null): ChatMessage[] {
  if (!draftId) return [];
  const key = getDraftChatStorageKey(draftId);
  const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
  if (!raw) return [];
  try {
    return normalizeMessages(JSON.parse(raw));
  } catch {
    return [];
  }
}

function isSessionOnlyProjectMessage(message: ChatMessage): boolean {
  if ((message as any).persistInHistory === false || (message as any).sessionOnly === true) {
    return true;
  }

  if (message.type === 'progress') return true;

  if (message.role === 'assistant' && message.content === '...') {
    return true;
  }

  const text = typeof message.content === 'string' ? message.content.trim() : '';
  if (!text || message.role !== 'assistant') return false;

  return (
    text.startsWith('⚠️ Preview failed to load:')
    || text.startsWith('⚠️ Could not load project:')
    || text.startsWith('⚠️ Project not found:')
  );
}

function buildPersistedProjectChatHistory(history: any[] | null | undefined): ChatMessage[] {
  return normalizeMessages(Array.isArray(history) ? history : []).filter(message => !isSessionOnlyProjectMessage(message));
}

function readInitialChatHistory(): ChatMessage[] {
  try {
    const activeProjectId = localStorage.getItem('CURRENT_PROJECT_ID');
    if (activeProjectId && ProjectStorage.projectDataExists(activeProjectId)) {
      const activeProject = ProjectStorage.getProject(activeProjectId);
      return buildPersistedProjectChatHistory((activeProject?.chatHistory as any[]) ?? []);
    }
    const activeDraftId = readDraftSessionId();
    return readDraftChatHistory(activeDraftId);
  } catch {
    return [];
  }
}

// ── hook ─────────────────────────────────────────────────────────────────────

export const useStudio = () => {
  const { user: authUser } = useAuth();
  // ── chat ─────────────────────────────────────────────────────────────────
  const [messages, dispatch] = useReducer(
    chatReducer,
    [],
    readInitialChatHistory,
  );

  // Tracks the id of the last blueprint message so ACCEPT/REJECT subscribers
  // can hide it without scanning the messages array.
  const blueprintIdRef = useRef<string | null>(null);
  // Guard: prevents double-dispatch when user clicks confirm twice quickly.
  const confirmingRef = useRef(false);

  // ── chat dispatch helpers ─────────────────────────────────────────────────
  const chatAppend = useCallback((partial: Omit<ChatMessage, 'id' | 'timestamp'> & Partial<Pick<ChatMessage, 'id' | 'timestamp'>>) => {
    dispatch({ type: 'APPEND', payload: partial });
  }, []);

  const chatLoadHistory = useCallback((history: any[]) => {
    dispatch({ type: 'LOAD_HISTORY', payload: history });
  }, []);

  const chatReset = useCallback(() => {
    dispatch({ type: 'RESET', payload: [] });
  }, []);

  const chatUpdate = useCallback((id: string, patch: Partial<ChatMessage>) => {
    dispatch({ type: 'UPDATE_BY_ID', id, patch });
  }, []);

  const chatPatchLast = useCallback((patch: Partial<ChatMessage>, when?: (msg: ChatMessage) => boolean) => {
    dispatch({ type: 'PATCH_LAST', patch, when });
  }, []);

  const chatRemoveByType = useCallback((msgType: string) => {
    dispatch({ type: 'REMOVE_BY_TYPE', msgType });
  }, []);

  // Ref flag: set by createNewProject() so _sendImpl uses empty history even if
  // React hasn't re-rendered yet (stale closure guard).
  const pendingHistoryClear = useRef(false);

  // Blueprint confirmation — set when Architect plan is ready, cleared on confirm/cancel.
  // resolver lives in a ref (not state) so resolve() fires only after React commits the cleanup.
  const [pendingPlan, setPendingPlan] = useState<PendingBlueprintPlan | null>(null);
  const planResolverRef = useRef<((decision: PlanApprovalDecision) => void) | null>(null);
  const planDecisionRef = useRef<PlanApprovalDecision | null>(null);

  // Diff review — set when edit candidate is compiled and has significant changes.
  // Resolver receives the selected file paths (partial apply) or false (reject all).
  const [pendingDiff, setPendingDiff] = useState<FileDiff[] | null>(null);
  const diffResolverRef = useRef<((result: string[] | false) => void) | null>(null);

  // Edit admission — set when EditAdmissionService classifies an incoming edit
  // as 'risky' or 'destructive'. Resolver receives true (proceed) or false (deny).
  const [pendingAdmission, setPendingAdmission] = useState<AdmissionDecision | null>(null);
  const admissionResolverRef = useRef<((approved: boolean) => void) | null>(null);

  // Clarification wait — resolver set when clarification card is shown,
  // resolved when user submits their answer via answerClarification().
  const clarificationResolverRef = useRef<((answer: string) => void) | null>(null);

  // Surface choice — resolver set when surface-choice card is shown,
  // resolved when user picks a surface type via chooseSurface().
  const surfaceChoiceResolverRef = useRef<((surface: 'landing' | 'app' | 'superapp') => void) | null>(null);

  // Tracks whether generationMode was explicitly set by the user or plan context.
  // When false, the surface-choice dialog appears before each genesis generation.
  const modeSetByUserRef = useRef(false);
  const lastGenerationPromptRef = useRef('');

  // ── files ─────────────────────────────────────────────────────────────────
  // On startup always restore from the last *stable* snapshot to avoid showing
  // a broken candidate that was in-flight when the tab was closed.
  //
  // Architecture:
  //   filesRaw    — raw FileMap state (streaming optimistic updates + manual edits)
  //   projectGraph — authoritative ProjectGraph set from GenerationResult.graph
  //   files       — DERIVED: projectGraphToFileMap(projectGraph) when graph is set,
  //                 else filesRaw. This is the "primary state" in the public API.
  //                 Downstream consumers should prefer reading projectGraph directly.
  const [filesRaw, setFilesRaw] = useState<FileMap>(() => {
    const snaps: Snapshot[] = JSON.parse(localStorage.getItem('SNAPSHOTS') || '[]');
    const stableId = localStorage.getItem('STABLE_SNAPSHOT_ID');
    // 1. Try the explicitly-stored stable snapshot ID
    if (stableId) {
      const snap = snaps.find(s => s.id === stableId);
      if (snap) return normalizeToFileMap(snap.files);
    }
    // 2. Walk backwards to find the last stable snapshot (see isSnapshotStable)
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (isSnapshotStable(snaps[i])) return normalizeToFileMap(snaps[i].files);
    }
    // 3. No stable snapshot at all — fall back to LAST_FILES / LAST_CODE
    return normalizeToFileMap(
      JSON.parse(localStorage.getItem('LAST_FILES') || 'null') ||
      localStorage.getItem('LAST_CODE')
    );
  });

  // Authoritative ProjectGraph — set from GenerationResult.graph after each generation.
  // Null before first generation or after a snapshot restore / manual file edit.
  const [projectGraph, setProjectGraph] = useState<ProjectGraph | null>(null);

  // Derived "files" — authoritative projection when projectGraph is available,
  // raw FileMap otherwise.  This is the value exposed to all consumers.
  // Use useMemo so the reference is stable when neither input changes.
  const files = useMemo<FileMap>(
    () => (projectGraph ? projectGraphToFileMap(projectGraph) : filesRaw),
    [projectGraph, filesRaw],
  );

  // Exposed setFiles — updates raw state and clears projectGraph so filesRaw takes
  // ownership again (user edit, snapshot restore, streaming optimistic update).
  // After a successful generation, setFilesRaw + setProjectGraph are called
  // directly (atomically) to avoid the intermediate null-graph state.
  const setFiles = useCallback((newFiles: FileMap) => {
    setFilesRaw(newFiles);
    setProjectGraph(null);
  }, []);

  const [activeFile, setActiveFileRaw] = useState<string>(DEFAULT_FILENAME);

  // ── EMERGENCY RESTORE (Машина времени из recover.html) ───────────────────
  useEffect(() => {
    const emergencyBackup = localStorage.getItem('aic_files_backup');
    if (emergencyBackup) {
      try {
        const parsedFiles = JSON.parse(emergencyBackup);
        setFiles(parsedFiles);
        localStorage.removeItem('aic_files_backup');
        console.log('🚀 SYSTEM RESTORED VIA EMERGENCY CHANNEL');
      } catch (e) {
        console.error('Failed to restore from emergency backup:', e);
      }
    }
  }, []);

  const setActiveFile = useCallback((name: string) => {
    setActiveFileRaw(name);
    CollabService.updateActiveFile(name);
  }, []);

  // ── snapshots / history ───────────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() =>
    JSON.parse(localStorage.getItem('SNAPSHOTS') || '[]')
  );
  const [currentSnapshotId, setCurrentSnapshotId] = useState<string | null>(
    localStorage.getItem('CURRENT_SNAPSHOT_ID')
  );
  const [stableSnapshotId, setStableSnapshotId] = useState<string | null>(
    localStorage.getItem('STABLE_SNAPSHOT_ID')
  );
  const [historyIndex, setHistoryIndex] = useState<number>(() => {
    const s: Snapshot[] = JSON.parse(localStorage.getItem('SNAPSHOTS') || '[]');
    // Start at the last stable snapshot, not the last one in the list,
    // so that broken candidates don't become the default history position.
    const stableId = localStorage.getItem('STABLE_SNAPSHOT_ID');
    if (stableId) {
      const idx = s.findIndex(snap => snap.id === stableId);
      if (idx !== -1) return idx;
    }
    for (let i = s.length - 1; i >= 0; i--) {
      if (isSnapshotStable(s[i])) return i;
    }
    return s.length - 1;
  });

  const addSnapshot = useCallback((newFiles: FileMap, label: string, revId?: string): Snapshot => {
    // Compute snapshot data eagerly so we can call all setters at the same level
    // (never call setState inside another setState updater — that creates render-phase
    // updates which can corrupt the hooks linked list and trigger "Should have a queue").
    const base    = snapshots.slice(0, historyIndex + 1);
    const version = base.length + 1;
    const snap: Snapshot = {
      id: Date.now().toString(),
      files: newFiles,
      label: label.slice(0, 48),
      createdAt: new Date().toISOString(),
      version,
      status: 'candidate',
      revisionId: revId ?? revisionManager.getActiveRevisionId() ?? undefined,
    };
    const updated = [...base, snap];
    safeSetItem('SNAPSHOTS', JSON.stringify(updated));
    safeSetItem('CURRENT_SNAPSHOT_ID', snap.id);
    setSnapshots(updated);
    setCurrentSnapshotId(snap.id);
    setHistoryIndex(updated.length - 1);
    return snap;
  }, [historyIndex, snapshots]);

  const restoreSnapshot = useCallback((snap: Snapshot) => {
    const restored = normalizeToFileMap(snap.files);
    setFiles(restored);
    setCurrentSnapshotId(snap.id);
    safeSetItem('CURRENT_SNAPSHOT_ID', snap.id);
    const idx = snapshots.findIndex(s => s.id === snap.id);
    if (idx !== -1) setHistoryIndex(idx);
    if (!restored[activeFile]) setActiveFile(Object.keys(restored)[0] ?? DEFAULT_FILENAME);

    // Flush to preview via RevisionManager so the iframe updates
    if (snap.revisionId) {
      revisionManager.restoreRevision(snap.revisionId).catch((err: unknown) => {
        console.warn('[useStudio] revision restore failed, falling back to files state:', err);
      });
    }
  }, [snapshots, activeFile]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const snap = snapshots[historyIndex - 1];
      if (snap) restoreSnapshot(snap);
    }
  }, [historyIndex, snapshots, restoreSnapshot]);

  const redo = useCallback(() => {
    if (historyIndex < snapshots.length - 1) {
      const snap = snapshots[historyIndex + 1];
      if (snap) restoreSnapshot(snap);
    }
  }, [historyIndex, snapshots, restoreSnapshot]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < snapshots.length - 1 && snapshots.length > 0;

  const clearSnapshots = useCallback(() => {
    setSnapshots([]);
    setCurrentSnapshotId(null);
    setStableSnapshotId(null);
    setHistoryIndex(-1);
    localStorage.removeItem('SNAPSHOTS');
    localStorage.removeItem('CURRENT_SNAPSHOT_ID');
    localStorage.removeItem('STABLE_SNAPSHOT_ID');
  }, []);

  /** rollbackToStable — restore the last snapshot marked as 'stable'.
   *  Called when the user clicks "Rollback" after a preview failure. */
  const rollbackToStable = useCallback(() => {
    const sid = stableSnapshotId;
    if (!sid) return;
    const snap = snapshots.find(s => s.id === sid);
    if (!snap) return;
    restoreSnapshot(snap);
  }, [stableSnapshotId, snapshots, restoreSnapshot]);

  /**
   * markSnapshotStable — called after the preview successfully mounts without
   * errors (driven by the preview-mounted(buildId) → ready lifecycle). Promotes
   * `snapshotId` from candidate → stable and writes STABLE_SNAPSHOT_ID to
   * localStorage so the next restart opens this revision.
   *
   * Invariant: a broken candidate (iframe-error, or a timed-out preview-mounted)
   * is never passed here, so stable is never replaced by broken code.
   */
  const markSnapshotStable = useCallback((snapshotId: string) => {
    setSnapshots(prev => {
      const updated = prev.map(s =>
        s.id === snapshotId ? { ...s, status: 'stable' as const } : s
      );
      safeSetItem('SNAPSHOTS', JSON.stringify(updated));
      return updated;
    });
    setStableSnapshotId(snapshotId);
    safeSetItem('STABLE_SNAPSHOT_ID', snapshotId);
  }, []);

  const invalidatePendingProjectSaveReady = useCallback(() => {
    setPendingProjectSaveMeta(prev => (
      prev?.previewReady ? { ...prev, previewReady: false } : prev
    ));
  }, []);

  const promoteFinalPreviewReady = useCallback((snapshotId: string | null) => {
    finalPreviewGateRef.current = { awaiting: false, filesCommitted: false };
    if (currentPlanMsgIdRef.current) {
      chatUpdate(currentPlanMsgIdRef.current, { buildStatus: 'ready' });
    }
    if (snapshotId) {
      markSnapshotStable(snapshotId);
    }
    setPreviewLifecycle('preview-ready');
    setProjectPersistenceState(prev => (
      pendingProjectSaveRef.current && prev !== 'exists' ? 'preview-ready' : prev
    ));
    setPendingProjectSaveMeta(prev => prev ? { ...prev, previewReady: true } : prev);
    if (currentTraceLookupRef.current.runId) {
      generationTracer.updateRunSummary(
        {
          runId: currentTraceLookupRef.current.runId,
          projectId: currentTraceLookupRef.current.projectId,
          branchId: currentTraceLookupRef.current.branchId,
        },
        {
          output: {
            previewMountStatus: 'mounted',
            saveReady: true,
            totalTimeToPreviewMs: currentTraceLookupRef.current.startedMs
              ? Date.now() - currentTraceLookupRef.current.startedMs
              : undefined,
          },
        },
      );
    }
  }, [chatUpdate, markSnapshotStable]);

  useEffect(() => {
    const syncPreviewState = (state: ReturnType<typeof previewController.getState>) => {
      if (state.status === 'compiling' && state.activeRevisionId) {
        const nextUrl = appendPreviewSessionToUrl(`/preview/${state.activeRevisionId}`);
        setPreviewUrl(prev => (prev === nextUrl ? prev : nextUrl));
        setPreviewReady(false);
        invalidatePendingProjectSaveReady();
        setPreviewBlockedReason(null);
        if (state.buildStage === 'final' || state.buildStage === 'repair') {
          setPreviewLifecycle('materializing');
        }
        return;
      }

      if (state.status === 'ready' && state.activeRevisionId) {
        const nextUrl = appendPreviewSessionToUrl(`/preview/${state.activeRevisionId}`);
        setPreviewUrl(prev => (prev === nextUrl ? prev : nextUrl));
        setPreviewBlockedReason(null);
        if (state.buildStage === 'skeleton') {
          setPreviewReady(false);
          setPreviewLifecycle(prev => (prev === 'preview-ready' ? prev : 'skeleton-ready'));
          return;
        }

        setPreviewReady(true);
        if (finalPreviewGateRef.current.awaiting) {
          if (!finalPreviewGateRef.current.filesCommitted) {
            setPreviewLifecycle('materializing');
            return;
          }
          if (!currentSnapshotId) {
            return;
          }
        } else if (!currentSnapshotId) {
          setPreviewLifecycle('preview-ready');
          return;
        }
        if (lastPreviewReadyRevisionRef.current === state.activeRevisionId) return;
        lastPreviewReadyRevisionRef.current = state.activeRevisionId;
        promoteFinalPreviewReady(currentSnapshotId);
        return;
      }

      if (state.status === 'failed') {
        finalPreviewGateRef.current = { awaiting: false, filesCommitted: false };
        setPreviewReady(false);
        invalidatePendingProjectSaveReady();
        setPreviewLifecycle(prev => (
          prev === 'preview-ready'
            ? 'degraded'
            : (prev === 'committing' || prev === 'generating' || prev === 'materializing')
              ? 'failed'
              : prev
        ));
        if (state.error) setPreviewBlockedReason(state.error);
      }
    };

    syncPreviewState(previewController.getState());
    return previewController.subscribe(syncPreviewState);
  }, [currentSnapshotId, invalidatePendingProjectSaveReady, promoteFinalPreviewReady]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  SEMANTIC GLOSSARY — revision / version / snapshot disambiguation
  // ═══════════════════════════════════════════════════════════════════════════
  //
  //  1. SNAPSHOT (this layer — useStudio undo/redo)
  //     - A full file-map checkpoint in the undo/redo history.
  //     - snapshotIndex:      1-indexed position of the user in history.
  //     - snapshotCount:      total number of snapshots.
  //     - lastStableSnapshot: index of the most recent snapshot whose iframe
  //                           mounted without errors (crash-recovery fallback).
  //     - Snapshot.status:    'candidate' (untested) → 'stable' (iframe ok).
  //
  //  2. BUILD REVISION (RevisionManager layer)
  //     - A UUID-scoped backend compile cycle (POST /api/preview/:buildId/compile).
  //     - candidateRevisionId: in-flight build being compiled.
  //     - activeRevisionId:    last successfully compiled build (shown in iframe).
  //     - Also called "buildId" in the preview-timeline.
  //     - One snapshot can link to one build revision via Snapshot.revisionId.
  //
  //  3. PROJECT REVISION (persistence layer — ProjectStorage)
  //     - A full file snapshot saved to StoredProject.revisions[].
  //     - Max 5 per project. Shown in ProjectsScreen as "versions".
  //     - Completely separate from snapshots and build revisions.
  //
  //  4. PROJECT RECORD VERSION (Supabase layer — ProjectRepository)
  //     - ProjectRecord.version: optimistic concurrency counter.
  //     - Incremented on each DB save. Not user-visible. Not related to any
  //       of the above.
  // ═══════════════════════════════════════════════════════════════════════════

  /** 1-indexed position of the user in undo/redo history. UI: "snap #N". */
  const snapshotIndex  = historyIndex + 1 || snapshots.length;
  /** Total number of snapshots in undo/redo history. */
  const snapshotCount  = snapshots.length;

  /**
   * 1-indexed version of the most recent *stable* snapshot (iframe mounted
   * without errors). This is the crash-recovery fallback and the true
   * "last good" state shown with the green checkmark in EngineTopBar.
   *
   * Returns undefined when no stable snapshot exists yet.
   */
  const lastStableSnapshotIndex: number | undefined = useMemo(() => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (isSnapshotStable(snapshots[i])) return snapshots[i].version;
    }
    return undefined;
  }, [snapshots]);

  // ── backward-compat aliases (deprecated — use canonical names above) ────
  const currentVersion    = snapshotIndex;
  const totalVersions     = snapshotCount;
  const lastStableVersion = lastStableSnapshotIndex;

  // ── logs ──────────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((msg: string, level: LogEntry['level'] = 'info') => {
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-199), { level, message: msg, time }]);
    // Forward to Stability Terminal (DevModePanel)
    try {
      (window as any).__stabilityLog?.({
        level: level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'info',
        source: 'studio',
        message: msg,
      });
    } catch { /* ignore */ }
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const downloadLogs = useCallback(() => {
    if (logs.length === 0) return;
    const content = `AIC-RG Studio — Event Log\n${'─'.repeat(40)}\n${
      logs.map(l => `[${l.time}] ${l.level.toUpperCase()}: ${l.message}`).join('\n')
    }`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `studio-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  // ── attachments ───────────────────────────────────────────────────────────
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addAttachment = useCallback((att: Attachment) => {
    setAttachments(prev => [...prev, att]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => setAttachments([]), []);

  const [activeProjectContext, setActiveProjectContext] = useState<ActiveProjectContext | null>(null);
  const packagedLaunchContextRef = useRef<PackagedLaunchContext | null>(null);

  const removeComposerContextItem = useCallback((id: string) => {
    if (packagedLaunchContextRef.current?.id === id) {
      packagedLaunchContextRef.current = null;
    }
    const nextItems = composerContextItemsRef.current.filter(item => item.id !== id);
    composerContextItemsRef.current = nextItems;
    setComposerContextItems(nextItems);
    const nextActiveContext = activeProjectContextRef.current?.id === id ? null : activeProjectContextRef.current;
    activeProjectContextRef.current = nextActiveContext;
    setActiveProjectContext(nextActiveContext);
  }, []);

  const clearComposerContextItems = useCallback(() => {
    packagedLaunchContextRef.current = null;
    composerContextItemsRef.current = [];
    activeProjectContextRef.current = null;
    setComposerContextItems([]);
    setActiveProjectContext(null);
  }, []);

  const addComposerContextFromPlan = useCallback((
    plan: ProjectPlan | null | undefined,
    intent: string,
    source: ComposerContextSource = 'weekly-feed',
    titleOverride?: string,
  ) => {
    const appName = (titleOverride ?? plan?.appName ?? '').trim();
    const title = appName || intent.slice(0, 64) || 'Imported context';
    const summaryParts: string[] = [];
    if (plan?.description) summaryParts.push(String(plan.description));
    if (plan?.targetUser) summaryParts.push(`Target: ${String(plan.targetUser)}`);
    if (source === 'niche' && (plan as any)?.competitorGap) {
      summaryParts.push(`Gap: ${String((plan as any).competitorGap)}`);
    }
    const summary = summaryParts.join(' · ').slice(0, 320);
    const normalizedIntent = intent.trim();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const id = `${source}:${slug}:${Date.now()}`;
    const nextItem: ComposerContextItem = {
      id,
      source,
      title,
      intent: normalizedIntent,
      summary,
      createdAt: Date.now(),
      plan: plan ?? undefined,
    };
    packagedLaunchContextRef.current = plan && (
      source === 'weekly-feed' ||
      source === 'niche' ||
      source === 'trend-niche'
    )
      ? { id, source, plan }
      : null;

    const duplicateIndex = composerContextItemsRef.current.findIndex(item =>
      item.source === source &&
      item.title.toLowerCase() === title.toLowerCase() &&
      item.intent.trim() === normalizedIntent,
    );
    const nextItems = duplicateIndex >= 0
      ? [
          ...composerContextItemsRef.current.slice(0, duplicateIndex),
          ...composerContextItemsRef.current.slice(duplicateIndex + 1),
        ]
      : [...composerContextItemsRef.current];
    nextItems.push(nextItem);
    const trimmedItems = nextItems.slice(-6);
    composerContextItemsRef.current = trimmedItems;
    setComposerContextItems(trimmedItems);

    if (plan) {
      const nextActiveContext = {
        ...nextItem,
        plan,
      };
      activeProjectContextRef.current = nextActiveContext;
      setActiveProjectContext(nextActiveContext);
    }

    if (source === 'weekly-feed' || source === 'niche' || source === 'trend-niche') {
      generationSourceRef.current = source;
      setGenerationSource(source);
      if (title) trendIdeaTitleRef.current = title;
    }

    if (plan?.pages?.length) {
      if (plan.pages.length >= 8) setGenerationMode('superapp');
      else setGenerationMode('app');
      modeSetByUserRef.current = true; // plan specifies surface, no need to ask
    }

    if (inputRef.current.trim().length === 0) {
      inputRef.current = normalizedIntent;
      setInput(normalizedIntent);
    }
  }, []);

  /**
   * Direct transient chat-context import (no generation, no project creation).
   * Used by "Trend Niches → В диалог" path.
   */
  const setChatContext = useCallback((
    brief: string,
    source: ComposerContextSource = 'manual',
    appName?: string,
  ) => {
    addComposerContextFromPlan(null, brief, source, appName);
  }, [addComposerContextFromPlan]);

  // ── projects ──────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<ProjectMeta[]>(() =>
    ProjectStorage.listProjects()
  );
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
    const saved = localStorage.getItem('CURRENT_PROJECT_ID');
    if (!saved) return null;
    // Migrate: discard legacy numeric-timestamp IDs (Supabase expects UUID)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return UUID_RE.test(saved) ? saved : null;
  });
  const [projectPersistenceState, setProjectPersistenceState] = useState<ProjectPersistenceState>(() => {
    const saved = localStorage.getItem('CURRENT_PROJECT_ID');
    if (!saved) return 'none';
    return ProjectStorage.projectDataExists(saved) ? 'exists' : 'unknown';
  });
  // Keep a ref in sync with projectPersistenceState so callers that capture a stale
  // closure (notably the e2e facade useEffect with [] deps) can read the current value.
  const projectPersistenceStateRef = useRef<ProjectPersistenceState>(projectPersistenceState);
  useEffect(() => {
    projectPersistenceStateRef.current = projectPersistenceState;
  }, [projectPersistenceState]);

  // Refresh project list from Supabase on mount (async — sync init above is the initial state)
  useEffect(() => {
    ProjectRepository.listProjects().then(meta => {
      setProjects(meta.map(repositoryMetaToProjectMeta));
    }).catch(() => { /* already have localStorage fallback from useState init */ });
  }, []);

  // ── ui state (lazy initialisers — ConfigService reads run once on mount) ──
  const [input,           setInput]           = useState('');
  const [showSettings,    setShowSettings]    = useState(false);
  const [isGenerating,    setIsGenerating]    = useState(false);
  const [device,          setDevice]          = useState<DeviceType>('desktop');
  // ── Settings (extracted hook) ───────────────────────────────────────────────
  const settings = useSettingsState();
  const { apiKey, setApiKey, selectedModel, setSelectedModel, theme, setTheme,
           fullContextMode, setFullContextMode, autoRoute, setAutoRoute,
           appLanguage, setAppLanguage, agentConfigs, setAgentConfig, refreshFromConfig } = settings;

  const [progress,        setProgress]        = useState(0);
  const [currentPhase,    setCurrentPhase]    = useState<string>('');
  const [machineState,    setMachineState]    = useState<MachineState>(INITIAL_STATE);
  /** Explicit kickoff lifecycle — only meaningful for genesis (existingCodeCount === 0) runs. */
  const [kickoffPhase,    setKickoffPhase]    = useState<KickoffPhase>('idle');
  const [generationMode,  setGenerationMode]  = useState<'landing' | 'app' | 'superapp'>('app');
  const [generationSource, setGenerationSource] = useState<GenerationSource>('chat');
  const [designClassification, setDesignClassification] = useState<ClassificationResult | null>(null);
  const [composerContextItems, setComposerContextItems] = useState<ComposerContextItem[]>([]);
  const inputRef = useRef(input);
  inputRef.current = input;
  const generationSourceRef = useRef(generationSource);
  generationSourceRef.current = generationSource;
  const composerContextItemsRef = useRef(composerContextItems);
  composerContextItemsRef.current = composerContextItems;
  const activeProjectContextRef = useRef(activeProjectContext);
  activeProjectContextRef.current = activeProjectContext;
  // Persists the trend-niche idea title across multiple _sendImpl calls
  // (composerContextItems are cleared after the first call but generationSource stays 'trend-niche')
  const trendIdeaTitleRef = useRef<string>('');


  // ── Figma state (extracted hook) ─────────────────────────────────────────────
  const figma = useFigmaState(addLog);
  const { figmaAccounts, addFigmaAccount, removeFigmaAccount, refreshFigmaAccounts,
          figmaLink, setFigmaLink, figmaAccessResult, validateFigmaLink, figmaValidating,
          currentProjectTheme, syncProgress, syncFigmaUrl, syncSource, startFigmaSync,
          targetMarket, setTargetMarket, auditStrictness, setAuditStrictness,
          figmaProjects, activeFigmaProjectId,
          saveFigmaProject, loadFigmaProject, deleteFigmaProject,
          markFigmaProjectSynced, clearFigmaSync,
          engineApiKey, setEngineApiKey, engineModelId, setEngineModelId,
          engineStatus, engineResult } = figma;

  const [settingsUserId, setSettingsUserId] = useState<string | null>(authUser?.id ?? null);
  const isApplyingScopedSettingsRef = useRef(false);
  const settingsInitializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const resolveUserId = async () => {
      if (authUser?.id) {
        if (!cancelled) setSettingsUserId(authUser.id);
        return;
      }
      const detected = await UserProjectSettingsService.getCurrentUserId();
      if (!cancelled) setSettingsUserId(detected);
    };
    void resolveUserId();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  const applyEffectiveSettingsForProject = useCallback((projectId: string | null): boolean => {
    if (!projectId) return false;
    isApplyingScopedSettingsRef.current = true;
    try {
      const applied = UserProjectSettingsService.applyEffectiveSettings(settingsUserId, projectId);
      if (!applied) return false;
      refreshFromConfig();
      setEngineModelId(ConfigService.getEngineModel());
      return true;
    } finally {
      isApplyingScopedSettingsRef.current = false;
    }
  }, [refreshFromConfig, setEngineModelId, settingsUserId]);

  const persistProjectOverrideIfNeeded = useCallback((projectId: string | null): void => {
    if (!projectId) return;
    if (!ACTIVE_PROJECT_PERSISTENCE_STATES.has(projectPersistenceState)) return;

    const currentSettings = UserProjectSettingsService.captureCurrentAsProjectOverride(settingsUserId, projectId);
    const baselineSettings = UserProjectSettingsService.resolveEffectiveSettings(settingsUserId, projectId);
    if (comparableSettingsSignature(currentSettings) === comparableSettingsSignature(baselineSettings)) {
      return;
    }

    UserProjectSettingsService.saveProjectOverride(currentSettings);
  }, [projectPersistenceState, settingsUserId]);

  useEffect(() => {
    const existingDefaults = UserProjectSettingsService.loadUserDefaults(settingsUserId ?? undefined);
    if (existingDefaults) {
      settingsInitializedRef.current = true;
      return;
    }
    const defaults = UserProjectSettingsService.captureCurrentAsUserDefaults(settingsUserId);
    UserProjectSettingsService.saveUserDefaults(defaults);
    settingsInitializedRef.current = true;
  }, [settingsUserId]);

  useEffect(() => {
    if (!settingsInitializedRef.current) return;
    if (isApplyingScopedSettingsRef.current) return;

    const hasActiveProject =
      Boolean(currentProjectId)
      && ACTIVE_PROJECT_PERSISTENCE_STATES.has(projectPersistenceState);

    if (hasActiveProject) {
      persistProjectOverrideIfNeeded(currentProjectId);
      return;
    }

    const defaults = UserProjectSettingsService.captureCurrentAsUserDefaults(settingsUserId);
    const storedDefaults = UserProjectSettingsService.loadUserDefaults(settingsUserId ?? undefined);
    if (
      storedDefaults
      && comparableSettingsSignature(defaults) === comparableSettingsSignature(storedDefaults)
    ) {
      return;
    }
    UserProjectSettingsService.saveUserDefaults(defaults);
  }, [
    agentConfigs,
    autoRoute,
    currentProjectId,
    engineModelId,
    fullContextMode,
    persistProjectOverrideIfNeeded,
    projectPersistenceState,
    selectedModel,
    settingsUserId,
  ]);

  // ── ScannerService (Fusion Protocol) ───────────────────────────────────────
  const [componentRegistry, setComponentRegistry] = useState<ComponentRegistry | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── ScannerService: auto-scan project files (debounced 3 s) ──────────────
  useEffect(() => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = setTimeout(() => {
      if (Object.keys(files).length === 0) return;
      const reg = ScannerService.scan(files);
      setComponentRegistry(reg);
    }, 3_000);
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  const addSystemMessage = useCallback((content: string) => {
    chatAppend({ role: 'assistant', content });
  }, [chatAppend]);

  // ── Token overflow notification ───────────────────────────────────────────
  // Listens for agent-token-overflow events emitted by readStream in SimpleGeneration.ts.
  // Shows a system message in chat so the user knows a step used the overflow buffer.
  useEffect(() => {
    const handler = (e: Event) => {
      const { modelId, stage, completionTokens, softLimit } = (e as CustomEvent).detail ?? {};
      const model   = (modelId as string ?? 'unknown').split('/').pop() ?? 'unknown';
      const tokens  = completionTokens as number ?? 0;
      const soft    = softLimit as number ?? 0;
      const overBy  = soft > 0 ? Math.round(((tokens - soft) / soft) * 100) : 0;
      addSystemMessage(
        `⚠️ **Token overflow on step "${stage ?? 'unknown'}"** — ` +
        `model \`${model}\` used ${tokens.toLocaleString()} tokens` +
        (soft > 0 ? ` (budget: ${soft.toLocaleString()}, over by ~${overBy}%)` : '') +
        `. The 30% overflow buffer covered this. ` +
        `If this happens frequently, increase **maxTokens** for this stage in Settings → Agent Config.`,
      );
    };
    window.addEventListener('agent-token-overflow', handler);
    return () => window.removeEventListener('agent-token-overflow', handler);
  }, [addSystemMessage]);

  const scrollRef          = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortDispositionRef = useRef<'user-stop' | 'context-switch' | null>(null);
  const consecutiveErrors  = useRef(0);
  const lastErrorTime      = useRef(0);
  const networkRetryCountRef   = useRef(0);
  const networkRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the Architect kickoff plan between analysis and blueprint confirmation.
  const pendingArchitectKickoffRef = useRef<PendingArchitectKickoffSelection | null>(null);
  // Tracks the active generation-plan message ID so markSnapshotStable can set buildStatus:'ready'
  const currentPlanMsgIdRef = useRef<string | null>(null);
  const currentTraceLookupRef = useRef<{
    runId: string | null;
    projectId: string | null;
    branchId: string | null;
    startedMs: number | null;
  }>({ runId: null, projectId: null, branchId: null, startedMs: null });
  const commitPendingProjectSaveRef = useRef<(reason: PendingProjectSaveReason) => boolean>(() => false);
  const lastPreviewReadyRevisionRef = useRef<string | null>(null);
  const finalPreviewGateRef = useRef({ awaiting: false, filesCommitted: false });

  // ── Preview lifecycle — honest completion handshake ───────────────────────
  const [previewLifecycle, setPreviewLifecycle] = useState<PreviewLifecycleStage>('idle');
  /** Human-readable reason when previewLifecycle === 'blocked'. Null otherwise. */
  const [previewBlockedReason, setPreviewBlockedReason] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewReady, setPreviewReady] = useState(false);

  // ── Level 2: Auto-fixer ───────────────────────────────────────────────────
  const fixAttemptsRef   = useRef(0);
  const MAX_FIX_ATTEMPTS = 2;
  const [isAutoFixing, setIsAutoFixing] = useState(false);

  // ── billing ───────────────────────────────────────────────────────────────
  const [sessionCost,    setSessionCost]    = useState(0);
  const [sessionTokens,  setSessionTokens]  = useState(0);
  const [projectCost,    setProjectCost]    = useState(() => {
    const id = localStorage.getItem('CURRENT_PROJECT_ID');
    return id ? loadBilling(id).cost : 0;
  });
  const [projectTokens,  setProjectTokens]  = useState(() => {
    const id = localStorage.getItem('CURRENT_PROJECT_ID');
    return id ? loadBilling(id).tokens : 0;
  });
  const projectLoadRequestRef = useRef(0);
  const chatThreadSequenceRef = useRef(0);
  const nextChatThreadKey = useCallback((
    kind: 'draft' | 'loading' | 'project' | 'missing' | 'error',
    threadId?: string | null,
  ) => `${kind}:${threadId ?? 'none'}:${++chatThreadSequenceRef.current}`, []);
  const [chatThreadKey, setChatThreadKey] = useState(() => {
    const persistedProjectId = localStorage.getItem('CURRENT_PROJECT_ID');
    if (persistedProjectId) return `project:${persistedProjectId}:0`;
    const draftId = readDraftSessionId();
    return draftId ? `draft:${draftId}:0` : 'draft:none:0';
  });

  // Generated project stays as a draft until the user explicitly saves it.
  // If preview failed/blocked, the legacy fallback still asks before saving.
  const pendingProjectSaveRef = useRef<PendingProjectSave | null>(null);
  const [pendingProjectSaveMeta, setPendingProjectSaveMeta] = useState<PendingProjectSaveMeta | null>(null);
  const pendingSavePromptShownRef = useRef(false);
  const processedArchitectureMessagesRef = useRef<Set<string>>(new Set());
  // Tracks the active draft session ID for the current unsaved generation run.
  // Null when a real persisted project is active (loaded or just saved).
  const _draftSessionIdRef = useRef<string | null>(null);
  const clearDraftChatStorage = useCallback((draftId: string | null | undefined) => {
    if (!draftId) return;
    const key = getDraftChatStorageKey(draftId);
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }, []);

  const abortActiveGeneration = useCallback((
    disposition: 'user-stop' | 'context-switch',
  ) => {
    if (networkRetryTimeoutRef.current) {
      clearTimeout(networkRetryTimeoutRef.current);
      networkRetryTimeoutRef.current = null;
    }
    networkRetryCountRef.current = 0;
    abortDispositionRef.current = disposition;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setKickoffPhase('idle');
    setProgress(0);
    setCurrentPhase('');
  }, []);

  const commitPendingProjectSave = useCallback((reason: PendingProjectSaveReason) => {
    const pending = pendingProjectSaveRef.current;
    if (!pending) return false;
    const previewReadyForSave =
      pendingProjectSaveMeta?.previewReady === true
      && previewLifecycle === 'preview-ready'
      && previewReady;
    if (!previewReadyForSave) {
      addLog('[Project] Save blocked: preview is not ready yet', 'warn');
      return false;
    }

    const persistedProjectName = getCanonicalProjectName(
      { name: pending.projectTitle },
      (pending.plan?.appName ?? '').trim() || 'New Project',
    );
    const basePersistedChatHistory = buildPersistedProjectChatHistory(
      _latestMsgsRef.current.length > 0 ? _latestMsgsRef.current : pending.chatHistoryToSave,
    );

    const reloadCompleteSave = resolveReloadCompleteSaveFiles({
      existingFiles: ProjectStorage.getProject(pending.projectId)?.files,
      skeletonFiles: getSkeletonSaveFiles((pending.skeletonId ?? null) as any),
      pendingFinalFiles: pending.finalFiles,
    });
    if (reloadCompleteSave.errorMessage) {
      addLog(`[Project] ${reloadCompleteSave.errorMessage}`, 'warn');
      showToast(reloadCompleteSave.errorMessage, 'error');
      return false;
    }
    const reloadCompleteFiles = reloadCompleteSave.files;

    pendingProjectSaveRef.current = null;
    pendingSavePromptShownRef.current = false;
    setPendingProjectSaveMeta(null);

    const reqTokens = pending.reqUsage.promptTokens + pending.reqUsage.completionTokens;
    if (reqTokens > 0) {
      const reqCost = calcCost(pending.effectiveModel, pending.reqUsage);
      setProjectCost((prev: number) => {
        const next = prev + reqCost;
        const savedTokens = (loadBilling(pending.projectId).tokens || 0) + reqTokens;
        safeSetItem(`BILLING_${pending.projectId}`, JSON.stringify({ cost: next, tokens: savedTokens }));
        return next;
      });
      setProjectTokens((prev: number) => prev + reqTokens);
    }

    const existing = ProjectStorage.getProject(pending.projectId);
    const existingActiveBranchId = existing?.activeBranchId ?? DEFAULT_PROJECT_BRANCH_ID;
    const existingBranch = existing?.branches?.[existingActiveBranchId];
    const targetLineageId =
      pending.lineageId
      ?? existingBranch?.activeLineageId
      ?? findLatestLineageId(basePersistedChatHistory);
    const revisionPatch = {
      prompt:     pending.userPrompt,
      source:     pending.source,
      files:      reloadCompleteFiles,
      modelId:    pending.effectiveModel,
      durationMs: Date.now() - pending.generationStartMs,
      pagesCount: pending.plan?.pages?.length ?? 0,
      lineageId: targetLineageId,
      lineageRootMessageId: pending.lineageRootMessageId ?? findLineageRootMessageId(basePersistedChatHistory, targetLineageId),
      reportMessageId: pending.reportMessageId ?? null,
    };
    let newRevisions: ProjectRevision[] | null = null;
    if (existing) {
      newRevisions = addRevision(existing, revisionPatch);
      if (!newRevisions) {
        chatAppend({
          role: 'assistant',
          content: [
            '\u26A0\uFE0F **Version limit reached**',
            '',
            `Project "${pending.projectTitle}" already has 5 saved versions.`,
            'Open the Projects page \u2192 select this project \u2192 History tab',
            'to delete old versions before saving new ones.',
            '',
            'Your changes were applied to the preview but not saved as a new version.',
          ].join('\n'),
          timestamp: Date.now(),
        });
      }
    }
    const persistedRevisionId = newRevisions?.[0]?.id ?? null;
    const linkedChatHistory = linkLatestGenerationReportToRevision(
      basePersistedChatHistory,
      persistedRevisionId,
      targetLineageId,
      revisionPatch.lineageRootMessageId,
    );

    const saveNow = new Date().toISOString();
    const activeBranchId = existingActiveBranchId;
    const mergedBranchFiles = {
      ...reloadCompleteFiles,
    };
    const fallbackBranch = existingBranch ?? {
      id: activeBranchId,
      projectId: pending.projectId,
      name: activeBranchId,
      isDefault: true,
      createdAt: existing?.createdAt ?? saveNow,
      updatedAt: saveNow,
      files: mergedBranchFiles,
      chatHistory: [],
      revisions: [],
      architecture: createProjectBranchArchitecture(
        pending.projectId,
        activeBranchId,
        activeBranchId,
        saveNow,
      ),
    };
    const refreshedArchitecture = refreshArchitectureAfterBuild(
      fallbackBranch.architecture,
      mergedBranchFiles,
      {
        language: appLanguage,
        now: saveNow,
        revisionId: persistedRevisionId ?? fallbackBranch.headRevisionId,
      },
    );
    const reconciledThread = reconcileProjectChatHistory({
      history: linkedChatHistory,
      revisions: newRevisions ?? (fallbackBranch.revisions as ProjectRevision[] | undefined) ?? existing?.revisions ?? [],
      currentFiles: mergedBranchFiles,
      currentHeadRevisionId: persistedRevisionId ?? fallbackBranch.headRevisionId ?? null,
      currentActiveLineageId: targetLineageId ?? existingBranch?.activeLineageId ?? null,
    });
    const persistedChatHistory = reconciledThread.history;
    let persistedChatHistoryForSession = persistedChatHistory;
    const updatedBranch = {
      ...fallbackBranch,
      projectId: pending.projectId,
      name: fallbackBranch.name || activeBranchId,
      updatedAt: saveNow,
      headRevisionId: persistedRevisionId ?? fallbackBranch.headRevisionId,
      activeLineageId: reconciledThread.activeLineageId ?? targetLineageId ?? fallbackBranch.activeLineageId,
      files: mergedBranchFiles,
      chatHistory: persistedChatHistory,
      revisions: reconciledThread.revisions,
      architecture: refreshedArchitecture.architecture,
    };
    const updatedBranches = {
      ...(existing?.branches ?? {}),
      [activeBranchId]: updatedBranch,
    };

    if (existing) {
      ProjectStorage.saveProject({
        ...existing,
        name: existing.name || persistedProjectName,
        activeBranchId,
        branches: updatedBranches,
        files: mergedBranchFiles,
        chatHistory:    persistedChatHistory,
        updatedAt:      saveNow,
        intent:         pending.userPrompt,
        source:         pending.source,
        plan:           pending.plan ?? existing.plan ?? undefined,
        logs:           pending.generationLogs,
        errors:         pending.generationErrors.filter(e => e.includes('❌') || e.toLowerCase().includes('error')),
        pagesCount:     pending.plan?.pages?.length ?? existing.pagesCount ?? 0,
        modelId:        pending.effectiveModel,
        durationMs:     Date.now() - pending.generationStartMs,
        generationMode,
        billingCost:    projectCost,
        billingTokens:  projectTokens,
        revisions:      reconciledThread.revisions,
      });
    } else {
      const firstRevision: ProjectRevision = {
        id:           crypto.randomUUID(),
        prompt:       pending.userPrompt,
        source:       pending.source,
        files:        mergedBranchFiles,
        createdAt:    saveNow,
        modelId:      pending.effectiveModel,
        durationMs:   Date.now() - pending.generationStartMs,
        isBookmarked: false,
        pagesCount:   pending.plan?.pages?.length ?? 0,
        lineageId: targetLineageId ?? undefined,
        lineageRootMessageId: revisionPatch.lineageRootMessageId ?? undefined,
        reportMessageId: pending.reportMessageId ?? undefined,
      };
      const firstThread = reconcileProjectChatHistory({
        history: linkLatestGenerationReportToRevision(
          basePersistedChatHistory,
          firstRevision.id,
          targetLineageId,
          revisionPatch.lineageRootMessageId,
        ),
        revisions: [firstRevision],
        currentFiles: mergedBranchFiles,
        currentHeadRevisionId: firstRevision.id,
        currentActiveLineageId: targetLineageId ?? null,
      });
      const fallback: StoredProject = {
        id:             pending.projectId,
        name:           persistedProjectName,
        description:    pending.userPrompt.slice(0, 120),
        theme:          pending.planTheme,
        createdAt:      saveNow,
        updatedAt:      saveNow,
        files:          mergedBranchFiles,
        chatHistory:    firstThread.history,
        activeBranchId,
        branches: {
          [activeBranchId]: {
            ...updatedBranch,
            headRevisionId: firstRevision.id,
            activeLineageId: firstThread.activeLineageId ?? targetLineageId ?? undefined,
            revisions: [firstRevision],
            chatHistory: firstThread.history,
          },
        },
        intent:         pending.userPrompt,
        source:         pending.source,
        plan:           pending.plan ?? undefined,
        logs:           pending.generationLogs,
        errors:         pending.generationErrors.filter(e => e.includes('❌') || e.toLowerCase().includes('error')),
        pagesCount:     pending.plan?.pages?.length ?? 0,
        modelId:        pending.effectiveModel,
        durationMs:     Date.now() - pending.generationStartMs,
        generationMode,
        billingCost:    projectCost,
        billingTokens:  projectTokens,
        revisions:      firstThread.revisions,
      };
      const ok = ProjectStorage.saveProject(fallback);
      if (!ok) addLog('[Project] Storage full â€” project not saved');
      persistedChatHistoryForSession = firstThread.history;
    }

    chatLoadHistory(persistedChatHistoryForSession);

    setCurrentProjectId(pending.projectId);
    ProjectManager.setCurrent(pending.projectId);
    setProjectPersistenceState('exists');
    setProjects(ProjectStorage.listProjects());

    const existingForCloud = ProjectStorage.getProject(pending.projectId);
    ProjectRepository.saveProject({
      id:          pending.projectId,
      name:        persistedProjectName,
      userId:      authUser?.id ?? 'anonymous',
      description: pending.userPrompt.slice(0, 120),
      theme:       pending.planTheme,
      files:       existingForCloud?.files
                     ? { ...existingForCloud.files, ...reloadCompleteFiles }
                     : mergedBranchFiles,
      chatHistory: existingForCloud?.chatHistory ?? persistedChatHistoryForSession,
      createdAt:   existingForCloud?.createdAt ?? new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
      version:     1,
      activeBranchId: existingForCloud?.activeBranchId ?? DEFAULT_PROJECT_BRANCH_ID,
      branches: existingForCloud?.branches,
      intent:         pending.userPrompt,
      source:         pending.source,
      plan:           pending.plan ?? undefined,
      logs:           pending.generationLogs,
      errors:         pending.generationErrors.filter(e => e.includes('❌') || e.toLowerCase().includes('error')),
      pagesCount:     pending.plan?.pages?.length ?? 0,
      modelId:        pending.effectiveModel,
      durationMs:     Date.now() - pending.generationStartMs,
      generationMode,
      billingCost:    projectCost,
      billingTokens:  projectTokens,
      revisions:      existingForCloud?.revisions ?? [],
    } as any).catch((err: any) => addLog(`[Project] Cloud save error: ${err}`));

    addLog(`[Project] Saved after explicit preview save: ${persistedProjectName}`);

    // Write journal record for the save event and clean up draft state.
    const draftIdAtSave = _draftSessionIdRef.current;
    if (draftIdAtSave) {
      draftArtifactJournal.appendRecord(draftIdAtSave, {
        stepType: 'project_saved',
        projectId: pending.projectId,
        status: 'ok',
        acceptedFiles: Object.keys(pending.finalFiles),
        metadata: { projectTitle: persistedProjectName, reason },
      });
      clearDraftChatStorage(draftIdAtSave);
      _draftSessionIdRef.current = null;
      clearDraftSessionId();
    }

    return true;
  }, [addLog, appLanguage, authUser?.id, clearDraftChatStorage, generationMode, pendingProjectSaveMeta?.previewReady, previewLifecycle, previewReady, projectCost, projectTokens]);
  commitPendingProjectSaveRef.current = commitPendingProjectSave;

  const savePendingProject = useCallback(() => {
    if (!pendingProjectSaveRef.current) return false;
    const ready =
      pendingProjectSaveMeta?.previewReady === true
      && previewLifecycle === 'preview-ready'
      && previewReady;
    if (!ready) {
      addLog('[Project] Save requested before preview was ready', 'warn');
      return false;
    }
    return commitPendingProjectSave('manual-after-preview');
  }, [addLog, commitPendingProjectSave, pendingProjectSaveMeta?.previewReady, previewLifecycle, previewReady]);

  const rejectPendingProjectSave = useCallback(() => {
    const pending = pendingProjectSaveRef.current;
    if (!pending) return false;

    pendingProjectSaveRef.current = null;
    pendingSavePromptShownRef.current = false;
    setPendingProjectSaveMeta(null);
    // Revert from preview-ready back to draft — user chose not to save this preview.
    setProjectPersistenceState('draft');

    addLog(`[Project] Pending save explicitly rejected: ${pending.projectTitle}`);

    if (_draftSessionIdRef.current) {
      draftArtifactJournal.appendRecord(_draftSessionIdRef.current, {
        stepType: 'project_save_rejected',
        projectId: null,
        acceptedFiles: Object.keys(pending.finalFiles),
        status: 'ok',
        metadata: {
          projectTitle: pending.projectTitle,
        },
      });
    }

    chatAppend({
      role: 'assistant',
      content: 'Черновик отклонён и не добавлен в Projects. Он остаётся только в текущей сессии.',
      timestamp: Date.now(),
    });

    return true;
  }, [addLog, chatAppend]);

  useEffect(() => {
    if (isGenerating) return;
    if (!pendingProjectSaveRef.current) return;
    if (previewLifecycle !== 'failed' && previewLifecycle !== 'blocked') return;
    if (pendingSavePromptShownRef.current) return;

    pendingSavePromptShownRef.current = true;
    addLog('[Project] Preview failed/blocked — keeping draft in-session only (no persisted save)', 'warn');
    chatAppend({
      role: 'assistant',
      content: 'Превью не готово. Черновик сохранён только в текущей сессии и не добавлен в Projects.',
      timestamp: Date.now(),
    });
  }, [previewLifecycle, isGenerating, addLog, chatAppend]);

  // ── persist (data only — config keys are written immediately by their setters) ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Hard isolation: never persist chat into a global key shared by projects/drafts.
    localStorage.removeItem(LEGACY_CHAT_HISTORY_KEY);
    if ((projectPersistenceState === 'draft' || projectPersistenceState === 'preview-ready') && currentProjectId) {
      const draftSessionId = _draftSessionIdRef.current ?? currentProjectId;
      _draftSessionIdRef.current = draftSessionId;
      writeDraftSessionId(draftSessionId);
      const draftChatKey = getDraftChatStorageKey(currentProjectId);
      const payload = JSON.stringify(messages);
      try {
        sessionStorage.setItem(draftChatKey, payload);
      } catch {
        // Fallback still stays isolated per draft session ID.
        safeSetItem(draftChatKey, payload);
      }
    } else {
      clearDraftSessionId();
    }
    // Persist the derived `files` value — includes graph-derived files when graph is set.
    safeSetItem('LAST_FILES',    JSON.stringify(files));
    safeSetItem('LAST_CODE',     getPrimaryCode(files));
    // Only persist real project IDs — draft session IDs must NOT survive page reload
    // as they would trigger a spurious "project not found" on cold start.
    if (currentProjectId && ProjectStorage.projectDataExists(currentProjectId)) {
      safeSetItem('CURRENT_PROJECT_ID', currentProjectId);
    } else {
      localStorage.removeItem('CURRENT_PROJECT_ID');
    }
  }, [messages, files, currentProjectId, projectPersistenceState]); // `files` is a useMemo — stable ref unless projectGraph or filesRaw changes

  useEffect(() => {
    if (projectPersistenceState !== 'exists' || !currentProjectId) {
      processedArchitectureMessagesRef.current.clear();
      return;
    }

    const storedProject = ProjectStorage.getProject(currentProjectId);
    if (!storedProject) return;

    const now = new Date().toISOString();
    const activeBranchId = storedProject.activeBranchId ?? DEFAULT_PROJECT_BRANCH_ID;
    const existingBranch = storedProject.branches?.[activeBranchId];
    const reconciledThread = reconcileProjectChatHistory({
      history: buildPersistedProjectChatHistory(messages),
      revisions: (existingBranch?.revisions as ProjectRevision[] | undefined) ?? storedProject.revisions ?? [],
      currentFiles: existingBranch?.files ?? storedProject.files ?? {},
      currentHeadRevisionId: existingBranch?.headRevisionId ?? null,
      currentActiveLineageId: existingBranch?.activeLineageId ?? null,
    });
    const persistedMessages = reconciledThread.history;
    const nextChatHistory = JSON.stringify(existingBranch?.chatHistory ?? []);
    const currentChatHistory = JSON.stringify(persistedMessages);
    if (nextChatHistory === currentChatHistory) return;

    ProjectStorage.saveProject({
      ...storedProject,
      updatedAt: now,
      activeBranchId,
      chatHistory: persistedMessages as any,
      branches: {
        ...(storedProject.branches ?? {}),
        [activeBranchId]: {
          ...(existingBranch ?? {
            id: activeBranchId,
            projectId: storedProject.id,
            name: activeBranchId,
            isDefault: true,
            createdAt: storedProject.createdAt,
            updatedAt: now,
            files: storedProject.files ?? {},
            chatHistory: [],
            revisions: storedProject.revisions ?? [],
            architecture: createProjectBranchArchitecture(
              storedProject.id,
              activeBranchId,
              activeBranchId,
              now,
            ),
          }),
          projectId: storedProject.id,
          name: existingBranch?.name ?? activeBranchId,
          updatedAt: now,
          files: existingBranch?.files ?? storedProject.files ?? {},
          chatHistory: persistedMessages as any,
          revisions: reconciledThread.revisions,
          activeLineageId: reconciledThread.activeLineageId ?? existingBranch?.activeLineageId,
        },
      },
    });
  }, [messages, currentProjectId, projectPersistenceState]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (projectPersistenceState !== 'exists' || !currentProjectId || !lastMessage?.id) return;

    const messageKey = `${currentProjectId}:${lastMessage.id}`;
    if (processedArchitectureMessagesRef.current.has(messageKey)) return;
    processedArchitectureMessagesRef.current.add(messageKey);

    const branchId = ProjectManager.resolveKickoffContext(currentProjectId).branchId;
    let cancelled = false;

    const persistArchitectureFromChat = async () => {
      try {
        const currentArchitecture = await ProjectRepository.getBranchArchitecture(currentProjectId, branchId);
        const result = ChatArchitectureService.applyMessage({
          projectId: currentProjectId,
          branchId,
          branchName: branchId,
          language: appLanguage,
          message: {
            id: lastMessage.id,
            role: lastMessage.role,
            type: lastMessage.type,
            content: lastMessage.content,
            timestamp: lastMessage.timestamp,
          },
          architecture: currentArchitecture,
        });

        if (!result.changed) return;

        await ProjectRepository.saveBranchArchitecture(currentProjectId, branchId, result.architecture);
        if (!cancelled && result.extractedItemIds.length > 0) {
          chatUpdate(lastMessage.id, {
            architectureLinkIds: result.extractedItemIds,
            architectureConversationRef: result.conversationRef,
            architectureThreadId: result.chatThreadId,
          });
          addLog(`[Architect Chat] Saved ${result.extractedItemIds.length} chat-derived architecture item(s) to ${branchId}`);
        }
      } catch (error) {
        addLog(`[Architect Chat] Failed to persist chat-derived architecture: ${(error as Error)?.message ?? String(error)}`);
      }
    };

    void persistArchitectureFromChat();

    return () => {
      cancelled = true;
    };
  }, [messages, currentProjectId, appLanguage, addLog, chatUpdate, projectPersistenceState]);

  // ── auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Level 2: Auto-fixer listener ─────────────────────────────────────────
  // Captures apiKey, addLog via ref so the effect never needs to be re-registered.
  const _autoFixHandlerRef = useRef<(e: MessageEvent) => void>(() => {});
  _autoFixHandlerRef.current = (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type !== 'iframe-error') return;
    // Preview lifecycle — mark as failed/degraded on first error after generation
    setPreviewReady(false);
    invalidatePendingProjectSaveReady();
    setPreviewLifecycle(prev =>
      prev === 'preview-ready'
        ? 'degraded'
        : (prev === 'committing' || prev === 'generating' || prev === 'materializing')
          ? 'failed'
          : prev,
    );
    if (isGenerating) return;                         // don't race with active generation
    if (fixAttemptsRef.current >= MAX_FIX_ATTEMPTS) {
      addLog(`[AutoFix] Max attempts (${MAX_FIX_ATTEMPTS}) reached. Manual fix required.`);
      return;
    }
    const errorMsg: string = typeof e.data.message === 'string' ? e.data.message : '';
    if (!errorMsg) return;
    fixAttemptsRef.current += 1;
    const attempt = fixAttemptsRef.current;
    const effectiveKey = ConfigService.getKeyForAgent('fix') || apiKey;
    if (!effectiveKey) {
      addLog('[AutoFix] Fix agent key not configured. Set it in Settings → Agent Fix.');
      return;
    }
    setIsAutoFixing(true);
    addLog(`[AutoFix] Attempt ${attempt}/${MAX_FIX_ATTEMPTS}: ${errorMsg.slice(0, 100)}`);
    GenerationPipeline.autoFix({ errorMsg, apiKey: effectiveKey, onLog: addLog })
      .then(success => {
        if (success) {
          setPreviewLifecycle('committing'); // waiting for backend recompile + preview-mounted
          addLog('[AutoFix] Fix applied — waiting for backend recompile...');
          chatAppend({
            role: 'assistant',
            content: `🔧 **Auto-fix applied** (attempt ${attempt}/${MAX_FIX_ATTEMPTS})\n\nFound and repaired a runtime error in the generated code. Preview is reloading…`,
          });
        } else {
          addLog('[AutoFix] Could not determine file to fix');
          if (attempt >= MAX_FIX_ATTEMPTS) {
            chatAppend({
              role: 'assistant',
              content: `❌ **Auto-fix failed** after ${MAX_FIX_ATTEMPTS} attempts.\n\nError: ${errorMsg.slice(0, 200)}\n\nTry describing what you want differently, or regenerate the project.`,
            });
          }
        }
      })
      .catch((err: unknown) => {
        addLog(`[AutoFix] Error: ${(err as Error)?.message ?? String(err)}`);
      })
      .finally(() => setIsAutoFixing(false));
  };
  useEffect(() => {
    const handler = (e: MessageEvent) => _autoFixHandlerRef.current(e);
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stable refs — latest state values without adding them to callback deps ──
  // (prevents studioMemo from invalidating on every token / file update)
  const _latestFilesRef    = useRef(files);
  _latestFilesRef.current  = files;
  const _latestMsgsRef    = useRef<any[]>(messages);
  _latestMsgsRef.current  = messages;

  // Stable refs for admission-check dirty-workspace detection (avoids closure staleness)
  const _pendingDiffRef         = useRef(pendingDiff);
  _pendingDiffRef.current       = pendingDiff;
  const _previewLifecycleRef    = useRef(previewLifecycle);
  _previewLifecycleRef.current  = previewLifecycle;

  // Register admission checker with SimpleGeneration via waitForAdmission callback.
  // Uses refs so the callback captures current state without a re-registration cycle.
  // Runs once on mount; cleans up on unmount.
  useEffect(() => {
    return () => {
      // On unmount: deny any pending admission promise so the pipeline does not hang.
      if (admissionResolverRef.current) {
        admissionResolverRef.current(false);
        admissionResolverRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── project actions ───────────────────────────────────────────────────────
  const createNewProject = useCallback(async (options: CreateNewProjectOptions = {}) => {
    const {
      autoSaveCurrentProject = true,
      sessionSource = 'new-project',
    } = options;
    persistProjectOverrideIfNeeded(currentProjectId);
    projectLoadRequestRef.current += 1;
    abortActiveGeneration('context-switch');
    pendingProjectSaveRef.current = null;
    pendingSavePromptShownRef.current = false;
    setPendingProjectSaveMeta(null);
    currentPlanMsgIdRef.current = null;
    const previousDraftId = _draftSessionIdRef.current ?? readDraftSessionId();
    clearDraftChatStorage(previousDraftId);
    // Auto-save the current project before clearing so history is not lost
    if (
      autoSaveCurrentProject &&
      projectPersistenceState === 'exists' &&
      currentProjectId &&
      Object.keys(_latestFilesRef.current).length > 0
    ) {
      const existing = ProjectStorage.getProject(currentProjectId);
      if (existing) {
        ProjectStorage.saveProject({
          ...existing,
          files:       _latestFilesRef.current,
          chatHistory: _latestMsgsRef.current,
          updatedAt:   new Date().toISOString(),
        });
        addLog('[Project] Auto-saved before new project');
      }
    }
    pendingHistoryClear.current = true;
    inputRef.current = '';
    setInput('');
    chatReset();
    setPendingPlan(null);
    setPendingDiff(null);
    setIsGenerating(false);
    setProgress(0);
    setCurrentPhase('');
    setFiles({});
    setCurrentProjectId(null);
    setProjectPersistenceState('none');
    setProjectCost(0);
    setProjectTokens(0);
    generationSourceRef.current = 'chat';
    setGenerationSource('chat');
    trendIdeaTitleRef.current = '';
    clearSnapshots();
    clearLogs();
    clearAttachments();
    clearComposerContextItems();
    modeSetByUserRef.current = false;
    clarificationResolverRef.current = null;
    surfaceChoiceResolverRef.current = null;
    setPreviewBlockedReason(null);
    setPreviewUrl('');
    setPreviewReady(false);
    localStorage.removeItem(LEGACY_CHAT_HISTORY_KEY);
    localStorage.removeItem('LAST_FILES');
    localStorage.removeItem('LAST_CODE');
    localStorage.removeItem('CURRENT_PROJECT_ID');
    localStorage.removeItem('aic-current-project');
    Orchestrator.resetSession();
    try {
      await revisionManager.createEmptyCandidate();
    } catch (e: unknown) {
      // Non-fatal: blank-slate preview is cosmetic. Generation still proceeds.
      addLog(`[Project] Empty candidate compile failed (preview unavailable): ${(e as Error)?.message ?? String(e)}`, 'warn');
    }
    // Create a draft session for the next generation run.
    // No persisted project is created here — a project is created only after
    // explicit Save following a successful preview (commitPendingProjectSave).
    const draftId = draftArtifactJournal.createSession({ source: sessionSource });
    _draftSessionIdRef.current = draftId;
    writeDraftSessionId(draftId);
    setCurrentProjectId(draftId);
    setProjectPersistenceState('draft');
    applyEffectiveSettingsForProject(draftId);
    setChatThreadKey(nextChatThreadKey('draft', draftId));
    draftArtifactJournal.appendRecord(draftId, {
      stepType: 'draft_session_started',
      source: sessionSource,
      projectId: null,
      status: 'ok',
    });
  }, [abortActiveGeneration, applyEffectiveSettingsForProject, clearDraftChatStorage, currentProjectId, clearSnapshots, clearLogs, clearAttachments, clearComposerContextItems, addLog, nextChatThreadKey, persistProjectOverrideIfNeeded, projectPersistenceState]);

  const startTrendIdeaDraftSession = useCallback(async (
    mode: 'chat' | 'build',
  ) => {
    await createNewProject({
      autoSaveCurrentProject: false,
      sessionSource: mode === 'chat' ? 'trend-niche-chat' : 'trend-niche-build',
    });
  }, [createNewProject]);

  const startExternalChatDraftSession = useCallback(async () => {
    await createNewProject({
      autoSaveCurrentProject: false,
      sessionSource: 'external-chat',
    });
  }, [createNewProject]);

  const loadProject = useCallback(async (project: { id: string }) => {
    persistProjectOverrideIfNeeded(currentProjectId);
    const loadRequestId = ++projectLoadRequestRef.current;
    abortActiveGeneration('context-switch');
    pendingProjectSaveRef.current = null;
    pendingSavePromptShownRef.current = false;
    setPendingProjectSaveMeta(null);
    setPendingPlan(null);
    setPendingDiff(null);
    setPendingAdmission(null);
    currentPlanMsgIdRef.current = null;
    setPreviewLifecycle('idle');
    setPreviewBlockedReason(null);
    setPreviewUrl('');
    setPreviewReady(false);
    clearAttachments();
    clearComposerContextItems();
    addLog(`[Project] Loading ${project.id.slice(0, 8)}…`);
    setProjectPersistenceState('unknown');
    // Switch chat context immediately so cross-project messages cannot leak while loading.
    setChatThreadKey(nextChatThreadKey('loading', project.id));
    chatLoadHistory([]);
    // Clear any active draft session — we are transitioning to a real persisted project.
    _draftSessionIdRef.current = null;
    clearDraftSessionId();
    try {
      // Supabase first, localStorage fallback
      const full = await ProjectRepository.getProject(project.id);
      if (projectLoadRequestRef.current !== loadRequestId) return;
      if (!full) {
        addLog('[Project] Not found in Supabase or localStorage');
        ProjectRepository.removeLocalProjectMeta(project.id);
        setProjects(prev => prev.filter(p => p.id !== project.id));
        localStorage.removeItem('aic-current-project');
        setCurrentProjectId(project.id);
        setProjectPersistenceState('missing');
        setChatThreadKey(nextChatThreadKey('missing', project.id));
        setFiles({});
        chatLoadHistory([]);
        clearSnapshots();
        setProjectCost(0);
        setProjectTokens(0);
        setPreviewLifecycle('blocked');
        setPreviewBlockedReason(`Project not found: ${project.id}`);
        setPreviewUrl('');
        setPreviewReady(false);
        chatAppend({
          role: 'assistant',
          content: `⚠️ Project not found: ${project.id}\n\nThis saved project entry is stale or missing, so it was not opened as a new blank project.`,
          timestamp: Date.now(),
        });
        return;
      }
      setProjectPersistenceState('exists');

      const b = loadBilling(full.id);
      ProjectManager.setCurrent(full.id);
      const activeBranchId = full.activeBranchId ?? DEFAULT_PROJECT_BRANCH_ID;
      const activeBranch = full.branches?.[activeBranchId];
      const reconciledThread = reconcileProjectChatHistory({
        history: buildPersistedProjectChatHistory(full.chatHistory as any[]),
        revisions: ((activeBranch?.revisions as ProjectRevision[] | undefined) ?? ((full as any).revisions as ProjectRevision[] | undefined) ?? []),
        currentFiles: normalizeToFileMap(full.files),
        currentHeadRevisionId: activeBranch?.headRevisionId ?? activeBranch?.architecture?.branch?.headRevisionId ?? null,
        currentActiveLineageId: activeBranch?.activeLineageId ?? null,
      });
      // Switch saved-project chat immediately; preview materialization can finish in parallel.
      setChatThreadKey(nextChatThreadKey('project', full.id));
      chatLoadHistory(reconciledThread.history);
      setCurrentProjectId(full.id);
      applyEffectiveSettingsForProject(full.id);
      setProjectCost(b.cost);
      setProjectTokens(b.tokens);
      clearSnapshots();

      // 1. Compile project files — await so backend compile + preview-mounted(buildId) complete before React state update
      const persistedFileCount = Object.keys(full.files ?? {}).length;
      try {
        await ProjectRepository.loadToPreview(full);
        if (projectLoadRequestRef.current !== loadRequestId) return;
        if (persistedFileCount === 0) {
          setPreviewBlockedReason('Repository preload failed: empty persisted file map');
          addLog('[Project] No persisted files found for preview preload');
        } else {
          setPreviewBlockedReason(null);
          addLog('[Project] ✅ Loaded to preview');
        }

        // Integrity check: warn about imports that reference missing files
        const appCode = full.files['App.tsx'] ?? full.files['src/App.tsx'] ?? '';
        if (appCode) {
          const importMatches = [...appCode.matchAll(/from ['"]\.\/([^'"]+)['"]/g)];
          for (const match of importMatches) {
            const base = match[1];
            const exists =
              (`${base}.tsx` in full.files) ||
              (`${base}.ts` in full.files) ||
              (`src/${base}.tsx` in full.files) ||
              (`${base}/index.tsx` in full.files);
            if (!exists) {
              addLog(`[Project] Missing file detected: ${base}.tsx — AutoFix will handle via Vite error`);
            }
          }
        }
      } catch (err) {
        if (projectLoadRequestRef.current !== loadRequestId) return;
        const msg = err instanceof Error ? err.message : String(err);
        addLog(`[Project] ❌ Preview load failed: ${msg}`);
        setPreviewBlockedReason(`Repository preload failed: ${msg}`);
      }

      // 2. Update file state after preview-workspace materialization.
      startTransition(() => {
        if (projectLoadRequestRef.current !== loadRequestId) return;
        setFiles(normalizeToFileMap(full.files));
      });
    } catch (err) {
      if (projectLoadRequestRef.current !== loadRequestId) return;
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`[Project] ❌ Load failed: ${msg}`);
      setChatThreadKey(nextChatThreadKey('error', project.id));
      chatAppend({
        role: 'assistant',
        content: `⚠️ Could not load project: ${msg}`,
        timestamp: Date.now(),
      });
    }
  }, [abortActiveGeneration, addLog, applyEffectiveSettingsForProject, chatAppend, chatLoadHistory, clearAttachments, clearComposerContextItems, clearSnapshots, currentProjectId, nextChatThreadKey, persistProjectOverrideIfNeeded]);

  const restorePersistedRevision = useCallback(async (
    targetRevisionId: string,
    sourceLabel: 'message' | 'blueprint',
  ) => {
    if (projectPersistenceState !== 'exists' || !currentProjectId) return false;

    abortActiveGeneration('context-switch');
    pendingProjectSaveRef.current = null;
    pendingSavePromptShownRef.current = false;
    setPendingProjectSaveMeta(null);
    setPreviewLifecycle('materializing');
    setPreviewBlockedReason(null);
    setPreviewReady(false);

    try {
      const full = await ProjectRepository.getProject(currentProjectId);
      if (!full) {
        throw new Error(`Project not found: ${currentProjectId}`);
      }

      const activeBranchId = full.activeBranchId ?? DEFAULT_PROJECT_BRANCH_ID;
      const activeBranch = full.branches?.[activeBranchId];
      const revisions =
        ((activeBranch?.revisions as ProjectRevision[] | undefined)
          ?? ((full as any).revisions as ProjectRevision[] | undefined)
          ?? []);
      const targetRevision = revisions.find(revision => revision.id === targetRevisionId);
      if (!targetRevision) {
        throw new Error(`Saved revision not found: ${targetRevisionId}`);
      }

      const restoredFiles = normalizeToFileMap(targetRevision.files);
      const buildId = await revisionManager.materializePersistedFiles(restoredFiles, {
        source: sourceLabel === 'blueprint'
          ? 'useStudio.restoreBlueprintLineage'
          : 'useStudio.restoreMessageRevision',
        projectId: currentProjectId,
      });
      startTransition(() => {
        setFiles(restoredFiles);
      });
      const restoredSnapshot = addSnapshot(restoredFiles, `Restore: ${targetRevision.prompt}`, buildId);
      markSnapshotStable(restoredSnapshot.id);

      const now = new Date().toISOString();
      const storedProject = ProjectStorage.getProject(currentProjectId);
      const baseProject: StoredProject = storedProject ?? {
        id: full.id,
        name: full.name,
        description: full.description,
        theme: full.theme,
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
        version: full.version,
        files: normalizeToFileMap(full.files),
        chatHistory: buildPersistedProjectChatHistory(full.chatHistory as any[]),
        activeBranchId,
        branches: full.branches,
        revisions,
      };
      const baseBranch = activeBranch ?? baseProject.branches?.[activeBranchId] ?? {
        id: activeBranchId,
        projectId: currentProjectId,
        name: activeBranchId,
        isDefault: true,
        createdAt: baseProject.createdAt,
        updatedAt: now,
        files: normalizeToFileMap(full.files),
        chatHistory: buildPersistedProjectChatHistory(full.chatHistory as any[]),
        revisions,
        architecture: createProjectBranchArchitecture(
          currentProjectId,
          activeBranchId,
          activeBranchId,
          now,
        ),
      };
      const branchArchitecture =
        baseBranch.architecture && typeof baseBranch.architecture === 'object' && 'branchId' in baseBranch.architecture
          ? baseBranch.architecture
          : createProjectBranchArchitecture(
              currentProjectId,
              activeBranchId,
              activeBranchId,
              now,
            );
      const reconciledThread = reconcileProjectChatHistory({
        history: buildPersistedProjectChatHistory(messages),
        revisions,
        currentFiles: restoredFiles,
        currentHeadRevisionId: targetRevision.id,
        currentActiveLineageId: targetRevision.lineageId ?? baseBranch.activeLineageId ?? null,
      });
      const refreshedArchitecture = refreshArchitectureAfterBuild(
        branchArchitecture,
        restoredFiles,
        {
          language: appLanguage,
          now,
          revisionId: targetRevision.id,
        },
      );
      const nextProject: StoredProject = {
        ...baseProject,
        updatedAt: now,
        files: restoredFiles,
        chatHistory: reconciledThread.history as any,
        activeBranchId,
        branches: {
          ...(baseProject.branches ?? {}),
          [activeBranchId]: {
            ...baseBranch,
            projectId: currentProjectId,
            name: baseBranch.name || activeBranchId,
            updatedAt: now,
            files: restoredFiles,
            chatHistory: reconciledThread.history as any,
            revisions: reconciledThread.revisions,
            headRevisionId: targetRevision.id,
            activeLineageId: reconciledThread.activeLineageId ?? targetRevision.lineageId ?? baseBranch.activeLineageId,
            architecture: refreshedArchitecture.architecture,
          },
        },
        revisions: reconciledThread.revisions,
      };
      const ok = ProjectStorage.saveProject(nextProject);
      if (!ok) {
        throw new Error('Storage full, could not persist restored revision');
      }

      chatLoadHistory(reconciledThread.history);

      await ProjectRepository.saveProject({
        ...full,
        files: restoredFiles,
        chatHistory: reconciledThread.history as any,
        updatedAt: now,
        activeBranchId,
        branches: nextProject.branches,
      });

      addLog(`[Project] Restored revision ${targetRevision.id.slice(0, 8)} from ${sourceLabel} history`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`[Project] ❌ Restore from ${sourceLabel} failed: ${msg}`);
      chatAppend({
        role: 'assistant',
        content: `⚠️ Could not restore this version: ${msg}`,
        timestamp: Date.now(),
        persistInHistory: false,
        sessionOnly: true,
      });
      return false;
    }
  }, [abortActiveGeneration, addLog, addSnapshot, appLanguage, chatAppend, chatLoadHistory, currentProjectId, markSnapshotStable, messages, projectPersistenceState]);

  const restoreMessageRevision = useCallback(async (messageId: string) => {
    const targetMessage = messages.find(message => message.id === messageId);
    const targetRevisionId = getMessageRevisionId(targetMessage);
    if (!targetRevisionId) {
      chatAppend({
        role: 'assistant',
        content: '⚠️ Could not restore this version: This message is not linked to a saved revision',
        timestamp: Date.now(),
        persistInHistory: false,
        sessionOnly: true,
      });
      return false;
    }
    return restorePersistedRevision(targetRevisionId, 'message');
  }, [chatAppend, messages, restorePersistedRevision]);

  const restoreBlueprintLineage = useCallback(async (messageId: string) => {
    if (projectPersistenceState !== 'exists' || !currentProjectId) return false;
    const targetMessage = messages.find(message => message.id === messageId);
    const targetLineageId = getMessageLineageId(targetMessage);
    if (!targetLineageId) {
      chatAppend({
        role: 'assistant',
        content: '⚠️ Could not restore this version: This blueprint is not linked to a saved lineage',
        timestamp: Date.now(),
        persistInHistory: false,
        sessionOnly: true,
      });
      return false;
    }

    const full = await ProjectRepository.getProject(currentProjectId);
    const activeBranchId = full?.activeBranchId ?? DEFAULT_PROJECT_BRANCH_ID;
    const revisions =
      ((full?.branches?.[activeBranchId]?.revisions as ProjectRevision[] | undefined)
        ?? ((full as any)?.revisions as ProjectRevision[] | undefined)
        ?? []);
    const targetRevision = revisions.find(revision => revision.lineageId === targetLineageId);
    if (!targetRevision) {
      chatAppend({
        role: 'assistant',
        content: '⚠️ Could not restore this version: No saved revision exists for this blueprint yet',
        timestamp: Date.now(),
        persistInHistory: false,
        sessionOnly: true,
      });
      return false;
    }

    return restorePersistedRevision(targetRevision.id, 'blueprint');
  }, [chatAppend, currentProjectId, messages, projectPersistenceState, restorePersistedRevision]);

  const deleteProject = useCallback(async (id: string) => {
    await ProjectRepository.deleteProject(id);
    // Refresh list from Supabase (falls back to localStorage on error)
    const meta = await ProjectRepository.listProjects();
    setProjects(meta.map(repositoryMetaToProjectMeta));
    if (currentProjectId === id) createNewProject();
  }, [currentProjectId, createNewProject]);

  /** Full current project (files included). Null when no project is active. */
  const currentProject = useMemo<Project | null>(
    () => (currentProjectId ? ProjectManager.getById(currentProjectId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentProjectId, projects],  // re-derive when id or project list changes
  );

  /**
   * Legacy entry-point preserved for backward compatibility.
   * Explicit project persistence is allowed only through savePendingProject()
   * after a successful preview.
   */
  const createProject = useCallback((
    _meta: { name: string; theme?: string; description?: string },
  ): string | null => {
    addLog('[Project] Direct createProject() is disabled — use "Сохранить проект" after preview', 'warn');
    return null;
  }, [addLog]);

  const refreshProjects = useCallback(() => {
    void ProjectRepository.listProjects()
      .then(meta => setProjects(meta.map(repositoryMetaToProjectMeta)))
      .catch(() => setProjects(ProjectStorage.listProjects()));
  }, []);

  /** Load an existing project into the active workspace (alias for loadProject with PM sync). */
  const switchProject = useCallback(async (project: { id: string }) => {
    await loadProject(project);
  }, [loadProject]);
  const loadProjectRef = useRef(loadProject);
  loadProjectRef.current = loadProject;

  // ── Auto-init: ensure a project is always active on first load ──────────────
  // Runs once after mount. Always calls loadProject() so the compiled preview
  // is rebuilt from scratch.
  //
  // HARD-REFRESH STARTUP BEHAVIOR — INTENTIONAL DESIGN DECISION (Option A):
  //   When the page loads after a hard refresh or server restart, if an active
  //   project exists in localStorage, it is automatically loaded and a fresh
  //   backend compile is triggered. The preview transitions through:
  //     idle → compiling → (preview-mounted) → ready
  //   The user does NOT need to take any action to restore the preview.
  //
  // Why we always recompile on startup (not restore a cached iframe URL):
  //   Compiled static builds (builds/:buildId/) are ephemeral — they live only
  //   for the duration of a backend server session. A hard refresh or server
  //   restart clears them. We therefore cannot rely on a previously-compiled
  //   build being present, and must trigger a fresh compile via the canonical
  //   materializePersistedFiles → triggerCompile path for every cold start.
  //
  //   This keeps the startup path identical to the project-switch path
  //   (no special cases, no silent stale-iframe risk).
  useEffect(() => {
    const init = async () => {
      localStorage.removeItem(LEGACY_CHAT_HISTORY_KEY);
      if (currentProjectId) {
        // Hard-refresh case: currentProjectId is restored from localStorage,
        // but the compiled build is gone. loadProject() fetches files and
        // triggers a fresh backend compile so the preview is live again.
        await loadProject({ id: currentProjectId });
        return;
      }

      // No explicitly-selected saved project — start with a fresh draft session.
      // No persisted project is created until the user explicitly saves after a successful preview.
      const existingDraftId = readDraftSessionId();
      const draftId = existingDraftId || draftArtifactJournal.createSession({ source: 'startup' });
      _draftSessionIdRef.current = draftId;
      localStorage.removeItem('aic-current-project');
      writeDraftSessionId(draftId);
      setCurrentProjectId(draftId);
      setProjectPersistenceState('draft');
      applyEffectiveSettingsForProject(draftId);
      setChatThreadKey(nextChatThreadKey('draft', draftId));
      chatLoadHistory(readDraftChatHistory(draftId));
      if (!existingDraftId) {
        draftArtifactJournal.appendRecord(draftId, {
          stepType: 'draft_session_started',
          source: 'startup',
          projectId: null,
          status: 'ok',
        });
      }
    };

    init().catch(() => {/* ignore — addLog already records errors inside loadProject */});
  }, [nextChatThreadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopGeneration = useCallback(() => {
    abortActiveGeneration('user-stop');
    setPreviewLifecycle('idle');
    addLog('⚡ Generation stopped by user');
    chatPatchLast(
      { role: 'assistant', content: '⚡ Остановлено.' },
      (msg) => msg.role === 'assistant' && (msg.content === '...' || msg.content === ''),
    );
  }, [abortActiveGeneration, addLog, chatPatchLast]);

  const _publishImpl = async (): Promise<string | null> => {
    const code = getPrimaryCode(files);
    if (!code) {
      console.warn('publishProject: files are empty — Supabase insert skipped');
      return null;
    }
    console.log('publishProject: uploading snapshot, code length =', code.length);
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert([{ code }])
        .select()
        .single();
      if (error) throw error;
      console.log('✅ Cloud Snapshot created! ID:', data.id);
      return data.id;
    } catch (err) {
      console.error('Publish error:', err);
      return null;
    }
  };
  const _publishRef = useRef(_publishImpl);
  _publishRef.current = _publishImpl;
  const publishProject = useCallback((): Promise<string | null> => _publishRef.current(), []);

  const classifyAndStore = useCallback(async (
    idea: string,
    apiKeyToUse: string,
  ): Promise<ClassificationResult> => {
    try {
      const result = await classifyIdea(idea, apiKeyToUse);
      setDesignClassification(result);
      console.log(`[design] Classified: ${result.category} / ${result.style} (${Math.round(result.confidence * 100)}%)`);
      return result;
    } catch {
      const fallback = fallbackClassify(idea);
      setDesignClassification(fallback);
      console.log(`[design] Fallback: ${fallback.category} / ${fallback.style}`);
      return fallback;
    }
  }, []);

  // ── handleSend ────────────────────────────────────────────────────────────
  // overridePrompt: used by REQUEST_PLAN_REVISION to bypass the textarea state.
  const _sendImpl = async (overridePrompt?: string) => {
    const effectiveInput = overridePrompt ?? inputRef.current;
    const composerContextItemsSnapshot = composerContextItemsRef.current;
    const activeProjectContextSnapshot = activeProjectContextRef.current;
    const generationSourceSnapshot = generationSourceRef.current;
    // Use abortControllerRef to detect a truly active generation: after
    // launchWithPlan() calls createNewProject() → abortActiveGeneration(), the
    // controller is cleared synchronously even though the `isGenerating` React
    // state hasn't re-rendered yet. Checking the ref avoids the stale-closure
    // false-positive that would block the "В работу" auto-send flow.
    if ((effectiveInput.trim().length === 0 && composerContextItemsSnapshot.length === 0 && attachments.length === 0) || (isGenerating && !!abortControllerRef.current)) return;

    const liveGenerationCanary = readLocalFlag(E2E_LIVE_GENERATION_CANARY_KEY);
    const playwrightBlueprintShortcut = readLocalFlag(E2E_BLUEPRINT_SHORTCUT_KEY);

    if (
      import.meta.env.VITE_PLAYWRIGHT_TEST === '1' &&
      playwrightBlueprintShortcut &&
      !liveGenerationCanary
    ) {
      console.log(' Test mode: isolated hardcoded blueprint');
      // Remove previous pending plans in chat to prevent duplicate plan cards.
      dispatch({ type: 'CLEAR_PENDING_PLANS' });
      const testPlan = {
        id: 'test-plan-1',
        title: 'Counter App',
        description: 'Счетчик с кнопками + и -',
        screens: [{ name: 'Page1', description: 'Отображение и изменение значения счетчика' }],
        technicalBlueprint: { framework: 'react', state: 'useState' },
      };

      const planMessage = {
        id: String(Date.now()),
        role: 'assistant' as const,
        // Keep blueprint type so LeftPanel renders the pending card/buttons in E2E.
        type: 'blueprint',
        blueprintText: '### Screens\n1. **Page1** — Отображение и изменение значения счетчика',
        technicalBlueprint: testPlan.technicalBlueprint,
        pendingPlan: testPlan,
        isPending: true,
        appName: testPlan.title,
        pages: ['Page1'],
        blueprintVisible: true,
        timestamp: Date.now(),
      };

      dispatch({ type: 'APPEND', payload: planMessage });
      setPendingPlan({
        id: testPlan.id,
        plan: testPlan as unknown as ProjectPlan,
        blueprintText: planMessage.blueprintText,
        technicalBlueprint: testPlan.technicalBlueprint,
        appName: testPlan.title,
        theme: 'default',
        pages: ['Page1'],
      });
      inputRef.current = '';
      setInput('');
      clearAttachments();
      return;
    }

    const packagedLaunchContext = packagedLaunchContextRef.current;
    generationSourceRef.current = 'chat';
    setGenerationSource('chat');
    const startMs = Date.now();

    const devAgentProvider = getLocalDevAgentProvider();
    const devAgentActive = devAgentProvider !== 'off';

    // ── Effective API key: use provider key for primary agent, global key as fallback
    const effectiveApiKey = ConfigService.getKeyForAgent('primary') || apiKey;

    if (!devAgentActive && !effectiveApiKey) {
      alert('Добавь OpenRouter API Key в настройках!');
      setShowSettings(true);
      return;
    }

    // ── Spam / retry protection: block after 3 consecutive errors for 30s ──
    const now = Date.now();
    if (consecutiveErrors.current >= 3 && now - lastErrorTime.current < 30_000) {
      const wait = Math.ceil((30_000 - (now - lastErrorTime.current)) / 1000);
      addLog(`⛔ Too many errors. Wait ${wait}s before retrying.`);
      alert(`Too many consecutive errors. Wait ${wait} seconds before retrying.`);
      return;
    }

    // ── Abort any previous request and create a fresh controller ──────────
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    pendingProjectSaveRef.current = null;
    pendingSavePromptShownRef.current = false;
    setPendingProjectSaveMeta(null);
    fixAttemptsRef.current = 0;  // reset auto-fix counter for this generation
    setIsGenerating(true);
    setProgress(5);
    setCurrentPhase('think');
    setPreviewLifecycle('generating');
    setPreviewBlockedReason(null);
    // Resolve project ID at execution time to avoid stale closure issues when
    // createNewProject() has set a draft session but React has not re-rendered yet.
    // Draft session ID always wins to guarantee unsaved runs never bind to a stale
    // persisted project ID.
    const persistedProjectId =
      currentProjectId
      ?? localStorage.getItem('CURRENT_PROJECT_ID')
      ?? currentProject?.id
      ?? (projectPersistenceState === 'exists' ? ProjectManager.getCurrentId() : null);
    const stableProjectId =
      readDraftSessionId()
      ?? persistedProjectId
      ?? ProjectManager.getCurrentId();
    const runWorkspaceContext = resolveStudioKickoffContext(stableProjectId, currentProject);
    const runProjectId = runWorkspaceContext.projectId ?? stableProjectId ?? crypto.randomUUID();
    const runBranchId = runWorkspaceContext.branchId ?? DEFAULT_PROJECT_BRANCH_ID;
    const runTargetsPersistedProject =
      projectPersistenceState === 'exists' &&
      !!persistedProjectId &&
      runProjectId === persistedProjectId;
    commandBus.dispatch({ type: 'START_GENERATION', intent: effectiveInput, plan: {} });
    addLog('─'.repeat(40));

    // (planning is handled inside GenerationPipeline via onPlan callback)

    const userPrompt = effectiveInput.trim();
    const hasComposerContext = composerContextItemsSnapshot.length > 0;
    const documentAttachmentContext = attachments
      .filter(a => a.type === 'pdf' || a.type === 'text' || a.type === 'code')
      .map((a, index) => {
        const body = (a.textContent ?? a.data ?? '').replace(/\s+/g, ' ').trim();
        const excerpt = body.slice(0, 800);
        return `${index + 1}. ${a.name}${excerpt ? `: ${excerpt}` : ''}`;
      });
    const attachmentContextText = documentAttachmentContext.length > 0
      ? [
          'ATTACHMENT CONTEXT (provided by user):',
          ...documentAttachmentContext,
        ].join('\n')
      : '';
    const contextPackText = hasComposerContext
      ? [
          'CONTEXT PACK (selected by user):',
          ...composerContextItemsSnapshot.map((item, index) => {
            const lines = [
              `${index + 1}. [${item.source}] ${item.title}`,
              item.intent ? `Intent: ${item.intent}` : '',
              item.summary ? `Notes: ${item.summary}` : '',
            ].filter(Boolean);
            return lines.join('\n');
          }),
        ].join('\n\n')
      : '';
    let resolvedGenerationMode: 'app' | 'superapp' = generationMode === 'superapp' ? 'superapp' : 'app';
    if (generationMode === 'landing') {
      setGenerationMode('app');
    }
    let generationModeLabel = resolvedGenerationMode === 'superapp' ? 'Super app' : 'Application';
    const languageLabelMap: Record<string, string> = {
      ru: 'Russian',
      en: 'English',
      es: 'Spanish',
      de: 'German',
      fr: 'French',
      zh: 'Chinese',
    };
    let buildPreferencesText = [
      'BUILD PREFERENCES (user-selected defaults):',
      `- Project type: ${generationModeLabel}`,
      `- Interface language: ${languageLabelMap[appLanguage] ?? appLanguage}`,
    ].join('\n');
    let baseIntent = [
      userPrompt || (hasComposerContext ? 'Continue with selected context pack.' : ''),
      buildPreferencesText,
      contextPackText,
      attachmentContextText,
    ].filter(Boolean).join('\n\n');
    const effectiveSource: GenerationSource =
      composerContextItemsSnapshot.length === 1 &&
      (
        composerContextItemsSnapshot[0].source === 'weekly-feed' ||
        composerContextItemsSnapshot[0].source === 'niche' ||
        composerContextItemsSnapshot[0].source === 'trend-niche'
      )
        ? composerContextItemsSnapshot[0].source
        : packagedLaunchContext?.source ?? generationSourceSnapshot;
    const autoStartPackagedTrendBuild =
      effectiveSource === 'trend-niche' && !!(
        activeProjectContextSnapshot?.plan
        ?? (
          composerContextItemsSnapshot.length === 1
            ? composerContextItemsSnapshot[0].plan
            : undefined
        )
        ?? packagedLaunchContext?.plan
      );
    const generationStartMs = Date.now();
    const generationLogs: string[] = [];
    const generationErrors: string[] = [];
    finalPreviewGateRef.current = { awaiting: true, filesCommitted: false };

    let messageContent: any = userPrompt || 'Use selected context pack.';
    const imageAttachments = attachments.filter(a => a.type === 'image');
    if (imageAttachments.length > 0) {
      messageContent = [
        ...imageAttachments.map(a => ({
          type: 'image_url',
          image_url: { url: a.data },
        })),
        { type: 'text', text: userPrompt || 'Use selected context pack.' },
      ];
    }

    const userMsg = { role: 'user' as const, content: messageContent };
    // Use empty history if createNewProject() was called but React hasn't re-rendered yet.
    const baseMessages = pendingHistoryClear.current ? [] : messages;
    pendingHistoryClear.current = false;
    const history = [...baseMessages, userMsg];
    console.log('[handleSend] history length:', history.length,
      'first msg:', history[0]?.content?.toString().slice(0, 50));

    // Capture before clearing so we can pass to run() below
    const capturedAttachments = [...attachments];

    // Reset chat to show conversation history while plan loads.
    dispatch({ type: 'RESET', payload: history });

    // ── Language detection ────────────────────────────────────────────────────
    let userLang = /[а-яА-Я]/.test(userPrompt) ? 'ru' : 'en';
    if (import.meta.env.VITE_PLAYWRIGHT_TEST === '1' && playwrightBlueprintShortcut) userLang = 'ru';
    const trustLanguage = appLanguage || userLang;
    const storedProjectForTrust = runProjectId ? ProjectStorage.getProject(runProjectId) : null;
    const activeBranchIdForTrust = storedProjectForTrust?.activeBranchId ?? runBranchId;
    const currentBranchForTrust = storedProjectForTrust?.branches?.[activeBranchIdForTrust];
    const currentThreadForTrust = reconcileProjectChatHistory({
      history: buildPersistedProjectChatHistory(
        (storedProjectForTrust?.chatHistory as any[]) ?? (baseMessages as any[]),
      ),
      revisions: (currentBranchForTrust?.revisions as ProjectRevision[] | undefined) ?? storedProjectForTrust?.revisions ?? [],
      currentFiles: currentBranchForTrust?.files ?? storedProjectForTrust?.files ?? files,
      currentHeadRevisionId: currentBranchForTrust?.headRevisionId ?? null,
      currentActiveLineageId: currentBranchForTrust?.activeLineageId ?? null,
    });
    const currentActiveLineageId = currentThreadForTrust.activeLineageId;
    const currentLineageRootMessageId =
      findLineageRootMessageId(currentThreadForTrust.history, currentActiveLineageId)
      ?? null;
    const projectFiles = Object.keys(files);
    const existingCodeCount = projectFiles.length;
    const restartLineageRequested = shouldStartNewLineage(userPrompt, existingCodeCount);
    const effectiveExistingCodeCount = restartLineageRequested ? 0 : existingCodeCount;

    // ── Surface choice — ask before genesis when mode was not set explicitly ──
    // Packaged trend-niche builds skip the dialog: the "В работу" flow is an
    // explicit signal that the user wants to build — forcing a second choice
    // breaks the founder flow. Auto-select 'app' and continue.
    if (effectiveExistingCodeCount === 0 && !modeSetByUserRef.current) {
      if (autoStartPackagedTrendBuild) {
        resolvedGenerationMode = 'app';
        setGenerationMode('app');
        modeSetByUserRef.current = true;
        generationModeLabel = 'Application';
      } else {
        const surfaceMsgId = createMessageId();
        chatAppend({
          id:        surfaceMsgId,
          role:      'assistant' as const,
          type:      'surface-choice' as const,
          content:   '',
          timestamp: Date.now(),
        });
        const chosen = await waitForSurfaceChoice(controller.signal);
        if (controller.signal.aborted || chosen === null) {
          finalPreviewGateRef.current = { awaiting: false, filesCommitted: false };
          setIsGenerating(false);
          return;
        }
        resolvedGenerationMode = chosen === 'superapp' ? 'superapp' : 'app';
        setGenerationMode(resolvedGenerationMode);
        modeSetByUserRef.current = true;
        chatUpdate(surfaceMsgId, { selectedSurface: resolvedGenerationMode });
        generationModeLabel = resolvedGenerationMode === 'superapp' ? 'Super app' : 'Application';
      }
      buildPreferencesText = [
        'BUILD PREFERENCES (user-selected defaults):',
        `- Project type: ${generationModeLabel}`,
        `- Interface language: ${languageLabelMap[appLanguage] ?? appLanguage}`,
      ].join('\n');
      baseIntent = [
        userPrompt || (hasComposerContext ? 'Continue with selected context pack.' : ''),
        buildPreferencesText,
        contextPackText,
        attachmentContextText,
      ].filter(Boolean).join('\n\n');
    }
    lastGenerationPromptRef.current = baseIntent || userPrompt || 'Continue the last generation.';

    const savedContinuationPlan =
      !restartLineageRequested
      && effectiveExistingCodeCount > 0
      && projectPersistenceState === 'exists'
      && isExplicitContinuationPrompt(userPrompt)
      && storedProjectForTrust?.plan
        ? storedProjectForTrust.plan as ProjectPlan
        : null;
    const continuationPlanPreview = savedContinuationPlan
      ? buildContinuationPlanPreview(savedContinuationPlan, userPrompt)
      : null;
    const prebuiltPlanFromContext = savedContinuationPlan
      ?? activeProjectContextSnapshot?.plan
      ?? (
        composerContextItemsSnapshot.length === 1
          ? composerContextItemsSnapshot[0].plan
          : undefined
      )
      ?? packagedLaunchContext?.plan;
    const founderFastPath =
      autoStartPackagedTrendBuild &&
      !!prebuiltPlanFromContext &&
      !savedContinuationPlan;
    const runStartsNewLineage = effectiveExistingCodeCount === 0 || !currentActiveLineageId;
    let runLineageId = currentActiveLineageId;
    let runLineageRootMessageId = currentLineageRootMessageId;
    let runReportMessageId: string | null = null;
    const branchArchitectureForTrust = currentBranchForTrust?.architecture ?? null;
    const generationTrust = buildBranchTrustUiSummary(
      buildBranchGenerationGuidance(
        branchArchitectureForTrust,
        files,
        trustLanguage,
        {
          requestIntent: userPrompt,
          generationMode: resolvedGenerationMode,
        },
      ),
      trustLanguage,
    );

    // ── Optimistic blueprint card — shown immediately while plan generates ─────
    const optimisticPlanMsgId = crypto.randomUUID();
    currentPlanMsgIdRef.current = optimisticPlanMsgId;
    dispatch({ type: 'APPEND', payload: {
      id:               optimisticPlanMsgId,
      role:             'assistant' as const,
      type:             'blueprint',
      timestamp:        Date.now(),
      content:          `Plan: ${userPrompt.slice(0, 80)}`,
      blueprintVisible: true,
      startsLineage:    false,
      ...(runLineageId ? { lineageId: runLineageId } : {}),
      ...(runLineageRootMessageId ? { lineageRootMessageId: runLineageRootMessageId } : {}),
      progress:         0,
      buildStatus:      'generating' as const,
      generationTrust,
    } });

    // ── Phase progress message — updated as generation phases advance ──────────
    const progressMsgId = `progress-${optimisticPlanMsgId}`;
    dispatch({ type: 'APPEND', payload: {
      id:        progressMsgId,
      role:      'assistant' as const,
      type:      'progress' as const,
      content:   '🏗️ Анализирую задачу...',
      timestamp: Date.now() + 1,
    } });

    const failBeforePipelineRun = (planErr: unknown) => {
      const err = planErr as any;
      const isNetworkError = err instanceof TypeError &&
        /fetch|network|ERR_|failed to fetch/i.test(err.message ?? '');
      const errorMessage: string = err?.message ?? 'Unknown error';
      const httpStatusMatch = errorMessage.match(/LLM Proxy (\d+)/);
      const httpStatus = httpStatusMatch ? parseInt(httpStatusMatch[1], 10) : 0;
      const isUnauthorized = httpStatus === 401;
      const isRateLimit = httpStatus === 429;
      const isProviderError = httpStatus >= 500;
      const isModelError = isUnauthorized || isRateLimit || isProviderError;

      let errorContent: string;
      if (isNetworkError) {
        errorContent = '🔌 **Connection lost.** Check your internet and retry.';
      } else if (isUnauthorized) {
        errorContent = `🔑 **API key rejected.** Open **Settings → API Keys** and verify your key, then retry.`;
      } else if (isRateLimit) {
        errorContent = `⏳ **Rate limit reached.** Switch to a different model in **Settings → Agents**, then retry.`;
      } else if (isProviderError) {
        errorContent = `🔴 **Provider error (${httpStatus}).** The service may be down. Switch to an OpenRouter model in Settings, then retry.`;
      } else {
        errorContent = `❌ Ошибка: ${errorMessage}`;
      }

      consecutiveErrors.current += 1;
      lastErrorTime.current = Date.now();
      networkRetryCountRef.current = 0;
      finalPreviewGateRef.current = { awaiting: false, filesCommitted: false };
      commandBus.dispatch({ type: 'GENERATION_FAILED', error: errorMessage });
      addLog(`${isNetworkError ? 'Connection lost' : 'Error'} #${consecutiveErrors.current}: ${errorMessage}`, 'error');
      dispatch({ type: 'REMOVE_BY_ID', id: optimisticPlanMsgId });
      dispatch({ type: 'REMOVE_BY_ID', id: progressMsgId });
      chatAppend({
        role: 'assistant',
        type: 'text',
        content: errorContent,
        retryable: true,
        showSettingsButton: isModelError,
        timestamp: Date.now(),
      });
      setCurrentPhase('');
      setPreviewLifecycle('failed');
      setIsGenerating(false);
      setKickoffPhase('idle');
      setTimeout(() => setProgress(0), 1200);
    };

    // ── Generate plan — replace optimistic card with real plan data ───────────
    // Resolve planRoute here so generatePlan uses canonical routing (not ConfigService fallback).
    // planRoute always uses 'primary' slot — autoRoute escalation only affects the main coder,
    // not the plan-generation call which always runs on the primary slot semantically.
    let plan: GeneratedPlanPreview;
    if (continuationPlanPreview) {
      plan = continuationPlanPreview;
      addLog('[Continue] Existing project continuation detected — reusing the saved project plan');
    } else if (founderFastPath && prebuiltPlanFromContext) {
      plan = buildContinuationPlanPreview(prebuiltPlanFromContext, userPrompt);
      addLog('[FounderFlow] Reusing the packaged founder brief — skipped legacy plan warmup');
    } else {
      const planRoute = resolveStandardRoute('primary', { onLog: addLog });
      try {
        plan = await GenerationPipeline.generatePlan({
          intent:   userPrompt,
          userLang,
          apiKey:   planRoute.apiKey,
          route:    planRoute,
          projectId: runProjectId,
          signal:   controller.signal,
        });
      } catch (planErr) {
        failBeforePipelineRun(planErr);
        return;
      }
    }
    console.log('[planner] plan generated, dispatching', plan);

    // Update the optimistic card with real plan data (reuse same id — no remount).
    const planMsgId = optimisticPlanMsgId;
    dispatch({ type: 'UPDATE_BY_ID', id: planMsgId, patch: {
      appName:      plan.appName,
      pages:        plan.pages,
      steps:        plan.steps,
      content:      undefined,
      blueprintVisible: true,
      buildStatus:  'generating' as const,
      streamingCode: '',
    } });
    const updateStep = (stepId: string, stepStatus: string) =>
      dispatch({ type: 'UPDATE_STEPS', id: planMsgId, stepId, stepStatus });
    const updatePlan = (patch: object) =>
      chatUpdate(planMsgId, patch as Partial<ChatMessage>);
      inputRef.current = '';
      setInput('');
      clearAttachments();

    const selectedContextFiles = fullContextMode
      ? files
      : activeFile && files[activeFile]
        ? { [activeFile]: files[activeFile] }
        : files;
    const contextFiles = restartLineageRequested ? {} : selectedContextFiles;

    // ── Inject project ID for memory persistence ─────────────────────────
    const contextWithProjectId = {
      ...contextFiles,
      ...(runProjectId ? { '_projectId': runProjectId } : {}),
    };

    // ── Inject Figma design tokens + cultural audit as virtual context file ─
    const contextWithTheme = currentProjectTheme
      ? {
          ...contextWithProjectId,
          '_figma_theme.css': FigmaService.injectFigmaContext(
            currentProjectTheme,
            { targetMarket, auditStrictness },
          ),
        }
      : contextWithProjectId;

    // ── Determine execution slot (autoRoute may escalate primary → build) ─────
    // Slot selection is the only routing decision made here.
    // All provider / model / key / endpoint resolution happens inside resolveStandardRoute.
    let primarySlot: 'primary' | 'build' = 'primary';
    if (autoRoute) {
      const { tier, taskType, signals } = ResourceManager.classifyTask(baseIntent || userPrompt, contextFiles);
      const signalList = signals.join(' · ') || 'default';
      if (tier === 3) {
        primarySlot = 'build';
        addLog(`🤖 [AutoRoute] T3 Expert — escalating to build slot: "${taskType}" [${signalList}]`);
      } else {
        addLog(`🤖 [AutoRoute] T${tier} ${ResourceManager.tierLabel(tier)} — primary slot: "${taskType}" [${signalList}]`);
      }
    }

    // ── Canonical route resolution — single source of truth for this generation
    const primaryRoute = resolveStandardRoute(primarySlot, { onLog: addLog });
    const buildRoute   = resolveStandardRoute('build',      { onLog: addLog });
    const fixRoute     = resolveStandardRoute('fix',        { onLog: addLog });
    const specRoute    = resolveStandardRoute('spec',       { onLog: addLog });
    const qaRoute      = resolveStandardRoute('qa',         { onLog: addLog });

    addLog(
      `[Route] primary: slot=${primaryRoute.slot} provider=${primaryRoute.provider} model=${primaryRoute.modelId}` +
      (primaryRoute.fallbackReason ? ` [fallback: ${primaryRoute.fallbackReason}]` : ''),
    );
    addLog(
      `[Route] build:   slot=${buildRoute.slot} provider=${buildRoute.provider} model=${buildRoute.modelId}` +
      (buildRoute.fallbackReason ? ` [fallback: ${buildRoute.fallbackReason}]` : ''),
    );
    console.log('[useStudio] routes resolved — primary:', primaryRoute.modelId, 'build:', buildRoute.modelId);

    const traceHandle = generationTracer.start({
      intent: userPrompt || 'Use selected context pack.',
      model: buildRoute.modelId || primaryRoute.modelId || 'unknown',
      mode: effectiveExistingCodeCount === 0 ? 'new' : 'edit',
      projectId: runProjectId,
      branchId: runBranchId,
    });
    currentTraceLookupRef.current = {
      runId: traceHandle.id,
      projectId: runProjectId,
      branchId: runBranchId,
      startedMs: generationStartMs,
    };
    traceHandle.setRoutes([
      buildTraceRouteRecord('primary', primaryRoute),
      buildTraceRouteRecord('build', buildRoute),
      buildTraceRouteRecord('fix', fixRoute),
      buildTraceRouteRecord('spec', specRoute),
      buildTraceRouteRecord('qa', qaRoute),
    ]);
    const kickoffStepId = traceHandle.beginStep({
      kind: 'intent_understanding',
      summary: [
        userPrompt || 'Use selected context pack.',
        `Mode: ${effectiveExistingCodeCount === 0 ? 'new' : 'edit'}`,
        `Source: ${effectiveSource}`,
        `Project: ${resolvedGenerationMode}`,
      ].join(' · '),
      labels: {
        provider: primaryRoute.provider,
        model: primaryRoute.modelId,
        slot: primaryRoute.slot,
        route: `${primaryRoute.provider}:${primaryRoute.slot}`,
      },
      metadata: {
        source: effectiveSource,
        generationMode: resolvedGenerationMode,
        projectId: runProjectId,
        branchId: runBranchId,
      },
    });
    let traceFinalized = false;

    // ── Draft journal: record generation start ────────────────────────────────
    const _journalDraftSessionId = _draftSessionIdRef.current;
    const _journalRunId = crypto.randomUUID();
    if (_journalDraftSessionId) {
      draftArtifactJournal.appendRecord(_journalDraftSessionId, {
        stepType: 'generation_start',
        runId: _journalRunId,
        source: effectiveSource,
        projectId: null,
        request: {
          userPrompt: userPrompt.slice(0, 400),
          primaryModel: primaryRoute.modelId,
          buildModel: buildRoute.modelId,
          provider: primaryRoute.provider,
          existingFileCount: effectiveExistingCodeCount,
        },
        status: 'ok',
      });
    }

    let finalIntent = baseIntent;

    const filesSnapshot = { ...files };
    try {
      let optimisticFiles: FileMap | null = null;
      const systemEvents: string[] = [];
      let reqUsage: UsageData = { promptTokens: 0, completionTokens: 0 };
      let capturedAppName = '';

      // Vision analysis is now handled inside GenerationPipeline.run() via config.attachments.

      let designPrompt = '';
      if (founderFastPath) {
        addLog('[FounderFlow] Skipped legacy design classification warm-up');
      } else {
        // Legacy warm-up: retained for non-founder flows until the old prompt path is removed.
        const classification = devAgentActive || savedContinuationPlan
          ? fallbackClassify(baseIntent)
          : await classifyAndStore(baseIntent, effectiveApiKey);

        if (devAgentActive) {
          addLog(`[handleSend] ${devAgentProvider} dev agent active: skipped OpenRouter classification`);
        } else if (savedContinuationPlan) {
          addLog('[Continue] Reusing saved project plan — skipped remote design re-classification');
        }
        designPrompt = buildDesignSystemPrompt({
          category: classification.category,
          style: classification.style,
          idea: baseIntent,
          classification,
        });
      }

      console.log('[DEBUG] pipeline input files:', Object.keys(contextWithTheme));

      // ── Pre-build Architect analysis (genesis only) ───────────────────────
      // Runs when there are no existing code files (first build / new branch kickoff).
      // Stage 1: local heuristic (always). Stage 2: LLM enrichment (when apiKey available).
      // The plan is shown as an assistant message before the build starts, and written
      // to branch-scoped architecture memory after a successful generation.
      pendingArchitectKickoffRef.current = null;
      // Track whether this specific run is a genesis build for kickoff phase logging.
      const isGenesisRun = effectiveExistingCodeCount === 0;
      if (founderFastPath) {
        addLog('[FounderFlow] Packaged founder brief already contains architecture — skipped kickoff analysis');
      } else if (isGenesisRun && !controller.signal.aborted) {
        setKickoffPhase('prompt_received');
        addLog('[Kickoff] kickoff_prompt_received');
        try {
          setKickoffPhase('analyzing');
          const kickoffContext = {
            projectId: runProjectId,
            branchId: runBranchId,
          };
          if (!kickoffContext.projectId) {
            throw new Error('Cannot run Architect kickoff without a resolved project id');
          }
          const architectPlan = await ArchitectPlannerService.analyze({
            intent:     userPrompt,
            projectId:  kickoffContext.projectId,
            branchId:   kickoffContext.branchId,
            language:   appLanguage,
            apiKey:     primaryRoute.apiKey,
            modelId:    primaryRoute.modelId,
            signal:     controller.signal,
            onLog:      addLog,
          });
          let proposedSnapshotId: string | null = null;
          if (runTargetsPersistedProject) {
            const proposedSnapshot = await ArchitectPlannerService.writeProposedKickoffToMemory(
              kickoffContext.projectId,
              kickoffContext.branchId,
              architectPlan,
              new Date().toISOString(),
              appLanguage,
            );
            proposedSnapshotId = proposedSnapshot.id;
            addLog(`[Architect] Proposed kickoff draft saved (${proposedSnapshot.id})`);
          } else {
            addLog('[Architect] Kickoff draft kept in session only until explicit Save');
          }
          pendingArchitectKickoffRef.current = {
            projectId: kickoffContext.projectId,
            plan: architectPlan,
            branchId: kickoffContext.branchId,
            selectedOptionId: architectPlan.defaultOptionId,
            proposedSnapshotId,
          };
          addLog(`[Kickoff] kickoff_scope_defaulted: ${architectPlan.defaultOptionId}`);

          if (!controller.signal.aborted) {
            chatAppend({
              role:      'assistant' as const,
              type:      'text',
              content:   ArchitectPlannerService.formatPlanForChat(architectPlan, appLanguage),
              timestamp: Date.now(),
            });
          }
          const blockingQuestions = architectPlan.questions.filter(
            (question): question is ArchitectBlockingQuestion => question.kind === 'blocking',
          );
          if (blockingQuestions.length > 0 && !controller.signal.aborted) {
            chatAppend({
              role:      'assistant' as const,
              type:      'clarification' as const,
              blockingQuestions,
              content:   '',
              timestamp: Date.now() + 2,
            });
            // Block generation until user answers (or aborts)
            const clarAnswer = await waitForClarification(controller.signal);
            if (controller.signal.aborted) {
              finalPreviewGateRef.current = { awaiting: false, filesCommitted: false };
              setIsGenerating(false);
              return;
            }
            if (clarAnswer.trim()) {
              finalIntent += '\n\nUser clarification answers: ' + clarAnswer;
            }
          }
        } catch (architectErr) {
          addLog(`[Architect] Pre-build analysis failed: ${(architectErr as Error)?.message ?? String(architectErr)} — continuing without`);
        }
      }

      traceHandle.setArchitectSummary(plan.summary || plan.appName || userPrompt);
      traceHandle.finishStep(kickoffStepId, {
        summary: founderFastPath
          ? 'Using the packaged founder brief and moving directly into the generation pipeline.'
          : savedContinuationPlan
            ? 'Reused the saved project plan and continuation context for this run.'
            : `Prepared the run brief${plan.appName ? ` for ${plan.appName}` : ''} and locked the generation context.`,
        labels: {
          provider: primaryRoute.provider,
          model: primaryRoute.modelId,
          slot: primaryRoute.slot,
          route: `${primaryRoute.provider}:${primaryRoute.slot}`,
        },
      });
      const traceStepIds = new Map<string, string>();
      const finishTracePipelineStep = (
        stepId: string,
        status: 'completed' | 'failed',
        detail?: string,
        warnings?: string[],
      ) => {
        const currentStepId = traceStepIds.get(stepId);
        if (!currentStepId) return;
        traceHandle.finishStep(currentStepId, {
          status,
          summary: detail ?? stepId,
          errorSummary: status === 'failed' ? detail : warnings?.[0],
          metadata: warnings && warnings.length > 0 ? { warnings } : undefined,
        });
        traceStepIds.delete(stepId);
      };

      const runOnce = (intentArg: string, buildRouteOverride?: AgentExecutionRoute) => GenerationPipeline.run({
        intent:       intentArg,
        history,
        files:        contextWithTheme,
        projectId:    runProjectId,
        branchId:     runBranchId,
        primaryRoute,
        buildRoute:   buildRouteOverride ?? buildRoute,
        fixRoute,
        specRoute,
        qaRoute,
        // kept for metrics/tracing (deprecated as routing truth)
        apiKey:    primaryRoute.apiKey,
        modelId:   (buildRouteOverride ?? buildRoute).modelId,
        fixModelId: fixRoute.modelId,
        designSystemPrompt: designPrompt,
        // Enable single-page safe mode on genesis (no existing code files).
        // This prevents the model from generating broken multi-page output
        // on the very first request when there's no context to ground on.
        singlePageSafeMode: effectiveExistingCodeCount === 0,
        generationMode: resolvedGenerationMode,
        visualPolishMode: generationTrust.mode === 'fast_prototype'
          ? 'fast_prototype'
          : 'architect_guided',
        attachments: capturedAttachments,
        prebuiltPlan: prebuiltPlanFromContext,
        reuseSavedPlanForContinuation: !!savedContinuationPlan,
        onStream: (streamText) => {
          traceHandle.markFirstToken();
          // Update streamingCode on the plan card (replaces old last-message overwrite)
          startTransition(() => {
            updatePlan({ streamingCode: streamText });
          });
        },
        onFiles: (ops: FileOperation[]) => {
          const base = optimisticFiles ?? filesSnapshot; // accumulate across multiple onFiles calls
          const applied = applyOperations(base, ops);
          optimisticFiles = applied;
          // Use setFilesRaw directly during streaming — projectGraph is null at this point
          // and calling the full setFiles() (which calls setProjectGraph(null)) is redundant.
          // startTransition: file-panel re-renders during streaming are non-critical
          const first = ops.find(o => o.op !== 'delete');
          startTransition(() => {
            setFilesRaw(applied);
            if (first && 'name' in first) setActiveFile((first as any).name);
          });
          for (const op of ops) {
            if ('name' in op) {
              const verb = op.op === 'delete' ? 'Deleted' : op.op === 'patch' ? 'Patched' : 'Updated';
              systemEvents.push(`⚙️ ${verb}: \`${op.name}\``);
            }
          }
        },
        onPhase: (event: PhaseEvent) => {
          startTransition(() => {
            setProgress(event.progress);
            setCurrentPhase(event.phase);
            if (event.phase === 'think')  {
              updateStep('think', 'done'); updateStep('architect', 'active'); updatePlan({ progress: 20 });
              if (isGenesisRun) {
                setKickoffPhase('building');
                addLog('[Kickoff] kickoff_build_in_progress');
              }
            }
            if (event.phase === 'code')   { updateStep('architect', 'done'); updateStep('code', 'active'); updatePlan({ progress: 40 }); }
            if (event.phase === 'verify') { updateStep('code', 'done'); updateStep('theme', 'active'); updatePlan({ progress: 80 }); }
            if (event.phase === 'idle')   { updateStep('theme', 'done'); updateStep('save', 'done'); updatePlan({ progress: 100, buildStatus: 'building' }); }
          });
        },
        onStepTrack: (() => {
          // Live step-track state — mutable, not React state (no re-render cascade).
          const STEP_ORDER: string[] = founderFastPath
            ? ['pack','architect','skeleton','coder','build','preview']
            : ['clarify','pack','architect','skeleton','coder','build','preview'];
          const STEP_RU: Record<string, string> = {
            clarify:   'Анализирую задачу',
            pack:      'Дизайн-пак',
            architect: 'Архитектура',
            skeleton:  'Выбор skeleton',
            coder:     'Кодирование',
            build:     'Финальная сборка',
            preview:   'Превью',
          };
          const stepState: Record<string, 'pending'|'active'|'done'|'error'> = {};
          for (const s of STEP_ORDER) stepState[s] = 'pending';

          return (e: import('../services/ProtoPipeline').StepEvent) => {
            const traceKind = mapTelemetryStepToTraceKind(e.step);
            const existingTraceStepId = traceStepIds.get(e.step);
            if (e.status === 'active' && !existingTraceStepId) {
              traceStepIds.set(e.step, traceHandle.beginStep({
                kind: traceKind,
                summary: e.detail ? `${e.label} — ${e.detail}` : e.label,
                labels:
                  e.step === 'coder' || e.step === 'build'
                    ? {
                        provider: buildRoute.provider,
                        model: buildRoute.modelId,
                        slot: buildRoute.slot,
                        route: `${buildRoute.provider}:${buildRoute.slot}`,
                      }
                    : {
                        provider: primaryRoute.provider,
                        model: primaryRoute.modelId,
                        slot: primaryRoute.slot,
                        route: `${primaryRoute.provider}:${primaryRoute.slot}`,
                      },
                metadata: {
                  pipelineStep: e.step,
                  detail: e.detail,
                },
              }));
            } else if (e.status === 'done') {
              finishTracePipelineStep(e.step, 'completed', e.detail ?? e.label, e.warnings);
            } else if (e.status === 'error') {
              finishTracePipelineStep(e.step, 'failed', e.detail ?? e.label, e.warnings);
            }
            stepState[e.step] = e.status;
            const detail = e.detail ? ` — ${e.detail}` : '';
            const rows = STEP_ORDER.map(s => {
              const st = stepState[s] ?? 'pending';
              const icon = st === 'done' ? '✓' : st === 'active' ? '⚡' : st === 'error' ? '✗' : '○';
              const extra = (s === e.step && e.status === 'done' && detail) ? detail : '';
              return `${icon} ${STEP_RU[s] ?? s}${s === e.step && e.status === 'active' && detail ? detail : ''}${extra}`;
            });
            chatUpdate(progressMsgId, { content: rows.join('\n') });
          };
        })(),
        onLog: (msg: string) => {
          addLog(msg);
          generationLogs.push(msg);
          if (msg.includes('❌') || msg.toLowerCase().includes('error')) {
            generationErrors.push(msg);
          }
        },
        onPlan: (steps, appName) => {
          capturedAppName = appName ?? '';
          if (steps.length > 0) {
            addLog(`[PLAN] ${steps.length} pages: ${steps.join(', ')}`);
          }
          startTransition(() => {
            updatePlan({
              appName: appName ?? '',
              pages:   steps,
            });
          });
        },
        onPlanReady: (data) => {
          // Synchronous dispatch — no startTransition, no commandBus indirection.
          // All chat mutations go through the reducer in order.
          // commandBus.dispatch(SHOW_BLUEPRINT) is intentionally omitted here:
          // chat state is already mutated above; firing SHOW_BLUEPRINT via commandBus
          // would create a second asynchronous mutation path and introduce races.
          const bpId = `blueprint-${Date.now()}`;
          if (runStartsNewLineage) {
            runLineageRootMessageId = bpId;
            runLineageId = buildLineageId(bpId);
          }
          blueprintIdRef.current = bpId;
          dispatch({
            type: 'APPEND',
            payload: {
              role:             'assistant',
              type:             'blueprint',
              id:               bpId,
              timestamp:        Date.now(),
              blueprintVisible: true,
              startsLineage:    runStartsNewLineage,
              ...(runLineageId ? { lineageId: runLineageId } : {}),
              ...(runLineageRootMessageId ? { lineageRootMessageId: runLineageRootMessageId } : {}),
              ...data,
            },
          });
        },
        waitForConfirmation: async (_plan) => {
          const architectKickoff = pendingArchitectKickoffRef.current;
          pendingArchitectKickoffRef.current = null;

          // Founder "Build now" flow: packaged trend ideas should move directly
          // into generation without an extra hidden confirmation gate.
          if (autoStartPackagedTrendBuild) {
            setKickoffPhase('build_starting');
            addLog('[FounderFlow] Packaged trend idea confirmed automatically — starting build');

            const approval = await prepareKickoffBuildApproval({
              pendingPlan: {
                id:            `plan_${Date.now()}`,
                plan:          _plan as ProjectPlan,
                blueprintText: '',
                technicalBlueprint: null,
                appName:       (_plan as any).appName ?? '',
                theme:         (_plan as any).theme ?? '',
                pages:         ((_plan as any).pages ?? []).map((p: any) => p.name ?? p),
                architectKickoff,
              },
              language: appLanguage,
              // Never persist kickoff snapshots for draft founder flows.
              persistKickoffSnapshot: false,
            });

            return {
              confirmed: true,
              approvedPlan: approval.approvedPlan,
              requiredKickoffScopeId: architectKickoff?.selectedOptionId,
            };
          }

          return await new Promise<PlanApprovalDecision>((resolve) => {
            planResolverRef.current = resolve;
            setKickoffPhase('awaiting_confirmation');
            addLog('[Kickoff] kickoff_waiting_for_confirmation');
            setPendingPlan({
              id:            `plan_${Date.now()}`,
              plan:          _plan as ProjectPlan,
              blueprintText: '', // already shown via onPlanReady
              technicalBlueprint: null, // already shown via onPlanReady
              appName:       (_plan as any).appName ?? '',
              theme:         (_plan as any).theme ?? '',
              pages:         ((_plan as any).pages ?? []).map((p: any) => p.name ?? p),
              architectKickoff,
            });
          });
        },
        waitForDiffReview: (diffs) => new Promise<string[] | false>((resolve) => {
          diffResolverRef.current = resolve;
          setPendingDiff(diffs);
        }),
        waitForAdmission: (decision) => {
          // Dirty-workspace detection (reads refs to avoid stale closure values)
          const isDirty =
            _pendingDiffRef.current !== null ||
            _previewLifecycleRef.current === 'committing';

          // Re-classify with dirty-workspace state injected (the pipeline has no
          // access to React state — we augment the decision here if needed).
          const augmented = isDirty && !decision.isDirtyWorkspace
            ? EditAdmissionService.classify(
                {
                  candidatePaths:  decision.protectedPathsHit.length > 0
                    ? decision.protectedPathsHit  // use already-known protected paths
                    : [],
                  activePaths: [],
                },
                true,
              )
            : decision;

          // If the augmented decision is still safe (e.g. only dirty-workspace was
          // the escalation reason but that went away), proceed without blocking.
          if (!augmented.requiresConfirmation) return Promise.resolve(true);

          return new Promise<boolean>((resolve) => {
            admissionResolverRef.current = resolve;
            setPendingAdmission(decision.requiresConfirmation ? decision : augmented);
          });
        },
        signal:   controller.signal,
        skipClarify: founderFastPath,
        onUsage:  (usage: UsageData) => {
          reqUsage = usage;
          traceHandle.addTokens(usage.promptTokens, usage.completionTokens);
          const cost = calcCost(buildRoute.modelId, usage);
          setSessionCost(prev => prev + cost);
          setSessionTokens(prev => prev + usage.promptTokens + usage.completionTokens);
        },
        language: appLanguage,
      });

      let result: GenerationResult;
      try {
        result = await runOnce(finalIntent);
      } catch (firstErr: any) {
        const firstErrMsg = String(firstErr?.message ?? '');
        const isTimeout = /timed out|timeout/i.test(firstErrMsg);
        if (isTimeout && !controller.signal.aborted) {
          addLog(`[Timeout] ${buildRoute.modelId} exhausted its LLM retry budget. Pausing for explicit retry.`, 'warn');
        }
        throw firstErr;
      }

      if (result.status === 'cancelled') {
        addLog('[Generation] Cancelled by user');
        traceHandle.appendStep({
          kind: 'ship_decision',
          status: 'warning',
          summary: 'The generation run was cancelled before promotion.',
        });
        traceHandle.setRunSummary(buildTraceRunSummary({
          brief: userPrompt || 'Use selected context pack.',
          telemetry: result.runTelemetry,
          filesSnapshot,
          qualitySummary: result.qualitySummary,
          visualQualitySummary: result.visualQualitySummary,
          previewLifecycle: 'idle',
          saveReady: false,
          path: buildRunPathSummary({
            testEnvironment: import.meta.env.VITE_PLAYWRIGHT_TEST === '1',
            devAgentProvider,
            founderFastPath,
            usesRealLlm: !!result.runTelemetry?.steps.some(step => !!step.llm),
            usesRealRuntime: (result.runTelemetry?.compileCount ?? 0) > 0,
            usedSavedPlan: !!savedContinuationPlan,
          }),
          noTelemetryReason: result.runTelemetry ? undefined : 'no telemetry for this run',
        }));
        traceHandle.finish('warn', { finalOutcome: 'cancelled', stopReason: 'cancelled_by_user' });
        traceFinalized = true;
        finalPreviewGateRef.current = { awaiting: false, filesCommitted: false };
        setProgress(0);
        setCurrentPhase('');
        setPreviewLifecycle('idle');
        return;
      }

      if (result.status === 'failed') {
        const failMsg = result.error ?? result.message ?? '';
        traceHandle.appendStep({
          kind: 'reviewer_result',
          status: 'failed',
          summary: 'Generation failed before a promotable preview was available.',
          errorSummary: failMsg,
        });
        traceHandle.setRunSummary(buildTraceRunSummary({
          brief: userPrompt || 'Use selected context pack.',
          telemetry: result.runTelemetry,
          filesSnapshot,
          qualitySummary: result.qualitySummary,
          visualQualitySummary: result.visualQualitySummary,
          previewLifecycle: 'failed',
          saveReady: false,
          path: buildRunPathSummary({
            testEnvironment: import.meta.env.VITE_PLAYWRIGHT_TEST === '1',
            devAgentProvider,
            founderFastPath,
            usesRealLlm: !!result.runTelemetry?.steps.some(step => !!step.llm),
            usesRealRuntime: (result.runTelemetry?.compileCount ?? 0) > 0,
            usedSavedPlan: !!savedContinuationPlan,
          }),
          noTelemetryReason: result.runTelemetry ? undefined : 'no telemetry for this run',
        }));
        traceHandle.finish('error', {
          errorSummary: failMsg,
          stopReason: 'generation_failed',
          finalOutcome: 'ship_fail',
        });
        traceFinalized = true;
        finalPreviewGateRef.current = { awaiting: false, filesCommitted: false };
        commandBus.dispatch({ type: 'GENERATION_FAILED', error: failMsg });
        const isParseFailure = /parse/i.test(failMsg) || failMsg.includes('No parseable');
        if (isParseFailure) {
          addLog('LLM returned invalid format — no parseable artifact found', 'error');
        } else {
          addLog(`[GenerationPipeline] failed: ${failMsg}`, 'error');
        }
        startTransition(() => {
          chatPatchLast({
            role: 'assistant',
            type: 'text',
            content: isParseFailure
              ? '❌ **LLM returned invalid format.** The model response could not be parsed into code files. Please retry.'
              : result.message || `❌ Ошибка: ${failMsg}`,
            retryable: true,
          });
        });
        setProgress(100);
        setCurrentPhase('');
        setPreviewLifecycle('failed');
        if (_journalDraftSessionId) {
          draftArtifactJournal.appendRecord(_journalDraftSessionId, {
            stepType: 'generation_failed',
            runId: _journalRunId,
            source: effectiveSource,
            projectId: null,
            error: failMsg,
            status: 'failed',
            metadata: { isParseFailure },
          });
        }
        return;
      }

      // Success — reset error counter
      consecutiveErrors.current = 0;
      commandBus.dispatch({ type: 'GENERATION_COMPLETE', result });

      // Hard guarantee: a blueprint message is present after generation response.
      // If onPlanReady did not fire for any reason, append a fallback plan card.
      if (!blueprintIdRef.current) {
        const fallbackBlueprintId = createMessageId();
        if (runStartsNewLineage) {
          runLineageRootMessageId = fallbackBlueprintId;
          runLineageId = buildLineageId(fallbackBlueprintId);
        }
        const planMessage = {
          id: fallbackBlueprintId,
          role: 'system',
          type: 'blueprint',
          content: (result as any)?.planSummary ?? 'Plan: Create todo app with Supabase',
          timestamp: Date.now(),
          raw: result,
          blueprintVisible: true,
          startsLineage: runStartsNewLineage,
          ...(runLineageId ? { lineageId: runLineageId } : {}),
          ...(runLineageRootMessageId ? { lineageRootMessageId: runLineageRootMessageId } : {}),
        };
        blueprintIdRef.current = planMessage.id;
        dispatch({ type: 'APPEND', payload: planMessage });
      }

      // Progress bar — critical, applied immediately
      setProgress(100);

      // Derive the full file map from the canonical graph (pure computation, no side effects).
      // All files are stored in the source registry and shown in the code editor.
      // PreviewAdapter filtering happens at the materializer boundary (SandpackPreview),
      // not here — so the registry retains the complete canonical snapshot.
      //
      // Scaffold files (shadcn/ui, design tokens, blocks) are injected BEFORE generation
      // in GenerationPipeline.run() — they are already part of the graph. No post-merge needed.
      const finalFiles = (result.graph.files.length > 0
          ? projectGraphToFileMap(result.graph)
          : optimisticFiles)
        ?? (result.operations.length > 0 ? applyOperations(files, result.operations) : files);

      // ── Benchmark quality check ────────────────────────────────────────────
      const benchmark = BenchmarkService.check(finalFiles, (result as any)?.plan);
      addLog(`[Benchmark] Score: ${benchmark.score}/100`);
      benchmark.warnings.forEach(w => addLog(`[Benchmark] ⚠ ${w}`));
      if (!benchmark.passed) {
        benchmark.blockers.forEach(b => addLog(`[Benchmark] ❌ ${b}`));
        traceHandle.appendStep({
          kind: 'fast_gate',
          status: 'failed',
          summary: 'Run-level benchmark gate rejected the generated output.',
          errorSummary: benchmark.blockers.join('; '),
        });
        traceHandle.setRunSummary(buildTraceRunSummary({
          brief: userPrompt || 'Use selected context pack.',
          telemetry: result.runTelemetry,
          filesSnapshot,
          finalFiles,
          qualitySummary: result.qualitySummary,
          visualQualitySummary: result.visualQualitySummary,
          previewLifecycle: 'failed',
          saveReady: false,
          path: buildRunPathSummary({
            testEnvironment: import.meta.env.VITE_PLAYWRIGHT_TEST === '1',
            devAgentProvider,
            founderFastPath,
            usesRealLlm: !!result.runTelemetry?.steps.some(step => !!step.llm),
            usesRealRuntime: (result.runTelemetry?.compileCount ?? 0) > 0,
            usedSavedPlan: !!savedContinuationPlan,
          }),
          noTelemetryReason: result.runTelemetry ? undefined : 'no telemetry for this run',
        }));
        traceHandle.finish('error', {
          fileCount: Object.keys(finalFiles).length,
          errorSummary: benchmark.blockers.join('; '),
          stopReason: 'benchmark_failed',
          finalOutcome: 'ship_fail',
        });
        traceFinalized = true;
        startTransition(() => {
          chatAppend({
            role: 'assistant',
            type: 'text',
            content: [
              '❌ Generation quality check failed:',
              ...benchmark.blockers.map(b => `• ${b}`),
              '',
              'Please try again or rephrase your prompt.',
            ].join('\n'),
          });
        });
        setCurrentPhase('');
        setPreviewLifecycle('failed');
        return;
      }

      if (result.runTelemetry?.designSummary) {
        traceHandle.setDesignSummary(result.runTelemetry.designSummary);
      }
      traceHandle.setRunSummary(buildTraceRunSummary({
        brief: userPrompt || 'Use selected context pack.',
        telemetry: result.runTelemetry,
        filesSnapshot,
        finalFiles,
        qualitySummary: result.qualitySummary,
        visualQualitySummary: result.visualQualitySummary,
        previewLifecycle: result.qualitySummary?.severity === 'blocking' ? 'blocked' : 'materializing',
        saveReady: false,
        path: buildRunPathSummary({
          testEnvironment: import.meta.env.VITE_PLAYWRIGHT_TEST === '1',
          devAgentProvider,
          founderFastPath,
          usesRealLlm: !!result.runTelemetry?.steps.some(step => !!step.llm),
          usesRealRuntime: (result.runTelemetry?.compileCount ?? 0) > 0,
          usedSavedPlan: !!savedContinuationPlan,
        }),
        noTelemetryReason: result.runTelemetry ? undefined : 'no telemetry for this run',
      }));

      // Non-critical UI updates — startTransition lets React apply them as one batch
      // without intermediate renders that could leave the iframe in an inconsistent state.
      startTransition(() => {
        setCurrentPhase('');
        // Plan card status is managed via onPhase('idle') → buildStatus:'building'
        // and markSnapshotStable → buildStatus:'ready'. No overwrite of messages[last] needed.

        if (Object.keys(finalFiles).length > 0) {
          // Atomic update: set raw FileMap AND promote ProjectGraph simultaneously.
          // filesRaw + projectGraph stay in sync; derived `files` will read from graph.
          // Do NOT call setFiles() here — that would clear projectGraph immediately.
          setFilesRaw(finalFiles);
          setProjectGraph(result.graph);
          addSnapshot(finalFiles, userPrompt);
          const first = result.operations.find(o => o.op !== 'delete');
          if (!optimisticFiles && first && 'name' in first) setActiveFile(first.name as string);

          // ── Generation report ────────────────────────────────────────────
          const report = buildGenerationReport({
            result,
            filesSnapshot,
            finalFiles,
            startMs,
          });
          const touchedCount = report.mode === 'EDIT'
            ? report.filesCreated.length + report.filesModified.length
            : report.filesCreated.length;
          const reportContent = report.mode === 'EDIT'
            ? `Updated ${touchedCount} file${touchedCount !== 1 ? 's' : ''}`
            : 'Built your app!';
          const storedProjectForReality = runProjectId ? ProjectStorage.getProject(runProjectId) : null;
          const activeBranchIdForReality = storedProjectForReality?.activeBranchId ?? DEFAULT_PROJECT_BRANCH_ID;
          const branchArchitectureForReality =
            storedProjectForReality?.branches?.[activeBranchIdForReality]?.architecture ?? null;
          const branchReality = buildBranchGenerationGuidance(
            branchArchitectureForReality,
            finalFiles,
            trustLanguage,
            {
              requestIntent: userPrompt,
              generationMode: resolvedGenerationMode,
            },
          )?.reality.ui ?? null;
          const reportMessageId = createMessageId();
          runReportMessageId = reportMessageId;
          chatAppend({
            id: reportMessageId,
            role: 'assistant',
            type: 'generation-report',
            content: reportContent,
            generationTrust,
            branchReality,
            ...(runLineageId ? { lineageId: runLineageId } : {}),
            ...(runLineageRootMessageId ? { lineageRootMessageId: runLineageRootMessageId } : {}),
            report: {
              ...report,
              ...(runLineageId ? { lineageId: runLineageId } : {}),
              ...(runLineageRootMessageId ? { lineageRootMessageId: runLineageRootMessageId } : {}),
            },
          });
        }
      });

      // ── Preview lifecycle — committing or blocked ──────────────────────────
      // Files compiled; now waiting for preview-mounted(buildId) confirmation or iframe-error.
      const severity = result.qualitySummary?.severity;
      if (severity === 'blocking') {
        const blockers = result.qualitySummary?.blockers ?? [];
        const reason = blockers.join('; ') || 'Quality check failed';
        traceHandle.appendStep({
          kind: 'ship_decision',
          status: 'failed',
          summary: 'Generated files stayed below the promotion bar, so preview promotion was blocked.',
          errorSummary: reason,
        });
        traceHandle.finish('error', {
          fileCount: Object.keys(finalFiles).length,
          errorSummary: reason,
          stopReason: 'quality_blocked',
          finalOutcome: 'ship_fail',
        });
        traceFinalized = true;
        finalPreviewGateRef.current = { awaiting: false, filesCommitted: false };
        setPreviewLifecycle('blocked');
        setPreviewBlockedReason(reason);
        startTransition(() => {
          chatAppend({
            role: 'assistant',
            content: `⚠️ Files were generated, but preview is blocked.\n\n${blockers.map(b => `• ${b}`).join('\n')}`,
          });
        });
        addLog(`[Preview] Blocked: ${reason}`);
      } else {
        traceHandle.appendStep({
          kind: 'ship_decision',
          status: 'completed',
          summary: 'Generated files compiled successfully and are moving into live preview mount.',
        });
        traceHandle.finish('ok', {
          fileCount: Object.keys(finalFiles).length,
          finalOutcome:
            result.qualitySummary?.severity === 'warning' || result.visualQualitySummary?.verdict === 'weak'
              ? 'ship_partial'
              : 'ship_ok',
        });
        traceFinalized = true;
        setPreviewLifecycle('materializing');
        setPreviewBlockedReason(null);
      }

      const projectId = runProjectId;

      console.log('[Project] Name debug:', {
        capturedAppName,
        planAppName: (result as any)?.planAppName,
        planName: (result as any)?.plan?.appName,
        userPrompt: userPrompt?.slice(0, 50),
      });
      const ideaTitle =
        effectiveSource === 'trend-niche'
          ? (composerContextItemsSnapshot[0]?.title || trendIdeaTitleRef.current || '').slice(0, 80)
          : effectiveSource !== 'chat'
            ? userPrompt.split(':')[0]?.trim()?.slice(0, 80)
            : '';
      const projectTitle = getCanonicalProjectName(
        {
          name:
            ideaTitle
            || capturedAppName
            || (result as any)?.planAppName
            || (result as any)?.plan?.appName
            || userPrompt?.slice(0, 40)
            || 'New Project',
        },
        'New Project',
      );

      if (Object.keys(finalFiles).length > 0) {
        // Draft journal: record successful generation before queuing save
        if (_journalDraftSessionId) {
          draftArtifactJournal.appendRecord(_journalDraftSessionId, {
            stepType: 'generation_complete',
            runId: _journalRunId,
            source: effectiveSource,
            projectId: null,
            acceptedFiles: Object.keys(finalFiles),
            status: 'ok',
            metadata: {
              projectTitle,
              fileCount: Object.keys(finalFiles).length,
              buildModel: buildRoute.modelId,
              planTheme: result.planTheme,
            },
          });
        }
        pendingProjectSaveRef.current = {
          projectId,
          projectTitle,
          finalFiles,
          skeletonId: result.runTelemetry?.skeletonId ?? null,
          chatHistoryToSave: [
            ...history,
            { role: 'assistant' as const, content: result.message || '✅ Готово' },
          ],
          userPrompt,
          source: effectiveSource,
          effectiveModel: buildRoute.modelId,
          generationStartMs,
          generationLogs: [...generationLogs],
          generationErrors: [...generationErrors],
          plan: ((result as any).plan ?? null) as ProjectPlan | null,
          planTheme: result.planTheme ?? 'dark-slate',
          reqUsage,
          lineageId: runLineageId ?? null,
          lineageRootMessageId: runLineageRootMessageId ?? null,
          reportMessageId: runReportMessageId,
        };
        finalPreviewGateRef.current.filesCommitted = true;
        setPendingProjectSaveMeta({
          projectId,
          projectTitle,
          previewReady: false,
        });
        // The skeleton preview may already exist, but Save stays locked until
        // the final coder delta is mounted as the real preview.
        // Append an inline file-diff summary to the chat so the user sees what changed.
        if (systemEvents.length > 0) {
          const fileList = systemEvents.slice(0, 20).join('\n');
          const extra = systemEvents.length > 20 ? `\n…and ${systemEvents.length - 20} more` : '';
          chatAppend({
            role: 'assistant' as const,
            type: 'text',
            content: `**Изменено файлов: ${systemEvents.length}**\n\n${fileList}${extra}`,
            timestamp: Date.now(),
          });
        }
        setProjectPersistenceState('draft');
        pendingSavePromptShownRef.current = false;
        addLog(`[Project] Final preview gate armed — Save unlocks only after mounted final preview (${projectTitle})`);
        if ((result as GenerationResult).fastPathTelemetry) {
          const telemetry = (result as GenerationResult).fastPathTelemetry!;
          addLog(
            `[FastPath] canonical=${telemetry.canonicalPath.join(' -> ')} | ` +
            `package=${telemetry.steps.packageMs}ms architecture=${telemetry.steps.architectureMs}ms ` +
            `skeleton=${telemetry.steps.skeletonMs}ms coder=${telemetry.steps.coderMs}ms ` +
            `finalCompile=${telemetry.steps.finalCompileMs}ms previewMount=${telemetry.steps.previewMountMs}ms ` +
            `skeletonPreview=${telemetry.timeToSkeletonPreviewMs}ms firstRealPreview=${telemetry.timeToFirstRealPreviewMs}ms`,
          );
        }
        packagedLaunchContextRef.current = null;
        composerContextItemsRef.current = [];
        setComposerContextItems([]);
      }

    } catch (err: any) {
      // User-initiated abort — soft stop, no error counter
      if (err?.name === 'AbortError') {
        const disposition = abortDispositionRef.current;
        abortDispositionRef.current = null;
        finalPreviewGateRef.current = { awaiting: false, filesCommitted: false };
        if (!traceFinalized) {
          traceHandle.appendStep({
            kind: 'ship_decision',
            status: 'warning',
            summary: disposition === 'context-switch'
              ? 'The run was cancelled because the workspace context changed.'
              : 'The run was stopped by the user before promotion.',
          });
          traceHandle.finish('warn', {
            stopReason: disposition === 'context-switch' ? 'context_switch_abort' : 'user_abort',
            finalOutcome: 'cancelled',
          });
          traceFinalized = true;
        }
        if (disposition === 'context-switch') {
          addLog('[Project] Active generation aborted for context switch');
        } else {
          addLog('⚡ Generation stopped by user');
          chatPatchLast(
            { role: 'assistant', content: '⚡ Остановлено.' },
            (msg) => msg.role === 'assistant' && (msg.content === '...' || msg.content === ''),
          );
        }
        setCurrentPhase('');
        setPreviewLifecycle('idle');
        return;
      }

      // Network errors are not idempotent in the chat generation flow: a full
      // resend creates a new blueprint/progress chain and looks like a fresh
      // project start. Keep the run paused and let the explicit Retry action
      // continue from the last captured prompt.
      const isNetworkError = err instanceof TypeError &&
        /fetch|network|ERR_|failed to fetch/i.test(err.message ?? '');
      const isTimeoutError = /timed out|timeout/i.test(String(err?.message ?? ''));

      // Real error — track for spam protection
      consecutiveErrors.current += 1;
      lastErrorTime.current = Date.now();
      networkRetryCountRef.current = 0;
      finalPreviewGateRef.current = { awaiting: false, filesCommitted: false };
      commandBus.dispatch({ type: 'GENERATION_FAILED', error: err?.message ?? 'Unknown error' });

      console.error('Studio Error:', err);
      addLog(`${isNetworkError ? 'Connection lost' : 'Error'} #${consecutiveErrors.current}: ${err?.message ?? 'Unknown error'}`, 'error');
      if (!traceFinalized) {
        traceHandle.appendStep({
          kind: 'reviewer_result',
          status: 'failed',
          summary: 'Generation crashed before the run summary could be completed.',
          errorSummary: err?.message ?? 'Unknown error',
        });
        traceHandle.setRunSummary(buildTraceRunSummary({
          brief: userPrompt || 'Use selected context pack.',
          filesSnapshot,
          qualitySummary: undefined,
          visualQualitySummary: undefined,
          previewLifecycle: 'failed',
          saveReady: false,
          path: buildRunPathSummary({
            testEnvironment: import.meta.env.VITE_PLAYWRIGHT_TEST === '1',
            devAgentProvider,
            founderFastPath,
            usesRealLlm: false,
            usesRealRuntime: false,
            usedSavedPlan: !!savedContinuationPlan,
          }),
          noTelemetryReason: 'no telemetry for this run',
        }));
        traceHandle.finish('error', {
          errorSummary: err?.message ?? 'Unknown error',
          stopReason: isNetworkError ? 'network_error' : 'runtime_error',
          finalOutcome: 'ship_fail',
        });
        traceFinalized = true;
      }
      if (_journalDraftSessionId) {
        draftArtifactJournal.appendRecord(_journalDraftSessionId, {
          stepType: 'generation_error',
          runId: _journalRunId,
          source: effectiveSource,
          projectId: null,
          error: err?.message ?? 'Unknown error',
          status: 'failed',
          metadata: { isNetworkError, errorCount: consecutiveErrors.current },
        });
      }
      // ── Classify model/provider errors for actionable guidance ──────────
      const errMsg: string = err?.message ?? '';
      const httpStatusMatch = errMsg.match(/LLM Proxy (\d+)/);
      const httpStatus = httpStatusMatch ? parseInt(httpStatusMatch[1], 10) : 0;
      const isUnauthorized = httpStatus === 401;
      const isRateLimit = httpStatus === 429;
      const isProviderError = httpStatus >= 500;
      const isModelError = isUnauthorized || isRateLimit || isProviderError;

      // Extract model/provider from last resolved routes if available
      const failedModel = primaryRoute?.modelId ?? buildRoute?.modelId ?? '';
      const failedProvider = primaryRoute?.provider ?? buildRoute?.provider ?? '';

      let errorContent: string;
      if (isNetworkError) {
        errorContent = '🔌 **Connection lost.** Check your internet and retry.';
      } else if (isTimeoutError) {
        errorContent = `⏱️ **Generation timed out.** ${errMsg}\n\nRetry will continue with the same prompt and project context.`;
      } else if (isUnauthorized) {
        errorContent = `🔑 **API key rejected** by **${failedProvider || 'provider'}**${failedModel ? ` (model: \`${failedModel}\`)` : ''}.\n\nOpen **Settings → API Keys** and verify your key, then retry.`;
      } else if (isRateLimit) {
        errorContent = `⏳ **Rate limit reached** on **${failedModel || failedProvider || 'model'}**.\n\nYou can switch to a different model in **Settings → Agents**, then retry.`;
      } else if (isProviderError) {
        errorContent = `🔴 **Provider error (${httpStatus})** from **${failedProvider || 'provider'}**${failedModel ? ` (model: \`${failedModel}\`)` : ''}.\n\nThe service may be temporarily down. Try switching to an **OpenRouter** model in Settings, then retry.`;
      } else {
        errorContent = `❌ Ошибка: ${errMsg || 'Проверь API Key.'}`;
      }

      chatPatchLast({
        role: 'assistant',
        type: 'text',
        content: errorContent,
        retryable: true,
        showSettingsButton: isModelError,
      });
      setCurrentPhase('');
      setPreviewLifecycle('failed');
    } finally {
      dispatch({ type: 'REMOVE_BY_ID', id: progressMsgId });
      abortControllerRef.current = null;
      abortDispositionRef.current = null;
      if (previewLifecycle !== 'preview-ready') {
        finalPreviewGateRef.current = finalPreviewGateRef.current.awaiting
          ? { awaiting: false, filesCommitted: false }
          : finalPreviewGateRef.current;
      }
      if (!traceFinalized) {
        traceHandle.finish('warn', {
          stopReason: 'run_closed_without_outcome',
          finalOutcome: 'superseded',
        });
        traceFinalized = true;
      }
      setIsGenerating(false);
      setKickoffPhase('idle');
      setTimeout(() => setProgress(0), 1200);
    }
  };
  const _sendRef = useRef(_sendImpl);
  _sendRef.current = _sendImpl;
  const handleSend = useCallback((overridePrompt?: string) => _sendRef.current(overridePrompt), []);
  const handleRetry = useCallback(() => {
    const retryPrompt = lastGenerationPromptRef.current.trim();
    consecutiveErrors.current = 0;
    networkRetryCountRef.current = 0;
    if (abortControllerRef.current) {
      abortActiveGeneration('context-switch');
    }
    if (retryPrompt) {
      _sendRef.current(retryPrompt);
      return;
    }
    setInput('Продолжи генерацию и исправь последнюю ошибку.');
  }, [abortActiveGeneration, setInput]);

  // ── launchWithPlan ────────────────────────────────────────────────────────
  // Unified UX: external idea sources enrich chat context; generation starts
  // only when user sends from the chat composer.
  const launchWithPlan = useCallback(async (
    plan: ProjectPlan,
    intent: string,
    source?: GenerationSource,
  ) => {
    const mappedSource: ComposerContextSource =
      source === 'niche'
        ? 'niche'
        : source === 'weekly-feed'
          ? 'weekly-feed'
          : source === 'trend-niche'
            ? 'trend-niche'
            : 'dashboard';

    // Ideas from the feed must always start in a fresh empty project so the
    // coder sees existingCodeCount === 0 and generates the full app from
    // scratch instead of producing an incremental patch against stale files.
    // autoSaveCurrentProject: false — idea entry must NOT write to Projects.
    if (source === 'trend-niche' || source === 'weekly-feed' || source === 'niche') {
      await createNewProject({ autoSaveCurrentProject: false });
    }

    addComposerContextFromPlan(plan, intent, mappedSource);
    addSystemMessage(
      `🧩 Context ready: **${plan.appName || 'Imported idea'}**. The idea is loaded into the composer as your next chat message. Edit it if needed, then press Send to start from chat.`,
    );
  }, [addComposerContextFromPlan, addSystemMessage, createNewProject]);

  const onSettings = useCallback(() => setShowSettings(true), []);


  const selectKickoffScope = useCallback((optionId: KickoffBuildScopeId) => {
    setPendingPlan(prev => {
      if (!prev?.architectKickoff) return prev;
      return {
        ...prev,
        architectKickoff: {
          ...prev.architectKickoff,
          selectedOptionId: optionId,
        },
      };
    });
    addLog(`[Kickoff] kickoff_scope_selected: ${optionId}`);
  }, [addLog]);

  const confirmPlan = useCallback(async (_plan?: object) => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setKickoffPhase('build_starting');
    addLog('[Kickoff] kickoff_build_started');
    try {
      const shouldPersistKickoffSnapshot = !!(
        pendingPlan?.architectKickoff &&
        projectPersistenceState === 'exists' &&
        currentProjectId &&
        pendingPlan.architectKickoff.projectId === currentProjectId
      );
      const approval = pendingPlan
        ? await prepareKickoffBuildApproval({
            pendingPlan,
            language: appLanguage,
            persistKickoffSnapshot: shouldPersistKickoffSnapshot,
          })
        : { approvedPlan: undefined, kickoffSnapshotId: null };

      if (approval.kickoffSnapshotId) {
        addLog(`[Architect] Kickoff snapshot saved before build (${approval.kickoffSnapshotId})`);
      }

      planDecisionRef.current = {
        confirmed: true,
        approvedPlan: approval.approvedPlan ?? pendingPlan?.plan,
        requiredKickoffScopeId: pendingPlan?.architectKickoff?.selectedOptionId,
      };

      commandBus.dispatch({
        type: 'PLAN_APPROVED',
        payload: approval.approvedPlan ?? pendingPlan?.plan ?? {},
      });
      if (currentProjectId) {
        setPreviewReady(false);
      }
      commandBus.dispatch({ type: 'ACCEPT_BLUEPRINT', planId: pendingPlan?.id ?? '' });
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      recoverKickoffApprovalFailure(message, pendingPlan?.id, {
        addLog,
        appendErrorMessage: (content) => {
          chatAppend({
            role: 'assistant',
            type: 'text',
            content,
            timestamp: Date.now(),
          });
        },
        resolvePendingConfirmation: (decision) => {
          planDecisionRef.current = decision;
          if (blueprintIdRef.current) {
            dispatch({ type: 'SET_BLUEPRINT_VISIBLE', id: blueprintIdRef.current, visible: false });
            blueprintIdRef.current = null;
          }
          setPendingPlan(null);
        },
        rejectBlueprint: (planId) => {
          commandBus.dispatch({ type: 'REJECT_BLUEPRINT', planId });
        },
      });
      confirmingRef.current = false;
      return;
    }

    // Reset guard after a tick so the same instance can be reused if generation is re-triggered.
    setTimeout(() => { confirmingRef.current = false; }, 500);
  }, [pendingPlan, currentProjectId, projectPersistenceState, appLanguage, addLog, chatAppend]);

  const cancelPlan = useCallback(() => {
    commandBus.dispatch({ type: 'REJECT_BLUEPRINT', planId: pendingPlan?.id ?? '' });
  }, [pendingPlan]);

  // Alias exposed to LeftPanel's GenerationPlanCard (same action as confirmPlan).
  const onConfirmPlan = confirmPlan;

  // Dispatches REQUEST_PLAN_REVISION → commandBus subscriber re-runs generation.
  const onSubmitClarification = useCallback((text: string) => {
    commandBus.dispatch({ type: 'REQUEST_PLAN_REVISION', payload: text });
  }, []);

  // Resolves the waitForClarification promise in the active pipeline run.
  const answerClarification = useCallback((answer: string) => {
    clarificationResolverRef.current?.(answer);
    clarificationResolverRef.current = null;
  }, []);

  const waitForClarification = useCallback((signal: AbortSignal): Promise<string> => {
    return new Promise<string>((resolve) => {
      if (signal.aborted) { resolve(''); return; }
      const onAbort = () => { clarificationResolverRef.current = null; resolve(''); };
      signal.addEventListener('abort', onAbort, { once: true });
      clarificationResolverRef.current = (answer: string) => {
        signal.removeEventListener('abort', onAbort);
        resolve(answer);
      };
    });
  }, []);

  // Resolves the waitForSurfaceChoice promise in the active pipeline run.
  const chooseSurface = useCallback((surface: 'landing' | 'app' | 'superapp') => {
    const normalizedSurface = surface === 'landing' ? 'app' : surface;
    surfaceChoiceResolverRef.current?.(normalizedSurface);
    surfaceChoiceResolverRef.current = null;
    modeSetByUserRef.current = true;
  }, []);

  const waitForSurfaceChoice = useCallback((signal: AbortSignal): Promise<'landing' | 'app' | 'superapp' | null> => {
    return new Promise((resolve) => {
      if (signal.aborted) { resolve(null); return; }
      const onAbort = () => { surfaceChoiceResolverRef.current = null; resolve(null); };
      signal.addEventListener('abort', onAbort, { once: true });
      surfaceChoiceResolverRef.current = (surface) => {
        signal.removeEventListener('abort', onAbort);
        resolve(surface);
      };
    });
  }, []);

  // Opens clarification flow from plan cards that do not have inline textarea.
  const onClarifyPlan = useCallback((_messageId: string) => {
    setInput(prev => (prev && prev.trim().length > 0 ? prev : 'Уточнение по плану: '));
  }, [setInput]);

  const approveDiff = useCallback((selectedPaths: string[]) => {
    if (diffResolverRef.current) {
      diffResolverRef.current(selectedPaths);
      diffResolverRef.current = null;
    }
    setPendingDiff(null);
  }, []);

  const rejectDiff = useCallback(() => {
    if (diffResolverRef.current) {
      diffResolverRef.current(false);
      diffResolverRef.current = null;
    }
    setPendingDiff(null);
  }, []);

  // ── Edit admission callbacks ──────────────────────────────────────────────
  /** User clicked "Continue" or "I understand, proceed" — resolve the gate. */
  const confirmAdmission = useCallback(() => {
    if (admissionResolverRef.current) {
      admissionResolverRef.current(true);
      admissionResolverRef.current = null;
    }
    setPendingAdmission(null);
  }, []);

  /** User clicked "Cancel" — reject the gate; pipeline will rollback. */
  const denyAdmission = useCallback(() => {
    if (admissionResolverRef.current) {
      admissionResolverRef.current(false);
      admissionResolverRef.current = null;
    }
    setPendingAdmission(null);
    addLog('[AdmissionControl] Edit cancelled by user');
  }, [addLog]);

  // ── Playwright / e2e test hooks ───────────────────────────────────────────
  // Only active when VITE_PLAYWRIGHT_TEST=1 (baked at build time by Vite;
  // dead-code-eliminated in production builds).
  // window.__E2E_PREVIEW_TEST.mountPreview(files) — compile a deterministic
  //   real preview build without routing through the full chat generation stack.
  // window.__E2E_DIFF_TEST.setPendingDiff(diffs) — inject a fake diff review
  //   so narrow browser tests can drive DiffPreview without running SimpleGeneration.
  // window.__E2E_DIFF_TEST.stageCandidateFiles(files) — stage candidate file
  //   contents so DiffPreview resolves into visible editor state after apply.
  // window.__E2E_DIFF_RESULT — set to the resolved value after approveDiff/rejectDiff.
  // window.__E2E_PROJECT_TEST.loadProjectById(id) — deterministic project switch
  //   helper used only by browser e2e to avoid hover-dependent card controls.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (import.meta.env.VITE_PLAYWRIGHT_TEST !== '1') return;
    (window as any).__E2E_PREVIEW_TEST = {
      getDiagnostics: () => ({
        revision: revisionManager.getRevisionSummary(),
        controller: previewController.getState(),
      }),
      mountPreview: async (previewFiles: FileMap) => {
        setFiles(previewFiles);
        setPreviewBlockedReason(null);
        setPreviewReady(false);
        setPreviewLifecycle('materializing');
        setPreviewUrl('');
        lastPreviewReadyRevisionRef.current = null;

        const buildId = crypto.randomUUID();
        const sessionId = getPreviewSessionToken();
        previewController.notifyCompiling(buildId, 'e2e-seed');
        const res = await fetch(`/api/preview/${buildId}/compile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Preview-Session': sessionId },
          body: JSON.stringify({
            sessionId,
            files: Object.fromEntries(
              Object.entries(previewFiles).map(([path, content]) => [normalizePath(path), content]),
            ),
          }),
        });

        let body: { success?: boolean; url?: string; error?: string } | null = null;
        try { body = await res.json(); } catch { /* ignore parse failures */ }

        if (!res.ok || body?.success === false) {
          previewController.notifyFailed(
            body?.error ?? `Preview seed compile failed (HTTP ${res.status})`,
            buildId,
          );
          throw new Error(body?.error ?? `Preview seed compile failed (HTTP ${res.status})`);
        }

        const nextUrl = appendPreviewSessionToUrl(body?.url ?? `/preview/${buildId}`);
        setPreviewUrl(nextUrl);
        await new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            window.removeEventListener('message', handleMessage);
            reject(new Error(`Preview seed timeout: no preview-mounted for ${buildId}`));
          }, 30_000);

          const handleMessage = (event: MessageEvent) => {
            if (event.data?.type !== 'preview-mounted') return;
            if (event.data?.buildId !== buildId) return;
            window.clearTimeout(timeoutId);
            window.removeEventListener('message', handleMessage);
            resolve();
          };

          window.addEventListener('message', handleMessage);
        });

        setPreviewReady(true);
        setPreviewLifecycle('preview-ready');
        previewController.notifyReady(buildId, 'e2e_seed_complete', 'e2e-seed');
        return { buildId, url: nextUrl };
      },
    };
    (window as any).__E2E_DIFF_TEST = {
      setPendingDiff: (diffs: FileDiff[]) => {
        // Wire up a resolver that captures the result for test assertions
        diffResolverRef.current = (result: string[] | false) => {
          (window as any).__E2E_DIFF_RESULT = result;
        };
        setPendingDiff(diffs);
      },
      stageCandidateFiles: (candidateFiles: FileMap) => {
        const baseFiles = { ..._latestFilesRef.current };
        const diffs = Object.entries(candidateFiles)
          .map(([path, nextContent]) => buildFileDiff(path, baseFiles[path] ?? '', nextContent))
          .filter(diff => diff.changedCount > 0);

        if (diffs.length === 0) {
          throw new Error('stageCandidateFiles requires at least one changed file');
        }

        (window as any).__E2E_DIFF_RESULT = undefined;

        // Create the promote promise before any user interaction so awaitPromote()
        // is callable as soon as stageCandidateFiles returns.  The promise settles
        // when revisionManager.promote() completes on approve, or immediately with
        // { success: false } on reject or compile failure.
        const promoteHolder: { resolve: ((r: { success: boolean }) => void) | null } =
          { resolve: null };
        (window as any).__E2E_DIFF_PROMOTE_PROMISE = new Promise<{ success: boolean }>(
          r => { promoteHolder.resolve = r; },
        );

        diffResolverRef.current = (result: string[] | false) => {
          (window as any).__E2E_DIFF_RESULT = result;
          if (result === false) {
            // Reject-all: no compile needed — settle the promise so tests don't hang.
            promoteHolder.resolve?.({ success: false });
            return;
          }
          const selectedPaths = new Set(result);
          const nextFiles = { ...baseFiles };
          for (const [path, nextContent] of Object.entries(candidateFiles)) {
            if (selectedPaths.has(path)) nextFiles[path] = nextContent;
          }
          setFiles(nextFiles);

          // Trigger the real RevisionManager candidate → compile → promote cycle so
          // the preview iframe is reloaded with the partially-accepted build.
          // This is the primary observable proof: after promote the live iframe
          // shows the accepted files, not just the in-memory editor state.
          revisionManager.createCandidate().then((revId: string) => {
            const writes = Object.entries(nextFiles).map(
              ([p, c]) => revisionManager.writeCandidateFile(revId, p, c),
            );
            return Promise.all(writes)
              .then(() => revisionManager.compileCandidate(revId))
              .then(async compileResult => {
                if (compileResult.success) {
                  try {
                    await revisionManager.promote(revId);
                    promoteHolder.resolve?.({ success: true });
                  } catch {
                    // PROMOTE_BLOCKED (white-screen gate) or similar
                    promoteHolder.resolve?.({ success: false });
                  }
                } else {
                  promoteHolder.resolve?.({ success: false });
                }
              });
          }).catch(() => promoteHolder.resolve?.({ success: false }));
        };
        setPendingDiff(diffs);
      },
      /**
       * Returns a Promise that resolves with { success: boolean } once the
       * compile+promote cycle triggered by the last stageCandidateFiles approve
       * completes.  On reject or compile failure resolves with { success: false }.
       *
       * page.evaluate(() => window.__E2E_DIFF_TEST.awaitPromote()) in Playwright
       * automatically awaits the returned Promise and surfaces the resolved value.
       */
      awaitPromote: (): Promise<{ success: boolean }> =>
        (window as any).__E2E_DIFF_PROMOTE_PROMISE ?? Promise.resolve({ success: false }),
    };
    (window as any).__E2E_PROJECT_TEST = {
      listProjects: () => ProjectStorage.listProjects().map(meta => ({
        id: meta.id,
        name: meta.name,
      })),
      getCurrentProjectId: () => localStorage.getItem('CURRENT_PROJECT_ID'),
      getProjectPersistenceState: () => projectPersistenceStateRef.current,
      getDraftSessionId: () => _draftSessionIdRef.current ?? readDraftSessionId(),
      loadProjectById: async (id: string) => {
        if (!id) throw new Error('loadProjectById requires a project id');
        await loadProjectRef.current({ id });
        return {
          projectId: id,
          currentProjectId: localStorage.getItem('CURRENT_PROJECT_ID'),
        };
      },
    };
    return () => {
      delete (window as any).__E2E_PREVIEW_TEST;
      delete (window as any).__E2E_DIFF_TEST;
      delete (window as any).__E2E_PROJECT_TEST;
    };
  }, []);

  // Resolve the waitForConfirmation promise AFTER React has committed the
  // pendingPlan cleanup.  pendingPlan === null is the commit signal.
  useEffect(() => {
    if (pendingPlan !== null) return;
    if (planDecisionRef.current === null) return;
    if (!planResolverRef.current) return;

    const decision = planDecisionRef.current;
    const resolve   = planResolverRef.current;
    planDecisionRef.current  = null;
    planResolverRef.current  = null;

    resolve(decision);
  }, [pendingPlan]);

  // Guard: if the component unmounts while waiting for confirmation, cancel the
  // dangling promise so the generation pipeline doesn't hang.
  useEffect(() => {
    return () => {
      if (planResolverRef.current) {
        planResolverRef.current({ confirmed: false });
        planResolverRef.current = null;
        planDecisionRef.current = null;
      }
      if (diffResolverRef.current) {
        diffResolverRef.current(false);
        diffResolverRef.current = null;
      }
      if (admissionResolverRef.current) {
        admissionResolverRef.current(false);
        admissionResolverRef.current = null;
      }
      if (clarificationResolverRef.current) {
        clarificationResolverRef.current('');
        clarificationResolverRef.current = null;
      }
      surfaceChoiceResolverRef.current = null;
    };
  }, []);

  // ── useStudioCommands — CommandBus → React state bridge ─────────────────
  useEffect(() => {
    const unsubs = [
      commandBus.subscribe('ACCEPT_BLUEPRINT', () => {
        planDecisionRef.current = planDecisionRef.current ?? { confirmed: true };
        setPendingPlan(null);
        dispatch({
          type: 'APPEND',
          payload: { role: 'assistant', type: 'text', content: '⚙️ Building…' },
        });
      }),
      commandBus.subscribe('REJECT_BLUEPRINT', () => {
        planDecisionRef.current = { confirmed: false };
        // Hide instead of remove — preserves fiber identity, avoids DOM conflicts.
        if (blueprintIdRef.current) {
          dispatch({ type: 'SET_BLUEPRINT_VISIBLE', id: blueprintIdRef.current, visible: false });
        }
        blueprintIdRef.current = null;
      }),
      commandBus.subscribe('REQUEST_PLAN_REVISION', (cmd) => {
        const text = (cmd as Extract<typeof cmd, { type: 'REQUEST_PLAN_REVISION' }>).payload;
        // Clear the pending blueprint so its card hides, then re-run generation
        // with the revision text as the new prompt (bypasses textarea state).
        planDecisionRef.current = { confirmed: false };
        setPendingPlan(null);
        if (blueprintIdRef.current) {
          dispatch({ type: 'SET_BLUEPRINT_VISIBLE', id: blueprintIdRef.current, visible: false });
        }
        blueprintIdRef.current = null;
        _sendRef.current(text);
      }),
      commandBus.subscribe('PREVIEW_READY', (cmd) => {
        const data = (cmd as Extract<typeof cmd, { type: 'PREVIEW_READY' }>).payload;
        if (data?.url) {
          const previewUrl = appendPreviewSessionToUrl(data.url);
          setPreviewUrl(previewUrl);
          setPreviewReady(true);
          if (import.meta.env.VITE_PLAYWRIGHT_TEST === '1') {
            (window as any).__E2E_PREVIEW_URL__ = previewUrl;
          }
          // Extract buildId from URL and notify SandpackPreview
          const buildId = previewUrl.split('/preview/')[1]?.split('?')[0] ?? '';
          window.dispatchEvent(new CustomEvent('preview-mounted', {
            detail: { buildId, previewUrl },
          }));
        }
      }),
      // State machine — mirror every command into read-only machineState
      commandBus.subscribeAll((cmd) => {
        setMachineState(prev => transition(prev, cmd));
      }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [chatRemoveByType]);

  const studioMemo = useMemo(() => ({
    isGenerating,
    device, setDevice, theme, setTheme,
    progress, currentPhase, scrollRef,
    apiKey, setApiKey,
    files, setFiles, activeFile, setActiveFile,
    /** Authoritative ProjectGraph from the last completed generation. Null before first generation. */
    projectGraph,
    projects, currentProjectId, currentProject, snapshots,
    chatThreadKey,
    persistedProjectExists: projectPersistenceState === 'exists'
      ? true
      : projectPersistenceState === 'missing'
        ? false
        : undefined,
    fullContextMode, setFullContextMode,
    selectedModel, setSelectedModel,
    // Canonical snapshot-layer names
    snapshotIndex, snapshotCount, lastStableSnapshotIndex,
    // Deprecated aliases (backward compat for existing consumers)
    currentVersion, totalVersions, lastStableVersion,
    currentSnapshotId, historyIndex,
    logs, addLog, clearLogs, downloadLogs,
    attachments, addAttachment, removeAttachment, clearAttachments,
    composerContextItems, activeProjectContext, addComposerContextFromPlan, setChatContext, removeComposerContextItem, clearComposerContextItems,
    startTrendIdeaDraftSession,
    startExternalChatDraftSession,
    handleSend,
    onRetry: handleRetry,
    onSend: handleSend,
    launchWithPlan,
    stopGeneration,
    onStop: stopGeneration,
    publishProject,
    createNewProject,
    onNewProject: createNewProject,
    createProject,
    loadProject,
    onLoadProject: loadProject,
    restoreMessageRevision,
    restoreBlueprintLineage,
    switchProject,
    deleteProject,
    onDeleteProject: deleteProject,
    refreshProjects,
    restoreSnapshot,
    onRestoreSnapshot: restoreSnapshot,
    markSnapshotStable,
    rollbackToStable,
    clearSnapshots,
    stableSnapshotId,
    undo,
    onUndo: undo,
    redo,
    onRedo: redo,
    canUndo,
    canRedo,
    showSettings, setShowSettings,
    onSettings,
    currentTheme: theme,
    // auto-routing
    autoRoute, setAutoRoute,
    // generation mode
    generationMode, setGenerationMode,
    generationSource, setGenerationSource,
    designClassification,
    classifyAndStore,
    // language
    appLanguage, setAppLanguage,
    // billing
    sessionCost, sessionTokens,
    projectCost, projectTokens,
    // figma identity
    figmaAccounts, addFigmaAccount, removeFigmaAccount, refreshFigmaAccounts,
    figmaLink, setFigmaLink,
    figmaAccessResult, validateFigmaLink, figmaValidating,
    // figma design DNA
    currentProjectTheme, syncProgress, syncFigmaUrl, syncSource, startFigmaSync,
    targetMarket, setTargetMarket, auditStrictness, setAuditStrictness,
    // chat injection
    addSystemMessage,
    // figma project hub
    figmaProjects, activeFigmaProjectId,
    saveFigmaProject, loadFigmaProject, deleteFigmaProject,
    markFigmaProjectSynced, clearFigmaSync,
    // background engine (isolated from chat)
    engineApiKey,  setEngineApiKey,
    engineModelId, setEngineModelId,
    engineStatus,  engineResult,
    // 5-agent system
    agentConfigs, setAgentConfig,
    // fusion protocol — component registry
    componentRegistry,
    // auto-fixer
    isAutoFixing,
    // preview lifecycle — honest completion handshake
    previewLifecycle,
    previewBlockedReason,
    previewUrl,
    previewReady,
    pendingProjectSave: pendingProjectSaveMeta,
    savePendingProject,
    rejectPendingProjectSave,
    // kickoff lifecycle — explicit phase for genesis builds
    kickoffPhase,
    // blueprint confirmation
    pendingPlan, confirmPlan, cancelPlan, onConfirmPlan, onClarifyPlan, onSubmitClarification, selectKickoffScope,
    answerClarification, chooseSurface,
    // diff review
    pendingDiff, approveDiff, rejectDiff,
    // edit admission
    pendingAdmission, confirmAdmission, denyAdmission,
    // state machine (read-only)
    studioPhase: machineState.phase,
    studioError: machineState.error ?? null,
  }), [
    // state — re-memoize only when actual data changes
    // messages/input intentionally excluded — returned directly below
    files, activeFile, theme, apiKey, selectedModel,
    isGenerating, device, progress, currentPhase, kickoffPhase, fullContextMode, autoRoute, generationMode, previewLifecycle, previewBlockedReason, previewUrl, previewReady, pendingProjectSaveMeta, machineState,
    designClassification,
    projectGraph,
    snapshots, historyIndex, currentProjectId, currentProject, currentSnapshotId, stableSnapshotId, projectPersistenceState, chatThreadKey,
    projects, showSettings, logs, attachments, composerContextItems, activeProjectContext,
    sessionCost, sessionTokens, projectCost, projectTokens,
    appLanguage,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(agentConfigs),
    syncProgress, syncFigmaUrl, syncSource,
    figmaAccounts, figmaLink, figmaAccessResult, figmaValidating,
    figmaProjects, activeFigmaProjectId, currentProjectTheme,
    targetMarket, auditStrictness,
    engineApiKey, engineModelId, engineStatus, engineResult,
    componentRegistry,
    pendingPlan, pendingDiff, pendingAdmission,
    // stable callbacks (useCallback — listed for ESLint correctness, never change)
    setInput, setDevice, setTheme, setApiKey, setSelectedModel, setFullContextMode, setAutoRoute, setGenerationMode,
    setActiveFile, addSnapshot, restoreSnapshot, undo, redo, clearSnapshots, markSnapshotStable, rollbackToStable,
    addLog, clearLogs, downloadLogs,
    addAttachment, removeAttachment, clearAttachments,
    addComposerContextFromPlan, setChatContext, removeComposerContextItem, clearComposerContextItems,
    startTrendIdeaDraftSession,
    createNewProject, createProject, switchProject, loadProject, restoreMessageRevision, restoreBlueprintLineage, deleteProject, refreshProjects, stopGeneration,
    handleSend, handleRetry, launchWithPlan, publishProject, classifyAndStore,
    savePendingProject,
    rejectPendingProjectSave,
    onSettings, setShowSettings,
    addFigmaAccount, removeFigmaAccount, refreshFigmaAccounts, validateFigmaLink,
    setEngineApiKey, setEngineModelId, setAgentConfig,
    startFigmaSync, addSystemMessage,
    saveFigmaProject, loadFigmaProject, deleteFigmaProject, markFigmaProjectSynced, clearFigmaSync,
    setAppLanguage, setFigmaLink, setTargetMarket, setAuditStrictness,
    confirmPlan, cancelPlan, selectKickoffScope,
    onConfirmPlan, onClarifyPlan, onSubmitClarification, answerClarification, chooseSurface,
    approveDiff, rejectDiff,
    confirmAdmission, denyAdmission,
  ]);

  // messages / input / setInput returned directly (not memoized) so their
  // high-frequency updates (every token, every keypress) do NOT invalidate
  // the stable studioMemo and retrigger deep re-renders of the full tree.
  return { ...studioMemo, messages, input, setInput };
};
