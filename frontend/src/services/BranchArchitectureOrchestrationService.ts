import {
  ARCHITECTURE_MEMORY_MODEL_VERSION,
  createArchitectureSnapshotFromBranchArchitecture,
  fileMapToProjectGraph,
  getCurrentArchitectureDecisions,
  upsertArchitectureSnapshot,
  validateAllRouteLayers,
  type ActualCapabilityState,
  type ArchitectureConstraint,
  type ArchitectureDecision,
  type ArchitectureSnapshot,
  type CapabilityDecision,
  type CapabilityManifest,
  type CapabilityManifestEntry,
  type DeferredItem,
  type ImplementationPlan,
  type PlanStep,
  type PlanStepStatus,
  type PlannedCapabilityState,
  type ProjectBranchArchitecture,
  type RouteDriftEntry,
} from '../shared/projectModel';
import { normalizeAppLanguage, type SupportedAppLanguage } from '../shared/appLanguage';
import { MANIFEST_PATH, parseManifest } from './RouteManifestService';

type SupportedLanguage = SupportedAppLanguage;
type StepState = 'planned' | 'in_progress' | 'implemented' | 'blocked' | 'deferred';
type StudioGenerationMode = 'landing' | 'app' | 'superapp';
type BranchAlignmentState = 'aligned' | 'partial' | 'drifted';

type CapabilityDetector = {
  title: Record<SupportedLanguage, string>;
  patterns: RegExp[];
};

export interface BranchRealityItem {
  id: string;
  title: string;
  summary: string;
}

export interface BranchRealityRoute {
  id: string;
  title: string;
  path: string;
  filePath: string;
}

type CopyShape = {
  promptTitle: string;
  branchBrief: string;
  acceptedDecisions: string;
  activeConstraints: string;
  currentStep: string;
  focusCapabilities: string;
  acceptedNotImplemented: string;
  deferredOutOfScope: string;
  actualState: string;
  hardRule: string;
  none: string;
  actualSummary: (stats: { implemented: number; remaining: number; deferred: number }) => string;
  nextStepHeading: string;
  nextStepStepSummary: (title: string, capabilities: string[]) => string;
  nextStepCapabilitySummary: (title: string) => string;
  nextStepReconcileTitle: (title: string) => string;
  nextStepReconcileSummary: (title: string) => string;
  nextStepDeferredSummary: (title: string) => string;
  nextStepDoneTitle: string;
  nextStepDoneSummary: string;
  reasonCurrentPlan: string;
  reasonPlanGap: string;
  reasonActualGap: string;
  reasonDeferredBacklog: string;
  promptOperatingMode: string;
  promptTrustBasis: string;
  promptConflictHandling: string;
  promptStatusIndicators: string;
  promptConflictDetails: string;
  promptModeRule: string;
  proposedDecisions: string;
  proposedConstraints: string;
  modeFastPrototype: string;
  modeArchitectGuided: string;
  modeProposedExperiment: string;
  trustAcceptedArchitecture: string;
  trustProposedGuidance: string;
  trustObservedState: string;
  indicatorDeferredExcluded: string;
  conflictOverrideRequest: string;
  conflictReviseArchitecture: string;
  conflictProposedExperiment: string;
  modeRuleAuthoritative: string;
  modeRuleProposed: string;
  modeRuleFast: string;
  summaryFastPrototype: string;
  summaryAcceptedArchitecture: string;
  summaryProposedGuidance: string;
  conflictSummaryOverride: (titles: string) => string;
  conflictSummaryExperiment: (titles: string) => string;
  conflictSummaryRevision: (titles: string) => string;
  realityTitle: string;
  realityAlignedLabel: string;
  realityMissingLabel: string;
  realityDriftingLabel: string;
  realityNextPassLabel: string;
  realityStateAligned: string;
  realityStatePartial: string;
  realityStateDrifted: string;
  realitySummaryAligned: (stats: { aligned: number }) => string;
  realitySummaryPartial: (stats: { aligned: number; missing: number }) => string;
  realitySummaryDrifted: (stats: { missing: number; drifting: number }) => string;
  realityEmptyAligned: string;
  realityEmptyMissing: string;
  realityEmptyDrifting: string;
  realityPlannedRouteImplemented: (path: string) => string;
  realityPlannedRouteMissing: (path: string) => string;
  realityUntrackedRoute: (path: string) => string;
  realityDecisionReflected: string;
  realityDecisionNotReflected: (titles: string) => string;
  realityDeferredOverride: string;
  realityTechnologyOverride: (found: string, expected: string) => string;
  realityRouteMismatch: (path: string) => string;
  realityRouteMetadataLag: (path: string) => string;
  realityRouteMetadataOnly: (path: string) => string;
  realityOrphanPage: string;
  realityRuntimeOnlyRoute: (path: string) => string;
  realityNextPassMissingRoute: (title: string) => string;
  realityNextPassDecision: (title: string) => string;
  realityNextPassDrift: (title: string) => string;
};

export interface BranchRealityUiSummary {
  sectionTitle: string;
  stateLabel: string;
  summary: string;
  alignedLabel: string;
  alignedItems: BranchRealityItem[];
  alignedEmpty: string;
  missingLabel: string;
  missingItems: BranchRealityItem[];
  missingEmpty: string;
  driftingLabel: string;
  driftingItems: BranchRealityItem[];
  driftingEmpty: string;
  nextPassLabel: string;
  nextPassTitle: string;
  nextPassSummary: string;
}

export interface BranchRealitySummary {
  state: BranchAlignmentState;
  plannedScreensImplemented: BranchRealityRoute[];
  plannedScreensMissing: BranchRealityRoute[];
  untrackedImplementedRoutes: BranchRealityRoute[];
  decisionsNotReflected: BranchRealityItem[];
  overridingImplementation: BranchRealityItem[];
  routeDrifts: RouteDriftEntry[];
  alignedItems: BranchRealityItem[];
  missingItems: BranchRealityItem[];
  driftingItems: BranchRealityItem[];
  nextPass: SuggestedNextStep;
  ui: BranchRealityUiSummary;
}

