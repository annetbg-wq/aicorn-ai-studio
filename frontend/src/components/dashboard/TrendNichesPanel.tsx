import React from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Loader2,
  RefreshCw,
  Send,
  Settings2,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { buildFounderReadyBrief } from '../../services/founderBriefBuilder';
import { PACKAGING_PROGRESS_STEPS, packageSelectedIdea } from '../../services/ideaPackagingService';
import {
  ensureTrendNichesModel,
  fetchTrendArchive,
  getIdeaFeedEventName,
  getTrendIdeaText,
  loadCachedTrendNiches,
  loadTrendIdeaBank,
  loadTrendNicheInterests,
  makeDefaultTrendModel,
  markTrendIdeaSentToChat,
  removeTrendIdeaFromBank,
  saveTrendIdeaToBank,
  saveTrendNicheInterests,
  TREND_NICHE_INTERESTS,
  type ProductBlueprint,
  type ProductIdea,
  type TrendArchiveEntry,
  type TrendIdeaBankItem,
  type TrendNicheIdea,
  type TrendNicheInterest,
  type TrendNichesModel,
} from '../../services/ideaFeedService';

interface TrendNichesPanelProps {
  appLanguage?: string;
  onSendIdeaToChat: (idea: TrendNicheIdea, founderBrief: string, generationPath: 'skeleton_assembly' | 'blank_canvas') => void;
  onBuildIdea?: (idea: TrendNicheIdea, blueprint: ProductBlueprint, intent: string) => void | Promise<void>;
}

const LABELS: Record<string, Record<string, string>> = {
  en: {
    eyebrow: 'Market intelligence',
    title: 'Trending niches',
    interests: 'Focus',
    interestsHint: 'Choose one interest and the daily, weekly, and monthly sets will be regenerated for it.',
    day: 'Daily ideas',
    week: 'Weekly ideas',
    month: 'Monthly ideas',
    bank: 'Idea bank',
    archive: 'Archive',
    archiveEmpty: 'No topics archived yet',
    archiveSendToChat: 'Send to chat',
    archiveDay: 'Daily',
    archiveWeek: 'Weekly',
    archiveMonth: 'Monthly',
    refresh: 'Refresh',
    save: 'Save idea',
    saved: 'Saved',
    send: '🏗 Skeleton',
    build: '⚡ LV Fast',
    launchModesHint: 'Skeleton — step-by-step ProtoPipeline build. LV Fast — single-shot LVPipeline. Both send the idea to chat first.',
    delete: 'Remove',
    emptyBank: 'No saved ideas yet',
    comment: 'User comment',
    commentPlaceholder: 'Optional context, constraint, or founder note',
    confirm: 'Send brief',
    cancel: 'Cancel',
    summary: 'Idea summary',
    loading: 'Loading ideas',
  },
  ru: {
    eyebrow: 'Рыночная аналитика',
    title: 'Трендовые ниши',
    interests: 'Интерес',
    interestsHint: 'Выбери один интерес — после этого подборки дня, недели и месяца будут заново сгенерированы под него.',
    day: 'Идеи дня',
    week: 'Идеи недели',
    month: 'Идеи месяца',
    bank: 'Банк идей',
    archive: 'Архив тем',
    archiveEmpty: 'Тем пока нет',
    archiveSendToChat: 'В чат',
    archiveDay: 'День',
    archiveWeek: 'Неделя',
    archiveMonth: 'Месяц',
    refresh: 'Обновить',
    save: 'Сохранить идею',
    saved: 'В банке',
    send: '🏗 Скелетон',
    build: '⚡ LV Быстро',
    launchModesHint: 'Скелетон — пошаговая сборка через ProtoPipeline. LV Быстро — быстрая генерация через LVPipeline. Оба варианта отправляют идею в чат.',
    delete: 'Удалить',
    emptyBank: 'Сохраненных идей пока нет',
    comment: 'Комментарий пользователя',
    commentPlaceholder: 'Необязательный контекст, ограничение или founder note',
    confirm: 'Отправить brief',
    cancel: 'Отмена',
    summary: 'Краткое описание идеи',
    loading: 'Загружаю идеи',
  },
};

