/**
 * Dashboard — Home screen.
 * Section 1: Platform module cards (navigation)
 * Section 2: Market Intelligence — Trending Niches with Generate Blueprint
 */

import React, { useEffect, useState } from 'react';
import {
  LayoutGrid, PenTool, Figma, Cloud, Rocket, TrendingUp, ArrowRight, X, Code2,
} from 'lucide-react';
import { isCreatorMode } from '../services/internalAccess';
import { useAuth } from '../contexts/AuthContext';
import {
  ensureNicheIdeas,
  getIdeaFeedEventName,
  hasIdeaGenerationAccess,
  loadCachedNiches,
} from '../services/ideaFeedService';
import { storageService } from '../services/storageService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardProps {
  sessionCost:        number;
  sessionTokens:      number;
  cloudAvailable:     boolean;
  projects:           any[];
  onEnterEngine:      () => void;
  onLoadProject:      (p: any) => void;
  onStartBlueprint:   (text: string) => void;
  onNavigateFigma?:       () => void;
  onNavigateCodeStudio?:  () => void;
  onNewProject?:          () => void;
  onOpenAllProjects?: () => void;
  onLaunchWithPlan?: (plan: Record<string, unknown>, intent: string, source?: 'weekly-feed' | 'niche') => void;
  appLanguage?:       string;
}

interface ModuleCard {
  id: string; icon: React.ElementType; title: string; description: string;
  available: boolean; accent: string;
}

interface TrendingNiche {
  id: string; icon: string; title: string; tag: string; tagColor: string;
  whyNow: string; blueprint: string;
  launchPlan?: Record<string, unknown>;
  launchIntent?: string;
}

function mapIdeaToTrendingNiche(idea: Record<string, unknown>, idx: number): TrendingNiche {
  return {
    id: String(idea.id ?? `weekly-niche-${idx}`),
    icon: ['📈', '🧠', '⚡', '💼', '🛠️', '🌍'][idx % 6],
    title: String(idea.appName ?? idea.targetAudience ?? 'Trending niche'),
    tag: 'Weekly Trend',
    tagColor: '#3b82f6',
    whyNow: String(idea.marketContext ?? idea.painPoint ?? ''),
    blueprint: JSON.stringify(idea, null, 2),
    launchPlan: idea,
    launchIntent: `${String(idea.appName ?? 'Project')}: ${String(idea.description ?? '')}`,
  };
}

// ── Static data ───────────────────────────────────────────────────────────────

const MODULES: ModuleCard[] = [
  { id: 'engine',    icon: LayoutGrid, title: 'System Engine',     available: true,  accent: '#3b82f6',
    description: 'AI-powered code generation, multi-file orchestration, real-time preview, and agentic workflows.' },
  { id: 'architect', icon: PenTool,    title: 'Product Architect', available: false, accent: '#8b5cf6',
    description: 'Define requirements, map user journeys, and structure system architecture from idea to spec.' },
  { id: 'figma',     icon: Figma,      title: 'Figma Platinum',    available: true,  accent: '#f59e0b',
    description: 'Connect design systems, sync design tokens, activate Digital Twin — import Figma → live interactive code in one click.' },
  { id: 'code-studio', icon: Code2,   title: 'Code Studio',       available: true,  accent: '#a78bfa',
    description: 'AI-powered IDE with integrated preview. Edit code, see changes live, let AI fix issues — all in one place.' },
  { id: 'cloud',     icon: Cloud,      title: 'Cloud & Backend',   available: false, accent: '#06b6d4',
    description: 'Provision infrastructure, manage databases, deploy serverless functions and APIs at scale.' },
  { id: 'package',   icon: Rocket,     title: 'Packaging & Ship',  available: false, accent: '#10b981',
    description: 'Bundle, test, set up CI/CD pipelines, versioning, and one-click deploy to production.' },
  { id: 'growth',    icon: TrendingUp, title: 'Growth & Marketing', available: false, accent: '#f43f5e',
    description: 'Analytics, A/B testing, SEO optimisation, landing pages, and user acquisition funnels.' },
];

// ── i18n ──────────────────────────────────────────────────────────────────────