const COPY: Record<SupportedLanguage, CopyShape> = {
  en: {
    promptTitle: 'Current branch architecture guidance',
    branchBrief: 'Branch brief',
    acceptedDecisions: 'Accepted decisions',
    activeConstraints: 'Active constraints',
    currentStep: 'Current implementation step',
    focusCapabilities: 'Capabilities to focus in this build',
    acceptedNotImplemented: 'Accepted but not fully implemented',
    deferredOutOfScope: 'Keep these deferred items out of scope',
    actualState: 'Observed current state',
    hardRule: 'Treat deferred items as out of scope unless the user explicitly reactivates them in this branch.',
    none: 'None',
    actualSummary: ({ implemented, remaining, deferred }) =>
      `Current branch state: ${implemented} accepted capabilities are implemented, ${remaining} accepted capabilities still need work, and ${deferred} items remain deferred.`,
    nextStepHeading: 'Suggested next step',
    nextStepStepSummary: (title, capabilities) =>
      `Continue the active implementation step "${title}"${capabilities.length > 0 ? ` to close ${capabilities.join(', ')}` : ''}.`,
    nextStepCapabilitySummary: title =>
      `Implement the accepted capability "${title}" next because it is still missing from the current branch state.`,
    nextStepReconcileTitle: title => `Reconcile ${title} with branch memory`,
    nextStepReconcileSummary: title =>
      `"${title}" is present in the branch state but not planned in branch memory. Reconcile the plan before expanding scope.`,
    nextStepDeferredSummary: title =>
      `The accepted branch scope is covered. If you want to expand intentionally, explicitly reactivate the deferred backlog item "${title}".`,
    nextStepDoneTitle: 'No grounded next step',
    nextStepDoneSummary: 'The accepted scope appears implemented and there are no unresolved branch-aware gaps right now.',
    reasonCurrentPlan: 'Based on the current implementation plan',
    reasonPlanGap: 'Based on accepted capabilities that are still missing',
    reasonActualGap: 'Based on a plan-vs-reality mismatch in the current branch',
    reasonDeferredBacklog: 'Based on deferred backlog that must stay opt-in',
    promptOperatingMode: 'Architect operating mode',
    promptTrustBasis: 'Trust basis',
    promptConflictHandling: 'Conflict handling',
    promptStatusIndicators: 'Status indicators',
    promptConflictDetails: 'Conflict details',
    promptModeRule: 'Mode rule',
    proposedDecisions: 'Proposed draft decisions',
    proposedConstraints: 'Proposed draft constraints',
    modeFastPrototype: 'Fast prototype mode',
    modeArchitectGuided: 'Architect-guided mode',
    modeProposedExperiment: 'Proposed experiment mode',
    trustAcceptedArchitecture: 'Using accepted branch architecture',
    trustProposedGuidance: 'Using proposed draft guidance',
    trustObservedState: 'Using observed branch state',
    indicatorDeferredExcluded: 'Deferred items excluded from scope',
    conflictOverrideRequest: 'Override request',
    conflictReviseArchitecture: 'Architecture revision path',
    conflictProposedExperiment: 'Proposed experiment',
    modeRuleAuthoritative: 'Accepted branch architecture is authoritative for this build. Do not silently contradict accepted decisions or constraints. Handle conflicts explicitly as overrides or architecture revisions.',
    modeRuleProposed: 'This run is using proposed draft guidance rather than accepted branch truth. Keep the build visibly experimental and do not present draft decisions as accepted architecture.',
    modeRuleFast: 'Keep this request lightweight. Use branch architecture as compatibility context when helpful, but do not force heavyweight planning for a small prototype request.',
    summaryFastPrototype: 'Fast prototype mode is active. Branch architecture stays lightweight and only helps with compatibility.',
    summaryAcceptedArchitecture: 'Accepted branch architecture is actively guiding this build.',
    summaryProposedGuidance: 'Proposed draft guidance is active for this run and remains exploratory until accepted.',
    conflictSummaryOverride: titles => `Conflicts with accepted branch architecture: ${titles}. Treating this run as an override request.`,
    conflictSummaryExperiment: titles => `Conflicts with accepted branch architecture: ${titles}. Treating this run as a proposed experiment.`,
    conflictSummaryRevision: titles => `Conflicts with accepted branch architecture: ${titles}. Treating this run as an architecture revision path.`,
    realityTitle: 'Branch reality',
    realityAlignedLabel: 'Aligned',
    realityMissingLabel: 'Missing',
    realityDriftingLabel: 'Drifting',
    realityNextPassLabel: 'Next pass',
    realityStateAligned: 'Aligned',
    realityStatePartial: 'Partial',
    realityStateDrifted: 'Drifted',
    realitySummaryAligned: ({ aligned }) =>
      `Branch reality is aligned. ${aligned} tracked items match the current branch.`,
    realitySummaryPartial: ({ aligned, missing }) =>
      `Branch reality is partial. ${aligned} tracked items align, and ${missing} still need implementation.`,
    realitySummaryDrifted: ({ missing, drifting }) =>
      `Branch reality is drifted. ${missing} planned items are missing and ${drifting} drift signals need review.`,
    realityEmptyAligned: 'Nothing is confirmed as aligned yet.',
    realityEmptyMissing: 'No planned gaps are visible right now.',
    realityEmptyDrifting: 'No drift signals are visible right now.',
    realityPlannedRouteImplemented: path => `Planned route is live at ${path}.`,
    realityPlannedRouteMissing: path => `Planned route is still missing at ${path}.`,
    realityUntrackedRoute: path => `Implemented route ${path} is not tracked in branch memory.`,
    realityDecisionReflected: 'Branch direction appears in code.',
    realityDecisionNotReflected: titles => `Code still does not reflect: ${titles}.`,
    realityDeferredOverride: 'Deferred scope appears implemented in code.',
    realityTechnologyOverride: (found, expected) => `Code points to ${found}, which may override the accepted ${expected} direction.`,
    realityRouteMismatch: path => `Route wiring disagrees around ${path}.`,
    realityRouteMetadataLag: path => `Route metadata is behind the branch route at ${path}.`,
    realityRouteMetadataOnly: path => `Route metadata mentions ${path}, but the branch graph does not.`,
    realityOrphanPage: 'A page file exists without tracked routing.',
    realityRuntimeOnlyRoute: path => `Runtime route ${path} is not tracked in the branch graph.`,
    realityNextPassMissingRoute: title => `Implement the planned screen "${title}" in the next pass.`,
    realityNextPassDecision: title => `Bring the code in line with "${title}" in the next pass.`,
    realityNextPassDrift: title => `Reconcile branch drift around "${title}" before expanding scope.`,
  },
  ru: {
    promptTitle: 'Архитектурные указания для текущей ветки',
    branchBrief: 'Кратко по ветке',
    acceptedDecisions: 'Принятые решения',
    activeConstraints: 'Активные ограничения',
    currentStep: 'Текущий шаг реализации',
    focusCapabilities: 'На чём сфокусировать эту сборку',
    acceptedNotImplemented: 'Принято, но ещё не реализовано полностью',
    deferredOutOfScope: 'Держать вне активного scope',
    actualState: 'Наблюдаемое текущее состояние',
    hardRule: 'Считай отложенные пункты вне scope, пока пользователь явно не реактивирует их для этой ветки.',
    none: 'Нет',
    actualSummary: ({ implemented, remaining, deferred }) =>
      `Текущее состояние ветки: реализовано ${implemented} принятых возможностей, ещё ${remaining} требуют работы, отложенными остаются ${deferred}.`,
    nextStepHeading: 'Рекомендуемый следующий шаг',
    nextStepStepSummary: (title, capabilities) =>
      `Продолжить активный шаг плана «${title}»${capabilities.length > 0 ? `, чтобы закрыть ${capabilities.join(', ')}` : ''}.`,
    nextStepCapabilitySummary: title =>
      `Следом реализовать принятую возможность «${title}», потому что её ещё не видно в текущем состоянии ветки.`,
    nextStepReconcileTitle: title => `Сверить «${title}» с памятью ветки`,
    nextStepReconcileSummary: title =>
      `«${title}» уже видно в фактическом состоянии ветки, но этого нет в текущем плане. Сначала сверить память ветки с реальностью.`,
    nextStepDeferredSummary: title =>
      `Принятый scope ветки уже закрыт. Если хотите расширять scope осознанно, явно реактивируйте отложенный пункт «${title}».`,
    nextStepDoneTitle: 'Заземлённого следующего шага нет',
    nextStepDoneSummary: 'Похоже, что принятый scope уже реализован и явных branch-aware разрывов сейчас нет.',
    reasonCurrentPlan: 'Основано на текущем плане реализации',
    reasonPlanGap: 'Основано на принятых возможностях, которые ещё не закрыты',
    reasonActualGap: 'Основано на расхождении между планом и реальностью в текущей ветке',
    reasonDeferredBacklog: 'Основано на отложенном backlog, который должен подключаться только явно',
    promptOperatingMode: 'Режим архитектора',
    promptTrustBasis: 'Основа доверия',
    promptConflictHandling: 'Обработка конфликта',
    promptStatusIndicators: 'Индикаторы статуса',
    promptConflictDetails: 'Детали конфликта',
    promptModeRule: 'Правило режима',
    proposedDecisions: 'Предложенные draft-решения',
    proposedConstraints: 'Предложенные draft-ограничения',
    modeFastPrototype: 'Режим быстрого прототипа',
    modeArchitectGuided: 'Архитектурный режим ветки',
    modeProposedExperiment: 'Режим предложенного эксперимента',
    trustAcceptedArchitecture: 'Используется принятая архитектура ветки',
    trustProposedGuidance: 'Используются предложенные draft-указания',
    trustObservedState: 'Используется наблюдаемое состояние ветки',
    indicatorDeferredExcluded: 'Отложенные пункты исключены из scope',
    conflictOverrideRequest: 'Запрос на override',
    conflictReviseArchitecture: 'Путь пересмотра архитектуры',
    conflictProposedExperiment: 'Предложенный эксперимент',
    modeRuleAuthoritative: 'Принятая архитектура ветки является авторитетной для этой сборки. Не противоречь принятым решениям и ограничениям молча. Любые конфликты оформляй явно как override или пересмотр архитектуры.',
    modeRuleProposed: 'Этот запуск опирается на предложенный draft, а не на принятую branch truth. Явно показывай экспериментальный характер и не выдавай draft-решения за принятую архитектуру.',
    modeRuleFast: 'Сохраняй запрос лёгким. Используй архитектуру ветки как контекст совместимости, когда это полезно, но не навязывай тяжёлое планирование для небольшого прототипа.',
    summaryFastPrototype: 'Активен режим быстрого прототипа. Архитектура ветки остаётся лёгким контекстом совместимости.',
    summaryAcceptedArchitecture: 'Эту сборку направляет принятая архитектура ветки.',
    summaryProposedGuidance: 'Для этого запуска активны предложенные draft-указания, поэтому режим остаётся исследовательским до принятия.',
    conflictSummaryOverride: titles => `Есть конфликт с принятой архитектурой ветки: ${titles}. Этот запуск трактуется как override-запрос.`,
    conflictSummaryExperiment: titles => `Есть конфликт с принятой архитектурой ветки: ${titles}. Этот запуск трактуется как предложенный эксперимент.`,
    conflictSummaryRevision: titles => `Есть конфликт с принятой архитектурой ветки: ${titles}. Этот запуск трактуется как путь пересмотра архитектуры.`,
    realityTitle: 'Реальность ветки',
    realityAlignedLabel: 'Совпадает',
    realityMissingLabel: 'Не хватает',
    realityDriftingLabel: 'Дрейфует',
    realityNextPassLabel: 'Следующий проход',
    realityStateAligned: 'Совпадает',
    realityStatePartial: 'Частично',
    realityStateDrifted: 'Дрейфует',
    realitySummaryAligned: ({ aligned }) =>
      `Реальность ветки совпадает. ${aligned} отслеживаемых пунктов соответствуют текущей ветке.`,
    realitySummaryPartial: ({ aligned, missing }) =>
      `Реальность ветки частичная. ${aligned} пунктов совпадают, ещё ${missing} требуют реализации.`,
    realitySummaryDrifted: ({ missing, drifting }) =>
      `Реальность ветки ушла в дрейф. Не хватает ${missing} запланированных пунктов, и ещё ${drifting} сигналов нужно сверить.`,
    realityEmptyAligned: 'Пока нет подтверждённых совпадений.',
    realityEmptyMissing: 'Сейчас не видно запланированных пробелов.',
    realityEmptyDrifting: 'Сигналов дрейфа сейчас не видно.',
    realityPlannedRouteImplemented: path => `Запланированный маршрут уже работает по адресу ${path}.`,
    realityPlannedRouteMissing: path => `Запланированный маршрут ${path} всё ещё отсутствует.`,
    realityUntrackedRoute: path => `Маршрут ${path} реализован, но не отслеживается в памяти ветки.`,
    realityDecisionReflected: 'Направление ветки уже видно в коде.',
    realityDecisionNotReflected: titles => `Код пока не отражает: ${titles}.`,
    realityDeferredOverride: 'Отложенный scope уже проявился в коде.',
    realityTechnologyOverride: (found, expected) => `Код указывает на ${found}, что может переопределять принятое направление ${expected}.`,
    realityRouteMismatch: path => `Маршрут ${path} подключён несогласованно.`,
    realityRouteMetadataLag: path => `Метаданные маршрутов отстают от ветки на ${path}.`,
    realityRouteMetadataOnly: path => `Метаданные упоминают ${path}, но в графе ветки его нет.`,
    realityOrphanPage: 'Есть файл страницы без отслеживаемой маршрутизации.',
    realityRuntimeOnlyRoute: path => `Runtime-маршрут ${path} не отражён в графе ветки.`,
    realityNextPassMissingRoute: title => `В следующем проходе реализовать запланированный экран «${title}».`,
    realityNextPassDecision: title => `В следующем проходе привести код в соответствие с «${title}».`,
    realityNextPassDrift: title => `Сначала сверить дрейф вокруг «${title}», а уже потом расширять scope.`,
  },
  es: {
    promptTitle: 'Guía arquitectónica de la rama actual',
    branchBrief: 'Resumen de la rama',
    acceptedDecisions: 'Decisiones aceptadas',
    activeConstraints: 'Restricciones activas',
    currentStep: 'Paso actual de implementación',
    focusCapabilities: 'Capacidades para enfocar en este build',
    acceptedNotImplemented: 'Aceptado pero aún no implementado por completo',
    deferredOutOfScope: 'Mantener fuera del alcance activo',
    actualState: 'Estado actual observado',
    hardRule: 'Trata los elementos diferidos como fuera de alcance hasta que el usuario los reactive explícitamente en esta rama.',
    none: 'Ninguno',
    actualSummary: ({ implemented, remaining, deferred }) =>
      `Estado actual de la rama: ${implemented} capacidades aceptadas están implementadas, ${remaining} aún requieren trabajo y ${deferred} siguen diferidas.`,
    nextStepHeading: 'Siguiente paso sugerido',
    nextStepStepSummary: (title, capabilities) =>
      `Continúa el paso activo "${title}"${capabilities.length > 0 ? ` para cerrar ${capabilities.join(', ')}` : ''}.`,
    nextStepCapabilitySummary: title =>
      `Implementa ahora la capacidad aceptada "${title}" porque aún falta en el estado actual de la rama.`,
    nextStepReconcileTitle: title => `Conciliar ${title} con la memoria de la rama`,
    nextStepReconcileSummary: title =>
      `"${title}" ya existe en la rama, pero no está planificado en la memoria. Conviene reconciliar el plan antes de ampliar alcance.`,
    nextStepDeferredSummary: title =>
      `El alcance aceptado ya está cubierto. Si quieres ampliar el alcance, reactiva explícitamente el elemento diferido "${title}".`,
    nextStepDoneTitle: 'No hay siguiente paso fundamentado',
    nextStepDoneSummary: 'El alcance aceptado parece implementado y no hay brechas claras entre plan y realidad.',
    reasonCurrentPlan: 'Basado en el plan de implementación actual',
    reasonPlanGap: 'Basado en capacidades aceptadas que aún faltan',
    reasonActualGap: 'Basado en una brecha entre plan y realidad en la rama',
    reasonDeferredBacklog: 'Basado en backlog diferido que debe seguir siendo opt-in',
    promptOperatingMode: 'Modo operativo del Architect',
    promptTrustBasis: 'Base de confianza',
    promptConflictHandling: 'Tratamiento del conflicto',
    promptStatusIndicators: 'Indicadores de estado',
    promptConflictDetails: 'Detalles del conflicto',
    promptModeRule: 'Regla del modo',
    proposedDecisions: 'Decisiones propuestas del borrador',
    proposedConstraints: 'Restricciones propuestas del borrador',
    modeFastPrototype: 'Modo de prototipo rápido',
    modeArchitectGuided: 'Modo guiado por Architect',
    modeProposedExperiment: 'Modo de experimento propuesto',
    trustAcceptedArchitecture: 'Usando arquitectura aceptada de la rama',
    trustProposedGuidance: 'Usando guía propuesta del borrador',
    trustObservedState: 'Usando el estado observado de la rama',
    indicatorDeferredExcluded: 'Elementos diferidos fuera del alcance',
    conflictOverrideRequest: 'Solicitud de override',
    conflictReviseArchitecture: 'Ruta de revisión de arquitectura',
    conflictProposedExperiment: 'Experimento propuesto',
    modeRuleAuthoritative: 'La arquitectura aceptada de la rama es la autoridad para este build. No contradigas en silencio decisiones o restricciones aceptadas. Trata los conflictos explícitamente como overrides o revisiones de arquitectura.',
    modeRuleProposed: 'Esta ejecución usa guía propuesta del borrador en lugar de verdad aceptada de la rama. Mantén visible su carácter experimental y no presentes decisiones de borrador como arquitectura aceptada.',
    modeRuleFast: 'Mantén esta solicitud ligera. Usa la arquitectura de la rama como contexto de compatibilidad cuando ayude, pero no fuerces una planificación pesada para un prototipo pequeño.',
    summaryFastPrototype: 'El modo de prototipo rápido está activo. La arquitectura de la rama solo aporta contexto ligero de compatibilidad.',
    summaryAcceptedArchitecture: 'La arquitectura aceptada de la rama está guiando activamente este build.',
    summaryProposedGuidance: 'La guía propuesta del borrador está activa en esta ejecución y sigue siendo exploratoria hasta que se acepte.',
    conflictSummaryOverride: titles => `Conflicto con la arquitectura aceptada de la rama: ${titles}. Esta ejecución se trata como una solicitud de override.`,
    conflictSummaryExperiment: titles => `Conflicto con la arquitectura aceptada de la rama: ${titles}. Esta ejecución se trata como un experimento propuesto.`,
    conflictSummaryRevision: titles => `Conflicto con la arquitectura aceptada de la rama: ${titles}. Esta ejecución se trata como una ruta de revisión de arquitectura.`,
    realityTitle: 'Realidad de la rama',
    realityAlignedLabel: 'Alineado',
    realityMissingLabel: 'Falta',
    realityDriftingLabel: 'Deriva',
    realityNextPassLabel: 'Siguiente pasada',
    realityStateAligned: 'Alineado',
    realityStatePartial: 'Parcial',
    realityStateDrifted: 'Desviado',
    realitySummaryAligned: ({ aligned }) =>
      `La realidad de la rama está alineada. ${aligned} elementos seguidos coinciden con la rama actual.`,
    realitySummaryPartial: ({ aligned, missing }) =>
      `La realidad de la rama es parcial. ${aligned} elementos coinciden y ${missing} aún faltan por implementar.`,
    realitySummaryDrifted: ({ missing, drifting }) =>
      `La realidad de la rama se desvió. Faltan ${missing} elementos planificados y ${drifting} señales de deriva necesitan revisión.`,
    realityEmptyAligned: 'Todavía no hay elementos confirmados como alineados.',
    realityEmptyMissing: 'Ahora mismo no se ven brechas planificadas.',
    realityEmptyDrifting: 'Ahora mismo no se ven señales de deriva.',
    realityPlannedRouteImplemented: path => `La ruta planificada ya está activa en ${path}.`,
    realityPlannedRouteMissing: path => `La ruta planificada aún falta en ${path}.`,
    realityUntrackedRoute: path => `La ruta implementada ${path} no está seguida en la memoria de la rama.`,
    realityDecisionReflected: 'La dirección de la rama ya se ve en el código.',
    realityDecisionNotReflected: titles => `El código todavía no refleja: ${titles}.`,
    realityDeferredOverride: 'El alcance diferido ya aparece implementado en el código.',
    realityTechnologyOverride: (found, expected) => `El código apunta a ${found}, lo que puede sustituir la dirección aceptada de ${expected}.`,
    realityRouteMismatch: path => `La conexión de rutas no coincide alrededor de ${path}.`,
    realityRouteMetadataLag: path => `Los metadatos de rutas van por detrás en ${path}.`,
    realityRouteMetadataOnly: path => `Los metadatos de rutas mencionan ${path}, pero el grafo de la rama no.`,
    realityOrphanPage: 'Existe un archivo de página sin ruta seguida.',
    realityRuntimeOnlyRoute: path => `La ruta de runtime ${path} no está seguida en el grafo de la rama.`,
    realityNextPassMissingRoute: title => `Implementa la pantalla planificada "${title}" en la siguiente pasada.`,
    realityNextPassDecision: title => `Alinea el código con "${title}" en la siguiente pasada.`,
    realityNextPassDrift: title => `Reconcilia la deriva alrededor de "${title}" antes de ampliar el alcance.`,
  },
  de: {
    promptTitle: 'Architekturhinweise fuer den aktuellen Branch',
    branchBrief: 'Branch-Ueberblick',
    acceptedDecisions: 'Akzeptierte Entscheidungen',
    activeConstraints: 'Aktive Einschraenkungen',
    currentStep: 'Aktueller Implementierungsschritt',
    focusCapabilities: 'Fokus fuer diesen Build',
    acceptedNotImplemented: 'Akzeptiert, aber noch nicht voll umgesetzt',
    deferredOutOfScope: 'Aus dem aktiven Scope heraushalten',
    actualState: 'Beobachteter Ist-Zustand',
    hardRule: 'Behandle zurueckgestellte Punkte als ausserhalb des Scope, bis der Nutzer sie im Branch ausdruecklich reaktiviert.',
    none: 'Keine',
    actualSummary: ({ implemented, remaining, deferred }) =>
      `Aktueller Branch-Zustand: ${implemented} akzeptierte Capabilities sind umgesetzt, ${remaining} brauchen noch Arbeit und ${deferred} bleiben zurueckgestellt.`,
    nextStepHeading: 'Empfohlener naechster Schritt',
    nextStepStepSummary: (title, capabilities) =>
      `Setze den aktiven Schritt "${title}" fort${capabilities.length > 0 ? `, um ${capabilities.join(', ')} zu schliessen` : ''}.`,
    nextStepCapabilitySummary: title =>
      `Setze als Naechstes die akzeptierte Capability "${title}" um, weil sie im aktuellen Branch-Zustand noch fehlt.`,
    nextStepReconcileTitle: title => `${title} mit dem Branch-Speicher abgleichen`,
    nextStepReconcileSummary: title =>
      `"${title}" ist im Branch bereits vorhanden, aber nicht im Plan hinterlegt. Vor Scope-Erweiterung erst den Speicher abgleichen.`,
    nextStepDeferredSummary: title =>
      `Der akzeptierte Scope ist umgesetzt. Wenn du bewusst erweitern willst, reaktiviere den zurueckgestellten Punkt "${title}" explizit.`,
    nextStepDoneTitle: 'Kein belastbarer naechster Schritt',
    nextStepDoneSummary: 'Der akzeptierte Scope wirkt umgesetzt und es gibt aktuell keine klaren Branch-Luecken.',
    reasonCurrentPlan: 'Basiert auf dem aktuellen Implementierungsplan',
    reasonPlanGap: 'Basiert auf akzeptierten, aber noch offenen Capabilities',
    reasonActualGap: 'Basiert auf einer Plan-Ist-Abweichung im aktuellen Branch',
    reasonDeferredBacklog: 'Basiert auf zurueckgestelltem Backlog, das opt-in bleiben muss',
    promptOperatingMode: 'Architect-Modus',
    promptTrustBasis: 'Vertrauensbasis',
    promptConflictHandling: 'Konfliktbehandlung',
    promptStatusIndicators: 'Statusindikatoren',
    promptConflictDetails: 'Konfliktdetails',
    promptModeRule: 'Modusregel',
    proposedDecisions: 'Vorgeschlagene Draft-Entscheidungen',
    proposedConstraints: 'Vorgeschlagene Draft-Einschraenkungen',
    modeFastPrototype: 'Schneller Prototyp-Modus',
    modeArchitectGuided: 'Architect-gefuehrter Modus',
    modeProposedExperiment: 'Vorgeschlagener Experiment-Modus',
    trustAcceptedArchitecture: 'Akzeptierte Branch-Architektur aktiv',
    trustProposedGuidance: 'Vorgeschlagene Draft-Guidance aktiv',
    trustObservedState: 'Beobachteter Branch-Zustand aktiv',
    indicatorDeferredExcluded: 'Zurueckgestellte Punkte aus dem Scope ausgeschlossen',
    conflictOverrideRequest: 'Override-Anfrage',
    conflictReviseArchitecture: 'Architektur-Revisionspfad',
    conflictProposedExperiment: 'Vorgeschlagenes Experiment',
    modeRuleAuthoritative: 'Die akzeptierte Branch-Architektur ist fuer diesen Build verbindlich. Widersprich akzeptierten Entscheidungen oder Einschraenkungen nicht stillschweigend. Behandle Konflikte explizit als Overrides oder Architektur-Revisionen.',
    modeRuleProposed: 'Dieser Lauf nutzt vorgeschlagene Draft-Guidance statt akzeptierter Branch-Wahrheit. Halte den Build sichtbar experimentell und stelle Draft-Entscheidungen nicht als akzeptierte Architektur dar.',
    modeRuleFast: 'Halte diese Anfrage leichtgewichtig. Nutze Branch-Architektur bei Bedarf als Kompatibilitaetskontext, erzwinge aber keine schwere Planung fuer einen kleinen Prototypen.',
    summaryFastPrototype: 'Schneller Prototyp-Modus ist aktiv. Die Branch-Architektur liefert nur leichten Kompatibilitaetskontext.',
    summaryAcceptedArchitecture: 'Die akzeptierte Branch-Architektur steuert diesen Build aktiv.',
    summaryProposedGuidance: 'Vorgeschlagene Draft-Guidance ist fuer diesen Lauf aktiv und bleibt bis zur Akzeptanz experimentell.',
    conflictSummaryOverride: titles => `Konflikt mit der akzeptierten Branch-Architektur: ${titles}. Dieser Lauf wird als Override-Anfrage behandelt.`,
    conflictSummaryExperiment: titles => `Konflikt mit der akzeptierten Branch-Architektur: ${titles}. Dieser Lauf wird als vorgeschlagenes Experiment behandelt.`,
    conflictSummaryRevision: titles => `Konflikt mit der akzeptierten Branch-Architektur: ${titles}. Dieser Lauf wird als Architektur-Revisionspfad behandelt.`,
    realityTitle: 'Branch-Realitaet',
    realityAlignedLabel: 'Ausgerichtet',
    realityMissingLabel: 'Fehlt',
    realityDriftingLabel: 'Drift',
    realityNextPassLabel: 'Naechster Durchlauf',
    realityStateAligned: 'Ausgerichtet',
    realityStatePartial: 'Teilweise',
    realityStateDrifted: 'Abgedriftet',
    realitySummaryAligned: ({ aligned }) =>
      `Die Branch-Realitaet ist ausgerichtet. ${aligned} verfolgte Punkte passen zum aktuellen Branch.`,
    realitySummaryPartial: ({ aligned, missing }) =>
      `Die Branch-Realitaet ist teilweise. ${aligned} Punkte passen, ${missing} fehlen noch in der Umsetzung.`,
    realitySummaryDrifted: ({ missing, drifting }) =>
      `Die Branch-Realitaet ist abgedriftet. ${missing} geplante Punkte fehlen und ${drifting} Drift-Signale muessen geprueft werden.`,
    realityEmptyAligned: 'Noch nichts ist eindeutig als ausgerichtet bestaetigt.',
    realityEmptyMissing: 'Aktuell sind keine geplanten Luecken sichtbar.',
    realityEmptyDrifting: 'Aktuell sind keine Drift-Signale sichtbar.',
    realityPlannedRouteImplemented: path => `Die geplante Route ist unter ${path} aktiv.`,
    realityPlannedRouteMissing: path => `Die geplante Route fehlt unter ${path} noch.`,
    realityUntrackedRoute: path => `Die umgesetzte Route ${path} ist nicht im Branch-Speicher erfasst.`,
    realityDecisionReflected: 'Die Branch-Richtung ist im Code sichtbar.',
    realityDecisionNotReflected: titles => `Der Code bildet Folgendes noch nicht ab: ${titles}.`,
    realityDeferredOverride: 'Zurueckgestellter Scope wirkt bereits im Code umgesetzt.',
    realityTechnologyOverride: (found, expected) => `Der Code zeigt auf ${found}; das koennte die akzeptierte ${expected}-Richtung ueberschreiben.`,
    realityRouteMismatch: path => `Die Routen-Verkabelung rund um ${path} stimmt nicht ueberein.`,
    realityRouteMetadataLag: path => `Die Routen-Metadaten hinken bei ${path} hinterher.`,
    realityRouteMetadataOnly: path => `Die Routen-Metadaten nennen ${path}, aber der Branch-Graph nicht.`,
    realityOrphanPage: 'Eine Seiten-Datei existiert ohne verfolgtes Routing.',
    realityRuntimeOnlyRoute: path => `Die Runtime-Route ${path} ist nicht im Branch-Graph erfasst.`,
    realityNextPassMissingRoute: title => `Setze im naechsten Durchlauf den geplanten Screen "${title}" um.`,
    realityNextPassDecision: title => `Bringe den Code im naechsten Durchlauf mit "${title}" in Einklang.`,
    realityNextPassDrift: title => `Gleiche erst den Drift rund um "${title}" ab, bevor du den Scope erweiterst.`,
  },
  fr: {
    promptTitle: 'Guidage architectural de la branche active',
    branchBrief: 'Resume de la branche',
    acceptedDecisions: 'Decisions acceptees',
    activeConstraints: 'Contraintes actives',
    currentStep: 'Etape d implementation en cours',
    focusCapabilities: 'Capacites a viser dans ce build',
    acceptedNotImplemented: 'Accepte mais pas encore completement implemente',
    deferredOutOfScope: 'A garder hors du scope actif',
    actualState: 'Etat actuel observe',
    hardRule: 'Considere les elements differes comme hors scope tant que l utilisateur ne les reactive pas explicitement dans cette branche.',
    none: 'Aucun',
    actualSummary: ({ implemented, remaining, deferred }) =>
      `Etat actuel de la branche : ${implemented} capacites acceptees sont implementees, ${remaining} demandent encore du travail et ${deferred} restent differees.`,
    nextStepHeading: 'Prochaine etape suggeree',
    nextStepStepSummary: (title, capabilities) =>
      `Continuer l etape active "${title}"${capabilities.length > 0 ? ` pour fermer ${capabilities.join(', ')}` : ''}.`,
    nextStepCapabilitySummary: title =>
      `Implementer ensuite la capacite acceptee "${title}" car elle manque encore dans l etat actuel de la branche.`,
    nextStepReconcileTitle: title => `Reconciler ${title} avec la memoire de branche`,
    nextStepReconcileSummary: title =>
      `"${title}" existe deja dans la branche mais n apparait pas dans le plan. Mieux vaut reconciler avant d elargir le scope.`,
    nextStepDeferredSummary: title =>
      `Le scope accepte semble couvert. Si vous voulez l elargir volontairement, reactivez explicitement l element differe "${title}".`,
    nextStepDoneTitle: 'Pas de prochaine etape solide',
    nextStepDoneSummary: 'Le scope accepte semble implemente et il n y a pas de decalage clair plan vs realite pour le moment.',
    reasonCurrentPlan: 'Base sur le plan d implementation actuel',
    reasonPlanGap: 'Base sur des capacites acceptees encore manquantes',
    reasonActualGap: 'Base sur un ecart entre le plan et la realite de la branche',
    reasonDeferredBacklog: 'Base sur un backlog differe qui doit rester opt-in',
    promptOperatingMode: 'Mode Architect',
    promptTrustBasis: 'Base de confiance',
    promptConflictHandling: 'Traitement du conflit',
    promptStatusIndicators: 'Indicateurs de statut',
    promptConflictDetails: 'Details du conflit',
    promptModeRule: 'Regle du mode',
    proposedDecisions: 'Decisions proposees du draft',
    proposedConstraints: 'Contraintes proposees du draft',
    modeFastPrototype: 'Mode prototype rapide',
    modeArchitectGuided: 'Mode guide par Architect',
    modeProposedExperiment: 'Mode d experiment propose',
    trustAcceptedArchitecture: 'Architecture acceptee de la branche active',
    trustProposedGuidance: 'Guidage propose du draft actif',
    trustObservedState: 'Etat observe de la branche actif',
    indicatorDeferredExcluded: 'Elements differes exclus du scope',
    conflictOverrideRequest: 'Demande d override',
    conflictReviseArchitecture: 'Parcours de revision d architecture',
    conflictProposedExperiment: 'Experience proposee',
    modeRuleAuthoritative: 'L architecture acceptee de la branche fait autorite pour ce build. Ne contredis pas silencieusement les decisions ou contraintes acceptees. Traite les conflits explicitement comme des overrides ou des revisions d architecture.',
    modeRuleProposed: 'Cette execution utilise un guidage propose du draft plutot qu une verite de branche acceptee. Garde le caractere experimental visible et ne presente pas les decisions du draft comme une architecture acceptee.',
    modeRuleFast: 'Garde cette demande legere. Utilise l architecture de branche comme contexte de compatibilite si utile, sans imposer une planification lourde pour un petit prototype.',
    summaryFastPrototype: 'Le mode prototype rapide est actif. L architecture de branche reste un contexte leger de compatibilite.',
    summaryAcceptedArchitecture: 'L architecture acceptee de la branche guide activement ce build.',
    summaryProposedGuidance: 'Le guidage propose du draft est actif pour cette execution et reste exploratoire tant qu il n est pas accepte.',
    conflictSummaryOverride: titles => `Conflit avec l architecture acceptee de la branche : ${titles}. Cette execution est traitee comme une demande d override.`,
    conflictSummaryExperiment: titles => `Conflit avec l architecture acceptee de la branche : ${titles}. Cette execution est traitee comme une experience proposee.`,
    conflictSummaryRevision: titles => `Conflit avec l architecture acceptee de la branche : ${titles}. Cette execution est traitee comme un parcours de revision d architecture.`,
    realityTitle: 'Realite de la branche',
    realityAlignedLabel: 'Aligne',
    realityMissingLabel: 'Manque',
    realityDriftingLabel: 'Derive',
    realityNextPassLabel: 'Prochaine passe',
    realityStateAligned: 'Aligne',
    realityStatePartial: 'Partiel',
    realityStateDrifted: 'En derive',
    realitySummaryAligned: ({ aligned }) =>
      `La realite de la branche est alignee. ${aligned} elements suivis correspondent a la branche actuelle.`,
    realitySummaryPartial: ({ aligned, missing }) =>
      `La realite de la branche est partielle. ${aligned} elements correspondent et ${missing} restent a implementer.`,
    realitySummaryDrifted: ({ missing, drifting }) =>
      `La realite de la branche derive. ${missing} elements planifies manquent et ${drifting} signaux de derive doivent etre revus.`,
    realityEmptyAligned: 'Rien n est encore confirme comme aligne.',
    realityEmptyMissing: 'Aucune lacune planifiee n est visible pour le moment.',
    realityEmptyDrifting: 'Aucun signal de derive n est visible pour le moment.',
    realityPlannedRouteImplemented: path => `La route planifiee est active sur ${path}.`,
    realityPlannedRouteMissing: path => `La route planifiee manque encore sur ${path}.`,
    realityUntrackedRoute: path => `La route implementee ${path} n est pas suivie dans la memoire de branche.`,
    realityDecisionReflected: 'La direction de la branche apparait dans le code.',
    realityDecisionNotReflected: titles => `Le code ne reflete pas encore : ${titles}.`,
    realityDeferredOverride: 'Le scope differe semble deja implemente dans le code.',
    realityTechnologyOverride: (found, expected) => `Le code pointe vers ${found}, ce qui peut remplacer la direction acceptee ${expected}.`,
    realityRouteMismatch: path => `Le branchement des routes diverge autour de ${path}.`,
    realityRouteMetadataLag: path => `Les metadonnees de routes sont en retard sur ${path}.`,
    realityRouteMetadataOnly: path => `Les metadonnees de routes mentionnent ${path}, mais pas le graphe de branche.`,
    realityOrphanPage: 'Un fichier de page existe sans routage suivi.',
    realityRuntimeOnlyRoute: path => `La route runtime ${path} n est pas suivie dans le graphe de branche.`,
    realityNextPassMissingRoute: title => `Implementez l ecran planifie "${title}" lors de la prochaine passe.`,
    realityNextPassDecision: title => `Alignez le code avec "${title}" lors de la prochaine passe.`,
    realityNextPassDrift: title => `Reconcilez d abord la derive autour de "${title}" avant d elargir le scope.`,
  },
  zh: {
    promptTitle: '当前分支架构指引',
    branchBrief: '分支摘要',
    acceptedDecisions: '已接受决策',
    activeConstraints: '当前约束',
    currentStep: '当前实施步骤',
    focusCapabilities: '本次构建应聚焦的能力',
    acceptedNotImplemented: '已接受但尚未完全实现',
    deferredOutOfScope: '保持在当前 scope 之外',
    actualState: '观察到的当前状态',
    hardRule: '除非用户在当前分支中明确重新激活，否则延后项都应视为超出 scope。',
    none: '无',
    actualSummary: ({ implemented, remaining, deferred }) =>
      `当前分支状态：已实现 ${implemented} 个已接受能力，仍有 ${remaining} 个已接受能力待完成，另有 ${deferred} 个项目保持延期。`,
    nextStepHeading: '建议的下一步',
    nextStepStepSummary: (title, capabilities) =>
      `继续当前激活的步骤“${title}”${capabilities.length > 0 ? `，以完成 ${capabilities.join('、')}` : ''}。`,
    nextStepCapabilitySummary: title =>
      `下一步实现已接受能力“${title}”，因为当前分支状态里仍然缺少它。`,
    nextStepReconcileTitle: title => `将“${title}”与分支记忆对齐`,
    nextStepReconcileSummary: title =>
      `当前分支里已经出现“${title}”，但它不在现有计划里。扩展 scope 之前应先对齐计划与记忆。`,
    nextStepDeferredSummary: title =>
      `已接受的 scope 看起来已经完成。如果你要继续扩展，请先明确重新激活延期项“${title}”。`,
    nextStepDoneTitle: '暂无可靠的下一步',
    nextStepDoneSummary: '已接受的 scope 看起来已经实现，目前没有明显的分支级计划差距。',
    reasonCurrentPlan: '依据当前实施计划',
    reasonPlanGap: '依据仍未完成的已接受能力',
    reasonActualGap: '依据当前分支中的计划与现实差距',
    reasonDeferredBacklog: '依据必须保持显式选择的延期 backlog',
    promptOperatingMode: 'Architect 运行模式',
    promptTrustBasis: '信任依据',
    promptConflictHandling: '冲突处理',
    promptStatusIndicators: '状态指示',
    promptConflictDetails: '冲突详情',
    promptModeRule: '模式规则',
    proposedDecisions: '提议中的草稿决策',
    proposedConstraints: '提议中的草稿约束',
    modeFastPrototype: '快速原型模式',
    modeArchitectGuided: 'Architect 引导模式',
    modeProposedExperiment: '提议实验模式',
    trustAcceptedArchitecture: '正在使用已接受的分支架构',
    trustProposedGuidance: '正在使用提议中的草稿指引',
    trustObservedState: '正在使用观察到的分支状态',
    indicatorDeferredExcluded: '延期项已排除在当前 scope 外',
    conflictOverrideRequest: '覆盖请求',
    conflictReviseArchitecture: '架构修订路径',
    conflictProposedExperiment: '提议实验',
    modeRuleAuthoritative: '已接受的分支架构对这次构建具有约束力。不要默默违背已接受的决策或约束。冲突必须明确按 override 或架构修订处理。',
    modeRuleProposed: '这次运行使用的是提议中的草稿指引，而不是已接受的分支事实。要明确保持实验性质，不要把草稿决策表述成已接受架构。',
    modeRuleFast: '保持这次请求轻量。需要时可把分支架构当作兼容性上下文，但不要为小型原型请求强加沉重规划。',
    summaryFastPrototype: '当前处于快速原型模式。分支架构只作为轻量兼容性上下文。',
    summaryAcceptedArchitecture: '当前构建正在由已接受的分支架构引导。',
    summaryProposedGuidance: '当前运行使用提议中的草稿指引，在被接受前都应视为探索性方案。',
    conflictSummaryOverride: titles => `与已接受的分支架构存在冲突：${titles}。本次运行按覆盖请求处理。`,
    conflictSummaryExperiment: titles => `与已接受的分支架构存在冲突：${titles}。本次运行按提议实验处理。`,
    conflictSummaryRevision: titles => `与已接受的分支架构存在冲突：${titles}。本次运行按架构修订路径处理。`,
    realityTitle: '分支现实',
    realityAlignedLabel: '已对齐',
    realityMissingLabel: '缺失',
    realityDriftingLabel: '漂移',
    realityNextPassLabel: '下一轮',
    realityStateAligned: '已对齐',
    realityStatePartial: '部分对齐',
    realityStateDrifted: '已漂移',
    realitySummaryAligned: ({ aligned }) =>
      `当前分支现实已对齐。共有 ${aligned} 个被跟踪项与当前分支一致。`,
    realitySummaryPartial: ({ aligned, missing }) =>
      `当前分支现实部分对齐。${aligned} 个被跟踪项已匹配，另有 ${missing} 个仍待实现。`,
    realitySummaryDrifted: ({ missing, drifting }) =>
      `当前分支现实已经漂移。${missing} 个计划项仍缺失，另有 ${drifting} 个漂移信号需要核对。`,
    realityEmptyAligned: '暂时还没有确认对齐的项目。',
    realityEmptyMissing: '当前没有看到计划缺口。',
    realityEmptyDrifting: '当前没有看到漂移信号。',
    realityPlannedRouteImplemented: path => `计划中的路由 ${path} 已在分支中生效。`,
    realityPlannedRouteMissing: path => `计划中的路由 ${path} 仍然缺失。`,
    realityUntrackedRoute: path => `已实现的路由 ${path} 没有被分支记忆跟踪。`,
    realityDecisionReflected: '分支方向已经体现在代码里。',
    realityDecisionNotReflected: titles => `代码仍未体现：${titles}。`,
    realityDeferredOverride: '延期范围似乎已经出现在代码里。',
    realityTechnologyOverride: (found, expected) => `代码指向 ${found}，这可能覆盖已接受的 ${expected} 方向。`,
    realityRouteMismatch: path => `${path} 附近的路由接线不一致。`,
    realityRouteMetadataLag: path => `${path} 的路由元数据落后于当前分支。`,
    realityRouteMetadataOnly: path => `路由元数据提到了 ${path}，但分支图中没有它。`,
    realityOrphanPage: '存在未被跟踪路由引用的页面文件。',
    realityRuntimeOnlyRoute: path => `运行时路由 ${path} 没有被分支图跟踪。`,
    realityNextPassMissingRoute: title => `下一轮先实现计划中的页面“${title}”。`,
    realityNextPassDecision: title => `下一轮先让代码与“${title}”保持一致。`,
    realityNextPassDrift: title => `扩展 scope 之前，先对齐围绕“${title}”的漂移。`,
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
      es: 'Autenticacion',
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
      es: 'Chat IA',
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
      es: 'Generacion IA',
      de: 'KI-Generierung',
      fr: 'Generation IA',
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
      es: 'Escaner',
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
      es: 'Analitica',
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
      es: 'Administracion',
      de: 'Admin',
      fr: 'Admin',
      zh: '管理后台',
    },
    patterns: [/\badmin\b/i, /moderation|role management|back office/i],
  },
};