function labelsFor(language?: string): Record<string, string> {
  const lang = (language || 'en').toLowerCase().split('-')[0];
  return LABELS[lang] ?? LABELS.en;
}

function sectionAccent(index: number): string {
  return ['#2563eb', '#059669', '#7c3aed'][index % 3];
}

function trendIdeaToProductIdea(idea: TrendNicheIdea, language?: string): ProductIdea {
  const copy = getTrendIdeaText(idea, language);
  return {
    id: idea.id,
    title: copy.title,
    pitch: copy.description,
    marketGap: copy.whyInteresting || copy.marketAngle,
    visualTag: idea.theme,
    unfairAdvantage: copy.marketAngle,
    buyerReason: copy.whyInteresting,
  };
}

function buildTrendPackagingIntent(idea: TrendNicheIdea, blueprint: ProductBlueprint, language?: string): string {
  const copy = getTrendIdeaText(idea, language);
  return [
    `Package this trend idea into production-ready code: ${blueprint.appName || copy.title}`,
    '',
    `Pitch: ${copy.description}`,
    `Market angle: ${copy.marketAngle}`,
    `Why now: ${copy.whyInteresting}`,
    `Visual direction: ${blueprint.visualTag || idea.theme}`,
    '',
    'Use the packaged blueprint already attached as the source of truth.',
    'Implement with the Premium UI Kit only, using /src/components/ui and /blocks.',
  ].join('\n');
}

