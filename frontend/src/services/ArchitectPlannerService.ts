/**
 * ArchitectPlannerService — pre-build Architect analysis for new project / branch kickoff.
 *
 * Runs BEFORE the first GenerationPipeline.run() on genesis (existingCodeCount === 0).
 *
 * Two-stage pipeline:
 *   Stage 1 — local heuristic capability inference (zero cost, < 1 ms)
 *   Stage 2 — LLM structured analysis (optional; only when apiKey present)
 *
 * Produces an ArchitectKickoffPlan that:
 *   - infers product type
 *   - recommends first-pass and deferred scope
 *   - builds a capability stack
 *   - proposes ordered implementation steps
 *   - surfaces 0–3 high-leverage open questions
 *   - provides 2–4 scope options for the user
 *
 * Writes a pre_build_draft snapshot into the branch-scoped architecture memory
 * (Session 1 model) via ProjectRepository.saveBranchArchitectureSnapshot().
 *
 * NOT to touch: SimpleGeneration, Orchestrator, preview pipeline, projectModel types.
 */

import { llmFetch } from './LLMProxy';
import type { ProjectPlan } from './SimpleGeneration';
import { ProjectRepository } from './ProjectRepository';
import {
  createProjectBranchArchitecture,
  createArchitectureSnapshotFromBranchArchitecture,
  type ArchitectureCapabilityKey,
  type ArchitectureDecision,
  type ArchitectureSnapshot,
  type CapabilityDecision,
  type CapabilityManifest,
  type CapabilityManifestEntry,
  type DeferredItem,
  type ImplementationPlan,
  type OpenArchitectureQuestion,
  type PlanStep,
  type ProductMode,
} from '../shared/projectModel';

// ─── Public types ─────────────────────────────────────────────────────────────

export type KickoffBuildScopeId = 'core' | 'core_backend' | 'core_backend_ai';

export interface KickoffScopeOption {
  id: KickoffBuildScopeId | 'revise';
  label: string;
  description: string;
  /** Capability keys included in this scope tier */
  capabilityIds: ArchitectureCapabilityKey[];
}

export interface InferredCapability {
  id: ArchitectureCapabilityKey;
  title: string;
  reason: string;
  scope: 'first_pass' | 'deferred';
  priority: 'must' | 'should' | 'could';
}

export interface KickoffPlanStep {
  id: string;
  title: string;
  capabilityIds: ArchitectureCapabilityKey[];
  scope: 'first_pass' | 'deferred';
}

export interface KickoffOpenQuestion {
  id: string;
  title: string;
  capabilityIds: ArchitectureCapabilityKey[];
  impact: 'high' | 'medium';
}

export interface ArchitectKickoffPlan {
  productType: ProductMode;
  branchBriefSummary: string;
  capabilities: InferredCapability[];
  implementationSteps: KickoffPlanStep[];
  openQuestions: KickoffOpenQuestion[];
  scopeOptions: KickoffScopeOption[];
  /** ID of the automatically-selected default scope option */
  defaultOptionId: KickoffBuildScopeId;
  /** Raw LLM analysis text, when available */
  rawAnalysis?: string;
}

export interface ArchitectPlannerInput {
  intent: string;
  attachmentContext?: string;
  projectId: string;
  branchId?: string;
  language?: string;
  apiKey: string;
  modelId: string;
  signal?: AbortSignal;
  onLog?: (msg: string) => void;
}

export interface KickoffBuildPreparation {
  snapshot: ArchitectureSnapshot;
  buildPlan: ProjectPlan;
}

type KickoffSnapshotMode = 'proposed' | 'accepted';
type PlannerSummaryLanguage = 'en' | 'ru' | 'es' | 'de' | 'fr' | 'zh';

const CHAT_SUMMARY_COPY: Record<PlannerSummaryLanguage, {
  analysis: string;
  firstPass: string;
  deferred: string;
  buildOptions: string;
  openQuestions: string;
  footer: string;
}> = {
  en: {
    analysis: 'Architect analysis',
    firstPass: 'First-pass scope',
    deferred: 'Deferred (post-build)',
    buildOptions: 'Build options',
    openQuestions: 'Open questions',
    footer: 'You will choose one of these scopes before the first build starts.',
  },
  ru: {
    analysis: 'Анализ Architect',
    firstPass: 'Объём первого прохода',
    deferred: 'Отложено после сборки',
    buildOptions: 'Варианты сборки',
    openQuestions: 'Открытые вопросы',
    footer: 'Перед первым запуском сборки вы выберете один из этих объёмов.',
  },
  es: {
    analysis: 'Análisis de Architect',
    firstPass: 'Alcance del primer paso',
    deferred: 'Diferido para después del build',
    buildOptions: 'Opciones de compilación',
    openQuestions: 'Preguntas abiertas',
    footer: 'Elegirás uno de estos alcances antes de que empiece la primera compilación.',
  },
  de: {
    analysis: 'Architect-Analyse',
    firstPass: 'Umfang des ersten Durchlaufs',
    deferred: 'Für nach dem Build zurückgestellt',
    buildOptions: 'Build-Optionen',
    openQuestions: 'Offene Fragen',
    footer: 'Vor dem ersten Build wählst du einen dieser Umfänge aus.',
  },
  fr: {
    analysis: 'Analyse Architect',
    firstPass: 'Périmètre du premier passage',
    deferred: 'Différé après le build',
    buildOptions: 'Options de build',
    openQuestions: 'Questions ouvertes',
    footer: 'Vous choisirez l’un de ces périmètres avant le premier build.',
  },
  zh: {
    analysis: 'Architect 分析',
    firstPass: '首轮范围',
    deferred: '延期到首轮构建之后',
    buildOptions: '构建选项',
    openQuestions: '待确认问题',
    footer: '首次构建开始前，你将从这些范围中选择一个。',
  },
};

const PRODUCT_TYPE_LABELS: Record<PlannerSummaryLanguage, Record<ProductMode, string>> = {
  en: {
    app: 'App',
    dashboard: 'Dashboard',
    landing: 'Landing page',
    saas: 'SaaS',
    'e-commerce': 'E-commerce',
    admin: 'Admin panel',
    blog: 'Blog',
    portfolio: 'Portfolio',
    tool: 'Tool',
    game: 'Game',
    social: 'Social app',
    unknown: 'Unknown',
  },
  ru: {
    app: 'Приложение',
    dashboard: 'Дашборд',
    landing: 'Лендинг',
    saas: 'SaaS',
    'e-commerce': 'E-commerce',
    admin: 'Админка',
    blog: 'Блог',
    portfolio: 'Портфолио',
    tool: 'Инструмент',
    game: 'Игра',
    social: 'Социальное приложение',
    unknown: 'Неизвестно',
  },
  es: {
    app: 'Aplicación',
    dashboard: 'Panel',
    landing: 'Landing',
    saas: 'SaaS',
    'e-commerce': 'Comercio electrónico',
    admin: 'Panel de administración',
    blog: 'Blog',
    portfolio: 'Portafolio',
    tool: 'Herramienta',
    game: 'Juego',
    social: 'Aplicación social',
    unknown: 'Desconocido',
  },
  de: {
    app: 'App',
    dashboard: 'Dashboard',
    landing: 'Landingpage',
    saas: 'SaaS',
    'e-commerce': 'E-Commerce',
    admin: 'Admin-Panel',
    blog: 'Blog',
    portfolio: 'Portfolio',
    tool: 'Tool',
    game: 'Spiel',
    social: 'Social-App',
    unknown: 'Unbekannt',
  },
  fr: {
    app: 'Application',
    dashboard: 'Tableau de bord',
    landing: 'Landing page',
    saas: 'SaaS',
    'e-commerce': 'E-commerce',
    admin: 'Panneau admin',
    blog: 'Blog',
    portfolio: 'Portfolio',
    tool: 'Outil',
    game: 'Jeu',
    social: 'Application sociale',
    unknown: 'Inconnu',
  },
  zh: {
    app: '应用',
    dashboard: '仪表盘',
    landing: '落地页',
    saas: 'SaaS',
    'e-commerce': '电商',
    admin: '管理后台',
    blog: '博客',
    portfolio: '作品集',
    tool: '工具',
    game: '游戏',
    social: '社交应用',
    unknown: '未知',
  },
};

