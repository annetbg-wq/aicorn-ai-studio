import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { KickoffBuildScopeId } from '../services/ArchitectPlannerService';
import type { BranchRealityUiSummary } from '../services/BranchArchitectureOrchestrationService';
import { normalizeAppLanguage } from '../shared/appLanguage';
import type {
  GenerationReport,
  VisualQualityDimensionId,
  VisualQualitySummary,
} from '../shared/projectModel';
import {
  Plus, Link2, Camera, Sparkles,
  Paperclip, History,
  X, Clock, RotateCcw, GitBranch,
  Undo2, Redo2, Square, Copy,
} from 'lucide-react';
import type { Snapshot, Attachment, ComposerContextItem, KickoffPhase } from '../hooks/useStudio';
// ProjectsList removed â€” see ProjectsScreen

// â”€â”€ Ð˜Ð½Ñ‚ÐµÑ€Ñ„ÐµÐ¹Ñ Ð¿Ñ€Ð¾Ð¿ÑÐ¾Ð² â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface GenerationTrustState {
  mode: 'fast_prototype' | 'architect_guided' | 'proposed_experiment';
  modeLabel: string;
  trustBasis: 'accepted_branch_architecture' | 'proposed_draft_guidance' | 'branch_memory_observation';
  trustLabel: string;
  summary: string;
  conflictHandling: 'none' | 'override_request' | 'proposed_experiment' | 'revise_architecture';
  conflictLabel: string | null;
  conflictSummary: string | null;
  indicators: Array<{
    id: string;
    label: string;
    state: 'accepted' | 'planned' | 'open' | 'deferred';
  }>;
}

interface ChatMessage {
  id: string;
  role: string;
  content: string | any[];
  type?: string;
  report?: GenerationReport;
  generationTrust?: GenerationTrustState;
  branchReality?: BranchRealityUiSummary | null;
  questions?: string[];
  lineageId?: string;
  lineageRootMessageId?: string;
  startsLineage?: boolean;
  lastGoodRevisionId?: string;
  lineageStatus?: 'current' | 'behind' | 'historical';
  restoreAvailable?: boolean;
}

interface Project {
  id: string;
  name: string;
  description: string;
  theme: string;
  createdAt: string;
  updatedAt: string;
}

interface LeftPanelProps {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  progress: number;
  currentPhase: string;
  scrollRef: React.RefObject<HTMLDivElement>;
  projects: Project[];
  currentProjectId: string | null;
  onNewProject: () => void;
  onLoadProject: (p: Project) => void;
  onRestoreMessageRevision?: (messageId: string) => void;
  onRestoreBlueprintLineage?: (messageId: string) => void;
  onDeleteProject: (id: string) => void;
  onSettings: () => void;
  setTheme: (t: 'dark' | 'medium' | 'light') => void;
  currentTheme: 'dark' | 'medium' | 'light';
  // snapshots
  snapshots: Snapshot[];
  currentSnapshotId: string | null;
  currentVersion: number;
  onRestoreSnapshot: (s: Snapshot) => void;
  // undo / redo
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // AI context
  fullContextMode: boolean;
  setFullContextMode: (v: boolean) => void;
  activeFile: string;
  // billing
  sessionCost: number;
  sessionTokens: number;
  projectCost: number;
  selectedModel: string;
  // auto-routing
  autoRoute?:          boolean;
  setAutoRoute?:       (v: boolean) => void;
  // generation mode
  generationMode?:     'landing' | 'app' | 'superapp';
  setGenerationMode?:  (v: 'landing' | 'app' | 'superapp') => void;
  // language
  appLanguage?:   string;
  // attachments
  attachments?:      Attachment[];
  addAttachment?:    (a: Attachment) => void;
  removeAttachment?: (id: string) => void;
  composerContextItems?: ComposerContextItem[];
  removeComposerContextItem?: (id: string) => void;
  clearComposerContextItems?: () => void;
  // kickoff lifecycle — explicit phase for genesis builds
  kickoffPhase?:           KickoffPhase;
  // blueprint confirmation
  pendingPlan?:            {
    architectKickoff?: {
      selectedOptionId?: KickoffBuildScopeId;
      plan?: {
        scopeOptions?: Array<{
          id: KickoffBuildScopeId | 'revise';
          label: string;
          description: string;
        }>;
      };
    };
  } | null;
  confirmPlan?:            () => void;
  cancelPlan?:             () => void;
  onConfirmPlan?:          (plan: object) => void;
  selectKickoffScope?:     (optionId: KickoffBuildScopeId) => void;
  onClarifyPlan?:          (messageId: string) => void;
  onSubmitClarification?:  (text: string) => void;
}