const DASH_LABELS: Record<string, Record<string, string>> = {
  en: {
    heading:    'Studio Dashboard',
    subheading: 'A full-stack product development platform. Select a module to begin working.',
    userEntities:    'User Entities',
    projectsHub:     'Projects Hub',
    projectsHubDesc: 'Your workspace. All projects, revisions, and branches.',
    noProjects:      'No projects yet',
    noProjectsHint:  'Start by opening System Engine and building something.',
    newProject:      'New Project',
    openAll:         'Open All',
    platformModules: 'Platform Modules',
    active:     'ACTIVE',
    soon:       'SOON',
    market:     'Market Intelligence',
    niches:     'Trending Niches',
    build:      'Add to Chat →',
    cancel:     'Cancel',
    blueprint:  'Confirm Meta-Instruction before building',
    trends:     'Trends updated: March 2026',
    footer:     'AIC-RG Studio — Professional Platform v3',
    figmaDesc:  'Connect design systems, sync design tokens, activate Digital Twin — import Figma → live interactive code in one click.',
  },
  ru: {
    heading:    'Панель студии',
    subheading: 'Платформа полного цикла разработки продукта. Выберите модуль для начала работы.',
    userEntities:    'Сущности пользователя',
    projectsHub:     'Проекты',
    projectsHubDesc: 'Ваше рабочее пространство. Все проекты, ревизии и ветки.',
    noProjects:      'Нет проектов',
    noProjectsHint:  'Откройте System Engine и создайте первый проект.',
    newProject:      'Новый проект',
    openAll:         'Все проекты',
    platformModules: 'Модули платформы',
    active:     'АКТИВЕН',
    soon:       'СКОРО',
    market:     'Рыночная аналитика',
    niches:     'Трендовые ниши',
    build:      'В чат →',
    cancel:     'Отмена',
    blueprint:  'Подтвердите мета-инструкцию перед началом',
    trends:     'Тренды обновлены: март 2026',
    footer:     'AIC-RG Studio — Профессиональная платформа v3',
    figmaDesc:  'Подключите дизайн-систему, синхронизируйте токены, активируйте Digital Twin — из Figma в живой интерактивный код одним кликом.',
  },
  es: {
    heading:    'Panel del Estudio',
    subheading: 'Una plataforma de desarrollo de producto full-stack. Selecciona un módulo para comenzar.',
    userEntities:    'Entidades de Usuario',
    projectsHub:     'Hub de Proyectos',
    projectsHubDesc: 'Tu espacio de trabajo. Todos los proyectos, revisiones y ramas.',
    noProjects:      'Sin proyectos aún',
    noProjectsHint:  'Comienza abriendo System Engine y construye algo.',
    newProject:      'Nuevo Proyecto',
    openAll:         'Ver Todos',
    platformModules: 'Módulos de la Plataforma',
    active:     'ACTIVO',
    soon:       'PRONTO',
    market:     'Inteligencia de Mercado',
    niches:     'Nichos Tendencia',
    build:      'Añadir al chat →',
    cancel:     'Cancelar',
    blueprint:  'Confirma la meta-instrucción antes de construir',
    trends:     'Tendencias actualizadas: marzo 2026',
    footer:     'AIC-RG Studio — Plataforma Profesional v3',
    figmaDesc:  'Conecta sistemas de diseño, sincroniza tokens y activa el Gemelo Digital.',
  },
  de: {
    heading:    'Studio-Dashboard',
    subheading: 'Eine Full-Stack-Produktentwicklungsplattform. Wähle ein Modul zum Starten.',
    userEntities:    'Benutzer-Entitäten',
    projectsHub:     'Projekte-Hub',
    projectsHubDesc: 'Dein Arbeitsbereich. Alle Projekte, Revisionen und Branches.',
    noProjects:      'Noch keine Projekte',
    noProjectsHint:  'Öffne die System Engine und baue etwas.',
    newProject:      'Neues Projekt',
    openAll:         'Alle anzeigen',
    platformModules: 'Plattform-Module',
    active:     'AKTIV',
    soon:       'BALD',
    market:     'Marktintelligenz',
    niches:     'Trendnischen',
    build:      'Zum Chat hinzufügen →',
    cancel:     'Abbrechen',
    blueprint:  'Meta-Anweisung vor dem Bauen bestätigen',
    trends:     'Trends aktualisiert: März 2026',
    footer:     'AIC-RG Studio — Professionelle Plattform v3',
    figmaDesc:  'Design-Systeme verbinden, Tokens synchronisieren, Digital Twin aktivieren.',
  },
  fr: {
    heading:    'Tableau de Bord Studio',
    subheading: 'Une plateforme de développement produit full-stack. Sélectionnez un module pour commencer.',
    userEntities:    'Entités Utilisateur',
    projectsHub:     'Hub Projets',
    projectsHubDesc: 'Votre espace de travail. Tous les projets, révisions et branches.',
    noProjects:      'Aucun projet encore',
    noProjectsHint:  "Ouvrez System Engine et commencez à construire.",
    newProject:      'Nouveau Projet',
    openAll:         'Voir Tout',
    platformModules: 'Modules de la Plateforme',
    active:     'ACTIF',
    soon:       'BIENTÔT',
    market:     'Intelligence Marché',
    niches:     'Niches Tendances',
    build:      'Ajouter au chat →',
    cancel:     'Annuler',
    blueprint:  'Confirmez la méta-instruction avant de construire',
    trends:     'Tendances mises à jour : mars 2026',
    footer:     'AIC-RG Studio — Plateforme Professionnelle v3',
    figmaDesc:  'Connectez les systèmes de design, synchronisez les tokens, activez le Digital Twin.',
  },
  zh: {
    heading:    '工作室仪表板',
    subheading: '全栈产品开发平台。选择模块开始工作。',
    userEntities:    '用户实体',
    projectsHub:     '项目中心',
    projectsHubDesc: '您的工作区。所有项目、版本和分支。',
    noProjects:      '暂无项目',
    noProjectsHint:  '打开 System Engine 开始构建。',
    newProject:      '新建项目',
    openAll:         '查看全部',
    platformModules: '平台模块',
    active:     '活跃',
    soon:       '即将推出',
    market:     '市场情报',
    niches:     '热门细分市场',
    build:      '添加到聊天 →',
    cancel:     '取消',
    blueprint:  '构建前确认元指令',
    trends:     '趋势更新：2026年3月',
    footer:     'AIC-RG Studio — 专业平台 v3',
    figmaDesc:  '连接设计系统，同步设计令牌，激活数字孪生。',
  },
};