const CAPABILITY_SUMMARY_COPY: Record<ArchitectureCapabilityKey, Record<PlannerSummaryLanguage, {
  title: string;
  reason: string;
}>> = {
  auth: {
    en: { title: 'Authentication', reason: 'User authentication flow is required' },
    ru: { title: 'Аутентификация', reason: 'Нужен пользовательский вход и управление сессией' },
    es: { title: 'Autenticación', reason: 'Se requiere flujo de autenticación de usuarios' },
    de: { title: 'Authentifizierung', reason: 'Ein Benutzer-Login und Sitzungen werden benötigt' },
    fr: { title: 'Authentification', reason: 'Un flux d’authentification utilisateur est nécessaire' },
    zh: { title: '认证', reason: '需要用户登录与会话能力' },
  },
  backend: {
    en: { title: 'Backend / Database', reason: 'Persistent data storage is required' },
    ru: { title: 'Бэкенд / база данных', reason: 'Нужно постоянное хранение данных' },
    es: { title: 'Backend / Base de datos', reason: 'Se requiere persistencia de datos' },
    de: { title: 'Backend / Datenbank', reason: 'Persistente Datenspeicherung wird benötigt' },
    fr: { title: 'Backend / Base de données', reason: 'Une persistance des données est nécessaire' },
    zh: { title: '后端 / 数据库', reason: '需要持久化数据存储' },
  },
  ai_chat: {
    en: { title: 'AI Chat / Completion', reason: 'Conversational AI is part of the first pass' },
    ru: { title: 'AI-чат / completion', reason: 'Разговорный AI входит в первый проход' },
    es: { title: 'Chat IA / Completion', reason: 'La IA conversacional entra en el primer paso' },
    de: { title: 'AI-Chat / Completion', reason: 'Konversationelle KI gehört zum ersten Durchlauf' },
    fr: { title: 'Chat IA / Completion', reason: 'Une IA conversationnelle fait partie du premier passage' },
    zh: { title: 'AI 对话 / Completion', reason: '首轮范围包含对话式 AI' },
  },
  ai_generation: {
    en: { title: 'AI Generation', reason: 'AI generation is part of the first pass' },
    ru: { title: 'AI-генерация', reason: 'AI-генерация входит в первый проход' },
    es: { title: 'Generación IA', reason: 'La generación IA entra en el primer paso' },
    de: { title: 'AI-Generierung', reason: 'AI-Generierung gehört zum ersten Durchlauf' },
    fr: { title: 'Génération IA', reason: 'La génération IA fait partie du premier passage' },
    zh: { title: 'AI 生成', reason: '首轮范围包含 AI 生成能力' },
  },
  storage: {
    en: { title: 'File Storage', reason: 'File upload and storage are required' },
    ru: { title: 'Хранение файлов', reason: 'Нужна загрузка и хранение файлов' },
    es: { title: 'Almacenamiento de archivos', reason: 'Se requieren carga y almacenamiento de archivos' },
    de: { title: 'Dateispeicher', reason: 'Upload und Speicherung von Dateien werden benötigt' },
    fr: { title: 'Stockage de fichiers', reason: 'Le téléversement et le stockage de fichiers sont nécessaires' },
    zh: { title: '文件存储', reason: '需要文件上传与存储' },
  },
  map: {
    en: { title: 'Maps / Geo', reason: 'Map and location functionality are required' },
    ru: { title: 'Карты / гео', reason: 'Нужны карты и геофункции' },
    es: { title: 'Mapas / Geo', reason: 'Se requieren mapas y geolocalización' },
    de: { title: 'Karten / Geo', reason: 'Karten- und Standortfunktionen werden benötigt' },
    fr: { title: 'Cartes / Géo', reason: 'Des fonctions de carte et de géolocalisation sont nécessaires' },
    zh: { title: '地图 / 地理', reason: '需要地图与定位能力' },
  },
  scanner: {
    en: { title: 'Camera / Scanner', reason: 'Camera or scanning capability is required' },
    ru: { title: 'Камера / сканер', reason: 'Нужна камера или сканирование' },
    es: { title: 'Cámara / Escáner', reason: 'Se requiere cámara o escaneo' },
    de: { title: 'Kamera / Scanner', reason: 'Kamera oder Scan-Funktion wird benötigt' },
    fr: { title: 'Caméra / Scanner', reason: 'Une capacité caméra ou scan est nécessaire' },
    zh: { title: '相机 / 扫描', reason: '需要相机或扫描能力' },
  },
  notifications: {
    en: { title: 'Notifications', reason: 'Notifications are postponed until after the first working build' },
    ru: { title: 'Уведомления', reason: 'Уведомления отложены до первого рабочего билда' },
    es: { title: 'Notificaciones', reason: 'Las notificaciones se difieren hasta después del primer build funcional' },
    de: { title: 'Benachrichtigungen', reason: 'Benachrichtigungen werden auf nach dem ersten funktionierenden Build verschoben' },
    fr: { title: 'Notifications', reason: 'Les notifications sont différées après le premier build fonctionnel' },
    zh: { title: '通知', reason: '通知能力延后到首个可运行构建之后' },
  },
  analytics: {
    en: { title: 'Analytics', reason: 'Analytics and reporting are part of the first pass' },
    ru: { title: 'Аналитика', reason: 'Аналитика и отчёты входят в первый проход' },
    es: { title: 'Analítica', reason: 'La analítica y los reportes entran en el primer paso' },
    de: { title: 'Analytics', reason: 'Analytics und Reporting gehören zum ersten Durchlauf' },
    fr: { title: 'Analytique', reason: 'L’analytique et le reporting font partie du premier passage' },
    zh: { title: '分析', reason: '首轮范围包含分析与报表' },
  },
  payments: {
    en: { title: 'Payments', reason: 'Payments are deferred until after the first working prototype' },
    ru: { title: 'Платежи', reason: 'Платежи отложены до первого рабочего прототипа' },
    es: { title: 'Pagos', reason: 'Los pagos se difieren hasta después del primer prototipo funcional' },
    de: { title: 'Zahlungen', reason: 'Zahlungen werden bis nach dem ersten funktionierenden Prototyp verschoben' },
    fr: { title: 'Paiements', reason: 'Les paiements sont différés après le premier prototype fonctionnel' },
    zh: { title: '支付', reason: '支付能力延后到首个可运行原型之后' },
  },
  admin: {
    en: { title: 'Admin Panel', reason: 'Admin tooling is deferred until after the first working build' },
    ru: { title: 'Админка', reason: 'Админские инструменты отложены до первого рабочего билда' },
    es: { title: 'Panel de administración', reason: 'Las herramientas de administración se difieren hasta después del primer build funcional' },
    de: { title: 'Admin-Panel', reason: 'Admin-Werkzeuge werden bis nach dem ersten funktionierenden Build verschoben' },
    fr: { title: 'Panneau admin', reason: 'Les outils d’administration sont différés après le premier build fonctionnel' },
    zh: { title: '管理后台', reason: '管理工具延后到首个可运行构建之后' },
  },
};

const SCOPE_OPTION_SUMMARY_COPY: Record<KickoffBuildScopeId | 'revise', Record<PlannerSummaryLanguage, {
  label: string;
  description: string;
}>> = {
  core: {
    en: { label: 'Build core', description: 'Ship the core screens and interactions with local / mock data. Fastest path to a working prototype.' },
    ru: { label: 'Собрать core', description: 'Собрать ключевые экраны и сценарии на локальных / mock-данных. Самый быстрый путь к рабочему прототипу.' },
    es: { label: 'Construir núcleo', description: 'Entregar las pantallas e interacciones centrales con datos locales / mock. La vía más rápida a un prototipo funcional.' },
    de: { label: 'Core bauen', description: 'Die zentralen Screens und Interaktionen mit lokalen / Mock-Daten umsetzen. Der schnellste Weg zu einem funktionierenden Prototyp.' },
    fr: { label: 'Construire le noyau', description: 'Livrer les écrans et interactions essentiels avec des données locales / mock. Le chemin le plus rapide vers un prototype fonctionnel.' },
    zh: { label: '构建核心范围', description: '先交付核心页面与交互，使用本地 / mock 数据。这是最快得到可运行原型的路径。' },
  },
  core_backend: {
    en: { label: 'Build core + backend', description: 'Core UI with real data persistence, auth, and backend wiring.' },
    ru: { label: 'Собрать core + backend', description: 'Core UI с реальной персистентностью данных, аутентификацией и backend-связкой.' },
    es: { label: 'Construir núcleo + backend', description: 'UI central con persistencia real, autenticación e integración backend.' },
    de: { label: 'Core + Backend bauen', description: 'Core-UI mit echter Persistenz, Authentifizierung und Backend-Anbindung.' },
    fr: { label: 'Construire noyau + backend', description: 'UI centrale avec persistance réelle, authentification et câblage backend.' },
    zh: { label: '构建核心 + 后端', description: '核心 UI 加上真实数据持久化、认证和后端接线。' },
  },
  core_backend_ai: {
    en: { label: 'Build core + backend + AI', description: 'Full first pass including backend, auth, and AI integration.' },
    ru: { label: 'Собрать core + backend + AI', description: 'Полный первый проход: backend, аутентификация и AI-интеграция.' },
    es: { label: 'Construir núcleo + backend + IA', description: 'Primer paso completo con backend, autenticación e integración IA.' },
    de: { label: 'Core + Backend + AI bauen', description: 'Voller erster Durchlauf mit Backend, Authentifizierung und AI-Integration.' },
    fr: { label: 'Construire noyau + backend + IA', description: 'Premier passage complet avec backend, authentification et intégration IA.' },
    zh: { label: '构建核心 + 后端 + AI', description: '完整首轮范围：后端、认证与 AI 集成。' },
  },
  revise: {
    en: { label: 'Revise plan', description: 'Change the Architect plan before building.' },
    ru: { label: 'Пересмотреть план', description: 'Изменить план Architect перед сборкой.' },
    es: { label: 'Revisar plan', description: 'Cambiar el plan de Architect antes de construir.' },
    de: { label: 'Plan überarbeiten', description: 'Den Architect-Plan vor dem Build anpassen.' },
    fr: { label: 'Réviser le plan', description: 'Modifier le plan Architect avant le build.' },
    zh: { label: '修改计划', description: '在开始构建前先调整 Architect 计划。' },
  },
};

function normalizePlannerLanguage(language?: string): PlannerSummaryLanguage {
  const base = language?.toLowerCase().split('-')[0] as PlannerSummaryLanguage | undefined;
  return base && base in CHAT_SUMMARY_COPY ? base : 'en';
}