// â”€â”€ i18n labels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const LABELS: Record<string, Record<string, string>> = {
  en: {
    file: 'File', voice: 'Voice', history: 'History',
    noProjects: 'No projects yet', recent: 'Recent Projects',
    settings: 'Settings', newProject: 'New Project',
    placeholder: 'How can we build today?',
    emptyTagline: 'Describe your idea below, or pick one from the sidebar',
    billing: 'Project Billing', session: 'Session', total: 'Total',
    visualQuality: 'Visual Quality',
    visualQualityHigh: 'High',
    visualQualityMedium: 'Medium',
    visualQualityLow: 'Low',
    visualQualityVerdictStrong: 'Looks visually strong',
    visualQualityVerdictAcceptable: 'Visually acceptable with a few rough edges',
    visualQualityVerdictWeak: 'Needs visual cleanup',
    visualReasonHierarchyStrong: 'Clear visual hierarchy',
    visualReasonHierarchyAcceptable: 'Hierarchy is mostly clear',
    visualReasonHierarchyWeak: 'Weak hierarchy',
    visualReasonSpacingStrong: 'Consistent spacing rhythm',
    visualReasonSpacingAcceptable: 'Spacing rhythm is mostly consistent',
    visualReasonSpacingWeak: 'Inconsistent spacing rhythm',
    visualReasonTokensStrong: 'Consistent visual tokens',
    visualReasonTokensAcceptable: 'Visual tokens are mostly consistent',
    visualReasonTokensWeak: 'Mixed visual tokens',
    visualReasonCtaStrong: 'CTA is visually clear',
    visualReasonCtaAcceptable: 'CTA clarity is workable',
    visualReasonCtaWeak: 'CTA not visually dominant',
    visualReasonClutterStrong: 'Comfortable breathing room',
    visualReasonClutterAcceptable: 'Layout breathing room is workable',
    visualReasonClutterWeak: 'Crowded layout',
    visualReasonMobileStrong: 'Good viewport discipline',
    visualReasonMobileAcceptable: 'Mobile fit is workable',
    visualReasonMobileWeak: 'Mobile fit is thin',
    visualReasonStateStrong: 'Empty/loading/error states are covered',
    visualReasonStateAcceptable: 'Core states are partly covered',
    visualReasonStateWeak: 'Missing empty/loading/error polish',
    visualPolish: 'Visual polish',
    visualPolishAppliedBadge: 'Polished',
    visualPolishFailedBadge: 'Kept safe',
    visualPolishAppliedFast: 'One quiet visual polish pass ran before finish.',
    visualPolishAppliedGuided: 'One guided visual polish pass ran before finish.',
    visualPolishFailed: 'A polish pass was attempted, but the safer revision was kept.',
    restoreVersion: 'Restore this version',
    previewBehindMessage: 'Preview is not showing the version from this message.',
    restoreBlueprint: 'Rollback to this blueprint',
    previewBehindBlueprint: 'Preview is not showing the last saved version from this blueprint.',
    lineageCurrent: 'Current',
    lineageBehind: 'Behind preview',
    lineageHistorical: 'Historical',
  },
  ru: {
    file: 'Файл', voice: 'Голос', history: 'История',
    noProjects: 'Нет проектов', recent: 'Последние проекты',
    settings: 'Настройки', newProject: 'Новый проект',
    placeholder: 'Что строим сегодня?',
    emptyTagline: 'Опишите идею ниже или выберите в сайдбаре',
    billing: 'Биллинг проекта', session: 'Сессия', total: 'Итого',
    visualQuality: 'Визуальное качество',
    visualQualityHigh: 'Высокое',
    visualQualityMedium: 'Среднее',
    visualQualityLow: 'Низкое',
    visualQualityVerdictStrong: 'Визуально выглядит сильно',
    visualQualityVerdictAcceptable: 'Визуально приемлемо, но шероховатости остались',
    visualQualityVerdictWeak: 'Нужна визуальная доработка',
    visualReasonHierarchyStrong: 'Четкая визуальная иерархия',
    visualReasonHierarchyAcceptable: 'Иерархия в целом читается',
    visualReasonHierarchyWeak: 'Слабая иерархия',
    visualReasonSpacingStrong: 'Ровный ритм отступов',
    visualReasonSpacingAcceptable: 'Ритм отступов в целом ровный',
    visualReasonSpacingWeak: 'Неровный ритм отступов',
    visualReasonTokensStrong: 'Последовательные визуальные токены',
    visualReasonTokensAcceptable: 'Визуальные токены в целом последовательны',
    visualReasonTokensWeak: 'Смешанные визуальные токены',
    visualReasonCtaStrong: 'CTA читается сразу',
    visualReasonCtaAcceptable: 'CTA читается приемлемо',
    visualReasonCtaWeak: 'CTA не доминирует визуально',
    visualReasonClutterStrong: 'Есть комфортный воздух в макете',
    visualReasonClutterAcceptable: 'Воздуха в макете в целом хватает',
    visualReasonClutterWeak: 'Перегруженный макет',
    visualReasonMobileStrong: 'Хорошая дисциплина вьюпорта',
    visualReasonMobileAcceptable: 'Мобильная посадка приемлема',
    visualReasonMobileWeak: 'Слабая мобильная посадка',
    visualReasonStateStrong: 'Состояния empty/loading/error покрыты',
    visualReasonStateAcceptable: 'Ключевые состояния покрыты частично',
    visualReasonStateWeak: 'Не хватает polish для empty/loading/error',
    visualPolish: 'Визуальная доработка',
    visualPolishAppliedBadge: 'Доработано',
    visualPolishFailedBadge: 'Оставлена безопасная версия',
    visualPolishAppliedFast: 'Перед завершением прошел один тихий визуальный polish-проход.',
    visualPolishAppliedGuided: 'Перед завершением прошел один направленный визуальный polish-проход.',
    visualPolishFailed: 'Попытка polish была, но сохранена более безопасная версия.',
    restoreVersion: 'Восстановить эту версию',
    previewBehindMessage: 'В превью сейчас не версия из этого сообщения.',
    restoreBlueprint: 'Откатить к этому blueprint',
    previewBehindBlueprint: 'В превью сейчас не последняя сохраненная версия этого blueprint.',
    lineageCurrent: 'Текущая',
    lineageBehind: 'Превью отстает',
    lineageHistorical: 'Историческая',
  },
  es: {
    file: 'Archivo', voice: 'Voz', history: 'Historial',
    noProjects: 'Sin proyectos', recent: 'Proyectos recientes',
    settings: 'Ajustes', newProject: 'Nuevo proyecto',
    placeholder: 'Â¿QuÃ© construimos hoy?',
    emptyTagline: 'Describe tu idea abajo o elige del âš¡ panel lateral',
    billing: 'FacturaciÃ³n', session: 'SesiÃ³n', total: 'Total',
    visualQuality: 'Calidad visual',
    visualQualityHigh: 'Alta',
    visualQualityMedium: 'Media',
    visualQualityLow: 'Baja',
    visualQualityVerdictStrong: 'Se ve visualmente fuerte',
    visualQualityVerdictAcceptable: 'Visualmente aceptable, con algunos bordes por pulir',
    visualQualityVerdictWeak: 'Necesita limpieza visual',
    visualReasonHierarchyStrong: 'JerarquÃ­a visual clara',
    visualReasonHierarchyAcceptable: 'La jerarquÃ­a es bastante clara',
    visualReasonHierarchyWeak: 'JerarquÃ­a dÃ©bil',
    visualReasonSpacingStrong: 'Ritmo de espaciado consistente',
    visualReasonSpacingAcceptable: 'El ritmo de espaciado es bastante consistente',
    visualReasonSpacingWeak: 'Ritmo de espaciado inconsistente',
    visualReasonTokensStrong: 'Tokens visuales consistentes',
    visualReasonTokensAcceptable: 'Los tokens visuales son bastante consistentes',
    visualReasonTokensWeak: 'Tokens visuales mezclados',
    visualReasonCtaStrong: 'La CTA se entiende visualmente',
    visualReasonCtaAcceptable: 'La claridad de la CTA es aceptable',
    visualReasonCtaWeak: 'La CTA no domina visualmente',
    visualReasonClutterStrong: 'Buen aire visual',
    visualReasonClutterAcceptable: 'El aire visual es aceptable',
    visualReasonClutterWeak: 'DiseÃ±o recargado',
    visualReasonMobileStrong: 'Buena disciplina de viewport',
    visualReasonMobileAcceptable: 'El ajuste mÃ³vil es aceptable',
    visualReasonMobileWeak: 'El ajuste mÃ³vil es dÃ©bil',
    visualReasonStateStrong: 'Los estados vacÃ­o/carga/error estÃ¡n cubiertos',
    visualReasonStateAcceptable: 'Los estados clave estÃ¡n cubiertos parcialmente',
    visualReasonStateWeak: 'Falta pulido en vacÃ­o/carga/error',
    visualPolish: 'Pulido visual',
    visualPolishAppliedBadge: 'Pulido',
    visualPolishFailedBadge: 'Se mantuvo la versiÃ³n segura',
    visualPolishAppliedFast: 'Se aplicÃ³ una pasada silenciosa de pulido visual antes de terminar.',
    visualPolishAppliedGuided: 'Se aplicÃ³ una pasada guiada de pulido visual antes de terminar.',
    restoreVersion: 'Restaurar esta versiÃ³n',
    previewBehindMessage: 'La vista previa no estÃ¡ mostrando la versiÃ³n de este mensaje.',
    visualPolishFailed: 'Se intentÃ³ una pasada de pulido, pero se mantuvo la versiÃ³n mÃ¡s segura.',
  },
  de: {
    file: 'Datei', voice: 'Stimme', history: 'Verlauf',
    noProjects: 'Keine Projekte', recent: 'Letzte Projekte',
    settings: 'Einstellungen', newProject: 'Neues Projekt',
    placeholder: 'Was bauen wir heute?',
    emptyTagline: 'Beschreibe deine Idee unten oder wÃ¤hle aus dem âš¡ MenÃ¼',
    billing: 'Abrechnung', session: 'Sitzung', total: 'Gesamt',
    visualQuality: 'Visuelle QualitÃ¤t',
    visualQualityHigh: 'Hoch',
    visualQualityMedium: 'Mittel',
    visualQualityLow: 'Niedrig',
    visualQualityVerdictStrong: 'Wirkt visuell stark',
    visualQualityVerdictAcceptable: 'Visuell akzeptabel mit etwas RestschÃ¤rfe',
    visualQualityVerdictWeak: 'Braucht visuelle Ãœberarbeitung',
    visualReasonHierarchyStrong: 'Klare visuelle Hierarchie',
    visualReasonHierarchyAcceptable: 'Die Hierarchie ist Ã¼berwiegend klar',
    visualReasonHierarchyWeak: 'Schwache Hierarchie',
    visualReasonSpacingStrong: 'Konsistenter AbstÃ¤nderhythmus',
    visualReasonSpacingAcceptable: 'Der AbstÃ¤nderhythmus ist Ã¼berwiegend konsistent',
    visualReasonSpacingWeak: 'Inkonsistenter AbstÃ¤nderhythmus',
    visualReasonTokensStrong: 'Konsistente visuelle Tokens',
    visualReasonTokensAcceptable: 'Visuelle Tokens sind Ã¼berwiegend konsistent',
    visualReasonTokensWeak: 'Gemischte visuelle Tokens',
    visualReasonCtaStrong: 'CTA ist visuell klar',
    visualReasonCtaAcceptable: 'CTA-Klarheit ist brauchbar',
    visualReasonCtaWeak: 'CTA ist nicht visuell dominant',
    visualReasonClutterStrong: 'Angenehm viel Luft im Layout',
    visualReasonClutterAcceptable: 'Der Freiraum im Layout ist brauchbar',
    visualReasonClutterWeak: 'Ãœberladenes Layout',
    visualReasonMobileStrong: 'Gute Viewport-Disziplin',
    visualReasonMobileAcceptable: 'Mobile Anpassung ist brauchbar',
    visualReasonMobileWeak: 'Schwache Mobile-Anpassung',
    visualReasonStateStrong: 'Leere/Laden/Fehler-ZustÃ¤nde sind abgedeckt',
    visualReasonStateAcceptable: 'KernzustÃ¤nde sind teilweise abgedeckt',
    visualReasonStateWeak: 'Polish fÃ¼r Leere/Laden/Fehler fehlt',
    visualPolish: 'Visuelles Polish',
    visualPolishAppliedBadge: 'Poliert',
    visualPolishFailedBadge: 'Sichere Version behalten',
    visualPolishAppliedFast: 'Vor dem Abschluss lief ein leiser visueller Polish-Durchgang.',
    visualPolishAppliedGuided: 'Vor dem Abschluss lief ein gefÃ¼hrter visueller Polish-Durchgang.',
    visualPolishFailed: 'Ein Polish-Durchgang wurde versucht, aber die sicherere Version blieb erhalten.',
  },
  fr: {
    file: 'Fichier', voice: 'Voix', history: 'Historique',
    noProjects: 'Aucun projet', recent: 'Projets rÃ©cents',
    settings: 'ParamÃ¨tres', newProject: 'Nouveau projet',
    placeholder: "Que construisons-nous aujourd'hui?",
    emptyTagline: 'DÃ©crivez votre idÃ©e ci-dessous ou choisissez dans le âš¡ panneau',
    billing: 'Facturation', session: 'Session', total: 'Total',
    visualQuality: 'QualitÃ© visuelle',
    visualQualityHigh: 'Ã‰levÃ©e',
    visualQualityMedium: 'Moyenne',
    visualQualityLow: 'Faible',
    visualQualityVerdictStrong: 'Le rendu visuel est solide',
    visualQualityVerdictAcceptable: 'Visuellement acceptable, avec quelques aspÃ©ritÃ©s',
    visualQualityVerdictWeak: 'A besoin dâ€™un nettoyage visuel',
    visualReasonHierarchyStrong: 'HiÃ©rarchie visuelle claire',
    visualReasonHierarchyAcceptable: 'La hiÃ©rarchie est plutÃ´t claire',
    visualReasonHierarchyWeak: 'HiÃ©rarchie faible',
    visualReasonSpacingStrong: 'Rythme dâ€™espacement cohÃ©rent',
    visualReasonSpacingAcceptable: 'Le rythme dâ€™espacement est plutÃ´t cohÃ©rent',
    visualReasonSpacingWeak: 'Rythme dâ€™espacement incohÃ©rent',
    visualReasonTokensStrong: 'Tokens visuels cohÃ©rents',
    visualReasonTokensAcceptable: 'Les tokens visuels sont plutÃ´t cohÃ©rents',
    visualReasonTokensWeak: 'Tokens visuels mÃ©langÃ©s',
    visualReasonCtaStrong: 'Le CTA est visuellement clair',
    visualReasonCtaAcceptable: 'La clartÃ© du CTA est correcte',
    visualReasonCtaWeak: 'Le CTA ne domine pas visuellement',
    visualReasonClutterStrong: 'Bonne respiration du layout',
    visualReasonClutterAcceptable: 'La respiration du layout est correcte',
    visualReasonClutterWeak: 'Mise en page chargÃ©e',
    visualReasonMobileStrong: 'Bonne discipline de viewport',
    visualReasonMobileAcceptable: 'Lâ€™adaptation mobile est correcte',
    visualReasonMobileWeak: 'Lâ€™adaptation mobile est faible',
    visualReasonStateStrong: 'Les Ã©tats vide/chargement/erreur sont couverts',
    visualReasonStateAcceptable: 'Les Ã©tats clÃ©s sont partiellement couverts',
    visualReasonStateWeak: 'Le polish vide/chargement/erreur manque',
    visualPolish: 'Polish visuel',
    visualPolishAppliedBadge: 'Poli',
    visualPolishFailedBadge: 'Version sÃ»re conservÃ©e',
    visualPolishAppliedFast: 'Un passage discret de polish visuel a eu lieu avant la fin.',
    visualPolishAppliedGuided: 'Un passage guidÃ© de polish visuel a eu lieu avant la fin.',
    visualPolishFailed: 'Une passe de polish a Ã©tÃ© tentÃ©e, mais la version la plus sÃ»re a Ã©tÃ© conservÃ©e.',
  },
  zh: {
    file: 'æ–‡ä»¶', voice: 'è¯­éŸ³', history: 'åŽ†å²',
    noProjects: 'æš‚æ— é¡¹ç›®', recent: 'æœ€è¿‘é¡¹ç›®',
    settings: 'è®¾ç½®', newProject: 'æ–°é¡¹ç›®',
    placeholder: 'ä»Šå¤©æž„å»ºä»€ä¹ˆï¼Ÿ',
    emptyTagline: 'åœ¨ä¸‹æ–¹æè¿°æ‚¨çš„æƒ³æ³•ï¼Œæˆ–ä»Ž âš¡ ä¾§æ é€‰æ‹©',
    billing: 'é¡¹ç›®è´¦å•', session: 'æœ¬æ¬¡', total: 'åˆè®¡',
    visualQuality: 'è§†è§‰è´¨é‡',
    visualQualityHigh: 'é«˜',
    visualQualityMedium: 'ä¸­',
    visualQualityLow: 'ä½Ž',
    visualQualityVerdictStrong: 'è§†è§‰è¡¨çŽ°è¾ƒå¼º',
    visualQualityVerdictAcceptable: 'è§†è§‰ä¸Šå¯æŽ¥å—ï¼Œä½†ä»æœ‰ä¸€äº›ç²—ç³™å¤„',
    visualQualityVerdictWeak: 'éœ€è¦è¿›è¡Œè§†è§‰æ•´ç†',
    visualReasonHierarchyStrong: 'è§†è§‰å±‚çº§æ¸…æ™°',
    visualReasonHierarchyAcceptable: 'å±‚çº§åŸºæœ¬æ¸…æ™°',
    visualReasonHierarchyWeak: 'å±‚çº§åå¼±',
    visualReasonSpacingStrong: 'é—´è·èŠ‚å¥ä¸€è‡´',
    visualReasonSpacingAcceptable: 'é—´è·èŠ‚å¥åŸºæœ¬ä¸€è‡´',
    visualReasonSpacingWeak: 'é—´è·èŠ‚å¥ä¸ä¸€è‡´',
    visualReasonTokensStrong: 'è§†è§‰ token ä¸€è‡´',
    visualReasonTokensAcceptable: 'è§†è§‰ token åŸºæœ¬ä¸€è‡´',
    visualReasonTokensWeak: 'è§†è§‰ token æ··ç”¨',
    visualReasonCtaStrong: 'CTA è§†è§‰ä¸Šå¾ˆæ¸…æ™°',
    visualReasonCtaAcceptable: 'CTA æ¸…æ™°åº¦å°šå¯',
    visualReasonCtaWeak: 'CTA ä¸å¤Ÿçªå‡º',
    visualReasonClutterStrong: 'å¸ƒå±€ç•™ç™½èˆ’é€‚',
    visualReasonClutterAcceptable: 'å¸ƒå±€ç•™ç™½å°šå¯',
    visualReasonClutterWeak: 'å¸ƒå±€è¿‡äºŽæ‹¥æŒ¤',
    visualReasonMobileStrong: 'è§†å£çºªå¾‹è‰¯å¥½',
    visualReasonMobileAcceptable: 'ç§»åŠ¨ç«¯é€‚é…å°šå¯',
    visualReasonMobileWeak: 'ç§»åŠ¨ç«¯é€‚é…åå¼±',
    visualReasonStateStrong: 'ç©º/åŠ è½½/é”™è¯¯çŠ¶æ€å·²è¦†ç›–',
    visualReasonStateAcceptable: 'å…³é”®çŠ¶æ€éƒ¨åˆ†è¦†ç›–',
    visualReasonStateWeak: 'ç©º/åŠ è½½/é”™è¯¯ç¼ºå°‘æ‰“ç£¨',
    visualPolish: 'è§†è§‰æ‰“ç£¨',
    visualPolishAppliedBadge: 'å·²æ‰“ç£¨',
    visualPolishFailedBadge: 'ä¿ç•™å®‰å…¨ç‰ˆæœ¬',
    visualPolishAppliedFast: 'åœ¨å®Œæˆå‰å·²è¿›è¡Œä¸€æ¬¡è½»é‡è§†è§‰æ‰“ç£¨ã€‚',
    visualPolishAppliedGuided: 'åœ¨å®Œæˆå‰å·²è¿›è¡Œä¸€æ¬¡å¼•å¯¼å¼è§†è§‰æ‰“ç£¨ã€‚',
    visualPolishFailed: 'ç³»ç»Ÿå°è¯•äº†ä¸€æ¬¡æ‰“ç£¨ï¼Œä½†ä¿ç•™äº†æ›´å®‰å…¨çš„ç‰ˆæœ¬ã€‚',
  },
};

