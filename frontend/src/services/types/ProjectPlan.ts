/**
 * ProjectPlan — structured plan shape produced by the architect step.
 *
 * Extracted from the legacy SimpleGeneration module so consumers
 * (ideaFeedService, ArchitectPlannerService, ideaPackagingService, …)
 * can keep their compile-time contract while the underlying pipeline
 * is replaced by ProtoPipeline.
 */

import type { ArtistLayerSpec } from '../../shared/projectModel';
import type { DesignIntent } from '../ThemeEngine';

export type SectionSpec = {
  template: string;
  props: Record<string, unknown>;
};

export interface ProjectPlan {
  appName:        string;
  description:    string;
  theme:          string;
  targetUser?:    string;
  layout: {
    type:       string;
    navigation: string;
  };
  uxPatterns?: {
    emptyStates:      boolean;
    loadingSkeletons?: boolean;
    searchAndFilter?:  boolean;
    onboarding?:       boolean;
    swipeActions?:     boolean;
  };
  responsiveness?: {
    primaryDevice: string;
    mobileFirst?:  boolean;
  };
  pages: Array<{
    path:         string;
    name:         string;
    file:         string;
    purpose:      string;
    isMainScreen: boolean;
    showInNav?:   boolean;
    guard?:       string | { type: string; redirectTo?: string };
    uiSpec?:      string;
    keyElements?: string[];
  }>;
  dataModel?: {
    entities:     Array<{ name: string; fields: string }>;
    sharedState?: string;
  };
  criticalUiRules?: string[];
  shadcnComponents: string[];
  icons:            string[];
  artistLayer?:     ArtistLayerSpec;
  designIntent?:    DesignIntent;
  sections?:        SectionSpec[];
  [key: string]: unknown;
}

export type KickoffBuildScopeId = 'core' | 'core_backend' | 'core_backend_ai';

export type PlanConfirmationResult =
  | boolean
  | {
      confirmed: boolean;
      approvedPlan?: ProjectPlan;
      requiredKickoffScopeId?: KickoffBuildScopeId;
    };