function localizeProductType(productType: ProductMode, language: PlannerSummaryLanguage): string {
  return PRODUCT_TYPE_LABELS[language][productType] ?? productType;
}

function localizeCapabilitySummary(capability: InferredCapability, language: PlannerSummaryLanguage): { title: string; reason: string } {
  const localized = CAPABILITY_SUMMARY_COPY[capability.id];
  if (!localized) {
    return {
      title: capability.title,
      reason: capability.reason,
    };
  }
  return localized[language];
}

function localizeScopeOptionSummary(option: KickoffScopeOption, language: PlannerSummaryLanguage): { label: string; description: string } {
  return SCOPE_OPTION_SUMMARY_COPY[option.id]?.[language] ?? {
    label: option.label,
    description: option.description,
  };
}

function buildBranchBriefFallback(productType: ProductMode, language: PlannerSummaryLanguage): string {
  switch (language) {
    case 'ru':
      return `${localizeProductType(productType, language)} — первый проход прототипа`;
    case 'es':
      return `${localizeProductType(productType, language)} — primera pasada del prototipo`;
    case 'de':
      return `${localizeProductType(productType, language)} — erster Prototyp-Durchlauf`;
    case 'fr':
      return `${localizeProductType(productType, language)} — premier passage du prototype`;
    case 'zh':
      return `${localizeProductType(productType, language)} — 首轮原型范围`;
    case 'en':
    default:
      return `${localizeProductType(productType, language)} — first prototype pass`;
  }
}

function buildImplementationStepTitle(
  key:
    | 'schema'
    | 'auth'
    | 'dashboard'
    | 'catalogue'
    | 'landing'
    | 'core'
    | 'map'
    | 'ai'
    | 'polish'
    | 'payments'
    | 'admin',
  language: PlannerSummaryLanguage,
): string {
  const copy: Record<typeof key, Record<PlannerSummaryLanguage, string>> = {
    schema: {
      en: 'Set up data schema and Supabase project',
      ru: 'Подготовить схему данных и проект Supabase',
      es: 'Preparar el esquema de datos y el proyecto de Supabase',
      de: 'Datenschema und Supabase-Projekt einrichten',
      fr: 'Préparer le schéma de données et le projet Supabase',
      zh: '准备数据结构与 Supabase 项目',
    },
    auth: {
      en: 'Implement authentication (sign-up / sign-in / session)',
      ru: 'Реализовать аутентификацию (регистрация / вход / сессия)',
      es: 'Implementar autenticación (registro / inicio de sesión / sesión)',
      de: 'Authentifizierung umsetzen (Registrierung / Login / Sitzung)',
      fr: 'Implémenter l’authentification (inscription / connexion / session)',
      zh: '实现认证能力（注册 / 登录 / 会话）',
    },
    dashboard: {
      en: 'Build main dashboard view and data tables',
      ru: 'Собрать основной дашборд и таблицы данных',
      es: 'Construir la vista principal de dashboard y las tablas de datos',
      de: 'Haupt-Dashboard und Datentabellen umsetzen',
      fr: 'Construire la vue principale du tableau de bord et les tables de données',
      zh: '构建主仪表盘视图与数据表',
    },
    catalogue: {
      en: 'Build product catalogue and cart screens',
      ru: 'Собрать каталог товаров и экраны корзины',
      es: 'Construir el catálogo de productos y las pantallas del carrito',
      de: 'Produktkatalog und Warenkorb-Screens umsetzen',
      fr: 'Construire le catalogue produit et les écrans du panier',
      zh: '构建商品目录与购物车页面',
    },
    landing: {
      en: 'Build hero, features, and CTA sections',
      ru: 'Собрать hero, блок возможностей и CTA-секции',
      es: 'Construir las secciones hero, features y CTA',
      de: 'Hero-, Feature- und CTA-Bereiche umsetzen',
      fr: 'Construire les sections hero, fonctionnalités et CTA',
      zh: '构建 Hero、功能介绍与 CTA 区块',
    },
    core: {
      en: 'Build core screens and navigation',
      ru: 'Собрать ключевые экраны и навигацию',
      es: 'Construir las pantallas principales y la navegación',
      de: 'Kern-Screens und Navigation umsetzen',
      fr: 'Construire les écrans principaux et la navigation',
      zh: '构建核心页面与导航',
    },
    map: {
      en: 'Integrate Leaflet map with location data',
      ru: 'Интегрировать карту Leaflet с данными локации',
      es: 'Integrar el mapa Leaflet con datos de ubicación',
      de: 'Leaflet-Karte mit Standortdaten integrieren',
      fr: 'Intégrer la carte Leaflet avec les données de localisation',
      zh: '集成 Leaflet 地图与位置数据',
    },
    ai: {
      en: 'Wire AI integration (model calls, streaming, error handling)',
      ru: 'Подключить AI-интеграцию (вызовы модели, стриминг, обработка ошибок)',
      es: 'Conectar la integración IA (llamadas al modelo, streaming, manejo de errores)',
      de: 'AI-Integration anbinden (Modellaufrufe, Streaming, Fehlerbehandlung)',
      fr: 'Brancher l’intégration IA (appels modèle, streaming, gestion des erreurs)',
      zh: '接入 AI 集成（模型调用、流式返回、错误处理）',
    },
    polish: {
      en: 'Polish: responsive layout, empty states, loading skeletons',
      ru: 'Полировка: адаптивность, empty states, loading skeletons',
      es: 'Pulido: diseño responsive, estados vacíos y skeletons de carga',
      de: 'Polish: responsives Layout, Empty States, Loading Skeletons',
      fr: 'Finition : responsive, états vides et skeletons de chargement',
      zh: '打磨：响应式布局、空状态和加载骨架屏',
    },
    payments: {
      en: 'Add Stripe checkout and subscription flow',
      ru: 'Добавить Stripe checkout и подписочную логику',
      es: 'Agregar Stripe checkout y flujo de suscripción',
      de: 'Stripe-Checkout und Abo-Flow hinzufügen',
      fr: 'Ajouter Stripe checkout et le flux d’abonnement',
      zh: '添加 Stripe 支付与订阅流程',
    },
    admin: {
      en: 'Build admin panel and moderation tools',
      ru: 'Собрать админку и инструменты модерации',
      es: 'Construir el panel de administración y las herramientas de moderación',
      de: 'Admin-Panel und Moderationswerkzeuge umsetzen',
      fr: 'Construire le panneau admin et les outils de modération',
      zh: '构建管理后台与审核工具',
    },
  };

  return copy[key][language];
}

function buildOpenQuestionTitle(
  key: 'saas-auth' | 'payments-model' | 'shared-or-private',
  language: PlannerSummaryLanguage,
): string {
  const copy: Record<typeof key, Record<PlannerSummaryLanguage, string>> = {
    'saas-auth': {
      en: 'Is this multi-tenant (org-scoped data) or single-user?',
      ru: 'Это multi-tenant продукт (данные на организацию) или single-user?',
      es: '¿Esto es multi-tenant (datos por organización) o para un solo usuario?',
      de: 'Ist das ein Multi-Tenant-Produkt (org-skopierte Daten) oder Single-User?',
      fr: 'Est-ce un produit multi-tenant (données par organisation) ou mono-utilisateur ?',
      zh: '这是多租户产品（按组织隔离数据）还是单用户模式？',
    },
    'payments-model': {
      en: 'What is the billing model — one-time purchase or recurring subscription?',
      ru: 'Какая модель оплаты нужна — разовая покупка или подписка?',
      es: '¿Cuál es el modelo de cobro: pago único o suscripción recurrente?',
      de: 'Welches Abrechnungsmodell wird benötigt — Einmalkauf oder wiederkehrendes Abo?',
      fr: 'Quel est le modèle de facturation : achat unique ou abonnement récurrent ?',
      zh: '计费模式是什么——一次性购买还是周期订阅？',
    },
    'shared-or-private': {
      en: 'Is user data shared (public board) or private per-user?',
      ru: 'Данные пользователей общие (публичная доска) или приватные для каждого?',
      es: '¿Los datos de usuario son compartidos (tablero público) o privados por usuario?',
      de: 'Sind Benutzerdaten gemeinsam genutzt (öffentliches Board) oder pro Benutzer privat?',
      fr: 'Les données utilisateur sont-elles partagées (tableau public) ou privées par utilisateur ?',
      zh: '用户数据是共享的（公开看板）还是按用户私有？',
    },
  };

  return copy[key][language];
}

function buildOpenQuestionSummary(impact: 'high' | 'medium', language: PlannerSummaryLanguage): string {
  switch (language) {
    case 'ru':
      return `Открытый архитектурный вопрос с высоким влиянием (impact: ${impact})`;
    case 'es':
      return `Pregunta abierta de arquitectura con alto impacto (impact: ${impact})`;
    case 'de':
      return `Offene Architekturfrage mit hoher Wirkung (impact: ${impact})`;
    case 'fr':
      return `Question d’architecture ouverte à fort impact (impact: ${impact})`;
    case 'zh':
      return `高影响的开放式架构问题（impact: ${impact}）`;
    case 'en':
    default:
      return `High-leverage open question (impact: ${impact})`;
  }
}