type TechnologyOverrideRule = {
  expected: string;
  match: RegExp[];
  conflicts: Array<{
    label: string;
    patterns: RegExp[];
  }>;
};

const TECHNOLOGY_OVERRIDE_RULES: TechnologyOverrideRule[] = [
  {
    expected: 'Supabase',
    match: [/supabase/i],
    conflicts: [
      { label: 'Firebase', patterns: [/firebase/i] },
      { label: 'Clerk', patterns: [/@clerk\/|clerk/i] },
      { label: 'Auth0', patterns: [/auth0/i] },
    ],
  },
  {
    expected: 'Firebase',
    match: [/firebase/i],
    conflicts: [
      { label: 'Supabase', patterns: [/supabase/i] },
      { label: 'Clerk', patterns: [/@clerk\/|clerk/i] },
      { label: 'Auth0', patterns: [/auth0/i] },
    ],
  },
  {
    expected: 'Clerk',
    match: [/@clerk\/|clerk/i],
    conflicts: [
      { label: 'Supabase', patterns: [/supabase/i] },
      { label: 'Firebase', patterns: [/firebase/i] },
      { label: 'Auth0', patterns: [/auth0/i] },
    ],
  },
  {
    expected: 'Stripe',
    match: [/stripe|checkout/i],
    conflicts: [
      { label: 'Paddle', patterns: [/paddle/i] },
      { label: 'Braintree', patterns: [/braintree/i] },
      { label: 'PayPal', patterns: [/paypal/i] },
    ],
  },
  {
    expected: 'PostHog',
    match: [/posthog/i],
    conflicts: [
      { label: 'Mixpanel', patterns: [/mixpanel/i] },
      { label: 'Segment', patterns: [/segment/i] },
      { label: 'Plausible', patterns: [/plausible/i] },
    ],
  },
];

