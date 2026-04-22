import { detectEnvVars, detectPackages } from '../../services/ProjectMemoryService';
import type { ProjectRecord } from '../../services/ProjectRepository';
import {
  buildBranchGenerationGuidance,
  buildBranchTrustUiSummary,
  type ArchitectOperatingMode,
  type BranchRealitySummary,
  type BranchConflictHandling,
  type BranchGuidanceTrustBasis,
  type BranchTrustIndicatorKey,
} from '../../services/BranchArchitectureOrchestrationService';
import { normalizeAppLanguage, type SupportedAppLanguage } from '../../shared/appLanguage';
import type {
  ActualCapabilityState,
  ArchitectureCapabilityKey,
  ArchitectureConstraint,
  ArchitectureDecision,
  ArchitectureMemorySource,
  ArchitectureSnapshot,
  ArchitectureStatus,
  BranchConversationLinkage,
  CapabilityDecision,
  CapabilityManifestEntry,
  DeferredItem,
  OpenArchitectureQuestion,
  PlanStep,
  PlannedCapabilityState,
  ProjectBranchArchitecture,
} from '../../shared/projectModel';

type SupportedLanguage = SupportedAppLanguage;
type CombinedCapabilityState = 'planned' | 'implemented' | 'deferred' | 'unknown';

export interface ArchitectCopy {
  architectTitle: string;
  architectSubtitle: string;
  proposedDraft: string;
  loading: string;
  loadingBody: string;
  loadErrorTitle: string;
  loadErrorBody: string;
  noProjectTitle: string;
  noProjectBody: string;
  noBranchTitle: string;
  noBranchBody: string;
  branchBrief: string;
  currentPlan: string;
  capabilityManifest: string;
  decisions: string;
  accepted: string;
  open: string;
  superseded: string;
  deferredItems: string;
  actualState: string;
  planVsReality: string;
  plannedNotImplemented: string;
  implementedNotPlanned: string;
  supersededDecisions: string;
  noPlan: string;
  noCapabilities: string;
  noDecisions: string;
  noDeferred: string;
  noPlanRealityItems: string;
  suggestedNextStep: string;
  whyThisNextStep: string;
  branch: string;
  revision: string;
  snapshot: string;
  updatedAt: string;
  summary: string;
  status: string;
  reality: string;
  files: string;
  routes: string;
  packages: string;
  envVars: string;
  keyFiles: string;
  observedSurfaces: string;
  implementedCapabilities: string;
  planned: string;
  implemented: string;
  deferred: string;
  unknown: string;
  missing: string;
  detected: string;
  partial: string;
  required: string;
  optional: string;
  notPlanned: string;
  realitySummary: (facts: { files: number; routes: number; packages: number; implemented: number }) => string;
  capabilityType: string;
  architectureType: string;
  constraintType: string;
  questionType: string;
  reason: string;
  untilPhase: string;
  affectedCapabilities: string;
  source: string;
  branchConversation: string;
  architectMemory: string;
  message: string;
  thread: string;
  generationTrust: string;
  fastPrototypeMode: string;
  architectGuidedMode: string;
  proposedExperimentMode: string;
  usingAcceptedArchitecture: string;
  usingProposedGuidance: string;
  deferredExcluded: string;
  operatingMode: string;
  trustBasis: string;
  trustSummaryPrototype: string;
  trustSummaryAccepted: string;
  trustSummaryProposed: string;
  overrideRequest: string;
  reviseArchitecture: string;
  experimentalRequest: string;
}

export interface BranchHeaderView {
  projectName: string;
  branchName: string;
  branchId: string;
  summary: string;
  status: ArchitectureStatus;
  revisionId: string | null;
  snapshotLabel: string;
  updatedAt: string;
}

export interface PlanStepView {
  id: string;
  title: string;
  summary?: string;
  state: 'planned' | 'in_progress' | 'implemented' | 'blocked' | 'deferred';
  capabilityIds: string[];
}

export interface CapabilityView {
  id: string;
  title: string;
  description?: string;
  plannedState: PlannedCapabilityState;
  actualState: ActualCapabilityState;
  combinedState: CombinedCapabilityState;
  source: 'manual' | 'detected' | 'mixed' | 'derived';
}

export interface DecisionView {
  id: string;
  title: string;
  summary: string;
  status: ArchitectureStatus;
  type: 'capability' | 'architecture' | 'constraint' | 'question';
  meta: string[];
}

export interface DeferredItemView {
  id: string;
  title: string;
  summary: string;
  status: DeferredItem['status'];
  reason?: string;
  untilPhase?: string;
  capabilityIds: string[];
  meta: string[];
}

export interface PlanRealityItemView {
  id: string;
  title: string;
  summary: string;
}

export interface ActualStateSummaryView {
  narrative: string;
  facts: Array<{ label: string; value: string }>;
  routes: string[];
  packages: string[];
  envVars: string[];
  keyFiles: string[];
  surfaces: Array<{
    id: string;
    title: string;
    state: ActualCapabilityState;
  }>;
}

export interface SuggestedNextStepView {
  title: string;
  summary: string;
  reasons: string[];
  kind: 'plan_step' | 'accepted_gap' | 'reconcile' | 'deferred_backlog' | 'done';
}

export interface TrustIndicatorView {
  id: BranchTrustIndicatorKey;
  label: string;
  state: 'accepted' | 'planned' | 'open' | 'deferred';
}

export interface GenerationTrustView {
  mode: ArchitectOperatingMode;
  modeLabel: string;
  trustBasis: BranchGuidanceTrustBasis;
  trustLabel: string;
  summary: string;
  conflictHandling: BranchConflictHandling;
  conflictLabel: string | null;
  conflictSummary: string | null;
  indicators: TrustIndicatorView[];
}

export interface BranchArchitectureViewModel {
  copy: ArchitectCopy;
  header: BranchHeaderView;
  generationTrust: GenerationTrustView;
  branchReality: BranchRealitySummary | null;
  stateCounts: Record<CombinedCapabilityState, number>;
  plan: {
    title: string;
    summary: string;
    steps: PlanStepView[];
  } | null;
  capabilities: CapabilityView[];
  decisions: {
    accepted: DecisionView[];
    open: DecisionView[];
    superseded: DecisionView[];
  };
  deferredItems: DeferredItemView[];
  actualStateSummary: ActualStateSummaryView;
  suggestedNextStep: SuggestedNextStepView | null;
  planVsReality: {
    plannedNotImplemented: PlanRealityItemView[];
    implementedNotPlanned: PlanRealityItemView[];
    supersededDecisions: DecisionView[];
  };
}

type CapabilityDetector = {
  title: Record<SupportedLanguage, string>;
  patterns: RegExp[];
};

const PHASE_LABELS: Record<'pre_build_draft' | 'post_build_actual', string> = {
  pre_build_draft: 'plan',
  post_build_actual: 'actual',
};