function buildSnapshotText(language: PlannerSummaryLanguage) {
  return {
    manifestTitle:
      language === 'ru' ? 'Манифест kickoff-возможностей'
      : language === 'es' ? 'Manifiesto de capacidades de kickoff'
      : language === 'de' ? 'Kickoff-Capability-Manifest'
      : language === 'fr' ? 'Manifeste des capacités de kickoff'
      : language === 'zh' ? 'Kickoff 能力清单'
      : 'Kickoff capability manifest',
    planTitle: (productType: ProductMode) =>
      language === 'ru' ? `План kickoff — ${localizeProductType(productType, language)}`
      : language === 'es' ? `Plan de kickoff — ${localizeProductType(productType, language)}`
      : language === 'de' ? `Kickoff-Plan — ${localizeProductType(productType, language)}`
      : language === 'fr' ? `Plan de kickoff — ${localizeProductType(productType, language)}`
      : language === 'zh' ? `Kickoff 计划 — ${localizeProductType(productType, language)}`
      : `Kickoff plan — ${localizeProductType(productType, language)}`,
    acceptCapability: (title: string) =>
      language === 'ru' ? `Принять ${title} в первый проход`
      : language === 'es' ? `Aceptar ${title} en el primer paso`
      : language === 'de' ? `${title} in den ersten Durchlauf aufnehmen`
      : language === 'fr' ? `Accepter ${title} dans le premier passage`
      : language === 'zh' ? `将 ${title} 纳入首轮范围`
      : `Accept ${title} in first pass`,
    deferCapability: (title: string) =>
      language === 'ru' ? `Отложить ${title}`
      : language === 'es' ? `Diferir ${title}`
      : language === 'de' ? `${title} verschieben`
      : language === 'fr' ? `Différer ${title}`
      : language === 'zh' ? `延后 ${title}`
      : `Defer ${title}`,
    productTypeDecision: (productType: ProductMode) =>
      language === 'ru' ? `Тип продукта: ${localizeProductType(productType, language)}`
      : language === 'es' ? `Tipo de producto: ${localizeProductType(productType, language)}`
      : language === 'de' ? `Produkttyp: ${localizeProductType(productType, language)}`
      : language === 'fr' ? `Type de produit : ${localizeProductType(productType, language)}`
      : language === 'zh' ? `产品类型：${localizeProductType(productType, language)}`
      : `Product type: ${localizeProductType(productType, language)}`,
    scopeSelection: (accepted: boolean, label: string) =>
      language === 'ru' ? `${accepted ? 'Выбранный объём' : 'Рекомендуемый объём'}: ${label}`
      : language === 'es' ? `${accepted ? 'Alcance elegido' : 'Alcance recomendado'}: ${label}`
      : language === 'de' ? `${accepted ? 'Gewählter Umfang' : 'Empfohlener Umfang'}: ${label}`
      : language === 'fr' ? `${accepted ? 'Périmètre choisi' : 'Périmètre recommandé'} : ${label}`
      : language === 'zh' ? `${accepted ? '已选范围' : '推荐范围'}：${label}`
      : `${accepted ? 'Scope selection' : 'Recommended scope'}: ${label}`,
    defaultScope:
      language === 'ru' ? 'Объём по умолчанию'
      : language === 'es' ? 'Alcance por defecto'
      : language === 'de' ? 'Standardumfang'
      : language === 'fr' ? 'Périmètre par défaut'
      : language === 'zh' ? '默认范围'
      : 'Default scope',
    deferredTitle: (title: string) =>
      language === 'ru' ? `Отложено: ${title}`
      : language === 'es' ? `Diferido: ${title}`
      : language === 'de' ? `Zurückgestellt: ${title}`
      : language === 'fr' ? `Différé : ${title}`
      : language === 'zh' ? `延期：${title}`
      : `Deferred: ${title}`,
    deferredSummary: (reason: string) =>
      language === 'ru' ? `${reason} — перенесено в backlog после первой сборки.`
      : language === 'es' ? `${reason} — movido al backlog posterior al primer build.`
      : language === 'de' ? `${reason} — in den Backlog nach dem ersten Build verschoben.`
      : language === 'fr' ? `${reason} — déplacé dans le backlog après le premier build.`
      : language === 'zh' ? `${reason}——已移到首次构建之后的 backlog。`
      : `${reason} — moved to post-build backlog.`,
    deferredReason:
      language === 'ru' ? 'Не требуется для первого рабочего прототипа'
      : language === 'es' ? 'No es necesario para el primer prototipo funcional'
      : language === 'de' ? 'Für den ersten funktionierenden Prototyp nicht erforderlich'
      : language === 'fr' ? 'Non requis pour le premier prototype fonctionnel'
      : language === 'zh' ? '首个可运行原型并不需要它'
      : 'Not required for first working prototype',
    identified:
      language === 'ru' ? 'Выявлено Architect-анализом'
      : language === 'es' ? 'Identificado por el análisis de Architect'
      : language === 'de' ? 'Durch die Architect-Analyse erkannt'
      : language === 'fr' ? 'Identifié par l’analyse Architect'
      : language === 'zh' ? '由 Architect 分析识别'
      : 'Identified by Architect analysis',
    identifiedDeferred:
      language === 'ru' ? 'Выявлено Architect-анализом — отложено'
      : language === 'es' ? 'Identificado por el análisis de Architect — diferido'
      : language === 'de' ? 'Durch die Architect-Analyse erkannt — zurückgestellt'
      : language === 'fr' ? 'Identifié par l’analyse Architect — différé'
      : language === 'zh' ? '由 Architect 分析识别——已延期'
      : 'Identified by Architect analysis — deferred',
  };
}

// ─── Heuristic capability inference ──────────────────────────────────────────

const CAPABILITY_PATTERNS: Array<{
  id: ArchitectureCapabilityKey;
  title: string;
  patterns: RegExp[];
  scope: 'first_pass' | 'deferred';
  priority: 'must' | 'should' | 'could';
  reason: string;
}> = [
  {
    id: 'auth',
    title: 'Authentication',
    patterns: [/\b(login|sign.?in|sign.?up|register|auth|user.?account|password|oauth|jwt|session)\b/i],
    scope: 'first_pass',
    priority: 'must',
    reason: 'User authentication flow detected in intent',
  },
  {
    id: 'backend',
    title: 'Backend / Database',
    patterns: [/\b(database|supabase|postgres|store|save|persist|crud|api|server|backend|data.?model|table|schema)\b/i],
    scope: 'first_pass',
    priority: 'must',
    reason: 'Data persistence requirement detected',
  },
  {
    id: 'ai_chat',
    title: 'AI Chat / Completion',
    patterns: [/\b(ai.?chat|chatbot|gpt|claude|llm|openai|anthropic|chat.?with|assistant|conversation|nlp)\b/i],
    scope: 'first_pass',
    priority: 'must',
    reason: 'AI conversation capability required',
  },
  {
    id: 'ai_generation',
    title: 'AI Generation',
    patterns: [/\b(generate|ai.?generat|image.?gen|dall-?e|stable.?diffusion|midjourney|text.?to|speech.?to)\b/i],
    scope: 'first_pass',
    priority: 'should',
    reason: 'AI generation capability detected',
  },
  {
    id: 'payments',
    title: 'Payments',
    patterns: [/\b(pay|stripe|checkout|subscription|billing|invoice|purchase|cart|price|monetiz)\b/i],
    scope: 'deferred',
    priority: 'should',
    reason: 'Payment flow detected — deferred to avoid blocking first prototype',
  },
  {
    id: 'storage',
    title: 'File Storage',
    patterns: [/\b(upload|file.?stor|image.?upload|document|attachment|media|bucket|s3|blob)\b/i],
    scope: 'first_pass',
    priority: 'should',
    reason: 'File upload / storage requirement detected',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    patterns: [/\b(notif|push|alert|remind|email.?send|smtp|transactional)\b/i],
    scope: 'deferred',
    priority: 'could',
    reason: 'Notification system detected — deferred; not critical for first prototype',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    patterns: [/\b(analytic|dashboard|metric|chart|graph|report|kpi|stat|tracking|event.?log)\b/i],
    scope: 'first_pass',
    priority: 'should',
    reason: 'Data visualization / analytics surface required',
  },
  {
    id: 'map',
    title: 'Maps / Geo',
    patterns: [/\b(map|geo|location|leaflet|mapbox|gps|coordinate|address|radius|distance)\b/i],
    scope: 'first_pass',
    priority: 'must',
    reason: 'Geospatial capability detected',
  },
  {
    id: 'scanner',
    title: 'Camera / Scanner',
    patterns: [/\b(scan|camera|qr.?code|barcode|ocr|webcam|capture|photo)\b/i],
    scope: 'first_pass',
    priority: 'must',
    reason: 'Camera / scanning capability detected',
  },
  {
    id: 'admin',
    title: 'Admin Panel',
    patterns: [/\b(admin|management|dashboard.?admin|cms|back.?office|control.?panel|moderate)\b/i],
    scope: 'deferred',
    priority: 'could',
    reason: 'Admin surface detected — deferred to focus on user-facing core first',
  },
];