function normalizeRouteFilePath(value: string): string {
  return value.replace(/^\//, '').replace(/^src\//, '');
}

function humanizeRouteTitle(path: string, filePath: string, title?: string): string {
  if (title && title.trim().length > 0) return title;
  if (path === '/') return 'Home';
  const fileName = filePath.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '') ?? path.replace(/^\//, '');
  return fileName || path;
}

function makeRealityRoute(
  id: string,
  path: string,
  filePath: string,
  title?: string,
): BranchRealityRoute {
  return {
    id,
    path,
    filePath,
    title: humanizeRouteTitle(path, filePath, title),
  };
}

function makeRealityItem(
  id: string,
  title: string,
  summary: string,
): BranchRealityItem {
  return { id, title, summary };
}

function readRouteManifestFromFiles(
  files: Record<string, string>,
): ReturnType<typeof parseManifest> {
  const raw = files[MANIFEST_PATH]
    ?? files[MANIFEST_PATH.replace(/^\//, '')]
    ?? files['src/route-manifest.json'];
  return raw ? parseManifest(raw) : null;
}

interface ResolvedCapability {
  id: string;
  title: string;
  plannedState: PlannedCapabilityState;
  actualState: ActualCapabilityState;
  source: 'manual' | 'detected' | 'mixed';
  status: CapabilityManifestEntry['status'];
}

interface ResolvedPlanStep {
  id: string;
  title: string;
  summary?: string;
  capabilityIds: string[];
  state: StepState;
  status: PlanStepStatus;
}

export interface SuggestedNextStep {
  title: string;
  summary: string;
  reasons: string[];
  kind: 'plan_step' | 'accepted_gap' | 'reconcile' | 'deferred_backlog' | 'done';
}

export type ArchitectOperatingMode = 'fast_prototype' | 'architect_guided' | 'proposed_experiment';
export type BranchGuidanceTrustBasis =
  | 'accepted_branch_architecture'
  | 'proposed_draft_guidance'
  | 'branch_memory_observation';
export type BranchConflictHandling = 'none' | 'override_request' | 'proposed_experiment' | 'revise_architecture';
export type BranchTrustIndicatorKey =
  | 'accepted_branch_architecture'
  | 'proposed_draft_guidance'
  | 'fast_prototype_mode'
  | 'deferred_scope_excluded';

export interface BranchConflictState {
  kind: BranchConflictHandling;
  conflictingTitles: string[];
  conflictingCapabilityIds: string[];
}

export interface BranchGenerationGuidance {
  operatingMode: ArchitectOperatingMode;
  trustBasis: BranchGuidanceTrustBasis;
  authoritative: boolean;
  branchSummary: string;
  acceptedDecisions: ArchitectureDecision[];
  acceptedConstraints: ArchitectureConstraint[];
  proposedDecisions: ArchitectureDecision[];
  proposedConstraints: ArchitectureConstraint[];
  guidanceDecisions: ArchitectureDecision[];
  guidanceConstraints: ArchitectureConstraint[];
  currentImplementationStep: ResolvedPlanStep | null;
  activeCapabilityIds: string[];
  activeCapabilityTitles: string[];
  acceptedButIncomplete: ResolvedCapability[];
  deferredItems: DeferredItem[];
  implementedNotPlanned: ResolvedCapability[];
  actualSummary: string;
  reality: BranchRealitySummary;
  suggestedNextStep: SuggestedNextStep | null;
  conflict: BranchConflictState;
  trustIndicators: BranchTrustIndicatorKey[];
}

export interface BranchTrustIndicatorView {
  id: BranchTrustIndicatorKey;
  label: string;
  state: 'accepted' | 'planned' | 'open' | 'deferred';
}

export interface BranchTrustUiSummary {
  mode: ArchitectOperatingMode;
  modeLabel: string;
  trustBasis: BranchGuidanceTrustBasis;
  trustLabel: string;
  summary: string;
  conflictHandling: BranchConflictHandling;
  conflictLabel: string | null;
  conflictSummary: string | null;
  indicators: BranchTrustIndicatorView[];
}

export interface ArchitectureRefreshResult {
  architecture: ProjectBranchArchitecture;
  actualSnapshot: ArchitectureSnapshot | null;
  guidance: BranchGenerationGuidance | null;
}

function normalizeLanguage(language?: string): SupportedLanguage {
  return normalizeAppLanguage(language);
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
  architecture: ProjectBranchArchitecture,
  phase: ArchitectureSnapshot['phase'],
): ArchitectureSnapshot | null {
  return architecture.snapshots.find(snapshot => snapshot.phase === phase) ?? null;
}

function hasSnapshotContent(snapshot: ArchitectureSnapshot): boolean {
  return Boolean(
    snapshot.branchBrief.summary
    || snapshot.implementationPlan
    || snapshot.capabilityManifest
    || snapshot.capabilityDecisions.length
    || snapshot.architectureDecisions.length
    || snapshot.constraints.length
    || snapshot.openQuestions.length
    || snapshot.deferredItems.length
  );
}

function resolveSnapshot(
  architecture: ProjectBranchArchitecture,
  phase: ArchitectureSnapshot['phase'],
): ArchitectureSnapshot | null {
  const existing = phase === 'pre_build_draft'
    ? architecture.draftSnapshot ?? pickLatestSnapshot(architecture, phase)
    : architecture.actualSnapshot ?? pickLatestSnapshot(architecture, phase);
  if (existing) return existing;

  const derived = createArchitectureSnapshotFromBranchArchitecture(architecture, phase, {
    id: `derived:${architecture.branchId}:${phase}`,
    createdAt: architecture.updatedAt,
    basedOnRevisionId: architecture.branch.headRevisionId,
  });

  return hasSnapshotContent(derived) ? derived : null;
}

function getCapabilityTitle(capabilityId: string, language: SupportedLanguage): string {
  return CAPABILITY_DETECTORS[capabilityId]?.title[language] ?? capabilityId;
}

function detectCapabilityActualState(
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
  if (score === 1) {
    return plannedState === 'required' || plannedState === 'planned' || plannedState === 'optional'
      ? 'partially_implemented'
      : 'detected';
  }

  return plannedState === 'required' || plannedState === 'planned' || plannedState === 'optional'
    ? 'missing'
    : 'unknown';
}

function mergeActualState(
  manifestState: ActualCapabilityState | undefined,
  liveState: ActualCapabilityState,
): ActualCapabilityState {
  return liveState !== 'unknown' ? liveState : (manifestState ?? 'unknown');
}

function plannedStateFromDecision(decision?: CapabilityDecision): PlannedCapabilityState {
  return decision?.plannedState ?? 'not_planned';
}

function collectCapabilityIds(
  draftSnapshot: ArchitectureSnapshot | null,
  actualSnapshot: ArchitectureSnapshot | null,
  files: Record<string, string>,
): string[] {
  const ids = new Set<string>();
  const capture = (value?: string | null) => {
    if (value) ids.add(value);
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
    if (detectCapabilityActualState(files, capabilityId, 'not_planned') !== 'unknown') {
      ids.add(capabilityId);
    }
  });

  return [...ids];
}

function resolveCapabilities(
  draftSnapshot: ArchitectureSnapshot | null,
  actualSnapshot: ArchitectureSnapshot | null,
  files: Record<string, string>,
  language: SupportedLanguage,
): ResolvedCapability[] {
  const draftManifest = new Map<string, CapabilityManifestEntry>();
  draftSnapshot?.capabilityManifest?.capabilities.forEach(entry => {
    draftManifest.set(entry.capabilityId, entry);
  });

  const actualManifest = new Map<string, CapabilityManifestEntry>();
  actualSnapshot?.capabilityManifest?.capabilities.forEach(entry => {
    actualManifest.set(entry.capabilityId, entry);
  });

  const draftDecisions = new Map<string, CapabilityDecision>();
  draftSnapshot?.capabilityDecisions.forEach(entry => {
    if (!draftDecisions.has(entry.capabilityId)) draftDecisions.set(entry.capabilityId, entry);
  });

  const actualDecisions = new Map<string, CapabilityDecision>();
  actualSnapshot?.capabilityDecisions.forEach(entry => {
    if (!actualDecisions.has(entry.capabilityId)) actualDecisions.set(entry.capabilityId, entry);
  });

  return collectCapabilityIds(draftSnapshot, actualSnapshot, files)
    .map(capabilityId => {
      const plannedEntry = draftManifest.get(capabilityId);
      const actualEntry = actualManifest.get(capabilityId);
      const plannedDecision = draftDecisions.get(capabilityId);
      const actualDecision = actualDecisions.get(capabilityId);
      const plannedState = plannedEntry?.plannedState
        ?? actualEntry?.plannedState
        ?? plannedStateFromDecision(plannedDecision)
        ?? plannedStateFromDecision(actualDecision);
      const liveState = detectCapabilityActualState(files, capabilityId, plannedState);
      const actualState = mergeActualState(
        actualEntry?.actualState ?? actualDecision?.actualState ?? plannedEntry?.actualState ?? plannedDecision?.actualState,
        liveState,
      );
      const hasDetectedState = liveState !== 'unknown';

      return {
        id: capabilityId,
        title: plannedEntry?.title ?? actualEntry?.title ?? getCapabilityTitle(capabilityId, language),
        plannedState,
        actualState,
        source: hasDetectedState
          ? (plannedEntry?.source === 'manual' || actualEntry?.source === 'manual' ? 'mixed' : 'detected')
          : (actualEntry?.source ?? plannedEntry?.source ?? 'manual'),
        status: plannedState === 'deferred' ? 'deferred' : 'accepted',
      } satisfies ResolvedCapability;
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function deriveStepState(step: PlanStep, capabilities: ResolvedCapability[]): StepState {
  const related = step.plannedCapabilityIds
    .map(capabilityId => capabilities.find(capability => capability.id === capabilityId))
    .filter((capability): capability is ResolvedCapability => Boolean(capability));

  if (step.implementationState === 'deferred') return 'deferred';
  if (step.implementationState === 'blocked') return 'blocked';
  if (related.length === 0) {
    return step.implementationState === 'implemented'
      ? 'implemented'
      : step.implementationState === 'in_progress'
        ? 'in_progress'
        : 'planned';
  }

  const implementedCount = related.filter(capability =>
    capability.actualState === 'implemented' || capability.actualState === 'detected',
  ).length;
  const partialCount = related.filter(capability => capability.actualState === 'partially_implemented').length;

  if (implementedCount === related.length) return 'implemented';
  if (implementedCount > 0 || partialCount > 0) return 'in_progress';
  return 'planned';
}

function stepStatusFromState(state: StepState): PlanStepStatus {
  switch (state) {
    case 'implemented':
      return 'completed';
    case 'in_progress':
      return 'in_progress';
    case 'blocked':
      return 'blocked';
    case 'deferred':
      return 'deferred';
    case 'planned':
    default:
      return 'proposed';
  }
}

function resolvePlanSteps(
  draftSnapshot: ArchitectureSnapshot | null,
  actualSnapshot: ArchitectureSnapshot | null,
  capabilities: ResolvedCapability[],
): ResolvedPlanStep[] {
  const actualSteps = new Map(
    (actualSnapshot?.implementationPlan?.steps ?? []).map(step => [step.id, step] as const),
  );

  return (draftSnapshot?.implementationPlan?.steps ?? []).map(step => {
    const derivedState = deriveStepState(step, capabilities);
    const actualStep = actualSteps.get(step.id);
    const actualState = actualStep?.implementationState;

    const state = actualState === 'implemented' || actualState === 'deferred' || actualState === 'blocked'
      ? actualState
      : actualState === 'in_progress'
        ? 'in_progress'
        : actualState === 'planned'
          ? derivedState
          : derivedState;

    return {
      id: step.id,
      title: step.title,
      summary: step.summary,
      capabilityIds: step.plannedCapabilityIds,
      state,
      status: stepStatusFromState(state),
    };
  });
}

function buildSuggestedNextStep(
  capabilities: ResolvedCapability[],
  steps: ResolvedPlanStep[],
  deferredItems: DeferredItem[],
  language: SupportedLanguage,
): SuggestedNextStep {
  const copy = COPY[language];
  const currentStep = steps.find(step => step.state === 'in_progress') ?? steps.find(step => step.state === 'planned') ?? null;
  if (currentStep) {
    const capabilityTitles = currentStep.capabilityIds
      .map(capabilityId => capabilities.find(capability => capability.id === capabilityId)?.title ?? capabilityId)
      .filter(Boolean);
    return {
      title: currentStep.title,
      summary: copy.nextStepStepSummary(currentStep.title, capabilityTitles),
      reasons: [copy.reasonCurrentPlan, copy.reasonPlanGap],
      kind: 'plan_step',
    };
  }

  const acceptedGap = capabilities.find(capability =>
    (capability.plannedState === 'required' || capability.plannedState === 'planned' || capability.plannedState === 'optional')
    && capability.actualState !== 'implemented'
    && capability.actualState !== 'detected',
  );
  if (acceptedGap) {
    return {
      title: acceptedGap.title,
      summary: copy.nextStepCapabilitySummary(acceptedGap.title),
      reasons: [copy.reasonPlanGap],
      kind: 'accepted_gap',
    };
  }

  const implementedNotPlanned = capabilities.find(capability =>
    (capability.plannedState === 'not_planned' || capability.plannedState === 'deferred')
    && (
      capability.actualState === 'implemented'
      || capability.actualState === 'detected'
      || capability.actualState === 'partially_implemented'
    ),
  );
  if (implementedNotPlanned) {
    return {
      title: copy.nextStepReconcileTitle(implementedNotPlanned.title),
      summary: copy.nextStepReconcileSummary(implementedNotPlanned.title),
      reasons: [copy.reasonActualGap],
      kind: 'reconcile',
    };
  }

  const nextDeferred = deferredItems.find(item => item.status === 'deferred');
  if (nextDeferred) {
    return {
      title: nextDeferred.title,
      summary: copy.nextStepDeferredSummary(nextDeferred.title),
      reasons: [copy.reasonDeferredBacklog],
      kind: 'deferred_backlog',
    };
  }

  return {
    title: copy.nextStepDoneTitle,
    summary: copy.nextStepDoneSummary,
    reasons: [],
    kind: 'done',
  };
}

function localizeRealityState(
  state: BranchAlignmentState,
  copy: CopyShape,
): string {
  switch (state) {
    case 'drifted':
      return copy.realityStateDrifted;
    case 'partial':
      return copy.realityStatePartial;
    case 'aligned':
    default:
      return copy.realityStateAligned;
  }
}

function buildDecisionReflectionItems(
  decisions: ArchitectureDecision[],
  capabilities: ResolvedCapability[],
  copy: CopyShape,
): {
  reflected: BranchRealityItem[];
  missing: BranchRealityItem[];
} {
  const reflected: BranchRealityItem[] = [];
  const missing: BranchRealityItem[] = [];

  for (const decision of decisions) {
    const affected = (decision.affectedCapabilityIds ?? [])
      .map(capabilityId => capabilities.find(capability => capability.id === capabilityId))
      .filter((capability): capability is ResolvedCapability => Boolean(capability));

    if (affected.length === 0) continue;

    const gaps = affected.filter(capability =>
      capability.actualState !== 'implemented' && capability.actualState !== 'detected',
    );

    if (gaps.length === 0) {
      reflected.push(makeRealityItem(
        `decision-reflected:${decision.id}`,
        decision.title,
        copy.realityDecisionReflected,
      ));
      continue;
    }

    missing.push(makeRealityItem(
      `decision-gap:${decision.id}`,
      decision.title,
      copy.realityDecisionNotReflected(gaps.map(capability => capability.title).join(', ')),
    ));
  }

  return { reflected, missing };
}

function buildOverrideItems(
  decisions: ArchitectureDecision[],
  constraints: ArchitectureConstraint[],
  deferredItems: DeferredItem[],
  capabilities: ResolvedCapability[],
  files: Record<string, string>,
  copy: CopyShape,
): BranchRealityItem[] {
  const items: BranchRealityItem[] = [];
  const seen = new Set<string>();
  const corpus = Object.entries(files)
    .map(([path, content]) => `${path}\n${content}`)
    .join('\n');

  for (const item of deferredItems) {
    const related = item.relatedCapabilityIds
      .map(capabilityId => capabilities.find(capability => capability.id === capabilityId))
      .filter((capability): capability is ResolvedCapability => Boolean(capability));
    const keywordSignals = [
      ...collectRequestKeywords(item.title),
      ...collectRequestKeywords(item.summary),
    ];
    const activated = related.some(capability =>
      capability.actualState === 'implemented'
      || capability.actualState === 'detected'
      || capability.actualState === 'partially_implemented',
    ) && keywordSignals.some(keyword => corpus.toLowerCase().includes(keyword));
    if (!activated) continue;

    const id = `deferred-override:${item.id}`;
    seen.add(id);
    items.push(makeRealityItem(id, item.title, copy.realityDeferredOverride));
  }

  for (const item of [...decisions, ...constraints]) {
    const sourceText = `${item.title}\n${item.summary}`;

    for (const rule of TECHNOLOGY_OVERRIDE_RULES) {
      const matchesExpected = rule.match.some(pattern => pattern.test(sourceText));
      if (!matchesExpected) continue;

      const conflict = rule.conflicts.find(entry =>
        entry.patterns.some(pattern => pattern.test(corpus)),
      );
      if (!conflict) continue;

      const id = `technology-override:${item.id}:${rule.expected}:${conflict.label}`;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(makeRealityItem(
        id,
        item.title,
        copy.realityTechnologyOverride(conflict.label, rule.expected),
      ));
    }
  }

  return items;
}

function buildRouteDriftItems(
  routeDrifts: RouteDriftEntry[],
  copy: CopyShape,
): BranchRealityItem[] {
  return routeDrifts.flatMap(drift => {
    switch (drift.kind) {
      case 'missing-in-json':
        return [makeRealityItem(
          `route-drift:${drift.kind}:${drift.path}:${drift.filePath}`,
          drift.path || drift.filePath,
          copy.realityRouteMetadataLag(drift.path || drift.filePath),
        )];
      case 'missing-in-graph':
        return [makeRealityItem(
          `route-drift:${drift.kind}:${drift.path}:${drift.filePath}`,
          drift.path || drift.filePath,
          copy.realityRouteMetadataOnly(drift.path || drift.filePath),
        )];
      case 'path-mismatch':
        return [makeRealityItem(
          `route-drift:${drift.kind}:${drift.path}:${drift.filePath}`,
          drift.path || drift.filePath,
          copy.realityRouteMismatch(drift.path || drift.filePath),
        )];
      case 'orphan-page-file':
        return [makeRealityItem(
          `route-drift:${drift.kind}:${drift.filePath}`,
          drift.filePath,
          copy.realityOrphanPage,
        )];
      case 'app-tsx-extra-route':
        return [makeRealityItem(
          `route-drift:${drift.kind}:${drift.path}`,
          drift.path,
          copy.realityRuntimeOnlyRoute(drift.path || drift.filePath),
        )];
      default:
        return [];
    }
  });
}

function buildBranchRealitySummary(input: {
  architecture: ProjectBranchArchitecture;
  files: Record<string, string>;
  language: SupportedLanguage;
  decisions: ArchitectureDecision[];
  constraints: ArchitectureConstraint[];
  deferredItems: DeferredItem[];
  capabilities: ResolvedCapability[];
  fallbackNextStep: SuggestedNextStep;
}): BranchRealitySummary {
  const copy = COPY[input.language];
  const manifest = readRouteManifestFromFiles(input.files);
  const graph = fileMapToProjectGraph(
    input.files,
    input.architecture.projectId,
    input.architecture.branch.headRevisionId ?? `${input.architecture.branchId}:reality`,
  );
  const routeDrifts = validateAllRouteLayers(graph);
  const graphByPath = new Map(graph.routes.map(route => [route.path, route] as const));
  const graphByFile = new Map(graph.routes.map(route => [normalizeRouteFilePath(route.filePath), route] as const));
  const plannedScreensImplemented: BranchRealityRoute[] = [];
  const plannedScreensMissing: BranchRealityRoute[] = [];

  for (const route of manifest?.routes ?? []) {
    const graphMatch = graphByPath.get(route.path) ?? graphByFile.get(normalizeRouteFilePath(route.filePath));
    const missingFromRuntime = routeDrifts.some(drift =>
      (drift.kind === 'app-tsx-missing-route' && drift.path === route.path)
      || (drift.kind === 'missing-file' && normalizeRouteFilePath(drift.filePath) === normalizeRouteFilePath(route.filePath)),
    );
    const entry = makeRealityRoute(
      `planned-route:${route.path}:${normalizeRouteFilePath(route.filePath)}`,
      route.path,
      route.filePath,
      route.title,
    );

    if (graphMatch && !missingFromRuntime) {
      plannedScreensImplemented.push(entry);
    } else {
      plannedScreensMissing.push(entry);
    }
  }

  const manifestPaths = new Set((manifest?.routes ?? []).map(route => route.path));
  const manifestFiles = new Set((manifest?.routes ?? []).map(route => normalizeRouteFilePath(route.filePath)));
  const untrackedImplementedRoutes: BranchRealityRoute[] = graph.routes
    .filter(route =>
      !manifestPaths.has(route.path)
      && !manifestFiles.has(normalizeRouteFilePath(route.filePath)),
    )
    .map(route => makeRealityRoute(
      `untracked-route:${route.path}:${normalizeRouteFilePath(route.filePath)}`,
      route.path,
      route.filePath,
      route.title,
    ));

  for (const drift of routeDrifts.filter(entry => entry.kind === 'app-tsx-extra-route')) {
    const id = `runtime-only:${drift.path}`;
    if (untrackedImplementedRoutes.some(route => route.id === id || route.path === drift.path)) continue;
    untrackedImplementedRoutes.push(makeRealityRoute(
      id,
      drift.path,
      drift.filePath,
      drift.path,
    ));
  }

  const decisionReflection = buildDecisionReflectionItems(input.decisions, input.capabilities, copy);
  const overridingImplementation = buildOverrideItems(
    input.decisions,
    input.constraints,
    input.deferredItems,
    input.capabilities,
    input.files,
    copy,
  );

  const alignedItems: BranchRealityItem[] = [
    ...plannedScreensImplemented.map(route => makeRealityItem(
      route.id,
      route.title,
      copy.realityPlannedRouteImplemented(route.path),
    )),
    ...decisionReflection.reflected,
  ];
  const missingItems: BranchRealityItem[] = [
    ...plannedScreensMissing.map(route => makeRealityItem(
      route.id,
      route.title,
      copy.realityPlannedRouteMissing(route.path),
    )),
    ...decisionReflection.missing,
  ];

  const routeDriftItems = buildRouteDriftItems(routeDrifts, copy);
  const driftingItems: BranchRealityItem[] = [
    ...untrackedImplementedRoutes.map(route => makeRealityItem(
      route.id,
      route.title,
      copy.realityUntrackedRoute(route.path),
    )),
    ...overridingImplementation,
    ...routeDriftItems.filter(item =>
      !missingItems.some(existing => existing.id === item.id)
      && !alignedItems.some(existing => existing.id === item.id),
    ),
  ];

  const state: BranchAlignmentState = driftingItems.length > 0
    ? 'drifted'
    : missingItems.length > 0
      ? 'partial'
      : 'aligned';

  const nextPass = driftingItems.length > 0
    ? {
        title: driftingItems[0].title,
        summary: copy.realityNextPassDrift(driftingItems[0].title),
        reasons: [copy.reasonActualGap],
        kind: 'reconcile' as const,
      }
    : plannedScreensMissing.length > 0
      ? {
          title: plannedScreensMissing[0].title,
          summary: copy.realityNextPassMissingRoute(plannedScreensMissing[0].title),
          reasons: [copy.reasonPlanGap],
          kind: 'accepted_gap' as const,
        }
      : input.fallbackNextStep.kind !== 'done'
        ? input.fallbackNextStep
      : decisionReflection.missing.length > 0
        ? {
            title: decisionReflection.missing[0].title,
            summary: copy.realityNextPassDecision(decisionReflection.missing[0].title),
            reasons: [copy.reasonPlanGap],
            kind: 'accepted_gap' as const,
          }
        : input.fallbackNextStep;

  const summary = state === 'drifted'
    ? copy.realitySummaryDrifted({ missing: missingItems.length, drifting: driftingItems.length })
    : state === 'partial'
      ? copy.realitySummaryPartial({ aligned: alignedItems.length, missing: missingItems.length })
      : copy.realitySummaryAligned({ aligned: alignedItems.length });

  return {
    state,
    plannedScreensImplemented,
    plannedScreensMissing,
    untrackedImplementedRoutes,
    decisionsNotReflected: decisionReflection.missing,
    overridingImplementation,
    routeDrifts,
    alignedItems,
    missingItems,
    driftingItems,
    nextPass,
    ui: {
      sectionTitle: copy.realityTitle,
      stateLabel: localizeRealityState(state, copy),
      summary,
      alignedLabel: copy.realityAlignedLabel,
      alignedItems,
      alignedEmpty: copy.realityEmptyAligned,
      missingLabel: copy.realityMissingLabel,
      missingItems,
      missingEmpty: copy.realityEmptyMissing,
      driftingLabel: copy.realityDriftingLabel,
      driftingItems,
      driftingEmpty: copy.realityEmptyDrifting,
      nextPassLabel: copy.realityNextPassLabel,
      nextPassTitle: nextPass.title,
      nextPassSummary: nextPass.summary,
    },
  };
}

function buildActualSummary(
  capabilities: ResolvedCapability[],
  deferredItems: DeferredItem[],
  language: SupportedLanguage,
): string {
  const copy = COPY[language];
  const implemented = capabilities.filter(capability =>
    capability.actualState === 'implemented' || capability.actualState === 'detected',
  ).length;
  const remaining = capabilities.filter(capability =>
    (capability.plannedState === 'required' || capability.plannedState === 'planned' || capability.plannedState === 'optional')
    && capability.actualState !== 'implemented'
    && capability.actualState !== 'detected',
  ).length;
  return copy.actualSummary({
    implemented,
    remaining,
    deferred: deferredItems.filter(item => item.status === 'deferred').length,
  });
}

const LIGHTWEIGHT_REQUEST_PATTERNS = [
  /\blanding page\b/i,
  /\bsingle screen\b/i,
  /\bfirst screen\b/i,
  /\bui sketch\b/i,
  /\bmock ui\b/i,
  /\bvisual tweak\b/i,
  /\bstyle(?: only)?\b/i,
  /\bpolish\b/i,
  /\bhero section\b/i,
  /\bwireframe\b/i,
  /\bjust sketch\b/i,
  /\bjust the ui\b/i,
  /\bjust the page\b/i,
  /\bprototype\b/i,
];

const HEAVY_REQUEST_PATTERNS = [
  /\bapi\b/i,
  /\bbackend\b/i,
  /\bdatabase\b/i,
  /\bpersist(?:ence)?\b/i,
  /\bsupabase\b/i,
  /\bfirebase\b/i,
  /\bauth0\b/i,
  /\bclerk\b/i,
  /\bserver\b/i,
  /\bintegration\b/i,
  /\bpayment\b/i,
  /\bwebsocket\b/i,
  /\brefactor\b/i,
  /\bmigration\b/i,
];

const OVERRIDE_REQUEST_PATTERNS = [
  /\boverride\b/i,
  /\bignore\b/i,
  /\binstead\b/i,
  /\breplace\b/i,
  /\bswitch\b/i,
  /\bmigrate\b/i,
  /\bdrop\b/i,
  /\bremove\b/i,
  /\bdo not use\b/i,
  /\bdon't use\b/i,
];

const PROPOSED_EXPERIMENT_PATTERNS = [
  /\bexperiment\b/i,
  /\btry\b/i,
  /\bspike\b/i,
  /\bexplore\b/i,
  /\bcompare\b/i,
  /\btest out\b/i,
];

const REVISE_ARCHITECTURE_PATTERNS = [
  /\brevise architecture\b/i,
  /\bupdate architecture\b/i,
  /\bchange architecture\b/i,
  /\brework architecture\b/i,
  /\brevisit architecture\b/i,
  /\bchange the branch decision\b/i,
];

const REQUEST_KEYWORD_STOPWORDS = new Set([
  'branch',
  'build',
  'current',
  'feature',
  'first',
  'implementation',
  'page',
  'screen',
  'simple',
  'this',
  'use',
  'with',
]);

function hasSnapshotStatus(snapshot: ArchitectureSnapshot | null, status: 'accepted' | 'proposed'): boolean {
  if (!snapshot) return false;

  if (snapshot.branchBrief.status === status) return true;
  if (snapshot.implementationPlan?.status === status) return true;
  if (snapshot.implementationPlan?.steps.some(step => step.status === status)) return true;
  if (snapshot.capabilityManifest?.status === status) return true;
  if (snapshot.capabilityManifest?.capabilities.some(capability => capability.status === status)) return true;
  if (snapshot.capabilityDecisions.some(decision => decision.status === status)) return true;
  if (snapshot.architectureDecisions.some(decision => decision.status === status)) return true;
  if (snapshot.constraints.some(constraint => constraint.status === status)) return true;
  return false;
}

function isLightweightPrototypeRequest(intent: string | undefined, generationMode?: StudioGenerationMode): boolean {
  const text = intent?.trim();
  if (!text) return false;

  const positive = generationMode === 'landing' || LIGHTWEIGHT_REQUEST_PATTERNS.some(pattern => pattern.test(text));
  const heavy = HEAVY_REQUEST_PATTERNS.some(pattern => pattern.test(text));
  return positive && !heavy;
}

function collectRequestKeywords(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .toLowerCase()
    .split(/[^a-z0-9_+-]+/i)
    .filter(token => token.length >= 3 && !REQUEST_KEYWORD_STOPWORDS.has(token));
}

function buildConflictState(
  requestIntent: string | undefined,
  acceptedDecisions: ArchitectureDecision[],
  acceptedConstraints: ArchitectureConstraint[],
  capabilities: ResolvedCapability[],
): BranchConflictState {
  if (!requestIntent || (acceptedDecisions.length === 0 && acceptedConstraints.length === 0)) {
    return {
      kind: 'none',
      conflictingTitles: [],
      conflictingCapabilityIds: [],
    };
  }

  const keywords = new Set<string>();
  capabilities
    .filter(capability => capability.plannedState === 'required' || capability.plannedState === 'planned' || capability.plannedState === 'optional')
    .forEach(capability => {
      keywords.add(capability.id.toLowerCase());
      collectRequestKeywords(capability.title).forEach(keyword => keywords.add(keyword));
    });

  [...acceptedDecisions, ...acceptedConstraints].forEach(item => {
    collectRequestKeywords(item.title).forEach(keyword => keywords.add(keyword));
    collectRequestKeywords(item.summary).forEach(keyword => keywords.add(keyword));
    (item.affectedCapabilityIds ?? []).forEach(capabilityId => keywords.add(capabilityId.toLowerCase()));
  });

  const normalizedIntent = requestIntent.toLowerCase();
  const touchesAcceptedScope = [...keywords].some(keyword => normalizedIntent.includes(keyword));
  if (!touchesAcceptedScope) {
    return {
      kind: 'none',
      conflictingTitles: [],
      conflictingCapabilityIds: [],
    };
  }

  const kind: BranchConflictHandling = REVISE_ARCHITECTURE_PATTERNS.some(pattern => pattern.test(requestIntent))
    ? 'revise_architecture'
    : PROPOSED_EXPERIMENT_PATTERNS.some(pattern => pattern.test(requestIntent))
      ? 'proposed_experiment'
      : OVERRIDE_REQUEST_PATTERNS.some(pattern => pattern.test(requestIntent))
        ? 'override_request'
        : 'none';

  if (kind === 'none') {
    return {
      kind,
      conflictingTitles: [],
      conflictingCapabilityIds: [],
    };
  }

  const conflictingTitles = [...acceptedDecisions, ...acceptedConstraints]
    .filter(item => (item.affectedCapabilityIds ?? []).some(capabilityId => normalizedIntent.includes(capabilityId.toLowerCase()))
      || collectRequestKeywords(item.title).some(keyword => normalizedIntent.includes(keyword)))
    .map(item => item.title);

  const conflictingCapabilityIds = capabilities
    .filter(capability =>
      normalizedIntent.includes(capability.id.toLowerCase())
      || collectRequestKeywords(capability.title).some(keyword => normalizedIntent.includes(keyword)),
    )
    .map(capability => capability.id);

  return {
    kind,
    conflictingTitles: conflictingTitles.length > 0
      ? conflictingTitles.slice(0, 3)
      : [...acceptedDecisions, ...acceptedConstraints].map(item => item.title).slice(0, 3),
    conflictingCapabilityIds: conflictingCapabilityIds.slice(0, 4),
  };
}

function resolveGuidanceControl(input: {
  acceptedGuidanceAvailable: boolean;
  proposedGuidanceAvailable: boolean;
  deferredItems: DeferredItem[];
  requestIntent?: string;
  generationMode?: StudioGenerationMode;
  conflict: BranchConflictState;
}): Pick<BranchGenerationGuidance, 'operatingMode' | 'trustBasis' | 'authoritative' | 'trustIndicators'> {
  const lightweightPrototype = isLightweightPrototypeRequest(input.requestIntent, input.generationMode);

  let operatingMode: ArchitectOperatingMode;
  let trustBasis: BranchGuidanceTrustBasis;

  if (input.acceptedGuidanceAvailable) {
    trustBasis = 'accepted_branch_architecture';
    operatingMode = input.conflict.kind === 'proposed_experiment'
      ? 'proposed_experiment'
      : lightweightPrototype && input.conflict.kind === 'none'
        ? 'fast_prototype'
        : 'architect_guided';
  } else if (input.proposedGuidanceAvailable) {
    trustBasis = 'proposed_draft_guidance';
    operatingMode = lightweightPrototype ? 'fast_prototype' : 'proposed_experiment';
  } else {
    trustBasis = 'branch_memory_observation';
    operatingMode = 'fast_prototype';
  }

  const trustIndicators: BranchTrustIndicatorKey[] = [];
  if (trustBasis === 'accepted_branch_architecture') trustIndicators.push('accepted_branch_architecture');
  if (trustBasis === 'proposed_draft_guidance') trustIndicators.push('proposed_draft_guidance');
  if (operatingMode === 'fast_prototype') trustIndicators.push('fast_prototype_mode');
  if (input.deferredItems.length > 0) trustIndicators.push('deferred_scope_excluded');

  return {
    operatingMode,
    trustBasis,
    authoritative: operatingMode === 'architect_guided' && trustBasis === 'accepted_branch_architecture',
    trustIndicators,
  };
}

function labelOperatingMode(mode: ArchitectOperatingMode, copy: CopyShape): string {
  switch (mode) {
    case 'architect_guided':
      return copy.modeArchitectGuided;
    case 'proposed_experiment':
      return copy.modeProposedExperiment;
    case 'fast_prototype':
    default:
      return copy.modeFastPrototype;
  }
}

function labelTrustBasis(trustBasis: BranchGuidanceTrustBasis, copy: CopyShape): string {
  switch (trustBasis) {
    case 'accepted_branch_architecture':
      return copy.trustAcceptedArchitecture;
    case 'proposed_draft_guidance':
      return copy.trustProposedGuidance;
    case 'branch_memory_observation':
    default:
      return copy.trustObservedState;
  }
}

function labelConflictHandling(kind: BranchConflictHandling, copy: CopyShape): string {
  switch (kind) {
    case 'override_request':
      return copy.conflictOverrideRequest;
    case 'proposed_experiment':
      return copy.conflictProposedExperiment;
    case 'revise_architecture':
      return copy.conflictReviseArchitecture;
    case 'none':
    default:
      return copy.none;
  }
}

function buildTrustIndicatorView(indicator: BranchTrustIndicatorKey, copy: CopyShape): BranchTrustIndicatorView {
  switch (indicator) {
    case 'accepted_branch_architecture':
      return {
        id: indicator,
        label: copy.trustAcceptedArchitecture,
        state: 'accepted',
      };
    case 'proposed_draft_guidance':
      return {
        id: indicator,
        label: copy.trustProposedGuidance,
        state: 'open',
      };
    case 'deferred_scope_excluded':
      return {
        id: indicator,
        label: copy.indicatorDeferredExcluded,
        state: 'deferred',
      };
    case 'fast_prototype_mode':
    default:
      return {
        id: indicator,
        label: copy.modeFastPrototype,
        state: 'planned',
      };
  }
}

function buildModeRule(guidance: BranchGenerationGuidance, copy: CopyShape): string {
  if (guidance.authoritative) {
    return copy.modeRuleAuthoritative;
  }

  if (guidance.trustBasis === 'proposed_draft_guidance' || guidance.operatingMode === 'proposed_experiment') {
    return copy.modeRuleProposed;
  }

  return copy.modeRuleFast;
}

function buildConflictSummary(conflict: BranchConflictState, copy: CopyShape): string | null {
  if (conflict.kind === 'none') return null;

  const titles = conflict.conflictingTitles.length > 0
    ? conflict.conflictingTitles.join(', ')
    : conflict.conflictingCapabilityIds.join(', ');
  const subject = titles || copy.none;

  switch (conflict.kind) {
    case 'override_request':
      return copy.conflictSummaryOverride(subject);
    case 'proposed_experiment':
      return copy.conflictSummaryExperiment(subject);
    case 'revise_architecture':
      return copy.conflictSummaryRevision(subject);
    default:
      return null;
  }
}

export function buildBranchTrustUiSummary(
  guidance: BranchGenerationGuidance | null | undefined,
  language = 'en',
): BranchTrustUiSummary {
  const copy = COPY[normalizeLanguage(language)];

  if (!guidance) {
    return {
      mode: 'fast_prototype',
      modeLabel: copy.modeFastPrototype,
      trustBasis: 'branch_memory_observation',
      trustLabel: copy.trustObservedState,
      summary: copy.summaryFastPrototype,
      conflictHandling: 'none',
      conflictLabel: null,
      conflictSummary: null,
      indicators: [buildTrustIndicatorView('fast_prototype_mode', copy)],
    };
  }

  return {
    mode: guidance.operatingMode,
    modeLabel: labelOperatingMode(guidance.operatingMode, copy),
    trustBasis: guidance.trustBasis,
    trustLabel: labelTrustBasis(guidance.trustBasis, copy),
    summary: guidance.trustBasis === 'accepted_branch_architecture'
      ? copy.summaryAcceptedArchitecture
      : guidance.trustBasis === 'proposed_draft_guidance'
        ? copy.summaryProposedGuidance
        : copy.summaryFastPrototype,
    conflictHandling: guidance.conflict.kind,
    conflictLabel: guidance.conflict.kind === 'none' ? null : labelConflictHandling(guidance.conflict.kind, copy),
    conflictSummary: buildConflictSummary(guidance.conflict, copy),
    indicators: guidance.trustIndicators.map(indicator => buildTrustIndicatorView(indicator, copy)),
  };
}

function cloneConstraintToActual(
  constraint: ArchitectureConstraint,
  now: string,
): ArchitectureConstraint {
  return {
    ...constraint,
    phase: 'post_build_actual',
    updatedAt: now,
  };
}

function cloneDecisionToActual(
  decision: ArchitectureDecision,
  now: string,
): ArchitectureDecision {
  return {
    ...decision,
    phase: 'post_build_actual',
    updatedAt: now,
  };
}

function cloneDeferredToActual(
  item: DeferredItem,
  now: string,
): DeferredItem {
  return {
    ...item,
    phase: 'post_build_actual',
    updatedAt: now,
  };
}

function buildActualManifest(
  architecture: ProjectBranchArchitecture,
  capabilities: ResolvedCapability[],
  now: string,
  language: SupportedLanguage,
  revisionId?: string,
): CapabilityManifest {
  const copy = COPY[language];
  return {
    id: `manifest:${architecture.branchId}:actual:${now}`,
    projectId: architecture.projectId,
    branchId: architecture.branchId,
    title: `${copy.actualState} - ${architecture.branch.branchName}`,
    phase: 'post_build_actual',
    status: 'accepted',
    basedOnRevisionId: revisionId ?? architecture.branch.headRevisionId,
    capabilities: capabilities.map(capability => ({
      id: `cap-actual:${architecture.branchId}:${capability.id}`,
      projectId: architecture.projectId,
      branchId: architecture.branchId,
      capabilityId: capability.id,
      title: capability.title,
      status: capability.status,
      plannedState: capability.plannedState,
      actualState: capability.actualState,
      source: capability.source,
      detectedFromRevisionId: revisionId ?? architecture.branch.headRevisionId,
      createdAt: now,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

function buildActualCapabilityDecisions(
  architecture: ProjectBranchArchitecture,
  draftSnapshot: ArchitectureSnapshot | null,
  capabilities: ResolvedCapability[],
  now: string,
): CapabilityDecision[] {
  const byId = new Map(capabilities.map(capability => [capability.id, capability] as const));

  return (draftSnapshot?.capabilityDecisions ?? []).map(decision => {
    const capability = byId.get(decision.capabilityId);
    return {
      ...decision,
      phase: 'post_build_actual',
      actualState: capability?.actualState ?? decision.actualState,
      updatedAt: now,
    };
  });
}

function buildActualImplementationPlan(
  architecture: ProjectBranchArchitecture,
  draftSnapshot: ArchitectureSnapshot | null,
  steps: ResolvedPlanStep[],
  now: string,
  revisionId?: string,
): ImplementationPlan | null {
  const draftPlan = draftSnapshot?.implementationPlan;
  if (!draftPlan) return null;

  return {
    ...draftPlan,
    id: `${draftPlan.id}:actual:${now}`,
    phase: 'post_build_actual',
    basedOnRevisionId: revisionId ?? architecture.branch.headRevisionId,
    status: 'accepted',
    steps: draftPlan.steps.map(step => {
      const resolved = steps.find(entry => entry.id === step.id);
      const state = resolved?.state ?? deriveStepState(step, []);
      return {
        ...step,
        status: stepStatusFromState(state),
        implementationState: state,
        actualStateRevisionId: revisionId ?? architecture.branch.headRevisionId,
        updatedAt: now,
      };
    }),
    updatedAt: now,
  };
}

export function buildBranchGenerationGuidance(
  architecture: ProjectBranchArchitecture | null | undefined,
  files: Record<string, string>,
  language = 'en',
  options: {
    requestIntent?: string;
    generationMode?: StudioGenerationMode;
  } = {},
): BranchGenerationGuidance | null {
  if (!architecture) return null;

  const normalizedLanguage = normalizeLanguage(language);
  const draftSnapshot = resolveSnapshot(architecture, 'pre_build_draft');
  const actualSnapshot = resolveSnapshot(architecture, 'post_build_actual');
  const capabilities = resolveCapabilities(draftSnapshot, actualSnapshot, files, normalizedLanguage);
  const steps = resolvePlanSteps(draftSnapshot, actualSnapshot, capabilities);
  const draftDecisions = uniqueById(draftSnapshot?.architectureDecisions ?? []);
  const currentDecisions = getCurrentArchitectureDecisions(draftDecisions);
  const acceptedDecisions = currentDecisions.filter(item => item.status === 'accepted');
  const proposedDecisions = draftDecisions.filter(item => item.status === 'proposed');
  const acceptedConstraints = (draftSnapshot?.constraints ?? []).filter(item => item.status === 'accepted');
  const proposedConstraints = (draftSnapshot?.constraints ?? []).filter(item => item.status === 'proposed');
  const deferredItems = (draftSnapshot?.deferredItems ?? []).filter(item => item.status === 'deferred');
  const currentImplementationStep = steps.find(step => step.state === 'in_progress') ?? steps.find(step => step.state === 'planned') ?? null;
  const acceptedButIncomplete = capabilities.filter(capability =>
    (capability.plannedState === 'required' || capability.plannedState === 'planned' || capability.plannedState === 'optional')
    && capability.actualState !== 'implemented'
    && capability.actualState !== 'detected',
  );
  const activeCapabilityIds = currentImplementationStep?.capabilityIds.length
    ? currentImplementationStep.capabilityIds.filter(capabilityId => !deferredItems.some(item => item.relatedCapabilityIds.includes(capabilityId)))
    : acceptedButIncomplete
        .map(capability => capability.id)
        .filter(capabilityId => !deferredItems.some(item => item.relatedCapabilityIds.includes(capabilityId)));
  const activeCapabilityTitles = activeCapabilityIds
    .map(capabilityId => capabilities.find(capability => capability.id === capabilityId)?.title ?? capabilityId);
  const implementedNotPlanned = capabilities.filter(capability =>
    (capability.plannedState === 'not_planned' || capability.plannedState === 'deferred')
    && (
      capability.actualState === 'implemented'
      || capability.actualState === 'detected'
      || capability.actualState === 'partially_implemented'
    ),
  );
  const conflict = buildConflictState(options.requestIntent, acceptedDecisions, acceptedConstraints, capabilities);
  const acceptedGuidanceAvailable = hasSnapshotStatus(draftSnapshot, 'accepted');
  const proposedGuidanceAvailable = !acceptedGuidanceAvailable && hasSnapshotStatus(draftSnapshot, 'proposed');
  const guidanceControl = resolveGuidanceControl({
    acceptedGuidanceAvailable,
    proposedGuidanceAvailable,
    deferredItems,
    requestIntent: options.requestIntent,
    generationMode: options.generationMode,
    conflict,
  });
  const guidanceDecisions = guidanceControl.trustBasis === 'proposed_draft_guidance' ? proposedDecisions : acceptedDecisions;
  const guidanceConstraints = guidanceControl.trustBasis === 'proposed_draft_guidance' ? proposedConstraints : acceptedConstraints;
  const fallbackNextStep = buildSuggestedNextStep(capabilities, steps, deferredItems, normalizedLanguage);
  const reality = buildBranchRealitySummary({
    architecture,
    files,
    language: normalizedLanguage,
    decisions: guidanceDecisions,
    constraints: guidanceConstraints,
    deferredItems,
    capabilities,
    fallbackNextStep,
  });

  return {
    operatingMode: guidanceControl.operatingMode,
    trustBasis: guidanceControl.trustBasis,
    authoritative: guidanceControl.authoritative,
    branchSummary: draftSnapshot?.branchBrief.summary ?? architecture.branch.summary,
    acceptedDecisions,
    acceptedConstraints,
    proposedDecisions,
    proposedConstraints,
    guidanceDecisions,
    guidanceConstraints,
    currentImplementationStep,
    activeCapabilityIds,
    activeCapabilityTitles,
    acceptedButIncomplete,
    deferredItems,
    implementedNotPlanned,
    actualSummary: buildActualSummary(capabilities, deferredItems, normalizedLanguage),
    reality,
    suggestedNextStep: reality.nextPass,
    conflict,
    trustIndicators: guidanceControl.trustIndicators,
  };
}

export function formatBranchArchitecturePrompt(
  guidance: BranchGenerationGuidance | null | undefined,
  language = 'en',
): string | null {
  if (!guidance) return null;

  const normalizedLanguage = normalizeLanguage(language);
  const copy = COPY[normalizedLanguage];
  const operatingMode = guidance.operatingMode ?? 'architect_guided';
  const trustBasis = guidance.trustBasis ?? 'accepted_branch_architecture';
  const conflict = guidance.conflict ?? {
    kind: 'none' as const,
    conflictingTitles: [],
    conflictingCapabilityIds: [],
  };
  const trustIndicators = guidance.trustIndicators ?? [];
  const guidanceDecisions = guidance.guidanceDecisions ?? guidance.acceptedDecisions ?? [];
  const guidanceConstraints = guidance.guidanceConstraints ?? guidance.acceptedConstraints ?? [];
  const section = (label: string, values: string[]) =>
    `${label}:\n${(values.length > 0 ? values : [copy.none]).map(value => `- ${value}`).join('\n')}`;
  const decisionsLabel = trustBasis === 'proposed_draft_guidance'
    ? copy.proposedDecisions
    : copy.acceptedDecisions;
  const constraintsLabel = trustBasis === 'proposed_draft_guidance'
    ? copy.proposedConstraints
    : copy.activeConstraints;

  return [
    copy.promptTitle,
    `${copy.promptOperatingMode}: ${labelOperatingMode(operatingMode, copy)}`,
    `${copy.promptTrustBasis}: ${labelTrustBasis(trustBasis, copy)}`,
    `${copy.promptConflictHandling}: ${labelConflictHandling(conflict.kind, copy)}`,
    section(copy.promptStatusIndicators, trustIndicators.map(indicator => buildTrustIndicatorView(indicator, copy).label)),
    conflict.kind !== 'none'
      ? `${copy.promptConflictDetails}: ${conflict.conflictingTitles.join(', ') || conflict.conflictingCapabilityIds.join(', ')}`
      : '',
    `${copy.branchBrief}: ${guidance.branchSummary || copy.none}`,
    section(decisionsLabel, guidanceDecisions.map(item => item.title)),
    section(constraintsLabel, guidanceConstraints.map(item => item.title)),
    section(copy.currentStep, guidance.currentImplementationStep ? [guidance.currentImplementationStep.title] : []),
    section(copy.focusCapabilities, guidance.activeCapabilityTitles),
    section(copy.acceptedNotImplemented, guidance.acceptedButIncomplete.map(item => item.title)),
    section(copy.deferredOutOfScope, guidance.deferredItems.map(item => item.title)),
    `${copy.actualState}: ${guidance.actualSummary}`,
    `${copy.promptModeRule}: ${buildModeRule({ ...guidance, operatingMode, trustBasis, conflict, trustIndicators } as BranchGenerationGuidance, copy)}`,
    copy.hardRule,
  ].join('\n\n');
}

export function refreshArchitectureAfterBuild(
  architecture: ProjectBranchArchitecture,
  files: Record<string, string>,
  options: {
    language?: string;
    now?: string;
    revisionId?: string;
  } = {},
): ArchitectureRefreshResult {
  const now = options.now ?? new Date().toISOString();
  const normalizedLanguage = normalizeLanguage(options.language);
  const draftSnapshot = resolveSnapshot(architecture, 'pre_build_draft');
  const previousActualSnapshot = resolveSnapshot(architecture, 'post_build_actual');
  const capabilities = resolveCapabilities(draftSnapshot, previousActualSnapshot, files, normalizedLanguage);
  const steps = resolvePlanSteps(draftSnapshot, previousActualSnapshot, capabilities);
  const deferredItems = (draftSnapshot?.deferredItems ?? []).filter(item => item.status === 'deferred');
  const actualSummary = buildActualSummary(capabilities, deferredItems, normalizedLanguage);

  const actualSnapshot: ArchitectureSnapshot = {
    id: `snapshot:${architecture.branchId}:actual:${now}`,
    modelVersion: ARCHITECTURE_MEMORY_MODEL_VERSION,
    projectId: architecture.projectId,
    branchId: architecture.branchId,
    phase: 'post_build_actual',
    createdAt: now,
    basedOnRevisionId: options.revisionId ?? architecture.branch.headRevisionId,
    sourcePlanId: draftSnapshot?.sourcePlanId ?? draftSnapshot?.implementationPlan?.id,
    previousSnapshotId: previousActualSnapshot?.id ?? draftSnapshot?.id,
    branchBrief: {
      ...architecture.branch,
      summary: actualSummary,
      status: 'accepted',
      headRevisionId: options.revisionId ?? architecture.branch.headRevisionId,
      updatedAt: now,
    },
    implementationPlan: buildActualImplementationPlan(
      architecture,
      draftSnapshot,
      steps,
      now,
      options.revisionId,
    ),
    capabilityManifest: buildActualManifest(
      architecture,
      capabilities,
      now,
      normalizedLanguage,
      options.revisionId,
    ),
    capabilityDecisions: buildActualCapabilityDecisions(architecture, draftSnapshot, capabilities, now),
    architectureDecisions: getCurrentArchitectureDecisions(draftSnapshot?.architectureDecisions ?? []).map(decision => cloneDecisionToActual(decision, now)),
    constraints: (draftSnapshot?.constraints ?? [])
      .filter(item => item.status === 'accepted')
      .map(item => cloneConstraintToActual(item, now)),
    openQuestions: (draftSnapshot?.openQuestions ?? []).map(question => ({
      ...question,
      phase: 'post_build_actual',
      updatedAt: now,
    })),
    deferredItems: (draftSnapshot?.deferredItems ?? []).map(item => cloneDeferredToActual(item, now)),
  };

  const refreshedArchitecture = upsertArchitectureSnapshot(architecture, actualSnapshot, now);
  return {
    architecture: refreshedArchitecture,
    actualSnapshot,
    guidance: buildBranchGenerationGuidance(refreshedArchitecture, files, normalizedLanguage),
  };
}