export const TrendNichesPanel: React.FC<TrendNichesPanelProps> = ({
  appLanguage = 'en',
  onSendIdeaToChat,
  onBuildIdea,
}) => {
  const { googleAccessToken } = useAuth();
  const labels = labelsFor(appLanguage);
  const [model, setModel] = React.useState<TrendNichesModel | null>(() => loadCachedTrendNiches() ?? makeDefaultTrendModel());
  const [bank, setBank] = React.useState<TrendIdeaBankItem[]>(() => loadTrendIdeaBank());
  const [archive, setArchive] = React.useState<TrendArchiveEntry[]>([]);
  const [archiveLoading, setArchiveLoading] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<'ideas' | 'bank' | 'archive'>('ideas');
  const [selectedInterest, setSelectedInterest] = React.useState<TrendNicheInterest | null>(() => loadTrendNicheInterests()[0] ?? null);
  const [loading, setLoading] = React.useState(false);
  const [pendingIdea, setPendingIdea] = React.useState<TrendNicheIdea | null>(null);
  const [pendingGenerationPath, setPendingGenerationPath] = React.useState<'skeleton_assembly' | 'blank_canvas'>('skeleton_assembly');
  const [comment, setComment] = React.useState('');
  const [packagingIdeaId, setPackagingIdeaId] = React.useState<string | null>(null);
  const [packagingStepIndex, setPackagingStepIndex] = React.useState(0);
  const [packagingError, setPackagingError] = React.useState<string | null>(null);

  const loadIdeas = React.useCallback(async (
    force = false,
    targetInterest: TrendNicheInterest | null = selectedInterest,
  ) => {
    setLoading(true);
    try {
      const next = await ensureTrendNichesModel(appLanguage, googleAccessToken, force, targetInterest);
      setModel(next);
    } finally {
      setLoading(false);
    }
  }, [appLanguage, googleAccessToken, selectedInterest]);

  React.useEffect(() => {
    void loadIdeas(false, selectedInterest);
  }, [loadIdeas, selectedInterest]);

  React.useEffect(() => {
    const refreshBank = () => {
      setBank(loadTrendIdeaBank());
      setSelectedInterest(loadTrendNicheInterests()[0] ?? null);
      setModel(loadCachedTrendNiches());
    };
    window.addEventListener('storage', refreshBank);
    window.addEventListener(getIdeaFeedEventName(), refreshBank);
    return () => {
      window.removeEventListener('storage', refreshBank);
      window.removeEventListener(getIdeaFeedEventName(), refreshBank);
    };
  }, []);

  React.useEffect(() => {
    if (activeSection !== 'archive') return;
    setArchiveLoading(true);
    void fetchTrendArchive().then(entries => {
      setArchive(entries);
      setArchiveLoading(false);
    });
  }, [activeSection]);

  const bankIds = React.useMemo(() => new Set(bank.map(item => item.idea.id)), [bank]);
  const allIdeas = React.useMemo(
    () => [
      ...(model?.daily ?? []),
      ...(model?.weekly ?? []),
      ...(model?.monthly ?? []),
      ...bank.map(item => item.idea),
    ],
    [bank, model],
  );
  const activePackagingIdea = React.useMemo(
    () => (packagingIdeaId ? allIdeas.find(item => item.id === packagingIdeaId) ?? null : null),
    [allIdeas, packagingIdeaId],
  );

  React.useEffect(() => {
    if (!packagingIdeaId) {
      setPackagingStepIndex(0);
      return;
    }

    setPackagingStepIndex(0);
    const interval = window.setInterval(() => {
      setPackagingStepIndex(current => Math.min(current + 1, PACKAGING_PROGRESS_STEPS.length - 1));
    }, 1700);

    return () => window.clearInterval(interval);
  }, [packagingIdeaId]);

  const toggleInterest = (interest: TrendNicheInterest) => {
    const next = selectedInterest === interest ? null : interest;
    setSelectedInterest(next);
    setModel(current => ((current?.taskInterest ?? null) === next ? current : null));
    saveTrendNicheInterests(next ? [next] : []);
  };

  const saveIdea = (idea: TrendNicheIdea) => {
    setBank(saveTrendIdeaToBank(idea));
  };

  const removeFromBank = (ideaId: string) => {
    setBank(removeTrendIdeaFromBank(ideaId));
  };

  const openComposer = (idea: TrendNicheIdea, path: 'skeleton_assembly' | 'blank_canvas') => {
    setPendingIdea(idea);
    setPendingGenerationPath(path);
    setComment('');
  };

  const confirmSend = () => {
    if (!pendingIdea) return;
    const brief = buildFounderReadyBrief({
      idea: pendingIdea,
      language: appLanguage,
      userComment: comment,
    });
    onSendIdeaToChat(pendingIdea, brief, pendingGenerationPath);
    setBank(markTrendIdeaSentToChat(pendingIdea.id));
    setPendingIdea(null);
    setComment('');
  };

  const handleBuildIdea = React.useCallback(async (idea: TrendNicheIdea) => {
    if (!onBuildIdea || packagingIdeaId) return;

    setPackagingError(null);
    setPackagingIdeaId(idea.id);

    try {
      const blueprint = await packageSelectedIdea(
        trendIdeaToProductIdea(idea, appLanguage),
        {
          googleAccessToken,
          language: appLanguage,
        },
      );
      const buildIntent = buildTrendPackagingIntent(idea, blueprint, appLanguage);
      await onBuildIdea(idea, blueprint, buildIntent);
    } catch (error) {
      setPackagingError((error as Error)?.message ?? 'Failed to package the idea.');
    } finally {
      setPackagingIdeaId(null);
    }
  }, [appLanguage, googleAccessToken, onBuildIdea, packagingIdeaId]);

  const cardBorder = '#e5e7eb';
  const textPrimary = '#111827';
  const textSecondary = '#4b5563';
  const muted = '#6b7280';

  const renderIdeaCard = (idea: TrendNicheIdea, accent: string, compact = false) => {
    const copy = getTrendIdeaText(idea, appLanguage);
    const saved = bankIds.has(idea.id);
    return (
      <div
        key={idea.id}
        style={{
          borderRadius: 8,
          border: `1px solid ${cardBorder}`,
          background: '#ffffff',
          padding: compact ? '12px' : '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minHeight: compact ? 150 : 190,
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 750, color: textPrimary, lineHeight: 1.25 }}>
              {copy.title}
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {idea.categories.slice(0, 3).map(category => {
                const interest = TREND_NICHE_INTERESTS.find(item => item.id === category);
                const chip = interest?.labels[(appLanguage || 'en').split('-')[0]] ?? interest?.labels.en ?? category;
                return (
                  <span
                    key={category}
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: accent,
                      border: `1px solid ${accent}30`,
                      background: `${accent}10`,
                      borderRadius: 6,
                      padding: '2px 6px',
                    }}
                  >
                    {chip}
                  </span>
                );
              })}
            </div>
          </div>
          <button
            onClick={() => saveIdea(idea)}
            title={saved ? labels.saved : labels.save}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: `1px solid ${saved ? 'rgba(245,158,11,0.34)' : cardBorder}`,
              background: saved ? 'rgba(245,158,11,0.1)' : '#f9fafb',
              color: saved ? '#b45309' : muted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          </button>
        </div>

        <div style={{ fontSize: 11.5, lineHeight: 1.55, color: textSecondary }}>
          {copy.description}
        </div>
        <div style={{ fontSize: 10.5, lineHeight: 1.5, color: muted }}>
          {copy.marketAngle}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', gap: 7 }}>
          <button
            onClick={() => openComposer(idea, 'skeleton_assembly')}
            style={{
              flex: 1,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${accent}55`,
              background: `${accent}12`,
              color: accent,
              fontSize: 11,
              fontWeight: 750,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <Send size={13} />
            {labels.send}
          </button>
          <button
            onClick={() => openComposer(idea, 'blank_canvas')}
            style={{
              flex: 1,
              height: 32,
              borderRadius: 8,
              border: '1px solid rgba(37,99,235,0.24)',
              background: '#eff6ff',
              color: '#1d4ed8',
              fontSize: 11,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <Zap size={13} />
            {labels.build}
          </button>
          {compact && (
            <button
              onClick={() => removeFromBank(idea.id)}
              disabled={Boolean(packagingIdeaId)}
              title={labels.delete}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: '1px solid rgba(220,38,38,0.18)',
                background: 'rgba(220,38,38,0.06)',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: packagingIdeaId ? 'wait' : 'pointer',
                opacity: packagingIdeaId ? 0.72 : 1,
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const sections: Array<{ key: 'daily' | 'weekly' | 'monthly'; title: string; ideas: TrendNicheIdea[] }> = [
    { key: 'daily', title: labels.day, ideas: model?.daily ?? [] },
    { key: 'weekly', title: labels.week, ideas: model?.weekly ?? [] },
    { key: 'monthly', title: labels.month, ideas: model?.monthly ?? [] },
  ];

  const pendingCopy = pendingIdea ? getTrendIdeaText(pendingIdea, appLanguage) : null;

  return (
    <section style={{ width: '100%', maxWidth: 900, marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(37,99,235,0.58)' }}>
          {labels.eyebrow}
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(37,99,235,0.12)' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: textPrimary, letterSpacing: 0 }}>
            {labels.title}
          </h2>
        </div>
        <button
          onClick={() => void loadIdeas(true, selectedInterest)}
          disabled={loading}
          title={labels.refresh}
          style={{
            height: 32,
            minWidth: 32,
            borderRadius: 8,
            border: '1px solid #dbeafe',
            background: '#eff6ff',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 11,
            fontWeight: 700,
            padding: '0 10px',
          }}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {loading ? labels.loading : labels.refresh}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: muted, marginRight: 2 }}>
            <Settings2 size={12} />
            {labels.interests}
          </span>
          {TREND_NICHE_INTERESTS.map(item => {
            const active = selectedInterest === item.id;
            const lang = (appLanguage || 'en').split('-')[0];
            return (
              <button
                key={item.id}
                onClick={() => toggleInterest(item.id)}
                style={{
                  height: 28,
                  borderRadius: 8,
                  border: `1px solid ${active ? 'rgba(37,99,235,0.45)' : '#e5e7eb'}`,
                  background: active ? 'rgba(37,99,235,0.1)' : '#ffffff',
                  color: active ? '#1d4ed8' : '#4b5563',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '0 9px',
                  cursor: 'pointer',
                }}
              >
                {item.labels[lang] ?? item.labels.en}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.5, color: muted }}>
          {labels.interestsHint}
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.5, color: '#2563eb', fontWeight: 700 }}>
          {labels.launchModesHint}
        </div>
      </div>

      {activePackagingIdea && (
        <div
          style={{
            marginBottom: 18,
            borderRadius: 10,
            border: '1px solid rgba(37,99,235,0.18)',
            background: 'linear-gradient(135deg, rgba(239,246,255,0.96), rgba(255,255,255,0.96))',
            padding: '13px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1d4ed8' }}>
              Packaging
            </div>
            <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: textPrimary }}>
              {getTrendIdeaText(activePackagingIdea, appLanguage).title}
            </div>
            <div style={{ marginTop: 3, fontSize: 11, color: '#1d4ed8' }}>
              {PACKAGING_PROGRESS_STEPS[packagingStepIndex]}
            </div>
          </div>
          <Loader2 size={16} className="animate-spin" color="#2563eb" />
        </div>
      )}

      {packagingError && (
        <div
          style={{
            marginBottom: 18,
            borderRadius: 8,
            border: '1px solid rgba(220,38,38,0.18)',
            background: 'rgba(254,242,242,0.95)',
            color: '#b91c1c',
            fontSize: 11.5,
            lineHeight: 1.5,
            padding: '11px 12px',
          }}
        >
          {packagingError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid #e5e7eb', paddingBottom: 0 }}>
        {([
          { key: 'ideas', label: `${labels.day} / ${labels.week} / ${labels.month}` },
          { key: 'bank', label: labels.bank },
          { key: 'archive', label: labels.archive },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: '8px 8px 0 0',
              border: '1px solid',
              borderBottom: activeSection === tab.key ? '1px solid #ffffff' : '1px solid #e5e7eb',
              borderColor: activeSection === tab.key ? '#e5e7eb' : 'transparent',
              background: activeSection === tab.key ? '#ffffff' : 'transparent',
              color: activeSection === tab.key ? '#111827' : '#6b7280',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: activeSection === tab.key ? -1 : 0,
              position: 'relative',
              zIndex: activeSection === tab.key ? 1 : 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSection === 'ideas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {sections.map((section, index) => (
            <div key={section.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 7, height: 7, borderRadius: 4, background: sectionAccent(index) }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: textPrimary, letterSpacing: 0 }}>
                  {section.title}
                </h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {section.ideas.map(idea => renderIdeaCard(idea, sectionAccent(index)))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSection === 'bank' && (
        <div>
          {bank.length === 0 ? (
            <div style={{ border: '1px dashed #d1d5db', borderRadius: 8, padding: '18px 16px', fontSize: 12, color: muted, background: '#ffffff' }}>
              {labels.emptyBank}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {bank.map(item => renderIdeaCard(item.idea, '#b45309', true))}
            </div>
          )}
        </div>
      )}

      {activeSection === 'archive' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {archiveLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: muted, fontSize: 12, padding: '12px 0' }}>
              <Loader2 size={13} className="animate-spin" /> {labels.loading}…
            </div>
          ) : archive.length === 0 ? (
            <div style={{ border: '1px dashed #d1d5db', borderRadius: 8, padding: '18px 16px', fontSize: 12, color: muted, background: '#ffffff' }}>
              {labels.archiveEmpty}
            </div>
          ) : (
            archive.map(entry => {
              const interestLabel = entry.interest ? ` · ${entry.interest}` : '';
              const sendMsg = [
                `Архив тем ${entry.date}${interestLabel}:`,
                entry.daily   ? `День: ${entry.daily}`   : '',
                entry.weekly  ? `Неделя: ${entry.weekly}`  : '',
                entry.monthly ? `Месяц: ${entry.monthly}` : '',
                '',
                'На основе этих тем предложи новые идеи для продуктов в этих направлениях.',
              ].filter(Boolean).join('\n');
              return (
                <div
                  key={entry.id}
                  style={{
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    background: '#ffffff',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: muted, letterSpacing: '0.06em' }}>
                      {entry.date}{interestLabel}
                    </span>
                    <button
                      onClick={() => {
                        const fakeIdea: TrendNicheIdea = {
                          id: entry.id,
                          appName: `Архив ${entry.date}`,
                          painPoint: '',
                          marketContext: '',
                          theme: 'archive',
                        } as unknown as TrendNicheIdea;
                        onSendIdeaToChat(fakeIdea, sendMsg, 'skeleton_assembly');
                      }}
                      style={{
                        height: 28,
                        borderRadius: 8,
                        border: '1px solid rgba(37,99,235,0.24)',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '0 10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Send size={11} />
                      {labels.archiveSendToChat}
                    </button>
                  </div>
                  {entry.daily && (
                    <div style={{ fontSize: 11, lineHeight: 1.5, color: textSecondary }}>
                      <span style={{ fontWeight: 700, color: sectionAccent(0) }}>{labels.archiveDay}: </span>
                      {entry.daily}
                    </div>
                  )}
                  {entry.weekly && (
                    <div style={{ fontSize: 11, lineHeight: 1.5, color: textSecondary }}>
                      <span style={{ fontWeight: 700, color: sectionAccent(1) }}>{labels.archiveWeek}: </span>
                      {entry.weekly}
                    </div>
                  )}
                  {entry.monthly && (
                    <div style={{ fontSize: 11, lineHeight: 1.5, color: textSecondary }}>
                      <span style={{ fontWeight: 700, color: sectionAccent(2) }}>{labels.archiveMonth}: </span>
                      {entry.monthly}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {pendingIdea && pendingCopy && (
        <div
          onClick={() => setPendingIdea(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.48)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 520,
              borderRadius: 8,
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              boxShadow: '0 24px 80px rgba(15,23,42,0.22)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 800, color: '#2563eb', letterSpacing: '0.1em' }}>
                  {labels.summary}
                </div>
                <div style={{ marginTop: 3, fontSize: 15, fontWeight: 800, color: textPrimary }}>
                  {pendingCopy.title}
                </div>
              </div>
              <button
                onClick={() => setPendingIdea(null)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: '#f9fafb',
                  color: muted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', padding: 12 }}>
                <div style={{ fontSize: 12, lineHeight: 1.55, color: textSecondary }}>
                  {pendingCopy.description}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.5, color: muted }}>
                  {pendingCopy.audience}
                </div>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: textPrimary }}>
                  {labels.comment}
                </span>
                <textarea
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  placeholder={labels.commentPlaceholder}
                  rows={4}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    padding: '10px 11px',
                    fontSize: 12,
                    color: textPrimary,
                    outline: 'none',
                    lineHeight: 1.5,
                  }}
                />
              </label>
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setPendingIdea(null)}
                style={{
                  height: 34,
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  color: textSecondary,
                  fontSize: 12,
                  fontWeight: 750,
                  padding: '0 13px',
                  cursor: 'pointer',
                }}
              >
                {labels.cancel}
              </button>
              <button
                onClick={confirmSend}
                style={{
                  height: 34,
                  borderRadius: 8,
                  border: '1px solid #1d4ed8',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '0 15px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <Send size={13} />
                {labels.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