const PRODUCT_TYPE_PATTERNS: Array<{ mode: ProductMode; patterns: RegExp[] }> = [
  { mode: 'dashboard', patterns: [/\b(dashboard|kpi|metrics|analytics.?app|reporting)\b/i] },
  { mode: 'landing', patterns: [/\b(landing.?page|marketing|homepage|waitlist|launch.?page)\b/i] },
  { mode: 'saas', patterns: [/\b(saas|software.?as|subscription.?product|multi.?tenant|workspace)\b/i] },
  { mode: 'e-commerce', patterns: [/\b(shop|store|e.?commerce|marketplace|product.?catalog|cart)\b/i] },
  { mode: 'admin', patterns: [/\b(admin.?panel|cms|content.?manage|back.?office)\b/i] },
  { mode: 'blog', patterns: [/\b(blog|article|post|content.?site|publication|newsletter)\b/i] },
  { mode: 'portfolio', patterns: [/\b(portfolio|showcase|gallery|personal.?site)\b/i] },
  { mode: 'tool', patterns: [/\b(tool|utility|converter|calculator|generator.?app|formatter)\b/i] },
  { mode: 'game', patterns: [/\b(game|interactive|puzzle|quiz.?game|play)\b/i] },
  { mode: 'social', patterns: [/\b(social|feed|follow|like|community|forum|ugc|user.?post)\b/i] },
];

/**
 * Pure local capability inference from intent text.
 * Zero cost, synchronous, usable without an API key.
 */
export function inferCapabilitiesFromIntent(intent: string): InferredCapability[] {
  return CAPABILITY_PATTERNS
    .filter(p => p.patterns.some(re => re.test(intent)))
    .map(p => ({
      id: p.id,
      title: p.title,
      reason: p.reason,
      scope: p.scope,
      priority: p.priority,
    }));
}

/**
 * Infer product type from intent text (local, zero cost).
 */
export function inferProductType(intent: string): ProductMode {
  for (const { mode, patterns } of PRODUCT_TYPE_PATTERNS) {
    if (patterns.some(re => re.test(intent))) return mode;
  }
  return 'app';
}

/**
 * Build the 2–4 scope options from inferred capabilities.
 */
export function buildScopeOptions(
  capabilities: InferredCapability[],
  language = 'en',
): { options: KickoffScopeOption[]; defaultId: KickoffBuildScopeId } {
  const normalizedLanguage = normalizePlannerLanguage(language);
  const firstPassIds = capabilities
    .filter(c => c.scope === 'first_pass')
    .map(c => c.id);

  const coreIds = firstPassIds.filter(
    id => id !== 'backend' && id !== 'auth' && id !== 'ai_chat' && id !== 'ai_generation',
  );
  const withBackendIds = [...new Set([...coreIds, 'backend', 'auth'] as ArchitectureCapabilityKey[])];
  const withAiIds = [...new Set([...withBackendIds, 'ai_chat', 'ai_generation'] as ArchitectureCapabilityKey[])];

  const hasBackend = firstPassIds.includes('backend') || firstPassIds.includes('auth');
  const hasAi = firstPassIds.includes('ai_chat') || firstPassIds.includes('ai_generation');
  const coreCopy = SCOPE_OPTION_SUMMARY_COPY.core[normalizedLanguage];
  const backendCopy = SCOPE_OPTION_SUMMARY_COPY.core_backend[normalizedLanguage];
  const aiCopy = SCOPE_OPTION_SUMMARY_COPY.core_backend_ai[normalizedLanguage];
  const reviseCopy = SCOPE_OPTION_SUMMARY_COPY.revise[normalizedLanguage];

  const options: KickoffScopeOption[] = [
    {
      id: 'core',
      label: coreCopy.label,
      description: coreCopy.description,
      capabilityIds: coreIds,
    },
    {
      id: 'core_backend',
      label: backendCopy.label,
      description: backendCopy.description,
      capabilityIds: withBackendIds,
    },
    {
      id: 'core_backend_ai',
      label: aiCopy.label,
      description: aiCopy.description,
      capabilityIds: withAiIds,
    },
    {
      id: 'revise',
      label: reviseCopy.label,
      description: reviseCopy.description,
      capabilityIds: [],
    },
  ];

  const defaultId: KickoffBuildScopeId =
    hasAi ? 'core_backend_ai' : hasBackend ? 'core_backend' : 'core';

  return { options, defaultId };
}

// ─── Implementation step builder ──────────────────────────────────────────────

function buildImplementationSteps(
  capabilities: InferredCapability[],
  productType: ProductMode,
  language = 'en',
): KickoffPlanStep[] {
  const normalizedLanguage = normalizePlannerLanguage(language);
  const steps: KickoffPlanStep[] = [];
  const firstPass = capabilities.filter(c => c.scope === 'first_pass');
  const hasAuth = firstPass.some(c => c.id === 'auth');
  const hasBackend = firstPass.some(c => c.id === 'backend');
  const hasAi = firstPass.some(c => c.id === 'ai_chat' || c.id === 'ai_generation');
  const hasMaps = firstPass.some(c => c.id === 'map');
  const hasPayments = capabilities.some(c => c.id === 'payments');
  const hasAdmin = capabilities.some(c => c.id === 'admin');

  let stepIdx = 1;
  const step = (
    title: string,
    capIds: ArchitectureCapabilityKey[],
    scope: 'first_pass' | 'deferred',
  ): KickoffPlanStep => ({
    id: `step-${stepIdx++}`,
    title,
    capabilityIds: capIds,
    scope,
  });

  if (hasBackend || hasAuth) {
    steps.push(step(buildImplementationStepTitle('schema', normalizedLanguage), ['backend'], 'first_pass'));
  }
  if (hasAuth) {
    steps.push(step(buildImplementationStepTitle('auth', normalizedLanguage), ['auth', 'backend'], 'first_pass'));
  }

  const coreUiCaps: ArchitectureCapabilityKey[] = firstPass
    .filter(c => !['auth', 'backend', 'ai_chat', 'ai_generation', 'payments', 'admin'].includes(c.id))
    .map(c => c.id);
  steps.push(step(
    productType === 'dashboard' ? buildImplementationStepTitle('dashboard', normalizedLanguage)
    : productType === 'e-commerce' ? buildImplementationStepTitle('catalogue', normalizedLanguage)
    : productType === 'landing' ? buildImplementationStepTitle('landing', normalizedLanguage)
    : buildImplementationStepTitle('core', normalizedLanguage),
    coreUiCaps,
    'first_pass',
  ));

  if (hasMaps) {
    steps.push(step(buildImplementationStepTitle('map', normalizedLanguage), ['map'], 'first_pass'));
  }
  if (hasAi) {
    steps.push(step(buildImplementationStepTitle('ai', normalizedLanguage), ['ai_chat', 'ai_generation'], 'first_pass'));
  }

  steps.push(step(buildImplementationStepTitle('polish', normalizedLanguage), [], 'first_pass'));

  if (hasPayments) {
    steps.push(step(buildImplementationStepTitle('payments', normalizedLanguage), ['payments'], 'deferred'));
  }
  if (hasAdmin) {
    steps.push(step(buildImplementationStepTitle('admin', normalizedLanguage), ['admin'], 'deferred'));
  }

  return steps;
}

// ─── Open question builder ────────────────────────────────────────────────────

function buildOpenQuestions(
  capabilities: InferredCapability[],
  productType: ProductMode,
  language = 'en',
): KickoffOpenQuestion[] {
  const normalizedLanguage = normalizePlannerLanguage(language);
  const questions: KickoffOpenQuestion[] = [];
  let idx = 1;

  const hasAuth = capabilities.some(c => c.id === 'auth');
  const hasBackend = capabilities.some(c => c.id === 'backend');
  const hasPayments = capabilities.some(c => c.id === 'payments');

  if (hasAuth && productType === 'saas') {
    questions.push({
      id: `oq-${idx++}`,
      title: buildOpenQuestionTitle('saas-auth', normalizedLanguage),
      capabilityIds: ['auth', 'backend'],
      impact: 'high',
    });
  }

  if (hasPayments) {
    questions.push({
      id: `oq-${idx++}`,
      title: buildOpenQuestionTitle('payments-model', normalizedLanguage),
      capabilityIds: ['payments'],
      impact: 'high',
    });
  }

  if (hasBackend && !hasAuth) {
    questions.push({
      id: `oq-${idx++}`,
      title: buildOpenQuestionTitle('shared-or-private', normalizedLanguage),
      capabilityIds: ['backend'],
      impact: 'medium',
    });
  }

  return questions.slice(0, 3);
}

// ─── Template catalog types ───────────────────────────────────────────────────

export type TemplateName =
  | 'HeroLamp'
  | 'BentoGrid'
  | 'Marquee'
  | 'PricingSection'
  | 'CTA'
  | 'FAQ'
  | 'Logos'
  | 'Footer';

export type SectionSpec = {
  template: TemplateName;
  props: Record<string, unknown>;
};

// ─── LLM analysis ─────────────────────────────────────────────────────────────

const TEMPLATE_CATALOG = `
TEMPLATE CATALOG (use ONLY these templates for sections):
  HeroLamp      — first screen hero. props: title, subtitle, ctaText, ctaHref
  BentoGrid     — features/benefits grid. props: items: [{title, description, icon?}]
  Marquee       — scrolling testimonials or logos. props: items: string[]
  PricingSection — pricing tiers. props: tiers: [{name, price, features[]}]
  CTA           — call-to-action end section. props: title, subtitle, primaryText, secondaryText
  FAQ           — frequently asked questions. props: items: [{question, answer}]
  Logos         — trust logos. props: items: [{name, src?}]
  Footer        — always last. props: brand, sections: [{title, links[]}]

CATALOG RULES:
1. Always start with HeroLamp.
2. Always end with Footer.
3. Never invent template names outside this catalog.
4. Fill props with real content — no lorem ipsum.
5. designIntent controls visual style only (mood, contrast, radius); it does not change section structure.
`.trim();