// â”€â”€ Ð’ÑÐ¿Ð¾Ð¼Ð¾Ð³Ð°Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ðµ ÐºÐ¾Ð¼Ð¿Ð¾Ð½ÐµÐ½Ñ‚Ñ‹ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const trustBadgeStyle = (
  state: 'accepted' | 'planned' | 'open' | 'deferred',
  isDark: boolean,
) => {
  switch (state) {
    case 'accepted':
      return {
        background: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.1)',
        color: '#10b981',
        border: '1px solid rgba(16,185,129,0.24)',
      };
    case 'open':
      return {
        background: isDark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.1)',
        color: '#f59e0b',
        border: '1px solid rgba(245,158,11,0.24)',
      };
    case 'deferred':
      return {
        background: isDark ? 'rgba(139,92,246,0.16)' : 'rgba(139,92,246,0.1)',
        color: '#8b5cf6',
        border: '1px solid rgba(139,92,246,0.24)',
      };
    case 'planned':
    default:
      return {
        background: isDark ? 'rgba(99,102,241,0.16)' : 'rgba(99,102,241,0.1)',
        color: '#6366f1',
        border: '1px solid rgba(99,102,241,0.24)',
      };
  }
};

const VISUAL_REASON_KEY_MAP: Record<
  VisualQualityDimensionId,
  { strong: string; acceptable: string; weak: string }
> = {
  'visual-hierarchy': {
    strong: 'visualReasonHierarchyStrong',
    acceptable: 'visualReasonHierarchyAcceptable',
    weak: 'visualReasonHierarchyWeak',
  },
  'spacing-consistency': {
    strong: 'visualReasonSpacingStrong',
    acceptable: 'visualReasonSpacingAcceptable',
    weak: 'visualReasonSpacingWeak',
  },
  'token-style-consistency': {
    strong: 'visualReasonTokensStrong',
    acceptable: 'visualReasonTokensAcceptable',
    weak: 'visualReasonTokensWeak',
  },
  'cta-prominence': {
    strong: 'visualReasonCtaStrong',
    acceptable: 'visualReasonCtaAcceptable',
    weak: 'visualReasonCtaWeak',
  },
  'clutter-breathing-room': {
    strong: 'visualReasonClutterStrong',
    acceptable: 'visualReasonClutterAcceptable',
    weak: 'visualReasonClutterWeak',
  },
  'mobile-fit': {
    strong: 'visualReasonMobileStrong',
    acceptable: 'visualReasonMobileAcceptable',
    weak: 'visualReasonMobileWeak',
  },
  'state-completeness': {
    strong: 'visualReasonStateStrong',
    acceptable: 'visualReasonStateAcceptable',
    weak: 'visualReasonStateWeak',
  },
};

function visualBadgeState(
  summary: VisualQualitySummary,
): 'accepted' | 'planned' | 'open' {
  if (summary.band === 'high') return 'accepted';
  if (summary.band === 'medium') return 'planned';
  return 'open';
}

function getVisualBandLabel(
  summary: VisualQualitySummary,
  t: (key: string) => string,
): string {
  if (summary.band === 'high') return t('visualQualityHigh');
  if (summary.band === 'medium') return t('visualQualityMedium');
  return t('visualQualityLow');
}

function getVisualVerdictLabel(
  summary: VisualQualitySummary,
  t: (key: string) => string,
): string {
  if (summary.verdict === 'strong') return t('visualQualityVerdictStrong');
  if (summary.verdict === 'acceptable') return t('visualQualityVerdictAcceptable');
  return t('visualQualityVerdictWeak');
}

function getVisualReasonLabels(
  summary: VisualQualitySummary,
  t: (key: string) => string,
): string[] {
  const verdictWeight = (verdict: VisualQualitySummary['verdict']) =>
    summary.verdict === 'weak'
      ? (verdict === 'weak' ? 0 : verdict === 'acceptable' ? 1 : 2)
      : summary.verdict === 'strong'
        ? (verdict === 'strong' ? 0 : verdict === 'acceptable' ? 1 : 2)
        : (verdict === 'acceptable' ? 0 : verdict === 'weak' ? 1 : 2);

  const orderedDimensions = [...summary.dimensions].sort((a, b) => {
    const verdictDelta = verdictWeight(a.verdict) - verdictWeight(b.verdict);
    if (verdictDelta !== 0) return verdictDelta;
    return summary.verdict === 'strong' ? b.score - a.score : a.score - b.score;
  });

  const labels: string[] = [];
  for (const dimension of orderedDimensions) {
    const key = VISUAL_REASON_KEY_MAP[dimension.id]?.[dimension.verdict];
    if (!key) continue;
    const label = t(key);
    if (!labels.includes(label)) labels.push(label);
    if (labels.length === 5) break;
  }

  return labels.slice(0, Math.max(3, Math.min(5, labels.length)));
}

const VisualQualityBanner = ({
  summary,
  isDark,
  textColor,
  subText,
  t,
}: {
  summary?: VisualQualitySummary;
  isDark: boolean;
  textColor: string;
  subText: string;
  t: (key: string) => string;
}) => {
  if (!summary) return null;

  const reasons = getVisualReasonLabels(summary, t);

  return (
    <div
      data-testid="generation-visual-quality"
      style={{
        marginTop: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.2)'}`,
        background: isDark ? 'rgba(15,23,42,0.22)' : 'rgba(248,250,252,0.88)',
        display: 'grid',
        gap: 7,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: subText, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {t('visualQuality')}
        </span>
        <span
          style={{
            ...trustBadgeStyle(visualBadgeState(summary), isDark),
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 999,
            padding: '3px 8px',
          }}
        >
          {getVisualBandLabel(summary, t)}
        </span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: textColor }}>
        {getVisualVerdictLabel(summary, t)}
      </div>
      <div data-testid="generation-visual-quality-reasons" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {reasons.map((reason) => (
          <span
            key={reason}
            style={{
              fontSize: 11,
              lineHeight: 1.4,
              color: textColor,
              borderRadius: 999,
              padding: '3px 8px',
              background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
              border: `1px solid ${isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.2)'}`,
            }}
          >
            {reason}
          </span>
        ))}
      </div>
    </div>
  );
};

const getVisualPolishMessage = (
  summary: GenerationReport['visualPolish'],
  t: (key: string) => string,
): string | null => {
  if (!summary) return null;
  if (summary.outcome === 'applied') {
    return summary.mode === 'architect_guided'
      ? t('visualPolishAppliedGuided')
      : t('visualPolishAppliedFast');
  }
  if (summary.outcome === 'failed') {
    return t('visualPolishFailed');
  }
  return null;
};

const VisualPolishBanner = ({
  summary,
  isDark,
  textColor,
  subText,
  t,
}: {
  summary?: GenerationReport['visualPolish'];
  isDark: boolean;
  textColor: string;
  subText: string;
  t: (key: string) => string;
}) => {
  const message = getVisualPolishMessage(summary, t);
  if (!summary || !message) return null;

  const badge = summary.outcome === 'applied'
    ? t('visualPolishAppliedBadge')
    : t('visualPolishFailedBadge');
  const badgeState = summary.outcome === 'applied' ? 'accepted' : 'planned';

  return (
    <div
      data-testid="generation-visual-polish"
      style={{
        marginTop: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.2)'}`,
        background: isDark ? 'rgba(15,23,42,0.22)' : 'rgba(248,250,252,0.88)',
        display: 'grid',
        gap: 7,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: subText, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {t('visualPolish')}
        </span>
        <span
          style={{
            ...trustBadgeStyle(badgeState, isDark),
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 999,
            padding: '3px 8px',
          }}
        >
          {badge}
        </span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: textColor }}>
        {message}
      </div>
    </div>
  );
};