const COPY: Record<SupportedLanguage, ArchitectCopy> = {
  en: {
    architectTitle: 'Product Architect',
    architectSubtitle: 'branch architecture',
    proposedDraft: 'Proposed draft',
    loading: 'Loading branch architecture…',
    loadingBody: 'Reading the active project, branch memory, and current implementation state.',
    loadErrorTitle: 'Could not load branch architecture',
    loadErrorBody: 'The Architect screen could not read the active branch state.',
    noProjectTitle: 'No active project',
    noProjectBody: 'Open or generate a project to inspect its branch architecture.',
    noBranchTitle: 'No active branch architecture',
    noBranchBody: 'This project does not have an active branch snapshot yet.',
    branchBrief: 'Branch brief',
    currentPlan: 'Current implementation plan',
    capabilityManifest: 'Capability manifest',
    decisions: 'Decisions',
    accepted: 'Accepted',
    open: 'Open',
    superseded: 'Superseded',
    deferredItems: 'Deferred items',
    actualState: 'Current actual project state',
    planVsReality: 'Plan vs reality',
    plannedNotImplemented: 'Planned, not implemented',
    implementedNotPlanned: 'Implemented, not in plan',
    supersededDecisions: 'Decisions now superseded',
    noPlan: 'No implementation plan is saved for this branch yet.',
    noCapabilities: 'No capability manifest is saved for this branch yet.',
    noDecisions: 'No decisions in this group yet.',
    noDeferred: 'No deferred items are saved for this branch.',
    noPlanRealityItems: 'Nothing to show here right now.',
    suggestedNextStep: 'Suggested next step',
    whyThisNextStep: 'Why this next',
    branch: 'Branch',
    revision: 'Revision',
    snapshot: 'Snapshot',
    updatedAt: 'Updated',
    summary: 'Summary',
    status: 'Status',
    reality: 'Reality',
    files: 'Files',
    routes: 'Routes',
    packages: 'Packages',
    envVars: 'Env vars',
    keyFiles: 'Key files',
    observedSurfaces: 'Observed surfaces',
    implementedCapabilities: 'Implemented capabilities',
    planned: 'Planned',
    implemented: 'Implemented',
    deferred: 'Deferred',
    unknown: 'Unknown',
    missing: 'Missing',
    detected: 'Detected',
    partial: 'Partial',
    required: 'Required',
    optional: 'Optional',
    notPlanned: 'Not planned',
    realitySummary: ({ files, routes, packages, implemented }) =>
      `Current branch reality shows ${files} files, ${routes} routes, ${packages} external packages, and ${implemented} implemented capabilities.`,
    capabilityType: 'Capability',
    architectureType: 'Architecture',
    constraintType: 'Constraint',
    questionType: 'Question',
    reason: 'Reason',
    untilPhase: 'Deferred until',
    affectedCapabilities: 'Capabilities',
    source: 'Source',
    branchConversation: 'Branch conversation',
    architectMemory: 'Architect memory',
    message: 'Message',
    thread: 'Thread',
    generationTrust: 'Generation trust',
    fastPrototypeMode: 'Fast prototype mode',
    architectGuidedMode: 'Architect-guided mode',
    proposedExperimentMode: 'Proposed experiment mode',
    usingAcceptedArchitecture: 'Using accepted branch architecture',
    usingProposedGuidance: 'Using proposed draft guidance',
    deferredExcluded: 'Deferred items excluded',
    operatingMode: 'Operating mode',
    trustBasis: 'Trust basis',
    trustSummaryPrototype: 'Lightweight requests can stay fast and only use branch architecture as compatibility context.',
    trustSummaryAccepted: 'Accepted branch architecture is the default authority for this branch unless you explicitly override or revise it.',
    trustSummaryProposed: 'This branch is currently guided by proposed draft guidance, so it should stay visibly experimental until decisions are accepted.',
    overrideRequest: 'Override request',
    reviseArchitecture: 'Revise architecture',
    experimentalRequest: 'Experimental request',
  },
  ru: {
    architectTitle: 'Архитектор продукта',
    architectSubtitle: 'архитектура ветки',
    proposedDraft: 'Черновик предложения',
    loading: 'Загрузка архитектуры ветки…',
    loadingBody: 'Читаем активный проект, память ветки и текущее состояние реализации.',
    loadErrorTitle: 'Не удалось загрузить архитектуру ветки',
    loadErrorBody: 'Экран Architect не смог прочитать состояние активной ветки.',
    noProjectTitle: 'Нет активного проекта',
    noProjectBody: 'Откройте или сгенерируйте проект, чтобы увидеть архитектуру его ветки.',
    noBranchTitle: 'Нет архитектуры активной ветки',
    noBranchBody: 'Для этого проекта пока нет снимка активной ветки.',
    branchBrief: 'Кратко по ветке',
    currentPlan: 'Текущий план реализации',
    capabilityManifest: 'Манифест возможностей',
    decisions: 'Решения',
    accepted: 'Принято',
    open: 'Открыто',
    superseded: 'Заменено',
    deferredItems: 'Отложенные пункты',
    actualState: 'Текущее фактическое состояние проекта',
    planVsReality: 'План и реальность',
    plannedNotImplemented: 'Запланировано, но не реализовано',
    implementedNotPlanned: 'Реализовано, но не было в плане',
    supersededDecisions: 'Решения, которые уже заменены',
    noPlan: 'Для этой ветки пока не сохранен план реализации.',
    noCapabilities: 'Для этой ветки пока не сохранен манифест возможностей.',
    noDecisions: 'В этой группе пока нет решений.',
    noDeferred: 'Для этой ветки нет отложенных пунктов.',
    noPlanRealityItems: 'Сейчас здесь нечего показывать.',
    suggestedNextStep: 'Рекомендуемый следующий шаг',
    whyThisNextStep: 'Почему именно сейчас',
    branch: 'Ветка',
    revision: 'Ревизия',
    snapshot: 'Снимок',
    updatedAt: 'Обновлено',
    summary: 'Сводка',
    status: 'Статус',
    reality: 'Факт',
    files: 'Файлы',
    routes: 'Маршруты',
    packages: 'Пакеты',
    envVars: 'Переменные окружения',
    keyFiles: 'Ключевые файлы',
    observedSurfaces: 'Наблюдаемые поверхности',
    implementedCapabilities: 'Реализованные возможности',
    planned: 'Запланировано',
    implemented: 'Реализовано',
    deferred: 'Отложено',
    unknown: 'Неизвестно',
    missing: 'Отсутствует',
    detected: 'Обнаружено',
    partial: 'Частично',
    required: 'Обязательно',
    optional: 'Опционально',
    notPlanned: 'Не планировалось',
    realitySummary: ({ files, routes, packages, implemented }) =>
      `Фактическое состояние ветки: ${files} файлов, ${routes} маршрутов, ${packages} внешних пакетов и ${implemented} реализованных возможностей.`,
    capabilityType: 'Возможность',
    architectureType: 'Архитектура',
    constraintType: 'Ограничение',
    questionType: 'Вопрос',
    reason: 'Причина',
    untilPhase: 'Отложено до',
    affectedCapabilities: 'Возможности',
    source: 'Источник',
    branchConversation: 'Разговор в ветке',
    architectMemory: 'Память Architect',
    message: 'Сообщение',
    thread: 'Тред',
    generationTrust: 'Доверие к генерации',
    fastPrototypeMode: 'Режим быстрого прототипа',
    architectGuidedMode: 'Архитектурный режим ветки',
    proposedExperimentMode: 'Режим эксперимента',
    usingAcceptedArchitecture: 'Используется принятая архитектура ветки',
    usingProposedGuidance: 'Используются предложенные draft-указания',
    deferredExcluded: 'Отложенные пункты исключены из scope',
    operatingMode: 'Режим работы',
    trustBasis: 'Основа доверия',
    trustSummaryPrototype: 'Лёгкие запросы могут оставаться быстрыми, а архитектура ветки используется только как контекст совместимости.',
    trustSummaryAccepted: 'Принятая архитектура ветки по умолчанию остаётся основой для этой ветки, пока вы явно не переопределите её или не пересмотрите.',
    trustSummaryProposed: 'Сейчас эта ветка опирается на предложенный draft, поэтому поведение должно оставаться явно экспериментальным до принятия решений.',
    overrideRequest: 'Запрос на override',
    reviseArchitecture: 'Пересмотр архитектуры',
    experimentalRequest: 'Экспериментальный запрос',
  },
  es: {
    architectTitle: 'Arquitecto de producto',
    architectSubtitle: 'arquitectura de la rama',
    proposedDraft: 'Borrador propuesto',
    loading: 'Cargando arquitectura de la rama…',
    loadingBody: 'Leyendo el proyecto activo, la memoria de la rama y el estado actual de implementación.',
    loadErrorTitle: 'No se pudo cargar la arquitectura de la rama',
    loadErrorBody: 'La pantalla Architect no pudo leer el estado de la rama activa.',
    noProjectTitle: 'No hay proyecto activo',
    noProjectBody: 'Abre o genera un proyecto para inspeccionar la arquitectura de su rama.',
    noBranchTitle: 'No hay arquitectura de rama activa',
    noBranchBody: 'Este proyecto todavía no tiene una instantánea de rama activa.',
    branchBrief: 'Resumen de la rama',
    currentPlan: 'Plan de implementación actual',
    capabilityManifest: 'Manifiesto de capacidades',
    decisions: 'Decisiones',
    accepted: 'Aceptado',
    open: 'Abierto',
    superseded: 'Reemplazado',
    deferredItems: 'Elementos diferidos',
    actualState: 'Estado real actual del proyecto',
    planVsReality: 'Plan vs realidad',
    plannedNotImplemented: 'Planificado, no implementado',
    implementedNotPlanned: 'Implementado, fuera del plan',
    supersededDecisions: 'Decisiones ya reemplazadas',
    noPlan: 'Todavía no hay un plan de implementación guardado para esta rama.',
    noCapabilities: 'Todavía no hay un manifiesto de capacidades guardado para esta rama.',
    noDecisions: 'Todavía no hay decisiones en este grupo.',
    noDeferred: 'No hay elementos diferidos guardados para esta rama.',
    noPlanRealityItems: 'No hay nada que mostrar aquí ahora mismo.',
    suggestedNextStep: 'Siguiente paso sugerido',
    whyThisNextStep: 'Por qué ahora',
    branch: 'Rama',
    revision: 'Revisión',
    snapshot: 'Instantánea',
    updatedAt: 'Actualizado',
    summary: 'Resumen',
    status: 'Estado',
    reality: 'Realidad',
    files: 'Archivos',
    routes: 'Rutas',
    packages: 'Paquetes',
    envVars: 'Variables',
    keyFiles: 'Archivos clave',
    observedSurfaces: 'Superficies observadas',
    implementedCapabilities: 'Capacidades implementadas',
    planned: 'Planificado',
    implemented: 'Implementado',
    deferred: 'Diferido',
    unknown: 'Desconocido',
    missing: 'Falta',
    detected: 'Detectado',
    partial: 'Parcial',
    required: 'Requerido',
    optional: 'Opcional',
    notPlanned: 'No planificado',
    realitySummary: ({ files, routes, packages, implemented }) =>
      `La realidad actual de la rama muestra ${files} archivos, ${routes} rutas, ${packages} paquetes externos y ${implemented} capacidades implementadas.`,
    capabilityType: 'Capacidad',
    architectureType: 'Arquitectura',
    constraintType: 'Restricción',
    questionType: 'Pregunta',
    reason: 'Motivo',
    untilPhase: 'Diferido hasta',
    affectedCapabilities: 'Capacidades',
    source: 'Origen',
    branchConversation: 'Conversación de la rama',
    architectMemory: 'Memoria de Architect',
    message: 'Mensaje',
    thread: 'Hilo',
    generationTrust: 'Confianza de generación',
    fastPrototypeMode: 'Fast prototype mode',
    architectGuidedMode: 'Architect-guided mode',
    proposedExperimentMode: 'Proposed experiment mode',
    usingAcceptedArchitecture: 'Using accepted branch architecture',
    usingProposedGuidance: 'Using proposed draft guidance',
    deferredExcluded: 'Deferred items excluded',
    operatingMode: 'Operating mode',
    trustBasis: 'Base de confianza',
    trustSummaryPrototype: 'Lightweight requests can stay fast and only use branch architecture as compatibility context.',
    trustSummaryAccepted: 'Accepted branch architecture is the default authority for this branch unless you explicitly override or revise it.',
    trustSummaryProposed: 'This branch is currently guided by proposed draft guidance, so it should stay visibly experimental until decisions are accepted.',
    overrideRequest: 'Override request',
    reviseArchitecture: 'Revise architecture',
    experimentalRequest: 'Experimental request',
  },
  de: {
    architectTitle: 'Produktarchitekt',
    architectSubtitle: 'Branch-Architektur',
    proposedDraft: 'Vorgeschlagener Entwurf',
    loading: 'Branch-Architektur wird geladen…',
    loadingBody: 'Aktives Projekt, Branch-Speicher und aktueller Implementierungsstand werden gelesen.',
    loadErrorTitle: 'Branch-Architektur konnte nicht geladen werden',
    loadErrorBody: 'Der Architect-Bildschirm konnte den Zustand des aktiven Branches nicht lesen.',
    noProjectTitle: 'Kein aktives Projekt',
    noProjectBody: 'Öffne oder generiere ein Projekt, um die Branch-Architektur zu sehen.',
    noBranchTitle: 'Keine aktive Branch-Architektur',
    noBranchBody: 'Dieses Projekt hat noch keinen aktiven Branch-Snapshot.',
    branchBrief: 'Branch-Überblick',
    currentPlan: 'Aktueller Implementierungsplan',
    capabilityManifest: 'Capability-Manifest',
    decisions: 'Entscheidungen',
    accepted: 'Akzeptiert',
    open: 'Offen',
    superseded: 'Ersetzt',
    deferredItems: 'Zurückgestellte Punkte',
    actualState: 'Aktueller tatsächlicher Projektzustand',
    planVsReality: 'Plan vs Realität',
    plannedNotImplemented: 'Geplant, nicht umgesetzt',
    implementedNotPlanned: 'Umgesetzt, nicht im Plan',
    supersededDecisions: 'Inzwischen ersetzte Entscheidungen',
    noPlan: 'Für diesen Branch ist noch kein Implementierungsplan gespeichert.',
    noCapabilities: 'Für diesen Branch ist noch kein Capability-Manifest gespeichert.',
    noDecisions: 'In dieser Gruppe gibt es noch keine Entscheidungen.',
    noDeferred: 'Für diesen Branch sind keine zurückgestellten Punkte gespeichert.',
    noPlanRealityItems: 'Hier gibt es im Moment nichts zu zeigen.',
    suggestedNextStep: 'Empfohlener naechster Schritt',
    whyThisNextStep: 'Warum jetzt',
    branch: 'Branch',
    revision: 'Revision',
    snapshot: 'Snapshot',
    updatedAt: 'Aktualisiert',
    summary: 'Zusammenfassung',
    status: 'Status',
    reality: 'Realität',
    files: 'Dateien',
    routes: 'Routen',
    packages: 'Pakete',
    envVars: 'Umgebungsvariablen',
    keyFiles: 'Wichtige Dateien',
    observedSurfaces: 'Beobachtete Oberflächen',
    implementedCapabilities: 'Umgesetzte Capabilities',
    planned: 'Geplant',
    implemented: 'Umgesetzt',
    deferred: 'Zurückgestellt',
    unknown: 'Unbekannt',
    missing: 'Fehlt',
    detected: 'Erkannt',
    partial: 'Teilweise',
    required: 'Erforderlich',
    optional: 'Optional',
    notPlanned: 'Nicht geplant',
    realitySummary: ({ files, routes, packages, implemented }) =>
      `Die aktuelle Branch-Realität zeigt ${files} Dateien, ${routes} Routen, ${packages} externe Pakete und ${implemented} umgesetzte Capabilities.`,
    capabilityType: 'Capability',
    architectureType: 'Architektur',
    constraintType: 'Einschränkung',
    questionType: 'Frage',
    reason: 'Grund',
    untilPhase: 'Zurückgestellt bis',
    affectedCapabilities: 'Capabilities',
    source: 'Quelle',
    branchConversation: 'Branch-Konversation',
    architectMemory: 'Architect-Speicher',
    message: 'Nachricht',
    thread: 'Thread',
    generationTrust: 'Vertrauenslage der Generierung',
    fastPrototypeMode: 'Fast prototype mode',
    architectGuidedMode: 'Architect-guided mode',
    proposedExperimentMode: 'Proposed experiment mode',
    usingAcceptedArchitecture: 'Using accepted branch architecture',
    usingProposedGuidance: 'Using proposed draft guidance',
    deferredExcluded: 'Deferred items excluded',
    operatingMode: 'Operating mode',
    trustBasis: 'Vertrauensbasis',
    trustSummaryPrototype: 'Lightweight requests can stay fast and only use branch architecture as compatibility context.',
    trustSummaryAccepted: 'Accepted branch architecture is the default authority for this branch unless you explicitly override or revise it.',
    trustSummaryProposed: 'This branch is currently guided by proposed draft guidance, so it should stay visibly experimental until decisions are accepted.',
    overrideRequest: 'Override request',
    reviseArchitecture: 'Revise architecture',
    experimentalRequest: 'Experimental request',
  },
  fr: {
    architectTitle: 'Architecte produit',
    architectSubtitle: 'architecture de branche',
    proposedDraft: 'Brouillon proposé',
    loading: 'Chargement de l’architecture de la branche…',
    loadingBody: 'Lecture du projet actif, de la mémoire de branche et de l’état actuel de l’implémentation.',
    loadErrorTitle: 'Impossible de charger l’architecture de la branche',
    loadErrorBody: 'L’écran Architect n’a pas pu lire l’état de la branche active.',
    noProjectTitle: 'Aucun projet actif',
    noProjectBody: 'Ouvrez ou générez un projet pour inspecter l’architecture de sa branche.',
    noBranchTitle: 'Aucune architecture de branche active',
    noBranchBody: 'Ce projet n’a pas encore de snapshot de branche active.',
    branchBrief: 'Résumé de la branche',
    currentPlan: 'Plan d’implémentation actuel',
    capabilityManifest: 'Manifeste des capacités',
    decisions: 'Décisions',
    accepted: 'Accepté',
    open: 'Ouvert',
    superseded: 'Remplacé',
    deferredItems: 'Éléments différés',
    actualState: 'État réel actuel du projet',
    planVsReality: 'Plan vs réalité',
    plannedNotImplemented: 'Prévu, non implémenté',
    implementedNotPlanned: 'Implémenté, hors plan',
    supersededDecisions: 'Décisions désormais remplacées',
    noPlan: 'Aucun plan d’implémentation n’est encore enregistré pour cette branche.',
    noCapabilities: 'Aucun manifeste de capacités n’est encore enregistré pour cette branche.',
    noDecisions: 'Aucune décision dans ce groupe pour le moment.',
    noDeferred: 'Aucun élément différé n’est enregistré pour cette branche.',
    noPlanRealityItems: 'Rien à afficher ici pour le moment.',
    suggestedNextStep: 'Prochaine étape suggérée',
    whyThisNextStep: 'Pourquoi maintenant',
    branch: 'Branche',
    revision: 'Révision',
    snapshot: 'Snapshot',
    updatedAt: 'Mis à jour',
    summary: 'Résumé',
    status: 'Statut',
    reality: 'Réalité',
    files: 'Fichiers',
    routes: 'Routes',
    packages: 'Paquets',
    envVars: 'Variables',
    keyFiles: 'Fichiers clés',
    observedSurfaces: 'Surfaces observées',
    implementedCapabilities: 'Capacités implémentées',
    planned: 'Prévu',
    implemented: 'Implémenté',
    deferred: 'Différé',
    unknown: 'Inconnu',
    missing: 'Manquant',
    detected: 'Détecté',
    partial: 'Partiel',
    required: 'Requis',
    optional: 'Optionnel',
    notPlanned: 'Non prévu',
    realitySummary: ({ files, routes, packages, implemented }) =>
      `La réalité actuelle de la branche montre ${files} fichiers, ${routes} routes, ${packages} paquets externes et ${implemented} capacités implémentées.`,
    capabilityType: 'Capacité',
    architectureType: 'Architecture',
    constraintType: 'Contrainte',
    questionType: 'Question',
    reason: 'Raison',
    untilPhase: 'Différé jusqu’à',
    affectedCapabilities: 'Capacités',
    source: 'Source',
    branchConversation: 'Conversation de branche',
    architectMemory: 'Mémoire Architect',
    message: 'Message',
    thread: 'Fil',
    generationTrust: 'Confiance de génération',
    fastPrototypeMode: 'Fast prototype mode',
    architectGuidedMode: 'Architect-guided mode',
    proposedExperimentMode: 'Proposed experiment mode',
    usingAcceptedArchitecture: 'Using accepted branch architecture',
    usingProposedGuidance: 'Using proposed draft guidance',
    deferredExcluded: 'Deferred items excluded',
    operatingMode: 'Operating mode',
    trustBasis: 'Base de confiance',
    trustSummaryPrototype: 'Lightweight requests can stay fast and only use branch architecture as compatibility context.',
    trustSummaryAccepted: 'Accepted branch architecture is the default authority for this branch unless you explicitly override or revise it.',
    trustSummaryProposed: 'This branch is currently guided by proposed draft guidance, so it should stay visibly experimental until decisions are accepted.',
    overrideRequest: 'Override request',
    reviseArchitecture: 'Revise architecture',
    experimentalRequest: 'Experimental request',
  },
  zh: {
    architectTitle: '产品架构师',
    architectSubtitle: '分支架构',
    proposedDraft: '提议草案',
    loading: '正在加载分支架构…',
    loadingBody: '正在读取当前项目、分支记忆和当前实现状态。',
    loadErrorTitle: '无法加载分支架构',
    loadErrorBody: 'Architect 页面无法读取当前分支状态。',
    noProjectTitle: '没有活动项目',
    noProjectBody: '请打开或生成一个项目以查看该分支架构。',
    noBranchTitle: '没有活动分支架构',
    noBranchBody: '此项目还没有当前分支快照。',
    branchBrief: '分支摘要',
    currentPlan: '当前实现计划',
    capabilityManifest: '能力清单',
    decisions: '决策',
    accepted: '已接受',
    open: '开放',
    superseded: '已被替代',
    deferredItems: '延期项',
    actualState: '当前实际项目状态',
    planVsReality: '计划与现实',
    plannedNotImplemented: '已计划但未实现',
    implementedNotPlanned: '已实现但不在计划中',
    supersededDecisions: '已被替代的决策',
    noPlan: '这个分支还没有保存实现计划。',
    noCapabilities: '这个分支还没有保存能力清单。',
    noDecisions: '这个分组目前没有决策。',
    noDeferred: '这个分支没有延期项。',
    noPlanRealityItems: '这里目前没有可显示的内容。',
    suggestedNextStep: '建议的下一步',
    whyThisNextStep: '为什么是现在',
    branch: '分支',
    revision: '修订',
    snapshot: '快照',
    updatedAt: '更新于',
    summary: '摘要',
    status: '状态',
    reality: '实际',
    files: '文件',
    routes: '路由',
    packages: '包',
    envVars: '环境变量',
    keyFiles: '关键文件',
    observedSurfaces: '已观察到的能力面',
    implementedCapabilities: '已实现能力',
    planned: '已计划',
    implemented: '已实现',
    deferred: '已延期',
    unknown: '未知',
    missing: '缺失',
    detected: '已检测',
    partial: '部分',
    required: '必需',
    optional: '可选',
    notPlanned: '未计划',
    realitySummary: ({ files, routes, packages, implemented }) =>
      `当前分支实际状态显示：${files} 个文件、${routes} 条路由、${packages} 个外部包，以及 ${implemented} 个已实现能力。`,
    capabilityType: '能力',
    architectureType: '架构',
    constraintType: '约束',
    questionType: '问题',
    reason: '原因',
    untilPhase: '延期到',
    affectedCapabilities: '相关能力',
    source: '来源',
    branchConversation: '分支对话',
    architectMemory: 'Architect 记忆',
    message: '消息',
    thread: '线程',
    generationTrust: '生成信任',
    fastPrototypeMode: 'Fast prototype mode',
    architectGuidedMode: 'Architect-guided mode',
    proposedExperimentMode: 'Proposed experiment mode',
    usingAcceptedArchitecture: 'Using accepted branch architecture',
    usingProposedGuidance: 'Using proposed draft guidance',
    deferredExcluded: 'Deferred items excluded',
    operatingMode: 'Operating mode',
    trustBasis: '信任依据',
    trustSummaryPrototype: 'Lightweight requests can stay fast and only use branch architecture as compatibility context.',
    trustSummaryAccepted: 'Accepted branch architecture is the default authority for this branch unless you explicitly override or revise it.',
    trustSummaryProposed: 'This branch is currently guided by proposed draft guidance, so it should stay visibly experimental until decisions are accepted.',
    overrideRequest: 'Override request',
    reviseArchitecture: 'Revise architecture',
    experimentalRequest: 'Experimental request',
  },
};