const ARCHITECT_SYSTEM_PROMPT = `You are a UI architect. Your job is to analyze a product idea and output a structured JSON plan including section composition and visual design intent.

Return ONLY valid JSON matching this schema (no prose, no markdown fences):

{
  "productType": "app|dashboard|landing|saas|e-commerce|admin|blog|portfolio|tool|game|social",
  "branchBriefSummary": "one-sentence description of what will be built",
  "firstPassCapabilities": ["backend","auth","ai_chat","analytics","map","storage","scanner"],
  "deferredCapabilities": ["payments","notifications","admin"],
  "implementationOrder": ["step one title","step two title","step three title"],
  "openQuestions": ["question only if truly blocking and high-leverage — max 2"],
  "designIntent": { "mood": "calm|corporate|luxury|playful|brutal", "contrast": "low|medium|high", "radius": "sharp|soft|pill" },
  "sections": [
    { "template": "HeroLamp", "props": { "title": "...", "subtitle": "...", "ctaText": "...", "ctaHref": "#pricing" } },
    { "template": "Footer", "props": { "brand": "..." } }
  ]
}

Rules:
- firstPassCapabilities: only what is genuinely needed for a first working prototype
- deferredCapabilities: real features the user asked for, but not needed in the first pass
- implementationOrder: 3–5 steps, in order, each a short imperative phrase
- openQuestions: 0–2 questions maximum; only if the answer materially changes architecture
- NEVER ask about tech stack, colors, or obvious choices. Never include clarifying questions about things you can infer.

${TEMPLATE_CATALOG}`;

type ArchitectLLMAnalysisResult = {
  productType?: ProductMode;
  branchBriefSummary?: string;
  firstPassCapabilities?: ArchitectureCapabilityKey[];
  deferredCapabilities?: ArchitectureCapabilityKey[];
  implementationOrder?: string[];
  openQuestions?: string[];
};

type SecondLLMStepParseStatus =
  | 'raw_received'
  | 'json_match_found'
  | 'json_match_missing'
  | 'parsed_ok'
  | 'parsed_failed'
  | 'request_failed';

interface SecondLLMStepDebugRecord {
  schema: 'aic-second-llm-step-v1';
  id: string;
  timestamp: string;
  stepIdentity: 'ArchitectPlannerService.runLLMAnalysis';
  projectId?: string;
  intentText: string;
  language: string;
  route: {
    step: 'architect_prebuild';
    provider: 'openrouter';
    modelId: string;
    endpoint: string;
    transport: 'llmFetch';
  };
  request: {
    systemPrompt: string;
    userMessage: string;
    temperature: number;
    maxTokens: number;
  };
  statusHistory: SecondLLMStepParseStatus[];
  parseStatus: SecondLLMStepParseStatus;
  rawCompletionText?: string;
  extractedJsonSubstring?: string;
  parsedJsonObject?: ArchitectLLMAnalysisResult;
  parseErrorMessage?: string;
  requestErrorMessage?: string;
}

const SECOND_LLM_STEP_LAST_KEY = 'ai_studio:second_llm_step:last';
const SECOND_LLM_STEP_HISTORY_KEY = 'ai_studio:second_llm_step:history';
const MAX_SECOND_LLM_STEP_RECORDS = 20;

function secondStepDebugId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function loadSecondLLMStepHistory(): SecondLLMStepDebugRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(SECOND_LLM_STEP_HISTORY_KEY);
    return raw ? JSON.parse(raw) as SecondLLMStepDebugRecord[] : [];
  } catch {
    return [];
  }
}

function saveSecondLLMStepRecord(record: SecondLLMStepDebugRecord): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SECOND_LLM_STEP_LAST_KEY, JSON.stringify(record));
  } catch { /* ignore local debug storage failures */ }

  try {
    if (typeof localStorage === 'undefined') return;
    const history = loadSecondLLMStepHistory().filter(item => item.id !== record.id);
    history.push(record);
    localStorage.setItem(
      SECOND_LLM_STEP_HISTORY_KEY,
      JSON.stringify(history.slice(-MAX_SECOND_LLM_STEP_RECORDS)),
    );
  } catch { /* ignore local debug storage failures */ }

  try {
    window.dispatchEvent(new CustomEvent('studio-second-llm-step', { detail: record }));
  } catch { /* test environment */ }
}