const GenerationTrustBanner = ({
  trust,
  isDark,
  textColor,
}: {
  trust?: GenerationTrustState | null;
  isDark: boolean;
  textColor: string;
}) => {
  if (!trust) return null;

  const extraIndicators = trust.indicators.filter(indicator =>
    !(
      (indicator.id === 'fast_prototype_mode' && trust.mode === 'fast_prototype')
      || (indicator.id === 'accepted_branch_architecture' && trust.trustBasis === 'accepted_branch_architecture')
      || (indicator.id === 'proposed_draft_guidance' && trust.trustBasis === 'proposed_draft_guidance')
    ));

  const trustBasisState: 'accepted' | 'planned' | 'open' = trust.trustBasis === 'accepted_branch_architecture'
    ? 'accepted'
    : trust.trustBasis === 'proposed_draft_guidance'
      ? 'open'
      : 'planned';

  return (
    <div
      data-testid="generation-trust-banner"
      style={{
        marginTop: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.2)'}`,
        background: isDark ? 'rgba(15,23,42,0.22)' : 'rgba(248,250,252,0.88)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
        <span style={{ ...trustBadgeStyle('planned', isDark), fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '3px 8px' }}>
          {trust.modeLabel}
        </span>
        <span style={{ ...trustBadgeStyle(trustBasisState, isDark), fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '3px 8px' }}>
          {trust.trustLabel}
        </span>
        {extraIndicators.map(indicator => (
          <span
            key={indicator.id}
            style={{ ...trustBadgeStyle(indicator.state, isDark), fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '3px 8px' }}
          >
            {indicator.label}
          </span>
        ))}
        {trust.conflictLabel ? (
          <span style={{ ...trustBadgeStyle('open', isDark), fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '3px 8px' }}>
            {trust.conflictLabel}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: textColor }}>
        {trust.summary}
      </div>
      {trust.conflictSummary ? (
        <div data-testid="generation-trust-conflict" style={{ fontSize: 12, lineHeight: 1.5, color: '#f59e0b', marginTop: 6 }}>
          {trust.conflictSummary}
        </div>
      ) : null}
    </div>
  );
};

const FallbackPlanCard = ({
  m,
  onConfirmPlan,
  isDark,
  textColor,
}: {
  m: any;
  onConfirmPlan: (m: object) => void;
  isDark: boolean;
  textColor: string;
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  return (
    <div data-testid="generation-plan-card" className="plan-card-fallback">
      <div className="plan-content">{typeof m.content === 'string' ? m.content : 'Plan ready'}</div>
      <GenerationTrustBanner trust={m.generationTrust} isDark={isDark} textColor={textColor} />
      <button
        data-testid="confirm-plan-btn"
        onClick={() => {
          setIsConfirming(true);
          onConfirmPlan(m as object);
        }}
        disabled={isConfirming}
      >
        {isConfirming ? 'Building...' : 'Build it'}
      </button>
    </div>
  );
};

const TypingDots = () => (
  <div className="flex items-center gap-1 px-1 py-0.5">
    {[0, 1, 2].map(i => (
      <span key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
        style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }} />
    ))}
  </div>
);