const TRENDING_NICHES: TrendingNiche[] = [
  {
    id: 'ai-agents-b2b', icon: '🤖', title: 'AI Agents for B2B',
    tag: 'High Growth', tagColor: '#3b82f6',
    whyNow: 'Tool-calling AI matured in 2025. Enterprises pay $50–500/mo for automation — no vertical leader yet.',
    blueprint: `Build an AI Agents SaaS for B2B workflow automation.

[Technical & Market Analysis]
• Efficiency: React SPA + Supabase Edge Functions + OpenAI tool-calling — zero heavy infra
• Future-Proof: Plug-and-play model layer; swap Claude/GPT-4o without rewriting agent logic
• Market Fit: Enterprises paying $50–500/mo; no vertical leader in legal/accounting/HR yet

Product Architecture:
- Landing with ROI calculator → Email signup → Free 7-day trial → $49/mo Pro
- Core: Visual workflow builder + AI agent runner (Supabase Edge Function)
- Paywall: Hard limit at 5 automations on free plan
- Gamification: "Hours saved" counter, streak badges, team leaderboard

Build Phases:
1. Landing + Auth + Dashboard shell
2. Workflow builder (drag-and-drop trigger/action nodes)
3. AI agent execution (Supabase Edge Functions + OpenAI tool calling)
4. Stripe billing + usage analytics dashboard`,
  },
  {
    id: 'micro-saas-tax', icon: '💰', title: 'Micro-SaaS Tax Tool',
    tag: 'Revenue Ready', tagColor: '#10b981',
    whyNow: 'TurboTax ignores 59M US freelancers. Mobile-first quarterly tax automation is wide open at $19/mo.',
    blueprint: `Build a Micro-SaaS for freelancer quarterly tax automation (US Form 1040).

[Technical & Market Analysis]
• Efficiency: Mobile-first PWA; OCR via FileReader + OpenAI Vision — no separate backend needed
• Future-Proof: API-first design; ready for 2026 document AI models (AWS Textract, Google DocAI)
• Market Fit: 59M US freelancers underserved by TurboTax; OCR + mobile = clear competitive edge

Product Architecture:
- Landing: "Know your taxes in 60 seconds" → Free (3 receipts) → $19/mo Pro
- Core: Receipt upload (drag/camera) → OCR → AI categorization → quarterly estimate
- Onboarding: 3-step wizard: income type → state → first receipt upload
- Gamification: Tax health score, savings streak, quarterly milestone alerts

Build Phases:
1. Landing + Auth + dashboard shell
2. Receipt upload + OCR + AI categorization flow
3. Tax estimate engine (federal + state rules as JSON config)
4. PDF export + Stripe paywall`,
  },
  {
    id: 'creator-platform', icon: '✍️', title: 'Creator Monetization Hub',
    tag: 'Proven', tagColor: '#f59e0b',
    whyNow: 'Substack takes 10% of revenue. Creators want owned audience + multi-stream monetization in one tool.',
    blueprint: `Build a Creator Monetization Hub — newsletter + community + digital products.

[Technical & Market Analysis]
• Efficiency: Supabase for auth/storage, Resend for email delivery — zero DevOps overhead
• Future-Proof: Modular revenue blocks; add live events or AI courses without core changes
• Market Fit: Substack charges 10%; creators at $5K+/mo are actively seeking lower-fee alternatives

Product Architecture:
- Landing: Revenue calculator ("You're leaving $X/mo on Substack") → Free → $29/mo Pro
- Core: Newsletter editor + subscriber management + community (threaded comments)
- Monetization: Paid newsletters, digital product store, tip jar
- Gamification: Subscriber milestone badges, monthly revenue streak

Build Phases:
1. Auth + subscriber list + newsletter editor
2. Community module (threaded comments + reactions)
3. Digital product store (Stripe checkout)
4. Analytics dashboard + milestone notification system`,
  },
  {
    id: 'ai-legal', icon: '⚖️', title: 'AI Legal Assistant',
    tag: 'Untapped', tagColor: '#8b5cf6',
    whyNow: 'SMBs spend $2B/year on contract review. AI handles NDAs and GDPR policies for $29/mo vs $300/hr lawyer.',
    blueprint: `Build an AI Legal Assistant SaaS for SMBs — contracts, NDAs, GDPR compliance.

[Technical & Market Analysis]
• Efficiency: GPT-4o for doc analysis; Supabase Storage for vault; average review < 3 seconds
• Future-Proof: Jurisdiction rules stored as JSON config — update laws without redeploying
• Market Fit: $200–500/hr lawyer consultation → $29/mo SaaS; validated SMB pain point

Product Architecture:
- Landing: "Review any contract in 30 seconds" → Free (3 reviews) → $29/mo Pro
- Core: Upload PDF/DOCX → AI risk scoring → Clause highlights → Suggested rewrites
- Templates: NDA, freelance agreement, privacy policy, terms of service
- Onboarding: Upload your first contract in step 1 of signup flow

Build Phases:
1. Landing + Auth + document upload UI
2. AI contract analysis (risk score + clause highlights)
3. Template library (4 core document types)
4. Contract vault (Supabase Storage) + team sharing`,
  },
  {
    id: 'ai-hr', icon: '👥', title: 'AI HR Copilot',
    tag: 'Emerging', tagColor: '#f43f5e',
    whyNow: 'Series A–B startups (20–200 employees) waste 8h/week on HR docs with no dedicated HR team.',
    blueprint: `Build an AI HR Copilot SaaS for startups (20–200 employees).

[Technical & Market Analysis]
• Efficiency: AI doc generation via OpenAI; Supabase for records; webhooks for Slack/Notion
• Future-Proof: HR templates as configurable JSON; add country compliance as drop-in modules
• Market Fit: Gusto/BambooHR target enterprise; Series A startups fully unserved at $49/mo

Product Architecture:
- Landing: "Replace 8h of HR work with 8 minutes" → Free trial → $49/mo per workspace
- Core: AI policy generator, onboarding checklist builder, performance review draft tool
- Integrations: Slack (announce new hires), Notion (sync policy docs)
- Gamification: Team health score, onboarding completion streaks

Build Phases:
1. Auth + employee directory dashboard
2. AI policy + document generator
3. Onboarding workflow builder (task checklists)
4. Slack/Notion webhook integration + team analytics`,
  },
  {
    id: 'smb-automation', icon: '⚡', title: 'SMB No-Code Automation',
    tag: 'High Volume', tagColor: '#06b6d4',
    whyNow: 'Zapier charges $299/mo for 10 automations. Vertical-focused alternative wins fast on price + depth.',
    blueprint: `Build a No-Code Automation SaaS for SMBs — vertical-focused Zapier alternative.

[Technical & Market Analysis]
• Efficiency: Supabase Edge Functions as runners; React flow canvas for builder; $0 idle cost
• Future-Proof: Connector system as plugins — add new integrations without core changes
• Market Fit: Zapier at $299/mo vs our $29/mo; e-commerce SMBs need only 5–10 automations

Product Architecture:
- Landing: "Automate your store in 5 minutes" → Free (3 automations) → $29/mo Pro
- Core: Visual workflow builder (trigger → condition → action nodes)
- Connectors v1: Shopify, Gmail, WhatsApp, Google Sheets, Stripe
- Gamification: "Hours saved" counter, automation health score, streak calendar

Build Phases:
1. Auth + visual workflow builder (React draggable nodes)
2. Trigger/action execution engine (Supabase Edge Functions)
3. Pre-built connector library (Shopify + Gmail as v1)
4. Analytics dashboard + Stripe billing`,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCost = (n: number) =>
  n < 0.0001 ? '$0.0000' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`;

function fmtSyncTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 1)  return 'Just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(isoString).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export const Dashboard: React.FC<DashboardProps> = ({
  sessionCost, sessionTokens, cloudAvailable, projects,
  onEnterEngine, onLoadProject, onStartBlueprint,
  onNavigateFigma, onNavigateCodeStudio, onNewProject, onOpenAllProjects, onLaunchWithPlan,
  appLanguage = 'en',
}) => {
  const repairMojibake = (value: string): string => {
    if (!/[ÃÐÑâ]/.test(value)) return value;
    try {
      return decodeURIComponent(escape(value));
    } catch {
      return value;
    }
  };
  const { googleAccessToken } = useAuth();
  const [hovered,        setHovered]        = useState<string | null>(null);
  const [blueprintNiche, setBlueprintNiche] = useState<TrendingNiche | null>(null);
  const [trendingNiches, setTrendingNiches] = useState<TrendingNiche[]>(TRENDING_NICHES);
  const LRaw = DASH_LABELS[appLanguage] ?? DASH_LABELS['en'];
  const L = Object.fromEntries(
    Object.entries(LRaw).map(([k, v]) => [k, repairMojibake(v)]),
  ) as typeof LRaw;
  const creatorMode = isCreatorMode();
  const visibleModules = creatorMode
    ? MODULES
    : MODULES.filter(mod => mod.id !== 'code-studio');

  useEffect(() => {
    const readNiches = async () => {
      try {
        let ideas = loadCachedNiches() as Array<Record<string, unknown>>;
        if (ideas.length === 0 && hasIdeaGenerationAccess(googleAccessToken)) {
          ideas = await ensureNicheIdeas(googleAccessToken);
        }
        if (ideas.length === 0) {
          setTrendingNiches(TRENDING_NICHES);
          return;
        }

        setTrendingNiches(ideas.slice(0, 6).map(mapIdeaToTrendingNiche));
      } catch {
        setTrendingNiches(TRENDING_NICHES);
      }
    };

    void readNiches();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'aic_ideas_niches') {
        void readNiches();
      }
    };
    const onIdeaFeed = () => {
      void readNiches();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(getIdeaFeedEventName(), onIdeaFeed);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(getIdeaFeedEventName(), onIdeaFeed);
    };
  }, [googleAccessToken]);

  const walletPct  = Math.min((sessionCost   / 1)       * 100, 100);
  const contextPct = Math.min((sessionTokens / 100_000) * 100, 100);

  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const handleNewProject     = onNewProject      ?? onEnterEngine;
  const handleOpenAllProjects = onOpenAllProjects ?? onEnterEngine;

  // Цвета для светлой темы
  const isLightTheme = true; // theme === 'light'
  const headerTitleColor = isLightTheme ? '#111111' : 'rgba(255,255,255,0.9)';
  const headerSubColor = isLightTheme ? '#444444' : 'rgba(255,255,255,0.32)';
  const pageBackground = isLightTheme ? '#f3f4f6' : 'transparent';
  const cardBackground = isLightTheme ? '#ffffff' : 'rgba(255,255,255,0.018)';
  const cardBorder = isLightTheme ? '#e5e7eb' : 'rgba(255,255,255,0.07)';
  const cardBorderHover = isLightTheme ? '#d1d5db' : 'rgba(255,255,255,0.13)';
  const statusActiveColor = isLightTheme ? '#16a34a' : '#4ade80';
  const statusActiveBg = isLightTheme ? 'rgba(22,163,74,0.1)' : 'rgba(74,222,128,0.1)';
  const statusActiveBorder = isLightTheme ? 'rgba(22,163,74,0.2)' : 'rgba(74,222,128,0.2)';
  const textColorPrimary = isLightTheme ? '#111111' : 'rgba(255,255,255,0.85)';
  const textColorSecondary = isLightTheme ? '#444444' : 'rgba(255,255,255,0.32)';
  const textColorMuted = isLightTheme ? '#6b7280' : 'rgba(255,255,255,0.28)';

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-start',
      padding: '48px 32px 40px', overflowY: 'auto', background: pageBackground,
    }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 40, textAlign: 'center', position: 'relative', width: '100%', maxWidth: 900 }}>
        <div style={{ position: 'absolute', right: 0, top: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: cloudAvailable ? '#4ade80' : '#374151',
            boxShadow: cloudAvailable ? '0 0 7px #4ade8060' : 'none', transition: 'all 0.4s',
          }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: cloudAvailable ? 'rgba(74,222,128,0.7)' : 'rgba(255,255,255,0.2)' }}>
            {cloudAvailable ? 'Cloud Sync' : 'Offline'}
          </span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', color: isLightTheme ? 'rgba(17,17,17,0.22)' : 'rgba(255,255,255,0.22)', textTransform: 'uppercase', marginBottom: 14 }}>
          AIC-RG Studio
        </div>
        <h1 style={{
          margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: '-0.025em',
          color: headerTitleColor,
        }}>
          {L.heading}
        </h1>
        <p style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.65, color: headerSubColor, maxWidth: 440, margin: '10px auto 0' }}>
          {L.subheading}
        </p>
      </div>

      {/* ══ USER ENTITIES LAYER ══════════════════════════════════════════════════ */}
      <div style={{ width: '100%', maxWidth: 900, marginBottom: 28 }}>

        {/* Layer label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: isLightTheme ? 'rgba(99,102,241,0.55)' : 'rgba(165,180,252,0.4)' }}>
            {L.userEntities}
          </span>
          <div style={{ flex: 1, height: 1, background: isLightTheme ? 'rgba(99,102,241,0.12)' : 'rgba(165,180,252,0.08)' }} />
        </div>

        {/* Projects Hub card */}
        <div
          style={{
            borderRadius: 16, padding: '20px 22px',
            background: isLightTheme ? '#ffffff' : 'rgba(99,102,241,0.045)',
            border: `1px solid ${isLightTheme ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.2)'}`,
            backdropFilter: isLightTheme ? 'none' : 'blur(16px)',
            display: 'flex', flexDirection: 'column', gap: 0,
          }}
        >
          {/* Hub header row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(129,140,248,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <path d="M8 21h8M12 17v4"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 650, color: textColorPrimary, lineHeight: 1.2 }}>{L.projectsHub}</div>
                <div style={{ fontSize: 11, color: textColorMuted, marginTop: 2 }}>{L.projectsHubDesc}</div>
              </div>
            </div>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
              <button
                onClick={handleOpenAllProjects}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: 'transparent',
                  color: isLightTheme ? 'rgba(99,102,241,0.75)' : 'rgba(165,180,252,0.6)',
                  border: `1px solid ${isLightTheme ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.25)'}`,
                  transition: 'all 0.18s',
                }}
              >
                {L.openAll}
              </button>
              <button
                onClick={handleNewProject}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: isLightTheme ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.18)',
                  color: isLightTheme ? '#6366f1' : 'rgba(165,180,252,0.9)',
                  border: `1px solid ${isLightTheme ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.3)'}`,
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.18s',
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> {L.newProject}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: isLightTheme ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.12)', marginBottom: 12 }} />

          {/* Projects list */}
          {recentProjects.length === 0 ? (
            <div style={{
              padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              <div style={{ fontSize: 22, opacity: 0.3 }}>📁</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: isLightTheme ? '#9ca3af' : 'rgba(255,255,255,0.22)' }}>{L.noProjects}</div>
              <div style={{ fontSize: 11, color: isLightTheme ? '#d1d5db' : 'rgba(255,255,255,0.14)', textAlign: 'center', maxWidth: 280 }}>{L.noProjectsHint}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Column headers */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 100px 72px 60px 60px',
                padding: '0 4px 6px', marginBottom: 4,
                borderBottom: `1px solid ${isLightTheme ? '#f3f4f6' : 'rgba(255,255,255,0.04)'}`,
              }}>
                {['Project', 'Last Activity', 'Branch', 'Rev', 'Last Good'].map(col => (
                  <span key={col} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isLightTheme ? '#9ca3af' : 'rgba(255,255,255,0.2)' }}>{col}</span>
                ))}
              </div>
              {recentProjects.map((p, idx) => {
                const lastActivity = fmtSyncTime(storageService.getLastSyncAt(p.id) ?? p.date);
                const branch       = p.branch       ?? 'main';
                const revision     = p.revision     != null ? `r${p.revision}` : '—';
                const lastGood     = p.lastGood     != null ? `r${p.lastGood}` : '—';
                const isLast       = idx === recentProjects.length - 1;
                return (
                  <div
                    key={p.id}
                    onClick={() => onLoadProject(p)}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 100px 72px 60px 60px',
                      padding: '8px 4px', cursor: 'pointer', borderRadius: 6,
                      borderBottom: isLast ? 'none' : `1px solid ${isLightTheme ? '#f9fafb' : 'rgba(255,255,255,0.025)'}`,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = isLightTheme ? '#f9fafb' : 'rgba(99,102,241,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 12, fontWeight: 500, color: isLightTheme ? '#1f2937' : 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                      {p.title || 'Untitled'}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: isLightTheme ? '#6b7280' : 'rgba(255,255,255,0.32)' }}>
                      {lastActivity}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: isLightTheme ? '#6366f1' : 'rgba(165,180,252,0.55)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="18" r="3"/><circle cx="12" cy="6" r="3"/><path d="M12 9v6"/></svg>
                      {branch}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: isLightTheme ? '#9ca3af' : 'rgba(255,255,255,0.25)' }}>
                      {revision}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: lastGood !== '—' ? (isLightTheme ? '#16a34a' : '#4ade80') : (isLightTheme ? '#d1d5db' : 'rgba(255,255,255,0.15)') }}>
                      {lastGood}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ PLATFORM MODULES LAYER ═══════════════════════════════════════════════ */}

      {/* Layer label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 900, marginBottom: 12 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: isLightTheme ? 'rgba(107,114,128,0.5)' : 'rgba(255,255,255,0.22)' }}>
          {L.platformModules}
        </span>
        <div style={{ flex: 1, height: 1, background: isLightTheme ? 'rgba(107,114,128,0.1)' : 'rgba(255,255,255,0.06)' }} />
      </div>

      {/* ── Module Cards Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(240px, 280px))', gap: 14, width: '100%', maxWidth: 900 }}>
        {visibleModules.map(mod => {
          const Icon      = mod.icon;
          const isEngine  = mod.id === 'engine';
          const isFigma   = mod.id === 'figma';
          const isCodeStudio = mod.id === 'code-studio';
          const isCloud   = mod.id === 'cloud';
          const isActive  = isEngine || isFigma || isCodeStudio;
          const isHovered = hovered === mod.id;
          const accentHex = mod.accent;
          const description = isFigma ? L.figmaDesc : mod.description;
          return (
            <div
              key={mod.id}
              onClick={() => {
                if (isEngine) onEnterEngine();
                if (isFigma && onNavigateFigma) onNavigateFigma();
                if (isCodeStudio && onNavigateCodeStudio) onNavigateCodeStudio();
              }}
              onMouseEnter={() => setHovered(mod.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'relative', borderRadius: 16, padding: '20px',
                border: isLightTheme
                  ? `1px solid ${isEngine && isHovered ? 'rgba(59,130,246,0.45)' : isEngine ? 'rgba(59,130,246,0.2)' : (isFigma || isCodeStudio) && isHovered ? `${accentHex}60` : (isFigma || isCodeStudio) ? `${accentHex}30` : cardBorderHover}`
                  : `1px solid ${
                      isEngine && isHovered ? 'rgba(59,130,246,0.45)' :
                      isEngine             ? 'rgba(59,130,246,0.2)'  :
                      (isFigma || isCodeStudio) && isHovered ? `${accentHex}60` :
                      (isFigma || isCodeStudio)             ? `${accentHex}30` :
                      isHovered            ? 'rgba(255,255,255,0.13)' :
                                             'rgba(255,255,255,0.07)'
                    }`,
                background: isLightTheme
                  ? cardBackground
                  : isEngine
                    ? `rgba(59,130,246,${isHovered ? '0.09' : '0.04'})`
                    : isFigma || isCodeStudio
                      ? `${accentHex}${isHovered ? '14' : '08'}`
                      : `rgba(255,255,255,${isHovered ? '0.035' : '0.018'})`,
                backdropFilter: isLightTheme ? 'none' : 'blur(16px)',
                cursor: isActive ? 'pointer' : 'default',
                opacity: mod.available ? 1 : 0.6,
                transform: isActive && isHovered ? 'translateY(-3px)' : 'translateY(0)',
                boxShadow: isLightTheme
                  ? isEngine && isHovered
                    ? '0 4px 12px rgba(59,130,246,0.15)'
                    : (isFigma || isCodeStudio) && isHovered
                      ? `0 4px 12px ${accentHex}22`
                      : '0 1px 3px rgba(0,0,0,0.08)'
                  : isEngine && isHovered
                    ? '0 12px 40px rgba(59,130,246,0.12)'
                    : (isFigma || isCodeStudio) && isHovered
                      ? `0 12px 40px ${accentHex}22`
                      : 'none',
                transition: 'all 0.25s ease', display: 'flex', flexDirection: 'column', gap: 14,
                minHeight: 190,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: `${mod.accent}1a`, border: `1px solid ${mod.accent}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: mod.accent,
                }}>
                  <Icon size={17} strokeWidth={1.8} />
                </div>
                {mod.available ? (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: statusActiveColor, background: statusActiveBg, border: `1px solid ${statusActiveBorder}`, padding: '3px 7px', borderRadius: 5 }}>{L.active}</span>
                ) : (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: isLightTheme ? 'rgba(107,114,128,0.5)' : 'rgba(255,255,255,0.22)', background: isLightTheme ? 'rgba(107,114,128,0.08)' : 'rgba(255,255,255,0.04)', border: isLightTheme ? '1px solid rgba(107,114,128,0.15)' : '1px solid rgba(255,255,255,0.07)', padding: '3px 7px', borderRadius: 5 }}>{L.soon}</span>
                )}
              </div>

              <div>
                <div style={{ fontSize: 14, fontWeight: 650, color: textColorPrimary, marginBottom: 6 }}>{mod.title}</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.6, color: textColorSecondary }}>{description}</div>
              </div>

              {isEngine && (
                <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: isLightTheme ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: isLightTheme ? '#6b7280' : 'rgba(255,255,255,0.28)' }}>API Wallet</span>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: isLightTheme ? '#16a34a' : '#4ade80' }}>{fmtCost(sessionCost)}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, overflow: 'hidden', background: isLightTheme ? '#e5e7eb' : 'rgba(255,255,255,0.06)' }}>
                      <div style={{ height: '100%', borderRadius: 2, width: `${walletPct}%`, background: 'linear-gradient(90deg,#22c55e,#4ade80)', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: isLightTheme ? '#6b7280' : 'rgba(255,255,255,0.28)' }}>Context Health</span>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: isLightTheme ? '#4b5563' : 'rgba(255,255,255,0.5)' }}>{Math.round(contextPct)}%</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, overflow: 'hidden', background: isLightTheme ? '#e5e7eb' : 'rgba(255,255,255,0.06)' }}>
                      <div style={{ height: '100%', borderRadius: 2, width: `${contextPct}%`, background: 'linear-gradient(90deg,#3b82f6,#60a5fa)', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                </div>
              )}

              {isCloud && (
                <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>DB Storage</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.18)' }}>— MB</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>Active Users</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.18)' }}>—</span>
                  </div>
                </div>
              )}

              {isFigma && (
                <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(245,158,11,0.1)', display: 'flex', gap: 6 }}>
                  {[['🪞', 'Digital Twin'], ['🎨', 'Design DNA'], ['⚡', 'Deep Scan']].map(([icon, label]) => (
                    <div key={label} style={{ flex: 1, padding: '6px 4px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.12)', textAlign: 'center' }}>
                      <div style={{ fontSize: 13 }}>{icon}</div>
                      <div style={{ fontSize: 9, color: 'rgba(245,158,11,0.7)', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap' }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {(isEngine || isFigma || isCodeStudio) && isHovered && (
                <div style={{ position: 'absolute', bottom: 18, right: 18, color: isEngine ? 'rgba(96,165,250,0.7)' : isFigma ? 'rgba(245,158,11,0.7)' : 'rgba(167,139,250,0.8)', animation: 'arrowPulse 0.6s ease' }}>
                  <ArrowRight size={14} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Market Intelligence Section ── */}
      <div style={{ width: '100%', maxWidth: 900, marginTop: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: isLightTheme ? '#6b7280' : 'rgba(255,255,255,0.22)', marginBottom: 4 }}>
              {L.market}
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: isLightTheme ? '#111111' : 'rgba(255,255,255,0.8)' }}>
              {L.niches}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: isLightTheme ? 'rgba(22,163,74,0.08)' : 'rgba(74,222,128,0.07)', border: isLightTheme ? '1px solid rgba(22,163,74,0.2)' : '1px solid rgba(74,222,128,0.14)', borderRadius: 20, padding: '5px 12px' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a', boxShadow: isLightTheme ? '0 0 5px rgba(22,163,74,0.4)' : '0 0 5px #4ade8066' }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: isLightTheme ? '#16a34a' : 'rgba(74,222,128,0.65)', letterSpacing: '0.06em' }}>
              {L.trends}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {trendingNiches.map(niche => {
            const isH = hovered === `niche-${niche.id}`;
            return (
              <div
                key={niche.id}
                onMouseEnter={() => setHovered(`niche-${niche.id}`)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  borderRadius: 14, padding: '16px',
                  display: 'flex', flexDirection: 'column', gap: 10,
                  background: isLightTheme ? '#ffffff' : isH ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.018)',
                  border: `1px solid ${isLightTheme ? '#e5e7eb' : isH ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                  backdropFilter: isLightTheme ? 'none' : 'blur(12px)',
                  transform: isH ? 'translateY(-2px)' : 'none',
                  transition: 'all 0.22s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 22 }}>{niche.icon}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: niche.tagColor, background: isLightTheme ? `${niche.tagColor}20` : `${niche.tagColor}1a`,
                    border: `1px solid ${niche.tagColor}40`, padding: '3px 7px', borderRadius: 5,
                  }}>
                    {niche.tag}
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 650, color: isLightTheme ? '#111111' : 'rgba(255,255,255,0.82)', marginBottom: 5 }}>{niche.title}</div>
                  <div style={{ fontSize: 11, lineHeight: 1.55, color: isLightTheme ? '#444444' : 'rgba(255,255,255,0.35)' }}>{niche.whyNow}</div>
                </div>

                <button
                  onClick={() => setBlueprintNiche(niche)}
                  style={{
                    marginTop: 'auto', padding: '7px 0', borderRadius: 8,
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    color: isLightTheme ? niche.tagColor : niche.tagColor, background: isLightTheme ? `${niche.tagColor}20` : `${niche.tagColor}12`,
                    border: `1px solid ${niche.tagColor}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    transition: 'all 0.18s',
                  }}
                >
                  <span style={{ fontSize: 12 }}>⚡</span> {appLanguage === 'ru' ? 'Добавить в контекст' : 'Add to Context'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 44, fontSize: 10, letterSpacing: '0.06em', color: isLightTheme ? '#9ca3af' : 'rgba(255,255,255,0.12)' }}>
        {L.footer}
      </div>

      {/* ── Blueprint Modal ── */}
      {blueprintNiche && (
        <div
          onClick={() => setBlueprintNiche(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 580, maxHeight: '82vh',
              background: '#0e0e14', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 18, display: 'flex', flexDirection: 'column',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)', animation: 'modalPop 0.22s ease',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '18px 20px 16px', flexShrink: 0,
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{blueprintNiche.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                    {blueprintNiche.title} — Blueprint
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                    {L.blueprint}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setBlueprintNiche(null)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 4, borderRadius: 6 }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Blueprint body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
              <div style={{
                fontSize: 12, lineHeight: 1.8, color: 'rgba(255,255,255,0.72)',
                whiteSpace: 'pre-wrap',
                fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
                background: 'rgba(255,255,255,0.03)', borderRadius: 10,
                padding: '16px 18px', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                {blueprintNiche.blueprint}
              </div>
            </div>

            {/* Footer buttons */}
            <div style={{
              padding: '14px 20px', flexShrink: 0,
              borderTop: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', gap: 10, justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setBlueprintNiche(null)}
                style={{
                  padding: '8px 18px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                  background: 'transparent', color: 'rgba(255,255,255,0.4)',
                  border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                }}
              >
                {L.cancel}
              </button>
              <button
                onClick={() => {
                  if (blueprintNiche.launchPlan && blueprintNiche.launchIntent && onLaunchWithPlan) {
                    onLaunchWithPlan(blueprintNiche.launchPlan, blueprintNiche.launchIntent, 'niche');
                  } else {
                    onStartBlueprint(blueprintNiche.blueprint);
                  }
                  setBlueprintNiche(null);
                }}
                style={{
                  padding: '8px 22px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                  background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                  boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
                }}
              >
                {L.build}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes arrowPulse {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        @keyframes modalPop {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  );
};