async function runLLMAnalysis(
  intent: string,
  modelId: string,
  apiKey: string,
  language = 'en',
  signal?: AbortSignal,
  debugContext?: { projectId?: string },
): Promise<ArchitectLLMAnalysisResult | null> {
  const timestamp = new Date().toISOString();
  const id = secondStepDebugId();
  const statusHistory: SecondLLMStepParseStatus[] = [];

  const normalizedLanguage = normalizePlannerLanguage(language);
  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const userMessage = `Analyze this product idea.\nReturn all user-facing strings in language: ${normalizedLanguage}.\n\n${intent.slice(0, 2000)}`;
  const makeRecord = (
    parseStatus: SecondLLMStepParseStatus,
    patch: Partial<SecondLLMStepDebugRecord> = {},
  ): SecondLLMStepDebugRecord => ({
    schema: 'aic-second-llm-step-v1',
    id,
    timestamp,
    stepIdentity: 'ArchitectPlannerService.runLLMAnalysis',
    projectId: debugContext?.projectId,
    intentText: intent,
    language: normalizedLanguage,
    route: {
      step: 'architect_prebuild',
      provider: 'openrouter',
      modelId,
      endpoint,
      transport: 'llmFetch',
    },
    request: {
      systemPrompt: ARCHITECT_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.1,
      maxTokens: 600,
    },
    statusHistory: [...statusHistory],
    parseStatus,
    ...patch,
  });

  try {
    const body = JSON.stringify({
      model: modelId,
      max_tokens: 600,
      temperature: 0.1,
      messages: [
        { role: 'system', content: ARCHITECT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const resp = await llmFetch(
      endpoint,
      { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body,
    );
    if (!resp.ok) {
      statusHistory.push('request_failed');
      saveSecondLLMStepRecord(makeRecord('request_failed', {
        requestErrorMessage: `HTTP ${resp.status}`,
      }));
      return null;
    }

    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data?.choices?.[0]?.message?.content ?? '';
    if (text) statusHistory.push('raw_received');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      statusHistory.push('json_match_missing');
      saveSecondLLMStepRecord(makeRecord('json_match_missing', {
        rawCompletionText: text,
      }));
      return null;
    }

    statusHistory.push('json_match_found');
    const extractedJsonSubstring = jsonMatch[0];

    try {
      const parsedJsonObject = JSON.parse(extractedJsonSubstring) as ArchitectLLMAnalysisResult;
      statusHistory.push('parsed_ok');
      saveSecondLLMStepRecord(makeRecord('parsed_ok', {
        rawCompletionText: text,
        extractedJsonSubstring,
        parsedJsonObject,
      }));
      return parsedJsonObject;
    } catch (parseErr) {
      statusHistory.push('parsed_failed');
      saveSecondLLMStepRecord(makeRecord('parsed_failed', {
        rawCompletionText: text,
        extractedJsonSubstring,
        parseErrorMessage: errorMessage(parseErr),
      }));
      return null;
    }
  } catch (err) {
    statusHistory.push('request_failed');
    saveSecondLLMStepRecord(makeRecord('request_failed', {
      requestErrorMessage: errorMessage(err),
    }));
    return null;
  }
}

// ─── Snapshot builder ─────────────────────────────────────────────────────────

function buildSnapshotFromPlan(
  plan: ArchitectKickoffPlan,
  projectId: string,
  branchId: string,
  now: string,
  selectedOptionId: KickoffBuildScopeId,
  language = 'en',
  mode: KickoffSnapshotMode = 'accepted',
): ArchitectureSnapshot {
  const normalizedLanguage = normalizePlannerLanguage(language);
  const snapshotText = buildSnapshotText(normalizedLanguage);
  const selectedOption = getKickoffScopeOption(plan, selectedOptionId);
  const capabilities = expandCapabilitiesForSelection(plan, selectedOption, normalizedLanguage);
  const isAccepted = mode === 'accepted';

  const acceptedCapabilityIds = new Set(selectedOption?.capabilityIds ?? []);

  const capabilityEntries: CapabilityManifestEntry[] = capabilities.map(cap => ({
    id: `cap-entry:${branchId}:${cap.id}`,
    projectId,
    branchId,
    capabilityId: cap.id,
    title: cap.title,
    status: acceptedCapabilityIds.has(cap.id)
      ? (isAccepted ? 'accepted' : 'proposed')
      : 'deferred',
    plannedState: acceptedCapabilityIds.has(cap.id) ? 'required' : 'deferred',
    actualState: 'unknown',
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  }));

  const capabilityManifest: CapabilityManifest = {
    id: `manifest:${branchId}:kickoff`,
    projectId,
    branchId,
    title: snapshotText.manifestTitle,
    phase: 'pre_build_draft',
    status: isAccepted ? 'accepted' : 'proposed',
    capabilities: capabilityEntries,
    createdAt: now,
    updatedAt: now,
  };

  const planSteps: PlanStep[] = plan.implementationSteps
    .filter(s => s.scope === 'first_pass')
    .map((s, idx) => ({
      id: `step:${branchId}:${idx}`,
      projectId,
      branchId,
      planId: `plan:${branchId}:kickoff`,
      title: s.title,
      status: 'proposed' as const,
      plannedCapabilityIds: s.capabilityIds,
      implementationState: 'planned' as const,
      createdAt: now,
      updatedAt: now,
    }));

  const implementationPlan: ImplementationPlan = {
    id: `plan:${branchId}:kickoff`,
    projectId,
    branchId,
    title: snapshotText.planTitle(plan.productType),
    summary: plan.branchBriefSummary,
    phase: 'pre_build_draft',
    status: isAccepted ? 'accepted' : 'proposed',
    stepIds: planSteps.map(s => s.id),
    steps: planSteps,
    createdAt: now,
    updatedAt: now,
  };

  const capabilityDecisions: CapabilityDecision[] = capabilities.map(cap => ({
    id: `cap-dec:${branchId}:${cap.id}`,
    projectId,
    branchId,
    phase: 'pre_build_draft' as const,
    capabilityId: cap.id,
    title: acceptedCapabilityIds.has(cap.id)
      ? snapshotText.acceptCapability(cap.title)
      : snapshotText.deferCapability(cap.title),
    summary: cap.reason,
    status: acceptedCapabilityIds.has(cap.id)
      ? (isAccepted ? 'accepted' : 'proposed')
      : 'deferred',
    plannedState: acceptedCapabilityIds.has(cap.id) ? 'required' : 'deferred',
    actualState: 'unknown' as const,
    createdAt: now,
    updatedAt: now,
  }));

  const architectureDecisions: ArchitectureDecision[] = [
    {
      id: `adec:${branchId}:product-type`,
      projectId,
      branchId,
      phase: 'pre_build_draft',
      title: snapshotText.productTypeDecision(plan.productType),
      summary: plan.branchBriefSummary,
      status: isAccepted ? 'accepted' : 'proposed',
      category: 'system',
      affectedCapabilityIds: capabilities.map(c => c.id),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `adec:${branchId}:scope-selection`,
      projectId,
      branchId,
      phase: 'pre_build_draft',
      title: snapshotText.scopeSelection(isAccepted, selectedOption?.label ?? selectedOptionId),
      summary: selectedOption?.description ?? snapshotText.defaultScope,
      status: isAccepted ? 'accepted' : 'proposed',
      category: 'delivery',
      affectedCapabilityIds: [...acceptedCapabilityIds],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const deferredItems: DeferredItem[] = capabilities
    .filter(c => !acceptedCapabilityIds.has(c.id) || c.scope === 'deferred')
    .map(cap => ({
      id: `deferred:${branchId}:${cap.id}`,
      projectId,
      branchId,
      phase: 'pre_build_draft' as const,
      title: snapshotText.deferredTitle(cap.title),
      summary: snapshotText.deferredSummary(cap.reason),
      status: 'deferred' as const,
      relatedCapabilityIds: [cap.id],
      deferredUntilPhase: 'post_build_actual' as const,
      reason: snapshotText.deferredReason,
      createdAt: now,
      updatedAt: now,
    }));

  const openQuestions: OpenArchitectureQuestion[] = plan.openQuestions.map(q => ({
    id: `oq:${branchId}:${q.id}`,
    projectId,
      branchId,
      phase: 'pre_build_draft' as const,
      title: q.title,
      summary: buildOpenQuestionSummary(q.impact, normalizedLanguage),
      status: 'open' as const,
    affectedCapabilityIds: q.capabilityIds,
    createdAt: now,
    updatedAt: now,
  }));

  const architecture = createProjectBranchArchitecture(projectId, branchId, branchId, now);
  architecture.branch.summary = plan.branchBriefSummary;
  architecture.branch.status = isAccepted ? 'accepted' : 'proposed';
  architecture.implementationPlan = implementationPlan;
  architecture.capabilityManifest = capabilityManifest;
  architecture.capabilityDecisions = capabilityDecisions;
  architecture.architectureDecisions = architectureDecisions;
  architecture.deferredItems = deferredItems;
  architecture.openQuestions = openQuestions;

  return createArchitectureSnapshotFromBranchArchitecture(
    architecture,
    'pre_build_draft',
    {
      id:
        mode === 'proposed'
          ? `snapshot:${branchId}:kickoff:proposed`
          : `snapshot:${branchId}:kickoff:accepted:${Date.now()}`,
      createdAt: now,
      sourcePlanId: implementationPlan.id,
    },
  );
}

function getCapabilityDefaults(capabilityId: ArchitectureCapabilityKey, language = 'en'): InferredCapability {
  const known = CAPABILITY_PATTERNS.find(p => p.id === capabilityId);
  const normalizedLanguage = normalizePlannerLanguage(language);
  const localized = known ? localizeCapabilitySummary({
    id: capabilityId,
    title: known.title,
    reason: known.reason,
    scope: known.scope,
    priority: known.priority,
  }, normalizedLanguage) : null;
  const snapshotText = buildSnapshotText(normalizedLanguage);
  return {
    id: capabilityId,
    title: localized?.title ?? known?.title ?? capabilityId,
    reason: snapshotText.identified,
    scope: 'first_pass',
    priority:
      capabilityId === 'backend' || capabilityId === 'auth' || capabilityId === 'ai_chat'
        ? 'must'
        : 'should',
  };
}

export function getKickoffScopeOption(
  plan: ArchitectKickoffPlan,
  selectedOptionId?: KickoffBuildScopeId,
  language = 'en',
): KickoffScopeOption {
  const normalizedLanguage = normalizePlannerLanguage(language);
  return plan.scopeOptions.find(
    (option): option is KickoffScopeOption =>
      option.id === (selectedOptionId ?? plan.defaultOptionId),
  ) ?? plan.scopeOptions.find(
    (option): option is KickoffScopeOption =>
      option.id === plan.defaultOptionId,
  ) ?? {
    id: 'core',
    ...SCOPE_OPTION_SUMMARY_COPY.core[normalizedLanguage],
    capabilityIds: [],
  };
}

export function expandCapabilitiesForSelection(
  plan: ArchitectKickoffPlan,
  selectedOption: KickoffScopeOption,
  language = 'en',
): InferredCapability[] {
  const capabilities = [...plan.capabilities];
  const knownIds = new Set(capabilities.map(capability => capability.id));

  for (const capabilityId of selectedOption.capabilityIds) {
    if (!knownIds.has(capabilityId)) {
      capabilities.push(getCapabilityDefaults(capabilityId, language));
      knownIds.add(capabilityId);
    }
  }

  return capabilities;
}

export function applyKickoffSelectionToBuildPlan(
  buildPlan: ProjectPlan,
  kickoffPlan: ArchitectKickoffPlan,
  selectedOptionId: KickoffBuildScopeId,
): ProjectPlan {
  const selectedOption = getKickoffScopeOption(kickoffPlan, selectedOptionId);
  const capabilities = expandCapabilitiesForSelection(kickoffPlan, selectedOption);
  const selectedCapabilityIds = new Set(selectedOption.capabilityIds);
  const deferredCapabilityIds = capabilities
    .map(capability => capability.id)
    .filter(capabilityId => !selectedCapabilityIds.has(capabilityId));

  const scopeRule =
    selectedOption.id === 'core'
      ? 'Build only the core product experience. Use local or mock data and do not add backend, auth, or AI integrations in this pass.'
      : selectedOption.id === 'core_backend'
        ? 'Build the core product plus backend/auth/data persistence. Do not add AI integrations in this pass.'
        : 'Build the core product plus backend/auth/data persistence and AI integration in this pass.';

  return {
    ...buildPlan,
    description: `${buildPlan.description}\n\nKickoff scope: ${selectedOption.label}. ${scopeRule}`.trim(),
    criticalUiRules: [
      ...(buildPlan.criticalUiRules ?? []),
      scopeRule,
    ],
    kickoffScope: {
      id: selectedOption.id,
      label: selectedOption.label,
      description: selectedOption.description,
      selectedCapabilityIds: [...selectedCapabilityIds],
      deferredCapabilityIds,
      branchBriefSummary: kickoffPlan.branchBriefSummary,
    },
    architectKickoff: {
      productType: kickoffPlan.productType,
      branchBriefSummary: kickoffPlan.branchBriefSummary,
      selectedOptionId: selectedOption.id,
      selectedOptionLabel: selectedOption.label,
      selectedCapabilityIds: [...selectedCapabilityIds],
      deferredCapabilityIds,
      openQuestions: kickoffPlan.openQuestions.map(question => question.title),
      implementationSteps: kickoffPlan.implementationSteps.map(step => step.title),
    },
  };
}

export function assertKickoffScopeApplied(
  buildPlan: ProjectPlan,
  selectedOptionId: KickoffBuildScopeId,
): ProjectPlan {
  const appliedScopeId = (buildPlan as { kickoffScope?: { id?: string } }).kickoffScope?.id;
  if (appliedScopeId !== selectedOptionId) {
    throw new Error(
      `[Architect] Kickoff scope handoff failed: expected ${selectedOptionId}, received ${appliedScopeId ?? 'none'}`,
    );
  }
  return buildPlan;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze the user's intent and produce a structured kickoff plan.
 *
 * Stage 1: local heuristic (always runs, zero cost).
 * Stage 2: LLM enrichment (runs when apiKey provided; gracefully skipped on error).
 */
export const ArchitectPlannerService = {
  inferCapabilitiesFromIntent,
  inferProductType,
  buildScopeOptions,

  async analyze(input: ArchitectPlannerInput): Promise<ArchitectKickoffPlan> {
    const { intent, apiKey, modelId, signal, onLog } = input;
    const normalizedLanguage = normalizePlannerLanguage(input.language);
    const snapshotText = buildSnapshotText(normalizedLanguage);

    onLog?.('[Architect] Running pre-build analysis…');

    // Stage 1 — local heuristic (always)
    const heuristicCaps = inferCapabilitiesFromIntent(intent).map(capability => ({
      ...capability,
      ...localizeCapabilitySummary(capability, normalizedLanguage),
    }));
    const heuristicProductType = inferProductType(intent);

    let capabilities = heuristicCaps;
    let productType = heuristicProductType;
    let branchBriefSummary = '';
    let llmSteps: string[] = [];
    let llmOpenQuestions: string[] = [];
    let rawAnalysis: string | undefined;

    // Stage 2 — LLM enrichment (optional)
      if (apiKey && !signal?.aborted) {
      try {
        const llmResult = await runLLMAnalysis(intent, modelId, apiKey, normalizedLanguage, signal, {
          projectId: input.projectId,
        });
        if (llmResult) {
          rawAnalysis = JSON.stringify(llmResult);

          if (llmResult.productType) productType = llmResult.productType;
          if (llmResult.branchBriefSummary) branchBriefSummary = llmResult.branchBriefSummary;
          if (llmResult.implementationOrder) llmSteps = llmResult.implementationOrder;
          if (llmResult.openQuestions) llmOpenQuestions = llmResult.openQuestions;

          // Merge LLM capability lists into heuristic results
          const llmFirstPass = new Set<ArchitectureCapabilityKey>(
            (llmResult.firstPassCapabilities ?? []) as ArchitectureCapabilityKey[],
          );
          const llmDeferred = new Set<ArchitectureCapabilityKey>(
            (llmResult.deferredCapabilities ?? []) as ArchitectureCapabilityKey[],
          );

          // Promote deferred → first_pass if LLM says so
          capabilities = heuristicCaps.map(c =>
            llmFirstPass.has(c.id) ? { ...c, scope: 'first_pass' as const }
            : llmDeferred.has(c.id) ? { ...c, scope: 'deferred' as const }
            : c,
          );

          // Add any LLM-only capabilities not caught by heuristics
          for (const id of llmFirstPass) {
            if (!capabilities.some(c => c.id === id)) {
              const known = CAPABILITY_PATTERNS.find(p => p.id === id);
              const localized = known ? localizeCapabilitySummary({
                id,
                title: known.title,
                reason: known.reason,
                scope: 'first_pass',
                priority: 'should',
              }, normalizedLanguage) : null;
              capabilities.push({
                id,
                title: localized?.title ?? known?.title ?? id,
                reason: localized?.reason ?? snapshotText.identified,
                scope: 'first_pass',
                priority: 'should',
              });
            }
          }
          for (const id of llmDeferred) {
            if (!capabilities.some(c => c.id === id)) {
              const known = CAPABILITY_PATTERNS.find(p => p.id === id);
              const localized = known ? localizeCapabilitySummary({
                id,
                title: known.title,
                reason: known.reason,
                scope: 'deferred',
                priority: 'could',
              }, normalizedLanguage) : null;
              capabilities.push({
                id,
                title: localized?.title ?? known?.title ?? id,
                reason: localized?.reason ?? snapshotText.identifiedDeferred,
                scope: 'deferred',
                priority: 'could',
              });
            }
          }

          onLog?.('[Architect] LLM enrichment applied');
        }
      } catch (err) {
        onLog?.(`[Architect] LLM analysis skipped: ${(err as Error)?.message ?? String(err)}`);
      }
    }

    if (!branchBriefSummary) {
      branchBriefSummary = buildBranchBriefFallback(productType, normalizedLanguage);
    }

    // Build implementation steps (LLM override if available)
    const heuristicSteps = buildImplementationSteps(capabilities, productType, normalizedLanguage);
    const implementationSteps: KickoffPlanStep[] = llmSteps.length > 0
      ? llmSteps.map((title, idx) => ({
          id: `step-${idx + 1}`,
          title,
          capabilityIds: [],
          scope: 'first_pass' as const,
        }))
      : heuristicSteps;

    // Open questions (LLM override if available)
    const openQuestions: KickoffOpenQuestion[] = llmOpenQuestions.length > 0
      ? llmOpenQuestions.map((title, idx) => ({
          id: `oq-${idx + 1}`,
          title,
          capabilityIds: [],
          impact: 'high' as const,
        }))
      : buildOpenQuestions(capabilities, productType, normalizedLanguage);

    const { options: scopeOptions, defaultId: defaultOptionId } = buildScopeOptions(capabilities, normalizedLanguage);

    onLog?.(`[Architect] Plan ready — ${productType}, ${capabilities.filter(c => c.scope === 'first_pass').length} capabilities in first pass, ${capabilities.filter(c => c.scope === 'deferred').length} deferred`);

    return {
      productType,
      branchBriefSummary,
      capabilities,
      implementationSteps,
      openQuestions,
      scopeOptions,
      defaultOptionId,
      rawAnalysis,
    };
  },

  /**
   * Write the kickoff plan as a pre_build_draft snapshot to branch architecture memory.
   * Uses ProjectRepository.saveBranchArchitectureSnapshot() — writes to Supabase + localStorage.
   *
   * Returns the snapshot that was written.
   */
  async writeKickoffToMemory(
    projectId: string,
    branchId: string,
    plan: ArchitectKickoffPlan,
    selectedOptionId: KickoffBuildScopeId,
    now: string,
    language = 'en',
  ): Promise<ArchitectureSnapshot> {
    const snapshot = buildSnapshotFromPlan(plan, projectId, branchId, now, selectedOptionId, language, 'accepted');
    await ProjectRepository.saveBranchArchitectureSnapshot(projectId, branchId, snapshot);
    return snapshot;
  },

  async writeProposedKickoffToMemory(
    projectId: string,
    branchId: string,
    plan: ArchitectKickoffPlan,
    now: string,
    language = 'en',
  ): Promise<ArchitectureSnapshot> {
    const snapshot = buildSnapshotFromPlan(
      plan,
      projectId,
      branchId,
      now,
      plan.defaultOptionId,
      language,
      'proposed',
    );
    await ProjectRepository.saveBranchArchitectureSnapshot(projectId, branchId, snapshot);
    return snapshot;
  },

  async prepareBuildFromKickoff(
    projectId: string,
    branchId: string,
    kickoffPlan: ArchitectKickoffPlan,
    selectedOptionId: KickoffBuildScopeId,
    buildPlan: ProjectPlan,
    now: string,
    language = 'en',
  ): Promise<KickoffBuildPreparation> {
    const snapshot = await this.writeKickoffToMemory(
      projectId,
      branchId,
      kickoffPlan,
      selectedOptionId,
      now,
      language,
    );

    return {
      snapshot,
      buildPlan: assertKickoffScopeApplied(
        applyKickoffSelectionToBuildPlan(buildPlan, kickoffPlan, selectedOptionId),
        selectedOptionId,
      ),
    };
  },

  /**
   * Format the architect plan as a concise markdown string for the chat UI.
   * Shown as an assistant message between the blueprint card and generation start.
   */
  formatPlanForChat(plan: ArchitectKickoffPlan, language = 'en'): string {
    const normalizedLanguage = normalizePlannerLanguage(language);
    const copy = CHAT_SUMMARY_COPY[normalizedLanguage];
    const firstPassCaps = plan.capabilities.filter(c => c.scope === 'first_pass');
    const deferredCaps = plan.capabilities.filter(c => c.scope === 'deferred');

    const lines: string[] = [
      `**${copy.analysis} — ${localizeProductType(plan.productType, normalizedLanguage)}**`,
      '',
      plan.branchBriefSummary,
      '',
    ];

    if (firstPassCaps.length > 0) {
      lines.push(`**${copy.firstPass}:**`);
      for (const c of firstPassCaps) {
        const localized = localizeCapabilitySummary(c, normalizedLanguage);
        lines.push(`• ${localized.title} — ${localized.reason}`);
      }
      lines.push('');
    }

    if (deferredCaps.length > 0) {
      lines.push(`**${copy.deferred}:**`);
      for (const c of deferredCaps) {
        const localized = localizeCapabilitySummary(c, normalizedLanguage);
        lines.push(`• ${localized.title} — ${localized.reason}`);
      }
      lines.push('');
    }

    lines.push(`**${copy.buildOptions}:**`);
    for (const opt of plan.scopeOptions.filter(o => o.id !== 'revise')) {
      const isDefault = opt.id === plan.defaultOptionId;
      const localized = localizeScopeOptionSummary(opt, normalizedLanguage);
      lines.push(`${isDefault ? '→' : ' '} **${localized.label}** — ${localized.description}`);
    }
    lines.push('');

    if (plan.openQuestions.length > 0) {
      lines.push(`**${copy.openQuestions}:**`);
      for (const q of plan.openQuestions) {
        lines.push(`• ${q.title}`);
      }
      lines.push('');
    }

    lines.push(`_${copy.footer}_`);

    return lines.join('\n');
  },
};