const CAPABILITY_DETECTORS: Record<string, CapabilityDetector> = {
  backend: {
    title: {
      en: 'Backend',
      ru: 'Бэкенд',
      es: 'Backend',
      de: 'Backend',
      fr: 'Backend',
      zh: '后端',
    },
    patterns: [/createClient\(/i, /@supabase\/supabase-js/i, /express\(/i, /app\.(get|post|put|delete)\(/i, /\/api\//i],
  },
  auth: {
    title: {
      en: 'Authentication',
      ru: 'Аутентификация',
      es: 'Autenticación',
      de: 'Authentifizierung',
      fr: 'Authentification',
      zh: '认证',
    },
    patterns: [/supabase\.auth/i, /\b(signIn|signUp|signOut|useAuth|AuthProvider)\b/i, /@clerk\//i, /\/(login|signup|register)\b/i],
  },
  ai_chat: {
    title: {
      en: 'AI chat',
      ru: 'AI-чат',
      es: 'Chat con IA',
      de: 'KI-Chat',
      fr: 'Chat IA',
      zh: 'AI 对话',
    },
    patterns: [/\b(chatbot|chat message|assistant|conversation)\b/i, /chat\/completions/i, /anthropic|openai|gemini/i],
  },
  ai_generation: {
    title: {
      en: 'AI generation',
      ru: 'AI-генерация',
      es: 'Generación IA',
      de: 'KI-Generierung',
      fr: 'Génération IA',
      zh: 'AI 生成',
    },
    patterns: [/\b(generateImage|generateText|image generation|text generation)\b/i, /dall-?e|stable diffusion|midjourney/i],
  },
  storage: {
    title: {
      en: 'Storage',
      ru: 'Хранилище',
      es: 'Almacenamiento',
      de: 'Speicher',
      fr: 'Stockage',
      zh: '存储',
    },
    patterns: [/localStorage/i, /sessionStorage/i, /storage\.from\(/i, /upload/i, /bucket/i],
  },
  map: {
    title: {
      en: 'Maps',
      ru: 'Карты',
      es: 'Mapas',
      de: 'Karten',
      fr: 'Cartes',
      zh: '地图',
    },
    patterns: [/leaflet|mapbox|google maps/i, /\b(latitude|longitude|coordinates?)\b/i, /\b<L?Map/i],
  },
  scanner: {
    title: {
      en: 'Scanner',
      ru: 'Сканер',
      es: 'Escáner',
      de: 'Scanner',
      fr: 'Scanner',
      zh: '扫描',
    },
    patterns: [/qr.?code|barcode|scanner|webcam|camera|ocr/i],
  },
  notifications: {
    title: {
      en: 'Notifications',
      ru: 'Уведомления',
      es: 'Notificaciones',
      de: 'Benachrichtigungen',
      fr: 'Notifications',
      zh: '通知',
    },
    patterns: [/\bNotification\b/i, /pushManager|push subscription/i, /sendgrid|smtp|resend/i, /\breminder\b/i],
  },
  analytics: {
    title: {
      en: 'Analytics',
      ru: 'Аналитика',
      es: 'Analítica',
      de: 'Analytics',
      fr: 'Analytique',
      zh: '分析',
    },
    patterns: [/gtag|google-analytics|posthog|mixpanel|plausible|analytics/i],
  },
  payments: {
    title: {
      en: 'Payments',
      ru: 'Платежи',
      es: 'Pagos',
      de: 'Zahlungen',
      fr: 'Paiements',
      zh: '支付',
    },
    patterns: [/stripe|checkout|subscription|billing|invoice|payment/i],
  },
  admin: {
    title: {
      en: 'Admin',
      ru: 'Админка',
      es: 'Administración',
      de: 'Admin',
      fr: 'Admin',
      zh: '管理后台',
    },
    patterns: [/\badmin\b/i, /moderation|role management|back office/i],
  },
};

function normalizeLanguage(language: string): SupportedLanguage {
  return normalizeAppLanguage(language);
}

export function getArchitectCopy(language: string): ArchitectCopy {
  return COPY[normalizeLanguage(language)];
}

function formatDate(value: string, language: string): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function pickLatestSnapshot(
  snapshots: ArchitectureSnapshot[],
  phase: ArchitectureSnapshot['phase'],
): ArchitectureSnapshot | null {
  return snapshots.find(snapshot => snapshot.phase === phase) ?? null;
}

function filterPhaseItems<T extends { phase: ArchitectureSnapshot['phase'] }>(
  items: T[] | undefined,
  phase: ArchitectureSnapshot['phase'],
): T[] {
  return (items ?? []).filter(item => item.phase === phase);
}

function resolvePhaseSnapshot(
  architecture: ProjectBranchArchitecture,
  phase: ArchitectureSnapshot['phase'],
): ArchitectureSnapshot | null {
  const snapshot = phase === 'pre_build_draft'
    ? architecture.draftSnapshot ?? pickLatestSnapshot(architecture.snapshots ?? [], phase)
    : architecture.actualSnapshot ?? pickLatestSnapshot(architecture.snapshots ?? [], phase);
  const implementationPlan = architecture.implementationPlan?.phase === phase
    ? architecture.implementationPlan
    : null;
  const capabilityManifest = architecture.capabilityManifest?.phase === phase
    ? architecture.capabilityManifest
    : null;
  const capabilityDecisions = uniqueById([
    ...(snapshot?.capabilityDecisions ?? []),
    ...filterPhaseItems(architecture.capabilityDecisions, phase),
  ]);
  const architectureDecisions = uniqueById([
    ...(snapshot?.architectureDecisions ?? []),
    ...filterPhaseItems(architecture.architectureDecisions, phase),
  ]);
  const constraints = uniqueById([
    ...(snapshot?.constraints ?? []),
    ...filterPhaseItems(architecture.constraints, phase),
  ]);
  const openQuestions = uniqueById([
    ...(snapshot?.openQuestions ?? []),
    ...filterPhaseItems(architecture.openQuestions, phase),
  ]);
  const deferredItems = uniqueById([
    ...(snapshot?.deferredItems ?? []),
    ...filterPhaseItems(architecture.deferredItems, phase),
  ]);
  const branchBrief = snapshot?.branchBrief ?? architecture.branch;
  const createdAt = snapshot?.createdAt ?? implementationPlan?.updatedAt ?? capabilityManifest?.updatedAt ?? architecture.updatedAt;
  const hasContent = Boolean(
    branchBrief?.summary
    || implementationPlan
    || capabilityManifest
    || capabilityDecisions.length
    || architectureDecisions.length
    || constraints.length
    || openQuestions.length
    || deferredItems.length,
  );

  if (!hasContent) return null;

  return {
    id: snapshot?.id ?? `derived:${architecture.branchId}:${phase}`,
    modelVersion: architecture.modelVersion,
    projectId: architecture.projectId,
    branchId: architecture.branchId,
    phase,
    createdAt,
    basedOnRevisionId: snapshot?.basedOnRevisionId
      ?? capabilityManifest?.basedOnRevisionId
      ?? implementationPlan?.basedOnRevisionId
      ?? architecture.branch.headRevisionId,
    sourcePlanId: snapshot?.sourcePlanId ?? implementationPlan?.id,
    previousSnapshotId: snapshot?.previousSnapshotId,
    branchBrief,
    implementationPlan: snapshot?.implementationPlan ?? implementationPlan,
    capabilityManifest: snapshot?.capabilityManifest ?? capabilityManifest,
    capabilityDecisions,
    architectureDecisions,
    constraints,
    openQuestions,
    deferredItems,
  };
}

function getTrackedCapabilityIds(
  architecture: ProjectBranchArchitecture,
  draftSnapshot: ArchitectureSnapshot | null,
  actualSnapshot: ArchitectureSnapshot | null,
  files: Record<string, string>,
): string[] {
  const ids = new Set<string>();
  const capture = (capabilityId?: string | null) => {
    if (capabilityId) ids.add(capabilityId);
  };
  const captureMany = (values?: Array<string | undefined>) => values?.forEach(value => capture(value));

  draftSnapshot?.capabilityManifest?.capabilities.forEach(entry => capture(entry.capabilityId));
  actualSnapshot?.capabilityManifest?.capabilities.forEach(entry => capture(entry.capabilityId));
  draftSnapshot?.capabilityDecisions.forEach(entry => capture(entry.capabilityId));
  actualSnapshot?.capabilityDecisions.forEach(entry => capture(entry.capabilityId));
  draftSnapshot?.architectureDecisions.forEach(entry => captureMany(entry.affectedCapabilityIds));
  actualSnapshot?.architectureDecisions.forEach(entry => captureMany(entry.affectedCapabilityIds));
  draftSnapshot?.deferredItems.forEach(entry => captureMany(entry.relatedCapabilityIds));
  actualSnapshot?.deferredItems.forEach(entry => captureMany(entry.relatedCapabilityIds));
  draftSnapshot?.implementationPlan?.steps.forEach(step => captureMany(step.plannedCapabilityIds));
  actualSnapshot?.implementationPlan?.steps.forEach(step => captureMany(step.plannedCapabilityIds));
  Object.keys(CAPABILITY_DETECTORS).forEach(capabilityId => {
    if (detectLiveCapabilityState(files, capabilityId, 'not_planned') !== 'unknown') {
      ids.add(capabilityId);
    }
  });

  return [...ids];
}

function extractRoutes(files: Record<string, string>): string[] {
  const routes = new Set<string>();
  const routePatterns = [
    /<Route\s+[^>]*path=["']([^"']+)["']/g,
    /path:\s*["']([^"']+)["']/g,
  ];

  for (const [path, content] of Object.entries(files)) {
    for (const pattern of routePatterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        routes.add(match[1]);
      }
    }

    const pageMatch = path.match(/(?:^|\/)(?:src\/)?pages\/(.+)\.(tsx?|jsx?)$/i);
    if (pageMatch) {
      const route = pageMatch[1]
        .replace(/index$/i, '')
        .replace(/\[([^\]]+)\]/g, ':$1')
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\//, '');
      routes.add(route ? `/${route}` : '/');
    }
  }

  return [...routes].sort((a, b) => a.localeCompare(b));
}

function getCapabilityTitle(capabilityId: string, language: string): string {
  const normalized = normalizeLanguage(language);
  return CAPABILITY_DETECTORS[capabilityId]?.title[normalized] ?? capabilityId;
}

function detectLiveCapabilityState(
  files: Record<string, string>,
  capabilityId: string,
  plannedState: PlannedCapabilityState,
): ActualCapabilityState {
  const detector = CAPABILITY_DETECTORS[capabilityId];
  if (!detector) {
    return plannedState === 'required' || plannedState === 'planned' || plannedState === 'optional'
      ? 'missing'
      : 'unknown';
  }

  let score = 0;
  for (const [path, content] of Object.entries(files)) {
    for (const pattern of detector.patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(path) || pattern.test(content)) {
        score += path.toLowerCase().includes(capabilityId.replace('_', '')) ? 2 : 1;
      }
    }
  }

  if (score >= 3) return 'implemented';
  if (score === 2) return 'partially_implemented';
  if (score === 1) return plannedState === 'required' || plannedState === 'planned' || plannedState === 'optional'
    ? 'partially_implemented'
    : 'detected';
  return plannedState === 'required' || plannedState === 'planned' || plannedState === 'optional'
    ? 'missing'
    : 'unknown';
}

function combineActualState(
  manifestState: ActualCapabilityState | undefined,
  liveState: ActualCapabilityState,
): ActualCapabilityState {
  if (liveState !== 'unknown') return liveState;
  return manifestState ?? 'unknown';
}

function combineCapabilityState(
  plannedState: PlannedCapabilityState,
  actualState: ActualCapabilityState,
): CombinedCapabilityState {
  if (plannedState === 'deferred') return 'deferred';
  if (actualState === 'implemented' || actualState === 'detected' || actualState === 'partially_implemented') {
    return 'implemented';
  }
  if (plannedState === 'required' || plannedState === 'planned' || plannedState === 'optional') {
    return 'planned';
  }
  return 'unknown';
}

function getPlannedStateFromDecision(
  decision: CapabilityDecision | undefined,
): PlannedCapabilityState {
  return decision?.plannedState ?? 'not_planned';
}

function buildCapabilityViews(
  files: Record<string, string>,
  trackedCapabilityIds: string[],
  draftSnapshot: ArchitectureSnapshot | null,
  actualSnapshot: ArchitectureSnapshot | null,
  language: string,
): CapabilityView[] {
  const manifestEntries = new Map<string, CapabilityManifestEntry>();
  draftSnapshot?.capabilityManifest?.capabilities.forEach(entry => {
    manifestEntries.set(entry.capabilityId, entry);
  });

  const actualManifestEntries = new Map<string, CapabilityManifestEntry>();
  actualSnapshot?.capabilityManifest?.capabilities.forEach(entry => {
    actualManifestEntries.set(entry.capabilityId, entry);
  });

  const draftCapabilityDecisions = new Map<string, CapabilityDecision>();
  draftSnapshot?.capabilityDecisions.forEach(entry => {
    if (!draftCapabilityDecisions.has(entry.capabilityId)) {
      draftCapabilityDecisions.set(entry.capabilityId, entry);
    }
  });

  const actualCapabilityDecisions = new Map<string, CapabilityDecision>();
  actualSnapshot?.capabilityDecisions.forEach(entry => {
    if (!actualCapabilityDecisions.has(entry.capabilityId)) {
      actualCapabilityDecisions.set(entry.capabilityId, entry);
    }
  });

  return trackedCapabilityIds
    .map(capabilityId => {
      const plannedEntry = manifestEntries.get(capabilityId);
      const actualEntry = actualManifestEntries.get(capabilityId);
      const plannedDecision = draftCapabilityDecisions.get(capabilityId);
      const actualDecision = actualCapabilityDecisions.get(capabilityId);
      const plannedState = plannedEntry?.plannedState
        ?? actualEntry?.plannedState
        ?? getPlannedStateFromDecision(plannedDecision)
        ?? getPlannedStateFromDecision(actualDecision);
      const liveState = detectLiveCapabilityState(files, capabilityId, plannedState);
      const actualState = combineActualState(
        actualEntry?.actualState ?? actualDecision?.actualState ?? plannedEntry?.actualState ?? plannedDecision?.actualState,
        liveState,
      );
      return {
        id: capabilityId,
        title: plannedEntry?.title ?? actualEntry?.title ?? getCapabilityTitle(capabilityId, language),
        description: plannedEntry?.description ?? actualEntry?.description,
        plannedState,
        actualState,
        combinedState: combineCapabilityState(plannedState, actualState),
        source: actualEntry?.source ?? plannedEntry?.source ?? 'derived',
      } satisfies CapabilityView;
    })
    .sort((a, b) => {
      const order: Record<CombinedCapabilityState, number> = {
        implemented: 0,
        planned: 1,
        deferred: 2,
        unknown: 3,
      };
      return order[a.combinedState] - order[b.combinedState] || a.title.localeCompare(b.title);
    });
}

function buildStepView(
  step: PlanStep,
  capabilities: CapabilityView[],
  actualStep?: PlanStep | null,
): PlanStepView {
  const capabilityStates = step.plannedCapabilityIds
    .map(capabilityId => capabilities.find(capability => capability.id === capabilityId))
    .filter((capability): capability is CapabilityView => Boolean(capability));

  let state: PlanStepView['state'] = actualStep?.implementationState ?? step.implementationState;
  if (state !== 'deferred' && capabilityStates.length > 0) {
    const implementedCount = capabilityStates.filter(capability =>
      capability.actualState === 'implemented' || capability.actualState === 'detected',
    ).length;
    const partialCount = capabilityStates.filter(capability => capability.actualState === 'partially_implemented').length;
    if (implementedCount === capabilityStates.length) state = 'implemented';
    else if (implementedCount > 0 || partialCount > 0) state = 'in_progress';
    else state = 'planned';
  }

  return {
    id: step.id,
    title: step.title,
    summary: step.summary,
    state,
    capabilityIds: step.plannedCapabilityIds,
  };
}

function statusBucket(status: ArchitectureStatus): 'accepted' | 'open' | 'superseded' | null {
  if (status === 'accepted') return 'accepted';
  if (status === 'superseded') return 'superseded';
  if (status === 'open' || status === 'proposed') return 'open';
  return null;
}

function buildSourceMeta(
  copy: ArchitectCopy,
  source?: ArchitectureMemorySource,
  chatLink?: BranchConversationLinkage,
): string[] {
  if (chatLink) {
    return [
      `${copy.source}: ${copy.branchConversation}`,
      `${copy.message}: ${chatLink.messageId}`,
      `${copy.thread}: ${chatLink.chatThreadId}`,
    ];
  }

  return [`${copy.source}: ${copy.architectMemory}`];
}

function buildDecisionViews(
  copy: ArchitectCopy,
  draftSnapshot: ArchitectureSnapshot | null,
  actualSnapshot: ArchitectureSnapshot | null,
  capabilities: CapabilityView[],
): BranchArchitectureViewModel['decisions'] {
  const capabilityTitles = new Map(capabilities.map(capability => [capability.id, capability.title]));
  const mapCapabilityTitles = (ids: string[]) => ids
    .map(id => capabilityTitles.get(id) ?? id)
    .join(', ') || '—';
  const capabilityDecisions = uniqueById([
    ...(draftSnapshot?.capabilityDecisions ?? []),
    ...(actualSnapshot?.capabilityDecisions ?? []),
  ]);
  const architectureDecisions = uniqueById([
    ...(draftSnapshot?.architectureDecisions ?? []),
    ...(actualSnapshot?.architectureDecisions ?? []),
  ]);
  const constraints = uniqueById([
    ...(draftSnapshot?.constraints ?? []),
    ...(actualSnapshot?.constraints ?? []),
  ]);
  const openQuestions = uniqueById([
    ...(draftSnapshot?.openQuestions ?? []),
    ...(actualSnapshot?.openQuestions ?? []),
  ]);

  const decisionGroups: BranchArchitectureViewModel['decisions'] = {
    accepted: [],
    open: [],
    superseded: [],
  };

  capabilityDecisions.forEach(decision => {
    const bucket = statusBucket(decision.status);
    if (!bucket) return;
    decisionGroups[bucket].push({
      id: decision.id,
      title: decision.title,
      summary: decision.summary,
      status: decision.status,
      type: 'capability',
      meta: [
        `${copy.capabilityType}: ${capabilityTitles.get(decision.capabilityId) ?? decision.capabilityId}`,
        `${copy.status}: ${localizePlannedState(copy, decision.plannedState)} / ${localizeActualState(copy, decision.actualState)}`,
        ...buildSourceMeta(copy, decision.source, decision.chatLink),
      ],
    });
  });

  architectureDecisions.forEach(decision => {
    const bucket = statusBucket(decision.status);
    if (!bucket) return;
    decisionGroups[bucket].push({
      id: decision.id,
      title: decision.title,
      summary: decision.summary,
      status: decision.status,
      type: 'architecture',
      meta: [
        `${copy.architectureType}: ${decision.category}`,
        `${copy.affectedCapabilities}: ${mapCapabilityTitles(decision.affectedCapabilityIds)}`,
        ...buildSourceMeta(copy, decision.source, decision.chatLink),
      ],
    });
  });

  constraints.forEach(constraint => {
    const bucket = statusBucket(constraint.status);
    if (!bucket) return;
    decisionGroups[bucket].push({
      id: constraint.id,
      title: constraint.title,
      summary: constraint.summary,
      status: constraint.status,
      type: 'constraint',
      meta: [
        `${copy.constraintType}: ${constraint.constraintType}`,
        `${copy.affectedCapabilities}: ${mapCapabilityTitles(constraint.affectedCapabilityIds ?? [])}`,
        ...buildSourceMeta(copy, constraint.source, constraint.chatLink),
      ],
    });
  });

  openQuestions.forEach(question => {
    const bucket = statusBucket(question.status);
    if (!bucket) return;
    decisionGroups[bucket].push({
      id: question.id,
      title: question.title,
      summary: question.summary,
      status: question.status,
      type: 'question',
      meta: [
        `${copy.questionType}: ${copy.open}`,
        `${copy.affectedCapabilities}: ${mapCapabilityTitles(question.affectedCapabilityIds)}`,
        ...buildSourceMeta(copy, question.source, question.chatLink),
      ],
    });
  });

  (Object.keys(decisionGroups) as Array<keyof typeof decisionGroups>).forEach(key => {
    decisionGroups[key].sort((a, b) => a.title.localeCompare(b.title));
  });

  return decisionGroups;
}

function buildDeferredItems(
  copy: ArchitectCopy,
  draftSnapshot: ArchitectureSnapshot | null,
  actualSnapshot: ArchitectureSnapshot | null,
): DeferredItemView[] {
  return uniqueById([
    ...(draftSnapshot?.deferredItems ?? []),
    ...(actualSnapshot?.deferredItems ?? []),
  ]).map(item => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    status: item.status,
    reason: item.reason,
    untilPhase: item.deferredUntilPhase,
    capabilityIds: item.relatedCapabilityIds,
    meta: buildSourceMeta(copy, item.source, item.chatLink),
  }));
}

function buildActualStateSummary(
  copy: ArchitectCopy,
  files: Record<string, string>,
  capabilities: CapabilityView[],
  language: string,
): ActualStateSummaryView {
  const routes = extractRoutes(files);
  const packages = detectPackages(files);
  const envVars = [...detectEnvVars(files).keys()];
  const totalLines = Object.values(files).reduce((sum, content) => sum + content.split(/\r?\n/).length, 0);
  const implementedCount = capabilities.filter(capability =>
    capability.actualState === 'implemented' || capability.actualState === 'detected' || capability.actualState === 'partially_implemented',
  ).length;
  const keyFiles = Object.keys(files)
    .sort((a, b) => {
      const score = (path: string) => {
        const normalized = path.toLowerCase();
        if (/(^|\/)(app|main)\.(tsx?|jsx?)$/.test(normalized)) return 0;
        if (/package\.json$/.test(normalized)) return 1;
        if (/(^|\/)(src\/)?pages\//.test(normalized)) return 2;
        if (/(auth|login|session|supabase|api|router|route)/.test(normalized)) return 3;
        return 4;
      };
      return score(a) - score(b) || a.localeCompare(b);
    })
    .slice(0, 6);
  const surfaces = capabilities
    .filter(capability =>
      capability.actualState === 'implemented'
      || capability.actualState === 'detected'
      || capability.actualState === 'partially_implemented',
    )
    .sort((a, b) => {
      const order: Record<ActualCapabilityState, number> = {
        implemented: 0,
        detected: 1,
        partially_implemented: 2,
        missing: 3,
        unknown: 4,
      };
      return order[a.actualState] - order[b.actualState] || a.title.localeCompare(b.title);
    })
    .slice(0, 8)
    .map(capability => ({
      id: capability.id,
      title: capability.title,
      state: capability.actualState,
    }));

  return {
    narrative: copy.realitySummary({
      files: Object.keys(files).length,
      routes: routes.length,
      packages: packages.length,
      implemented: implementedCount,
    }),
    facts: [
      { label: copy.files, value: String(Object.keys(files).length) },
      { label: copy.routes, value: String(routes.length) },
      { label: copy.packages, value: String(packages.length) },
      { label: copy.envVars, value: String(envVars.length) },
      { label: copy.implementedCapabilities, value: String(implementedCount) },
      { label: 'LOC', value: new Intl.NumberFormat(language).format(totalLines) },
    ],
    routes,
    packages: packages.sort((a, b) => a.localeCompare(b)),
    envVars: envVars.sort((a, b) => a.localeCompare(b)),
    keyFiles,
    surfaces,
  };
}

function buildPlanReality(
  copy: ArchitectCopy,
  plan: BranchArchitectureViewModel['plan'],
  capabilities: CapabilityView[],
  decisions: BranchArchitectureViewModel['decisions'],
): BranchArchitectureViewModel['planVsReality'] {
  const capabilityTitles = new Map(capabilities.map(capability => [capability.id, capability.title]));
  return {
    plannedNotImplemented: uniqueById([
      ...capabilities
        .filter(capability =>
          (capability.plannedState === 'required' || capability.plannedState === 'planned' || capability.plannedState === 'optional')
          && capability.actualState !== 'implemented'
          && capability.actualState !== 'detected'
          && capability.actualState !== 'partially_implemented',
        )
        .map(capability => ({
          id: `planned-gap:${capability.id}`,
          title: capability.title,
          summary: `${localizePlannedState(copy, capability.plannedState)} -> ${localizeActualState(copy, capability.actualState)}`,
        })),
      ...(plan?.steps ?? [])
        .filter(step => step.state !== 'implemented' && step.state !== 'deferred')
        .map(step => ({
          id: `planned-step-gap:${step.id}`,
          title: step.title,
          summary: `${copy.currentPlan}: ${localizePlanStepState(copy, step.state)}${step.capabilityIds.length > 0
            ? ` — ${step.capabilityIds.map(capabilityId => capabilityTitles.get(capabilityId) ?? capabilityId).join(', ')}`
            : ''}`,
        })),
    ]),
    implementedNotPlanned: capabilities
      .filter(capability =>
        (capability.plannedState === 'not_planned' || capability.plannedState === 'deferred')
        && (
          capability.actualState === 'implemented'
          || capability.actualState === 'detected'
          || capability.actualState === 'partially_implemented'
        ),
      )
      .map(capability => ({
        id: `reality-gap:${capability.id}`,
        title: capability.title,
        summary: `${localizePlannedState(copy, capability.plannedState)} -> ${localizeActualState(copy, capability.actualState)}`,
      })),
    supersededDecisions: decisions.superseded,
  };
}

function buildGenerationTrustView(
  copy: ArchitectCopy,
  guidance: ReturnType<typeof buildBranchGenerationGuidance>,
  language: string,
): GenerationTrustView {
  const trust = buildBranchTrustUiSummary(guidance, language);

  return {
    mode: trust.mode,
    modeLabel: trust.modeLabel,
    trustBasis: trust.trustBasis,
    trustLabel: trust.trustLabel,
    summary: trust.summary,
    conflictHandling: trust.conflictHandling,
    conflictLabel: trust.conflictLabel,
    conflictSummary: trust.conflictSummary,
    indicators: trust.indicators,
  };
}

function localizePlannedState(copy: ArchitectCopy, value: PlannedCapabilityState): string {
  switch (value) {
    case 'required':
      return copy.required;
    case 'planned':
      return copy.planned;
    case 'optional':
      return copy.optional;
    case 'deferred':
      return copy.deferred;
    case 'not_planned':
    default:
      return copy.notPlanned;
  }
}

function localizeActualState(copy: ArchitectCopy, value: ActualCapabilityState): string {
  switch (value) {
    case 'implemented':
      return copy.implemented;
    case 'detected':
      return copy.detected;
    case 'partially_implemented':
      return copy.partial;
    case 'missing':
      return copy.missing;
    case 'unknown':
    default:
      return copy.unknown;
  }
}

function localizePlanStepState(copy: ArchitectCopy, value: PlanStepView['state']): string {
  switch (value) {
    case 'implemented':
      return copy.implemented;
    case 'deferred':
      return copy.deferred;
    case 'blocked':
      return copy.missing;
    case 'in_progress':
      return copy.partial;
    case 'planned':
    default:
      return copy.planned;
  }
}

function buildStateCounts(capabilities: CapabilityView[]): Record<CombinedCapabilityState, number> {
  return capabilities.reduce<Record<CombinedCapabilityState, number>>((counts, capability) => {
    counts[capability.combinedState] += 1;
    return counts;
  }, {
    planned: 0,
    implemented: 0,
    deferred: 0,
    unknown: 0,
  });
}

function getBranchArchitecture(project: ProjectRecord): { branchId: string; architecture: ProjectBranchArchitecture | null; files: Record<string, string> } {
  const branchId = project.activeBranchId ?? 'main';
  const branch = project.branches?.[branchId];
  return {
    branchId,
    architecture: branch?.architecture ?? null,
    files: branch?.files ?? project.files ?? {},
  };
}

export function buildBranchArchitectureViewModel(
  project: ProjectRecord,
  language: string,
): BranchArchitectureViewModel | null {
  const copy = getArchitectCopy(language);
  const { branchId, architecture, files } = getBranchArchitecture(project);
  if (!architecture) return null;

  const draftSnapshot = resolvePhaseSnapshot(architecture, 'pre_build_draft');
  const actualSnapshot = resolvePhaseSnapshot(architecture, 'post_build_actual');
  const branchBrief = actualSnapshot?.branchBrief ?? draftSnapshot?.branchBrief ?? architecture.branch;
  const trackedCapabilityIds = getTrackedCapabilityIds(architecture, draftSnapshot, actualSnapshot, files);
  const capabilities = buildCapabilityViews(files, trackedCapabilityIds, draftSnapshot, actualSnapshot, language);
  const actualPlanSteps = new Map(
    (actualSnapshot?.implementationPlan?.steps ?? []).map(step => [step.id, step] as const),
  );
  const plan = draftSnapshot?.implementationPlan
    ? {
        title: draftSnapshot.implementationPlan.title,
        summary: draftSnapshot.implementationPlan.summary,
        steps: draftSnapshot.implementationPlan.steps.map(step =>
          buildStepView(step, capabilities, actualPlanSteps.get(step.id)),
        ),
      }
    : null;
  const decisions = buildDecisionViews(copy, draftSnapshot, actualSnapshot, capabilities);
  const guidance = buildBranchGenerationGuidance(architecture, files, language);

  return {
    copy,
    header: {
      projectName: project.name,
      branchName: branchBrief?.branchName ?? branchId,
      branchId,
      summary: branchBrief?.summary || copy.noBranchBody,
      status: branchBrief?.status ?? 'open',
      revisionId: actualSnapshot?.basedOnRevisionId ?? branchBrief?.headRevisionId ?? null,
      snapshotLabel: actualSnapshot
        ? PHASE_LABELS[actualSnapshot.phase]
        : draftSnapshot
          ? PHASE_LABELS[draftSnapshot.phase]
          : 'none',
      updatedAt: formatDate(actualSnapshot?.createdAt ?? draftSnapshot?.createdAt ?? architecture.updatedAt, language),
    },
    generationTrust: buildGenerationTrustView(copy, guidance, language),
    branchReality: guidance?.reality ?? null,
    stateCounts: buildStateCounts(capabilities),
    plan,
    capabilities,
    decisions,
    deferredItems: buildDeferredItems(copy, draftSnapshot, actualSnapshot),
    actualStateSummary: buildActualStateSummary(copy, files, capabilities, language),
    suggestedNextStep: guidance?.suggestedNextStep ?? null,
    planVsReality: buildPlanReality(copy, plan, capabilities, decisions),
  };
}