const GenerationReportCard: React.FC<{
  messageId: string;
  report: GenerationReport;
  content: string;
  generationTrust?: GenerationTrustState | null;
  branchReality?: BranchRealityUiSummary | null;
  restoreAvailable?: boolean;
  lineageStatus?: 'current' | 'behind' | 'historical';
  onRestoreVersion?: (messageId: string) => void;
  isDark: boolean;
  textColor: string;
  subText: string;
  t: (key: string) => string;
}> = ({ messageId, report, content, generationTrust, branchReality, restoreAvailable = false, lineageStatus, onRestoreVersion, isDark, textColor, subText, t }) => {
  const isNew = report.mode === 'NEW';
  const allFiles = isNew
    ? report.filesCreated
    : [...report.filesModified, ...report.filesCreated];
  const accent = isDark ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.1)';
  const border = isDark ? 'rgba(16,185,129,0.22)' : 'rgba(16,185,129,0.18)';
  const lineageStatusLabel = lineageStatus === 'behind'
    ? t('lineageBehind')
    : lineageStatus === 'historical'
      ? t('lineageHistorical')
      : lineageStatus === 'current'
        ? t('lineageCurrent')
        : null;
  return (
    <div className="max-w-[92%]" style={{
      background: accent,
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: '11px 14px',
      userSelect: 'text',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>{isNew ? 'OK' : 'EDIT'}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{content}</span>
        {lineageStatusLabel ? (
          <span style={{
            marginLeft: 'auto',
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 999,
            background: lineageStatus === 'historical' ? 'rgba(148,163,184,0.18)' : 'rgba(99,102,241,0.15)',
            color: lineageStatus === 'historical' ? subText : '#818cf8',
          }}>
            {lineageStatusLabel}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 11, color: subText, marginBottom: 7 }}>
        {report.theme !== 'default' ? `Theme: ${report.theme} Â· ` : ''}
        {report.pageCount > 0 ? `${report.pageCount} page${report.pageCount !== 1 ? 's' : ''} Â· ` : ''}
        {`${report.duration}s`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {allFiles.slice(0, 8).map(f => {
          const isMod = !isNew && report.filesModified.includes(f);
          return (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <span>{isMod ? 'ðŸ“' : 'ðŸ“„'}</span>
              <span style={{ fontFamily: 'monospace', color: textColor, opacity: 0.8 }}>
                {f}{isMod ? ' (modified)' : ''}
              </span>
            </div>
          );
        })}
        {allFiles.length > 8 && (
          <div style={{ fontSize: 11, color: subText, marginTop: 1 }}>
            +{allFiles.length - 8} more
          </div>
        )}
      </div>
      <GenerationTrustBanner trust={generationTrust} isDark={isDark} textColor={textColor} />
      <VisualQualityBanner
        summary={report.visualQuality}
        isDark={isDark}
        textColor={textColor}
        subText={subText}
        t={t}
      />
      <VisualPolishBanner
        summary={report.visualPolish}
        isDark={isDark}
        textColor={textColor}
        subText={subText}
        t={t}
      />
      {restoreAvailable ? (
        <div
          data-testid={`generation-report-reconciliation-${messageId}`}
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${isDark ? 'rgba(96,165,250,0.22)' : 'rgba(59,130,246,0.18)'}`,
            background: isDark ? 'rgba(30,41,59,0.4)' : 'rgba(239,246,255,0.9)',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, lineHeight: 1.5, color: textColor }}>
            {t('previewBehindMessage')}
          </div>
          {onRestoreVersion ? (
            <button
              data-testid={`generation-report-restore-${messageId}`}
              onClick={() => onRestoreVersion(messageId)}
              style={{
                justifySelf: 'start',
                borderRadius: 999,
                border: 'none',
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                background: isDark ? '#2563eb' : '#1d4ed8',
                cursor: 'pointer',
              }}
            >
              {t('restoreVersion')}
            </button>
          ) : null}
        </div>
      ) : null}
      {branchReality ? (
        <div
          data-testid="generation-branch-reality"
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.2)'}`,
            background: isDark ? 'rgba(15,23,42,0.22)' : 'rgba(248,250,252,0.88)',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ ...trustBadgeStyle('planned', isDark), fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '3px 8px' }}>
              {branchReality.sectionTitle}
            </span>
            <span style={{ ...trustBadgeStyle('accepted', isDark), fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '3px 8px' }}>
              {branchReality.stateLabel}
            </span>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: textColor }}>
            {branchReality.summary}
          </div>
          <div style={{ display: 'grid', gap: 4, fontSize: 11, color: subText }}>
            {[
              { label: branchReality.alignedLabel, items: branchReality.alignedItems, empty: branchReality.alignedEmpty },
              { label: branchReality.missingLabel, items: branchReality.missingItems, empty: branchReality.missingEmpty },
              { label: branchReality.driftingLabel, items: branchReality.driftingItems, empty: branchReality.driftingEmpty },
            ].map(section => (
              <div key={section.label}>
                <strong style={{ color: textColor }}>{section.label}:</strong>{' '}
                {section.items.length > 0
                  ? section.items.slice(0, 2).map(item => item.title).join(', ')
                  : section.empty}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: subText, lineHeight: 1.5 }}>
            <strong style={{ color: textColor }}>{branchReality.nextPassLabel}:</strong>{' '}
            {branchReality.nextPassTitle}
            {branchReality.nextPassSummary ? ` — ${branchReality.nextPassSummary}` : ''}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const ClarificationCard: React.FC<{
  questions: string[];
  isDark: boolean;
  textColor: string;
  subText: string;
}> = ({ questions, isDark, textColor, subText }) => {
  const accent = isDark ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.07)';
  const border = isDark ? 'rgba(139,92,246,0.22)' : 'rgba(139,92,246,0.18)';
  return (
    <div className="max-w-[92%]" style={{
      background: accent,
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: '11px 14px',
      userSelect: 'text',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>ðŸ¤”</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>
          A couple of questions before I start:
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {questions.map((q, i) => (
          <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, color: textColor, lineHeight: 1.5 }}>
            <span style={{ color: subText, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
            <span>{q}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: subText }}>
        Just type your answer below â†“
      </div>
    </div>
  );
};

const THEME_COLORS: Record<string, string> = {
  'dark-slate': '#475569',
  'trust':      '#3b82f6',
  'warm':       '#f59e0b',
  'neon':       '#22d3ee',
  'bloom':      '#ec4899',
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH} ч назад`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// â”€â”€ ÐžÑÐ½Ð¾Ð²Ð½Ð¾Ð¹ ÐºÐ¾Ð¼Ð¿Ð¾Ð½ÐµÐ½Ñ‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// ── BlueprintCard ─────────────────────────────────────────────────────────────
// Always rendered inside messages.map() — never unmounted after first append.
// If blueprintVisible === false the card is hidden via early return (no DOM removal).

interface BlueprintCardProps {
  m: any;
  pendingPlan: LeftPanelProps['pendingPlan'];
  isPending: boolean;
  kickoffPhase: KickoffPhase;
  isDark: boolean;
  textColor: string;
  subText: string;
  borderColor: string;
  onConfirmPlan: (plan: object) => void;
  selectKickoffScope: (optionId: KickoffBuildScopeId) => void;
  onClarifyPlan: (messageId: string) => void;
  cancelPlan: () => void;
  onRestoreLineage?: (messageId: string) => void;
  t: (key: string) => string;
}

const BlueprintCard: React.FC<BlueprintCardProps> = ({
  m, pendingPlan, isPending, kickoffPhase, isDark, textColor, subText, borderColor, onConfirmPlan, selectKickoffScope, onClarifyPlan, cancelPlan, onRestoreLineage, t,
}) => {
  // Visibility guard — keeps fiber in the tree but renders nothing.
  // This prevents the insertBefore crash that occurs when a node is removed
  // by REMOVE_BY_TYPE while a sibling is being inserted simultaneously.
  if (m.blueprintVisible === false) return null;

  const bpPages: string[] = m.pages ?? [];
  const kickoffOptions = pendingPlan?.architectKickoff?.plan?.scopeOptions
    ?.filter((option): option is { id: KickoffBuildScopeId; label: string; description: string } => option.id !== 'revise')
    ?? [];
  const selectedKickoffScope = pendingPlan?.architectKickoff?.selectedOptionId ?? 'core';
  const isAwaitingKickoffConfirmation = isPending && kickoffPhase === 'awaiting_confirmation';
  const isKickoffBuildStarting = isPending && kickoffPhase === 'build_starting';
  const lineageStatusLabel = m.lineageStatus === 'behind'
    ? t('lineageBehind')
    : m.lineageStatus === 'historical'
      ? t('lineageHistorical')
      : m.lineageStatus === 'current'
        ? t('lineageCurrent')
        : null;
  const showRestoreLineage =
    !isPending
    && Boolean(m.startsLineage)
    && Boolean(m.lastGoodRevisionId)
    && Boolean(m.restoreAvailable)
    && !!onRestoreLineage;

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid rgba(99,102,241,0.4)',
      borderRadius: 12, overflow: 'hidden', margin: '8px 0',
    }}>
      <div style={{
        padding: '12px 16px', background: 'rgba(99,102,241,0.08)',
        borderBottom: '1px solid rgba(99,102,241,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>{m.appName}</div>
          <div style={{ fontSize: 11, color: subText, marginTop: 2 }}>
            {bpPages.length} screens · {m.theme} theme
          </div>
        </div>
        {(isAwaitingKickoffConfirmation || isKickoffBuildStarting || lineageStatusLabel) && (
          <div style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 10,
            background: isAwaitingKickoffConfirmation
              ? 'rgba(251,191,36,0.15)'
              : lineageStatusLabel
                ? (m.lineageStatus === 'historical' ? 'rgba(148,163,184,0.18)' : 'rgba(99,102,241,0.15)')
                : 'rgba(99,102,241,0.15)',
            color: isAwaitingKickoffConfirmation
              ? '#f59e0b'
              : lineageStatusLabel && m.lineageStatus === 'historical'
                ? subText
                : '#818cf8',
            fontWeight: 600,
          }}>
            {isAwaitingKickoffConfirmation
              ? 'Awaiting confirmation'
              : isKickoffBuildStarting
                ? 'Build starting'
                : lineageStatusLabel}
          </div>
        )}
      </div>

      <div style={{
        padding: '12px 16px', fontSize: 12, color: textColor,
        lineHeight: 1.6, maxHeight: isPending ? 400 : 200,
        overflowY: 'auto', whiteSpace: 'pre-wrap',
      }}>
        {m.blueprintText && (
          <div dangerouslySetInnerHTML={{
            __html: String(m.blueprintText).replace(/\[object Object\]/g, ''),
          }} />
        )}
        <GenerationTrustBanner trust={m.generationTrust} isDark={isDark} textColor={textColor} />
        {showRestoreLineage ? (
          <div
            data-testid={`blueprint-lineage-reconciliation-${m.id}`}
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${isDark ? 'rgba(96,165,250,0.22)' : 'rgba(59,130,246,0.18)'}`,
              background: isDark ? 'rgba(30,41,59,0.4)' : 'rgba(239,246,255,0.9)',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, lineHeight: 1.5, color: textColor }}>
              {t('previewBehindBlueprint')}
            </div>
            <button
              data-testid={`blueprint-lineage-restore-${m.id}`}
              onClick={() => onRestoreLineage?.(m.id)}
              style={{
                justifySelf: 'start',
                borderRadius: 999,
                border: 'none',
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                background: isDark ? '#2563eb' : '#1d4ed8',
                cursor: 'pointer',
              }}
            >
              {t('restoreBlueprint')}
            </button>
          </div>
        ) : null}
      </div>

      {m.technicalBlueprint && JSON.stringify(m.technicalBlueprint).length > 20 && (
        <details style={{
          margin: '0 16px 12px', borderRadius: 8,
          border: `1px solid ${borderColor}`, overflow: 'hidden',
        }}>
          <summary style={{
            padding: '8px 12px', fontSize: 11, fontWeight: 600,
            color: subText, cursor: 'pointer',
            background: 'rgba(99,102,241,0.05)', userSelect: 'none',
          }}>
            Technical Blueprint
          </summary>
          <pre style={{
            padding: '10px 12px', fontSize: 10, color: subText,
            lineHeight: 1.5, maxHeight: 300, overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            margin: 0, fontFamily: 'monospace',
          }}>
            {JSON.stringify(m.technicalBlueprint, null, 2)}
          </pre>
        </details>
      )}

      {isAwaitingKickoffConfirmation && kickoffOptions.length > 0 && (
        <div style={{
          margin: '0 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: subText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            First build scope
          </div>
          <div style={{ fontSize: 11, color: subText, lineHeight: 1.5 }}>
            Default scope will start automatically in a moment. Choose another scope or start now.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {kickoffOptions.map(option => {
              const isSelected = option.id === selectedKickoffScope;
              return (
                <button
                  key={option.id}
                  data-testid={`kickoff-option-${option.id}`}
                  onClick={() => selectKickoffScope(option.id)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: `1px solid ${isSelected ? '#6366f1' : borderColor}`,
                    background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: textColor,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{option.label}</div>
                  <div style={{ fontSize: 11, color: subText, marginTop: 4, lineHeight: 1.5 }}>
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isAwaitingKickoffConfirmation && (
        <div
          data-testid="generation-plan-card"
          style={{ padding: '12px 16px', borderTop: `1px solid ${borderColor}`, display: 'flex', gap: 8 }}
        >
          <button
            data-testid="confirm-plan-btn"
            onClick={() => onConfirmPlan(m.pendingPlan || m.technicalBlueprint)}
            style={{
              flex: 1, padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
              background: '#6366f1', border: 'none', color: '#fff',
              fontSize: 13, fontWeight: 600,
            }}
          >
            Start build
          </button>
          <button
            data-testid="clarify-plan-btn"
            onClick={() => onClarifyPlan(String(m.id ?? ''))}
            style={{
              padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${borderColor}`,
              color: subText, fontSize: 13,
            }}
          >
            {kickoffOptions.length > 0 ? 'Revise plan' : 'Уточнить'}
          </button>
          <button onClick={cancelPlan} style={{
            padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${borderColor}`,
            color: subText, fontSize: 13,
          }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

// ── GenerationPlanCard ────────────────────────────────────────────────────────
// Extracted so it can hold its own isClarifying / clarifyText local state
// (useState is not allowed inside a .map() callback).

interface GenerationPlanCardProps {
  m: any;
  pendingPlan: object | null;
  textColor: string;
  subText: string;
  borderColor: string;
  isDark: boolean;
  onConfirmPlan: (plan: object) => void;
  onSubmitClarification: (text: string) => void;
  onCancel?: () => void;
}

const renderDescription = (desc: unknown): string => {
  if (typeof desc === 'string') return desc;
  if (desc !== null && typeof desc === 'object') {
    const o = desc as Record<string, unknown>;
    if (typeof o.label === 'string') return o.label;
    if (typeof o.text === 'string')  return o.text;
    return JSON.stringify(desc);
  }
  return String(desc ?? '');
};

const getKickoffStatus = (phase: KickoffPhase): { label: string; testId: string } | null => {
  switch (phase) {
    case 'prompt_received':
      return { label: 'Prompt received', testId: 'kickoff-prompt-received' };
    case 'analyzing':
      return { label: 'Planning first build', testId: 'kickoff-planning' };
    case 'awaiting_confirmation':
      return { label: 'Awaiting confirmation', testId: 'kickoff-awaiting-confirmation' };
    case 'build_starting':
      return { label: 'Build starting', testId: 'kickoff-build-starting' };
    case 'building':
      return { label: 'Build in progress', testId: 'kickoff-build-in-progress' };
    default:
      return null;
  }
};

const GenerationPlanCard: React.FC<GenerationPlanCardProps> = ({
  m, pendingPlan, textColor, subText, borderColor, isDark,
  onConfirmPlan, onSubmitClarification, onCancel,
}) => {
  const [isClarifying, setIsClarifying]   = useState(false);
  const [clarifyText, setClarifyText]     = useState('');
  const [confirmed, setConfirmed]         = useState(false);
  const confirmLockedRef                  = useRef(false);

  const isDone:         boolean = (m as any).buildStatus === 'ready';
  const isBuilding:     boolean = (m as any).buildStatus === 'building';
  const steps:          Array<{ id: string; label: string; status: string }> = (m as any).steps ?? [];
  const pages:          string[]  = (m as any).pages ?? [];
  const screens:        Array<{ name: string; description: unknown }> = (m as any).screens ?? [];
  const summary:        string    = (m as any).summary ?? '';
  const appName:        string    = (m as any).appName ?? '';
  const progress:       number    = (m as any).progress ?? 0;
  const displayProgress: number   = Math.max(progress, 15);
  const streamingCode:  string    = (m as any).streamingCode ?? '';

  // After user clicks confirm — hide plan details, show progress overlay.
  if (confirmed && !isDone) {
    return (
      <div data-testid="generation-plan-card" style={{
        background: 'var(--card)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 12, padding: '14px 16px', margin: '8px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 14, height: 14, flexShrink: 0,
            border: '2px solid rgba(99,102,241,0.3)',
            borderTopColor: '#6366f1', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: textColor }}>ГЕНЕРАЦИЯ... {displayProgress}%</div>
        </div>
        <div style={{
          marginTop: 10, height: 2, borderRadius: 1,
          background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${displayProgress}%`,
            background: '#6366f1', transition: 'width 0.5s ease',
          }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Show confirm UI only while waiting for user decision (blueprint ready, not yet building).
  const showConfirm = pendingPlan !== null && !isBuilding && !isDone;

  return (
    <div data-testid="generation-plan-card" style={{
      background: 'var(--card)',
      border: `1px solid ${isDone ? 'rgba(34,197,94,0.3)' : 'rgba(99,102,241,0.3)'}`,
      borderRadius: 12, padding: '14px 16px', margin: '8px 0',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {isDone ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>OK</span>
        ) : (
          <div style={{
            width: 14, height: 14, flexShrink: 0,
            border: '2px solid rgba(99,102,241,0.3)',
            borderTopColor: '#6366f1', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        )}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: textColor }}>
            {isDone
              ? `${appName || 'Приложение'} готово`
              : appName ? `Генерация ${appName}...` : 'Анализирую идею...'}
          </div>
          {isBuilding && (
            <div style={{ fontSize: 11, color: subText, marginTop: 2 }}>
              Собираю проект...
            </div>
          )}
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {steps.map(step => (
          <div key={step.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12,
            opacity: step.status === 'pending' ? 0.4 : 1,
            color: textColor,
          }}>
            {step.status === 'done'    && <span style={{ color: '#22c55e', fontSize: 11 }}>✓</span>}
            {step.status === 'active'  && <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#6366f1', flexShrink: 0,
              animation: 'pulse 1.5s ease infinite',
            }} />}
            {step.status === 'pending' && <div style={{
              width: 8, height: 8, borderRadius: '50%',
              border: '1px solid var(--border)', flexShrink: 0,
            }} />}
            {step.label}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {!isDone && (
        <div style={{
          marginTop: 10, height: 2, borderRadius: 1,
          background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: '#6366f1', transition: 'width 0.5s ease',
          }} />
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div style={{ fontSize: 12, color: subText, marginTop: 8, lineHeight: 1.5 }}>
          {summary}
        </div>
      )}

      {/* Screens with descriptions */}
      {screens.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {screens.map((s, i) => (
            <div key={i} style={{ fontSize: 12, color: textColor }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              {s.description != null && (
                <span style={{ color: subText, marginLeft: 6 }}>
                  — {renderDescription(s.description)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pages (string tags) */}
      {pages.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {pages.map(p => (
            <span key={p} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 20,
              background: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
              color: '#818cf8',
            }}>{p}</span>
          ))}
        </div>
      )}

      {/* Streaming code — collapsible */}
      {streamingCode && (
        <details style={{ marginTop: 10 }}>
          <summary style={{
            fontSize: 11, color: subText,
            cursor: 'pointer', userSelect: 'none',
          }}>
            {isDone
              ? 'Показать код'
              : `ГЕНЕРАЦИЯ... (${Math.round(streamingCode.length / 1000)}k chars)`}
          </summary>
          <div style={{ position: 'relative', marginTop: 6 }}>
            <pre style={{
              padding: 8, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
              borderRadius: 6, fontSize: 10, fontFamily: 'monospace',
              overflow: 'auto', maxHeight: 180,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              color: subText, margin: 0,
            }}>
              {isDone ? streamingCode.slice(0, 3000) : streamingCode.slice(-2000)}
            </pre>
            {isDone && (
              <button
                onClick={() => navigator.clipboard.writeText(streamingCode)}
                style={{
                  position: 'absolute', top: 6, right: 6,
                  padding: '3px 8px', fontSize: 10, borderRadius: 4,
                  border: `1px solid ${borderColor}`,
                  background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                  color: subText, cursor: 'pointer',
                }}
              >Копировать</button>
            )}
          </div>
        </details>
      )}

      {/* Confirm / Clarify — shown while waiting for user decision */}
      {showConfirm && (
        <div style={{
          marginTop: 12, paddingTop: 12,
          borderTop: `1px solid ${borderColor}`,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              data-testid="confirm-plan-btn"
              onClick={() => {
                if (confirmLockedRef.current) return;
                confirmLockedRef.current = true;
                setConfirmed(true);
                onConfirmPlan(m as object);
              }}
              style={{
                flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer',
                background: '#6366f1', border: 'none', color: '#fff',
                fontSize: 13, fontWeight: 600,
              }}
            >
              Все верно
            </button>
            <button
              data-testid="clarify-plan-btn"
              onClick={() => setIsClarifying(true)}
              style={{
                padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent',
                border: `1px solid ${borderColor}`,
                color: subText, fontSize: 13,
              }}
            >
              Уточнить
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                style={{
                  padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
                  background: 'transparent',
                  border: `1px solid ${borderColor}`,
                  color: subText, fontSize: 13,
                }}
              >
                Отмена
              </button>
            )}
          </div>

          {isClarifying && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                data-testid="clarify-input"
                value={clarifyText}
                onChange={e => setClarifyText(e.target.value)}
                placeholder="Опишите, что нужно изменить в плане..."
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '8px 10px', borderRadius: 8, fontSize: 12,
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  border: `1px solid ${borderColor}`, color: textColor,
                  resize: 'vertical', outline: 'none',
                }}
              />
              <button
                data-testid="submit-clarify-btn"
                onClick={() => {
                  if (clarifyText.trim()) {
                    onSubmitClarification(clarifyText.trim());
                    setIsClarifying(false);
                    setClarifyText('');
                  }
                }}
                style={{
                  alignSelf: 'flex-end', padding: '7px 16px',
                  borderRadius: 8, cursor: 'pointer',
                  background: '#6366f1', border: 'none',
                  color: '#fff', fontSize: 12, fontWeight: 600,
                }}
              >
                Отправить
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
};

export const LeftPanel: React.FC<LeftPanelProps> = ({
  messages, input, setInput, onSend, onStop, isGenerating, progress, currentPhase, scrollRef,
  projects, currentProjectId, onNewProject, onLoadProject, onRestoreMessageRevision, onRestoreBlueprintLineage, onDeleteProject,
  onSettings, setTheme, currentTheme,
  snapshots, currentSnapshotId, currentVersion, onRestoreSnapshot,
  canUndo, canRedo, onUndo, onRedo,
  fullContextMode, setFullContextMode, activeFile,
  sessionCost, sessionTokens, projectCost, selectedModel,
  autoRoute = false, setAutoRoute = () => {},
  generationMode = 'app', setGenerationMode = () => {},
  appLanguage = 'en',
  attachments = [], addAttachment = () => {}, removeAttachment = () => {},
  composerContextItems = [], removeComposerContextItem = () => {}, clearComposerContextItems = () => {},
  kickoffPhase = 'idle' as KickoffPhase,
  pendingPlan = null, confirmPlan = () => {}, cancelPlan = () => {},
  onConfirmPlan = () => confirmPlan(), selectKickoffScope = () => {}, onClarifyPlan = () => {}, onSubmitClarification = () => {},
}) => {
  const normalizedLanguage = normalizeAppLanguage(appLanguage);
  const lang = LABELS[normalizedLanguage] ?? LABELS['en'];
  const t = (key: string) => lang[key] ?? LABELS['en'][key] ?? key;
  const [historyOpen, setHistoryOpen]         = useState(false);
  const [previewSnap, setPreviewSnap]         = useState<Snapshot | null>(null);
  const [attachMenuOpen, setAttachMenuOpen]   = useState(false);
  const [copiedIdx, setCopiedIdx]             = useState<string | null>(null);
  const [isDragging, setIsDragging]           = useState(false);
  const [isDraggingInput, setIsDraggingInput] = useState(false);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  /** Resize image to max 1920px wide and return JPEG data-URI (~85% quality). */
  const resizeImage = (file: File): Promise<string> =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1920;
          const ratio = Math.min(1, MAX / img.width);
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(img.width  * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    });

  /** Dynamically loads pdf.js from CDN (once) and extracts text from the first 5 pages. */
  async function extractPdfText(base64: string): Promise<string> {
    if (!(window as any).pdfjsLib) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload  = () => resolve();
        script.onerror = () => reject(new Error('Failed to load pdf.js'));
        document.head.appendChild(script);
      });
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const pdfjsLib = (window as any).pdfjsLib;
    const binaryStr = atob(base64.split(',')[1]);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const texts: string[] = [];
    const maxPages = Math.min(pdf.numPages, 5);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      texts.push(content.items.map((item: any) => item.str).join(' '));
    }
    return texts.join('\n\n').slice(0, 3000);
  }

  const handleFileSelect = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach(async file => {
      if (file.size > 10 * 1024 * 1024) {
        console.warn(`File too large: ${file.name} (max 10MB)`);
        return;
      }
      if (file.type.startsWith('image/')) {
        const dataUri = await resizeImage(file);
        addAttachment({
          id:       crypto.randomUUID(),
          name:     file.name,
          type:     'image',
          data:     dataUri,
          mimeType: 'image/jpeg',
        });
      } else if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async ev => {
          const base64 = ev.target?.result as string;
          let textContent: string | undefined;
          try {
            textContent = await extractPdfText(base64);
            console.log(`[Intake] PDF extracted: ${textContent.length} chars`);
          } catch (e) {
            console.warn(`[Intake] PDF extraction failed: ${e}`);
          }
          addAttachment({
            id:          crypto.randomUUID(),
            name:        file.name,
            type:        'pdf',
            data:        base64,
            mimeType:    file.type,
            textContent,
          });
        };
        reader.readAsDataURL(file);
      } else {
        // Plain text / code â€” append content to the textarea
        const reader = new FileReader();
        reader.onload = ev => {
          const text = ev.target?.result as string;
          setInput(input + (input ? '\n\n' : '') + text);
        };
        reader.readAsText(file);
      }
    });
  };

  const isDark      = currentTheme !== 'light';
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const panelBg     = isDark ? '#0a0a0a' : '#ffffff';
  const subText     = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)';
  const textColor   = isDark ? 'rgba(255,255,255,0.85)' : '#111';
  const hoverBg     = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
  const inputBg     = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

  // Compute current project name for registry display
  const projectName = currentProjectId
    ? projects.find(p => p.id === currentProjectId)?.name || 'Unnamed'
    : '';

  const phaseColor  =
    currentPhase === 'verify' ? '#f59e0b' :
    currentPhase === 'code'   ? '#818cf8' :
    currentPhase === 'plan'   ? '#3b82f6' :
    '#3b82f6';

  const phaseLabel  =
    currentPhase === 'think'  ? 'Анализ...' :
    currentPhase === 'plan'   ? 'Планирование' :
    currentPhase === 'code'   ? 'Кодирование' :
    currentPhase === 'verify' ? 'Проверка' : '';

  // Derived label — shows kickoff-specific states when the pipeline is not yet
  // in a code phase (kickoff phases take priority over the raw currentPhase).
  const effectivePhaseLabel =
    kickoffPhase === 'prompt_received' ? 'Prompt received' :
    kickoffPhase === 'analyzing'    ? 'Architect...' :
    kickoffPhase === 'build_starting' ? 'Starting...' :
    kickoffPhase === 'building' ? 'Build in progress' :
    phaseLabel;
  const kickoffStatus = getKickoffStatus(kickoffPhase);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  }, [input]);

  // Auto-scroll to latest message
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close attach menu on outside click
  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [attachMenuOpen]);

  const hasMessages = messages.length > 0;
  const appendToInput = (snippet: string) => {
    const next = input.trim() ? `${input}\n${snippet}` : snippet;
    setInput(next);
  };

  return (
    <div className="flex flex-col shrink-0 transition-colors duration-500 relative"
      style={{ width: 360, height: '100%', minHeight: 0, background: panelBg, borderRight: `1px solid ${borderColor}`, zIndex: 40 }}>

      {/* Projects list removed â€” see Projects screen (ðŸ“ icon in sidebar) */}

      {/* â”€â”€ CHAT SECTION (messages + input) â€” takes remaining space â”€â”€ */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

      {/* â”€â”€ MESSAGES / EMPTY STATE â”€â”€ */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar relative" style={{ minHeight: 0 }}
        onDragOver={e  => { e.preventDefault(); setIsDragging(true);  }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); handleFileSelect(e.dataTransfer.files); }}
      >
        {isDragging && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 pointer-events-none"
            style={{ background: 'rgba(59,130,246,0.07)', border: '2px dashed rgba(59,130,246,0.4)', borderRadius: 8, margin: 8 }}>
            <Paperclip size={22} style={{ color: '#60a5fa' }} />
            <span style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>Drop images here</span>
          </div>
        )}
        {!hasMessages ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 10, opacity: 0.35,
            userSelect: 'none',
          }}>
            <svg width="26" height="26" viewBox="0 0 16 16" fill="currentColor" style={{ color: isDark ? '#fff' : '#000' }}>
              <rect x="1"   y="1"   width="5.5" height="5.5" rx="1.5" opacity="0.9"/>
              <rect x="9.5" y="1"   width="5.5" height="5.5" rx="1.5" opacity="0.45"/>
              <rect x="1"   y="9.5" width="5.5" height="5.5" rx="1.5" opacity="0.45"/>
              <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.5" opacity="0.9"/>
            </svg>
            <div style={{ fontSize: 12, fontWeight: 600, color: textColor, letterSpacing: '0.06em' }}>
              AIC-RG Studio
            </div>
            <div style={{ fontSize: 11, color: subText, textAlign: 'center', lineHeight: 1.5, maxWidth: 180 }}>
              {t('emptyTagline')}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {messages.map((m) => {
              if (!m.id) throw new Error('Message without id');
              const isUser          = m.role === 'user';
              const isTyping        = !isUser && m.content === '...' && isGenerating;
              const isReport        = m.type === 'generation-report' && !!m.report;
              const isClarification = m.type === 'clarification' && Array.isArray(m.questions) && (m.questions as string[]).length > 0;
              const isBlueprint     = m.type === 'blueprint';

              if (isBlueprint) {
                // If full blueprint payload exists — render the rich card.
                if ((m as any).blueprintText || (m as any).technicalBlueprint || (m as any).pages) {
                  return (
                    <BlueprintCard
                      key={m.id}
                      m={m}
                      pendingPlan={pendingPlan}
                      isPending={pendingPlan !== null}
                      kickoffPhase={kickoffPhase}
                      isDark={isDark}
                      textColor={textColor}
                      subText={subText}
                      borderColor={borderColor}
                      onConfirmPlan={onConfirmPlan}
                      selectKickoffScope={selectKickoffScope}
                      onClarifyPlan={onClarifyPlan}
                      cancelPlan={cancelPlan}
                      onRestoreLineage={onRestoreBlueprintLineage}
                      t={t}
                    />
                  );
                }
                // Fallback: always show Build it button even when payload is minimal.
                return <FallbackPlanCard key={m.id} m={m} onConfirmPlan={onConfirmPlan} isDark={isDark} textColor={textColor} />;
              }

              return (
                <div key={m.id} className={`flex flex-col group ${isUser ? 'items-end' : 'items-start'}`}
                  style={{ animation: 'fadeSlideIn 0.2s ease both' }}>
                  {isClarification ? (
                    <ClarificationCard
                      questions={m.questions as string[]}
                      isDark={isDark}
                      textColor={textColor}
                      subText={subText}
                    />
                  ) : isReport && m.report ? (
                    <GenerationReportCard
                      messageId={m.id}
                      report={m.report}
                      content={typeof m.content === 'string' ? m.content : ''}
                      generationTrust={m.generationTrust}
                      branchReality={m.branchReality}
                      restoreAvailable={Boolean((m as any).restoreAvailable)}
                      lineageStatus={(m as any).lineageStatus}
                      onRestoreVersion={onRestoreMessageRevision}
                      isDark={isDark}
                      textColor={textColor}
                      subText={subText}
                      t={t}
                    />
                  ) : (
                    <div className="relative max-w-[92%]">
                      <div className="allow-copy px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed"
                        style={{
                          background: isUser ? 'rgba(59,130,246,0.12)' : hoverBg,
                          border: `1px solid ${isUser ? 'rgba(59,130,246,0.2)' : borderColor}`,
                          color: textColor,
                          userSelect: 'text',
                        }}>
                        {isTyping ? <TypingDots /> : (() => {
                          // content may be a vision array: [{type:'image_url',...},{type:'text',...}]
                          const imgUrls: string[] = Array.isArray(m.content)
                            ? (m.content as Array<{type: string; image_url?: {url: string}}>)
                                .filter(c => c.type === 'image_url')
                                .map(c => c.image_url?.url ?? '')
                                .filter(Boolean)
                            : [];
                          const textContent: string = Array.isArray(m.content)
                            ? (m.content as Array<{type: string; text?: string}>)
                                .filter(c => c.type === 'text')
                                .map(c => c.text ?? '')
                                .join(' ')
                            : (m.content as string);
                          return (
                            <>
                              {imgUrls.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-1">
                                  {imgUrls.map((url, idx) => (
                                    <img key={idx} src={url} alt="attachment"
                                      style={{ maxHeight: 80, maxWidth: 120, borderRadius: 6, objectFit: 'cover' }} />
                                  ))}
                                </div>
                              )}
                              <div className={`allow-copy prose prose-sm max-w-none ${isDark ? 'prose-invert' : 'prose-slate'}`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {!isUser && !isTyping && (
                        <button
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded-md transition-all"
                          style={{
                            color: subText,
                            background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                          }}
                          onClick={() => {
                            navigator.clipboard.writeText(m.content as string).catch(() => {});
                            const msgId = (m as any).id as string;
                            setCopiedIdx(msgId);
                            setTimeout(() => setCopiedIdx(c => c === msgId ? null : c), 2000);
                          }}
                          title="Copy response">
                          {copiedIdx === (m as any).id
                            ? <span style={{ fontSize: 10, color: '#4ade80' }}>✓</span>
                            : <Copy size={11} />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="h-2" />
          </div>
        )}
      </div>

      {/* â”€â”€ INPUT â”€â”€ */}
      <div className="shrink-0 px-3 pb-3 relative" style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 10 }}
        onDragOver={e => { e.preventDefault(); setIsDraggingInput(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingInput(false); }}
        onDrop={e => { e.preventDefault(); setIsDraggingInput(false); handleFileSelect(e.dataTransfer.files); }}
      >
        {isDraggingInput && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            backgroundColor: 'rgba(99,102,241,0.1)',
            border: '2px dashed #6366f1',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#6366f1', fontWeight: 600,
            pointerEvents: 'none',
            gap: 6,
          }}>
            <Paperclip size={15} />
            Drop image or PDF here
          </div>
        )}

        {/* toolbar â€” left-aligned, compact, AUTO first */}
        <div className="flex items-center mb-2 px-1" style={{ gap: 2, overflowX: 'auto' }}>

          {/* 1 â€” AUTO toggle (first) */}
          <button
            onClick={() => setAutoRoute(!autoRoute)}
            title={autoRoute ? 'Auto-routing ON â€” click to disable' : 'Auto-routing OFF â€” click to enable'}
            className="flex items-center gap-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0"
            style={{
              padding: '4px 7px',
              background: autoRoute ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
              color:      autoRoute ? '#fbbf24' : subText,
              border:    `1px solid ${autoRoute ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)'}`,
              boxShadow:  autoRoute ? '0 0 8px rgba(251,191,36,0.18)' : 'none',
              transition: 'all 0.2s',
            }}>
            AUTO
          </button>

          {/* 2 â€” Generation mode toggle: App / Landing / Superapp */}
          {(['app', 'landing', 'superapp'] as const).map(m => (
            <button key={m}
              onClick={() => setGenerationMode(m)}
              title={m === 'app' ? 'Full app with multiple pages' : m === 'landing' ? 'Single-page landing' : 'Super app (complex multi-module)'}
              className="flex items-center gap-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0"
              style={{
                padding: '4px 7px',
                background: generationMode === m ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                color:      generationMode === m ? '#a78bfa' : subText,
                border:    `1px solid ${generationMode === m ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                transition: 'all 0.2s',
              }}>
              {m === 'app' ? 'APP' : m === 'landing' ? 'PAGE' : 'SUPER'}
            </button>
          ))}

          {/* 4 â€” ALL / FILE context toggle */}
          <button
            onClick={() => setFullContextMode(!fullContextMode)}
            title={fullContextMode ? 'Context: all files' : `Context: ${activeFile} only`}
            className="flex items-center gap-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0"
            style={{
              padding: '4px 7px',
              background: fullContextMode ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
              color:      fullContextMode ? '#60a5fa' : subText,
              border:    `1px solid ${fullContextMode ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)'}`,
            }}>
            {fullContextMode ? 'ALL' : 'FILE'}
          </button>

          {/* thin divider */}
          <div style={{ width: 1, height: 14, background: borderColor, flexShrink: 0, margin: '0 1px' }} />

          {/* 5 â€” quick actions */}
          {[
            { icon: <History size={11} />,   label: t('history'), onClick: () => setHistoryOpen(true) },
          ].map(btn => (
            <button key={btn.label} onClick={btn.onClick}
              className="flex items-center gap-0.5 rounded-lg text-[10px] font-medium transition-all hover:bg-blue-500/10 hover:text-blue-400 shrink-0"
              style={{ color: subText, padding: '4px 6px' }}>
              {btn.icon} {btn.label}
              {btn.label === t('history') && snapshots.length > 0 && (
                <span className="ml-0.5 px-1 py-0 rounded-full text-[9px] font-bold"
                  style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                  {snapshots.length}
                </span>
              )}
            </button>
          ))}

          {/* thin divider */}
          <div style={{ width: 1, height: 14, background: borderColor, flexShrink: 0, margin: '0 1px' }} />

          {/* 4 â€” Undo / Redo */}
          <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className="flex items-center justify-center rounded-lg transition-all hover:bg-blue-500/10 disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
            style={{ color: canUndo ? '#60a5fa' : subText, width: 26, height: 26 }}>
            <Undo2 size={11} />
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"
            className="flex items-center justify-center rounded-lg transition-all hover:bg-blue-500/10 disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
            style={{ color: canRedo ? '#60a5fa' : subText, width: 26, height: 26 }}>
            <Redo2 size={11} />
          </button>
        </div>

        {/* progress bar â€” visible only while generating */}
        {isGenerating && (
          <div style={{ marginBottom: 8 }}>
            {kickoffPhase === 'awaiting_confirmation' ? (
              /* Ghost-overlap prevention: system is blocked waiting for user.
                 Show explicit banner instead of a misleading "building" spinner. */
              <div
                data-testid="kickoff-awaiting-banner"
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.2)',
                  fontSize: 10, fontWeight: 600,
                  color: '#f59e0b', letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>
                Awaiting confirmation
                <div style={{ marginTop: 3, fontSize: 10, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                  Pick a scope or let the default start shortly.
                </div>
              </div>
            ) : (
              <>
                {kickoffStatus && (
                  <div
                    data-testid="kickoff-status"
                    data-kickoff-phase={kickoffPhase}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 5,
                      fontSize: 10,
                      fontWeight: 700,
                      color: phaseColor,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span data-testid={kickoffStatus.testId}>{kickoffStatus.label}</span>
                    <span>{progress}%</span>
                  </div>
                )}
                <div style={{
                  height: 3, borderRadius: 2, overflow: 'hidden',
                  background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${progress}%`,
                    background: phaseColor,
                    transition: 'width 0.5s ease, background 0.3s ease',
                    boxShadow: `0 0 6px ${phaseColor}80`,
                  }} />
                </div>
                {effectivePhaseLabel && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: 4, fontSize: 10, fontWeight: 600,
                    color: phaseColor, letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>
                    <span>{kickoffStatus ? 'Live generation' : effectivePhaseLabel}</span>
                    <span>{progress}%</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Attachment thumbnails */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachments.map(att => (
              <div key={att.id} className="relative flex items-center gap-1 rounded-lg overflow-hidden shrink-0"
                style={{ background: inputBg, border: `1px solid ${borderColor}` }}>
                {att.type === 'image' ? (
                  <img src={att.data} alt={att.name}
                    className="object-cover"
                    style={{ width: 44, height: 44, flexShrink: 0 }} />
                ) : att.type === 'pdf' ? (
                  <div className="flex flex-col items-center justify-center gap-0.5"
                    style={{ width: 44, height: 44, flexShrink: 0 }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>ðŸ“„</span>
                    <span style={{ fontSize: 8, color: subText, fontWeight: 600 }}>PDF</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center"
                    style={{ width: 44, height: 44, flexShrink: 0 }}>
                    <Paperclip size={16} style={{ color: subText }} />
                  </div>
                )}
                <div className="flex flex-col justify-center" style={{ maxWidth: 72, paddingRight: 2 }}>
                  <span className="text-[9px] truncate leading-tight" style={{ color: subText }}>
                    {att.name}
                  </span>
                </div>
                <button onClick={() => removeAttachment(att.id)}
                  className="p-0.5 mr-1 rounded hover:text-red-400 transition-colors"
                  style={{ color: subText }}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Context pack chips (ideas/trends/briefs queued before send) */}
        {composerContextItems.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 items-center">
            {composerContextItems.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-1 rounded-full px-2.5 py-1"
                style={{
                  background: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.35)',
                  color: isDark ? '#c7d2fe' : '#4f46e5',
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.8 }}>
                  {item.source === 'trend-niche' ? 'TREND' : item.source === 'niche' ? 'NICHE' : item.source === 'weekly-feed' ? 'WEEKLY' : item.source.toUpperCase()}
                </span>
                <span className="text-[10px] max-w-[170px] truncate" style={{ fontWeight: 600 }}>
                  {item.title}
                </span>
                <button
                  onClick={() => removeComposerContextItem(item.id)}
                  className="p-0.5 rounded transition-colors"
                  style={{ color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.45)' }}
                  title="Remove context"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <button
              onClick={clearComposerContextItems}
              className="text-[10px] px-2 py-1 rounded-full transition-colors"
              style={{
                color: subText,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                border: `1px solid ${borderColor}`,
              }}
            >
              Clear
            </button>
          </div>
        )}

        {/* textarea + send / stop */}
        <div className="flex items-end gap-2 rounded-2xl p-2"
          style={{ background: inputBg, border: `1px solid ${borderColor}` }}>
          <div ref={attachMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setAttachMenuOpen(v => !v)}
              title="Attach / tools"
              className="p-2.5 rounded-xl transition-all hover:bg-blue-500/10"
              style={{ color: subText }}
            >
              <Plus size={16} />
            </button>
            {attachMenuOpen && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 40,
                minWidth: 210, borderRadius: 12, overflow: 'hidden',
                border: `1px solid ${borderColor}`,
                background: isDark ? 'rgba(8,8,12,0.98)' : 'rgba(255,255,255,0.98)',
                boxShadow: '0 12px 28px rgba(0,0,0,0.25)',
              }}>
                {[
                  { icon: <Paperclip size={14} />, label: 'Attach file', action: () => fileInputRef.current?.click() },
                  { icon: <Link2 size={14} />, label: 'Add reference URL', action: () => {
                    const url = window.prompt('Reference URL');
                    if (url?.trim()) appendToInput(`Reference: ${url.trim()}`);
                  } },
                  { icon: <Camera size={14} />, label: 'Take screenshot', action: () => appendToInput('Please use screenshot as context for this task.') },
                  { icon: <Sparkles size={14} />, label: 'Visual edits', action: () => appendToInput('Apply visual edits while preserving current structure and logic.') },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setAttachMenuOpen(false); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                      padding: '10px 12px', border: 'none', textAlign: 'left',
                      background: 'transparent', color: textColor, cursor: 'pointer', fontSize: 12,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ color: subText }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea ref={textareaRef} rows={1} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), !isGenerating && onSend())}
            placeholder={t('placeholder')}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-3 resize-none outline-none"
            style={{ color: textColor, minHeight: 44, maxHeight: 128 }} />

          {isGenerating ? (
            <button onClick={onStop} title="Stop generation"
              className="p-2.5 rounded-xl text-white transition-all active:scale-90 shrink-0"
              style={{ background: '#dc2626' }}>
              <Square size={18} fill="currentColor" strokeWidth={0} />
            </button>
          ) : (
            <button onClick={onSend} disabled={!input.trim() && composerContextItems.length === 0 && attachments.length === 0}
              className="p-2.5 rounded-xl bg-blue-600 text-white transition-all hover:bg-blue-500 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" className="hidden"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.ts,.tsx,.js,.jsx,.css,.json,.md"
          multiple
          onChange={e => { handleFileSelect(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* PROJECTS */}
      <div className="shrink-0" style={{ borderTop: `1px solid ${borderColor}` }}>
        {/* Recent projects removed — see Projects screen icon in sidebar */}
        {projects.length > 0 && currentProjectId && (() => {
          const cur = projects.find((p: any) => p.id === currentProjectId);
          if (!cur) return null;
          return (
            <div className="px-4 pb-2 pt-1 flex items-center gap-2" style={{ color: subText }}>
              <span className="w-2 h-2 rounded-full shrink-0"
                style={{ background: THEME_COLORS[(cur as any).theme] ?? '#475569' }} />
              <span className="text-[11px] truncate flex-1" style={{ color: textColor }}>
                {(cur as any).name || 'Untitled'}
              </span>
              <span className="text-[10px]" style={{ color: subText }}>current</span>
            </div>
          );
        })()}

        {/* â”€â”€ BILLING WIDGET â”€â”€ */}
        {(sessionCost > 0 || projectCost > 0) && (() => {
          const modelShort = (selectedModel ?? '').split('/').pop()?.replace(/:free$/, '') ?? 'â€”';
          const fmtCost = (n: number) => n < 0.0001 ? '$0.0000' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`;
          const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
          return (
            <div style={{ margin: '0 12px 8px', padding: '10px 12px', borderRadius: 12, background: isDark ? 'rgba(15,23,42,0.7)' : 'rgba(0,0,0,0.04)', border: `1px solid ${borderColor}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: subText, marginBottom: 7 }}>
                {t('billing')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                <span style={{ fontSize: 10, color: subText }}>{t('session')}</span>
                <span style={{ fontSize: 10, color: subText }}>{t('total')}</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#4ade80' }}>{fmtCost(sessionCost)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: textColor }}>{fmtCost(projectCost)}</span>
              </div>
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: subText }}>
                  {fmtTokens(sessionTokens)} tokens
                </span>
                <span style={{ fontSize: 9, color: subText, fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {modelShort}
                </span>
              </div>
            </div>
          );
        })()}

      </div>

      {/* â”€â”€ HISTORY DRAWER â”€â”€ */}
      {historyOpen && (
        <div className="absolute inset-0 flex flex-col z-50"
          style={{ background: panelBg, borderRight: `1px solid ${borderColor}` }}>

          <div className="flex items-center justify-between px-5 py-4 shrink-0"
            style={{ borderBottom: `1px solid ${borderColor}` }}>
            <div className="flex items-center gap-2">
              <Clock size={15} style={{ color: '#60a5fa' }} />
              <span className="text-sm font-semibold" style={{ color: textColor }}>История версий</span>
              {snapshots.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
                  {snapshots.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onUndo} disabled={!canUndo} title="Undo"
                className="p-1.5 rounded-lg hover:bg-white/5 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                style={{ color: canUndo ? '#60a5fa' : subText }}>
                <Undo2 size={14} />
              </button>
              <button onClick={onRedo} disabled={!canRedo} title="Redo"
                className="p-1.5 rounded-lg hover:bg-white/5 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                style={{ color: canRedo ? '#60a5fa' : subText }}>
                <Redo2 size={14} />
              </button>
              <button onClick={() => setHistoryOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-all ml-1"
                style={{ color: subText }}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 custom-scrollbar">
              {snapshots.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3" style={{ opacity: 0.3 }}>
                  <Clock size={32} style={{ color: subText }} />
                  <span className="text-xs" style={{ color: subText }}>Версии появятся после первой генерации</span>
                </div>
              ) : (
                [...snapshots].reverse().map((snap) => {
                  const isActive     = snap.id === currentSnapshotId;
                  const isPreviewing = previewSnap?.id === snap.id;
                  return (
                    <div key={snap.id}
                      className="group relative flex flex-col gap-1.5 p-3 rounded-xl cursor-pointer transition-all"
                      style={{
                        background: isActive ? 'rgba(59,130,246,0.1)' : isPreviewing ? 'rgba(255,255,255,0.04)' : hoverBg,
                        border: `1px solid ${isActive ? 'rgba(59,130,246,0.25)' : isPreviewing ? 'rgba(255,255,255,0.1)' : borderColor}`,
                      }}
                      onMouseEnter={() => setPreviewSnap(snap)}
                      onMouseLeave={() => setPreviewSnap(null)}
                      onClick={() => { onRestoreSnapshot(snap); setHistoryOpen(false); }}>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{
                              background: isActive ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                              color: isActive ? '#60a5fa' : subText,
                            }}>
                            <GitBranch size={8} /> v{snap.version}
                          </span>
                          {isActive && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-[10px]" style={{ color: subText }}>{formatTime(snap.createdAt)}</span>
                      </div>

                      <p className="text-xs leading-relaxed" style={{ color: isActive ? textColor : subText }}>
                        {snap.label}
                      </p>

                      {!isActive && (
                        <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-all">
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium"
                            style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                            <RotateCcw size={10} /> Восстановить
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Snapshot mini-preview â€” ALWAYS mounted; display:none avoids removeChild crash */}
            {(() => {
              const snapFiles = previewSnap?.files ?? {};
              const previewCode = previewSnap
                ? (typeof snapFiles === 'string'
                    ? snapFiles
                    : (snapFiles['index.html'] ?? Object.values(snapFiles)[0] ?? ''))
                : '';
              return (
                <div
                  className="w-40 shrink-0 flex flex-col overflow-hidden"
                  style={{
                    display: previewSnap ? 'flex' : 'none',
                    borderLeft: `1px solid ${borderColor}`,
                    background: isDark ? '#050505' : '#f0f0f0',
                  }}
                >
                  <div
                    className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-widest shrink-0"
                    style={{ color: subText, borderBottom: `1px solid ${borderColor}` }}
                  >
                    Preview v{previewSnap?.version}
                  </div>
                  <div className="flex-1 overflow-hidden pointer-events-none" style={{ background: '#fff' }}>
                    <iframe
                      srcDoc={previewCode ? `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script><style>*{margin:0;padding:0;box-sizing:border-box}body{transform:scale(0.4);transform-origin:top left;width:250%;height:250%}</style></head><body>${previewCode}</body></html>` : ''}
                      className="w-full h-full border-none"
                      style={{ pointerEvents: 'none' }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${borderColor}` }}>
            <p className="text-[10px] text-center" style={{ color: subText }}>
              Наведи для превью • Нажми для отката
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .custom-scrollbar::-webkit-scrollbar { width:4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background:transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:2px; }
      `}</style>
      </div>{/* end chat section wrapper */}
    </div>
  );
};







