import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, BookmarkCheck, Loader2, RefreshCw, Trash2, X, Zap } from 'lucide-react';
import { GeminiService } from '../services/GeminiService';
import {
  ensureHotIdeas,
  ensureNicheIdeas,
  getIdeaFeedEventName,
  hasIdeaGenerationAccess,
  IDEA_FEED_STORAGE_KEYS,
  loadCachedHotIdeas,
  loadCachedNiches,
  normalizeProductIdea,
  type ProductBlueprint,
  type ProductIdea,
} from '../services/ideaFeedService';
import { packageSelectedIdea, PACKAGING_PROGRESS_STEPS } from '../services/ideaPackagingService';
import { useAuth } from '../contexts/AuthContext';

export type IdeaPlan = ProductBlueprint;

type Tab = 'hot' | 'niches' | 'bank';

interface BankItem {
  idea: ProductIdea;
  savedAt: string;
  launched: number;
}

interface WeeklyFeedPanelProps {
  onClose: () => void;
  onStartBlueprint: (text: string) => void;
  onLaunchWithPlan?: (
    plan: ProductBlueprint,
    intent: string,
    source?: 'chat' | 'weekly-feed' | 'niche' | 'weekly-feed-code-studio',
  ) => void;
  onOpenInCodeStudio?: (idea: {
    title: string;
    description: string;
  }) => void;
  onAddMessage?: (msg: { role: 'assistant'; content: string }) => void;
  appLanguage?: string;
}

const STORAGE_KEYS = {
  hotIdeas: IDEA_FEED_STORAGE_KEYS.hotIdeas,
  niches: IDEA_FEED_STORAGE_KEYS.niches,
  bank: IDEA_FEED_STORAGE_KEYS.bank,
} as const;

const CODE_STUDIO_INTENT_PREFIX = '__OPEN_CODE_STUDIO__';
const CODE_STUDIO_INPUT_KEY = 'AIC_CODE_STUDIO_INITIAL_INPUT';

function loadBank(): BankItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.bank) ?? '[]') as Array<{
      idea?: Record<string, unknown>;
      ideaPlan?: Record<string, unknown>;
      savedAt?: string;
      launched?: number;
    }>;
    return raw.map((item) => ({
      idea: normalizeProductIdea((item.idea ?? item.ideaPlan ?? {}) as Record<string, unknown>),
      savedAt: item.savedAt ?? new Date().toISOString(),
      launched: item.launched ?? 0,
    }));
  } catch {
    return [];
  }
}

function saveBank(bank: BankItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.bank, JSON.stringify(bank));
  } catch {
    // ignore quota issues
  }
}

function isRu(language: string): boolean {
  return language.toLowerCase().startsWith('ru');
}

function buildPackagingIntent(idea: ProductIdea, blueprint: ProductBlueprint): string {
  return [
    `${idea.title}. ${idea.pitch}`,
    `Market gap: ${idea.marketGap}`,
    `Visual direction: ${idea.visualTag}`,
    blueprint.packageSummary,
  ].join('\n');
}

export const WeeklyFeedPanel: React.FC<WeeklyFeedPanelProps> = ({
  onClose,
  onStartBlueprint,
  onLaunchWithPlan,
  onOpenInCodeStudio,
  onAddMessage,
  appLanguage = 'en',
}) => {
  const ru = isRu(appLanguage);
  const { googleAccessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('hot');
  const [hotIdeas, setHotIdeas] = useState<ProductIdea[]>([]);
  const [niches, setNiches] = useState<ProductIdea[]>([]);
  const [bank, setBank] = useState<BankItem[]>(() => loadBank());
  const [hotLoading, setHotLoading] = useState(true);
  const [nicheLoading, setNicheLoading] = useState(true);
  const [hotError, setHotError] = useState<string | null>(null);
  const [nicheError, setNicheError] = useState<string | null>(null);
  const [packagingIdeaId, setPackagingIdeaId] = useState<string | null>(null);
  const [packagingStepIndex, setPackagingStepIndex] = useState(0);
  const [packagingError, setPackagingError] = useState<string | null>(null);

  const freeRemaining = GeminiService.getRemainingFreeQuota();
  const hasKey = hasIdeaGenerationAccess(googleAccessToken);

  const packagingStep = PACKAGING_PROGRESS_STEPS[packagingStepIndex] ?? PACKAGING_PROGRESS_STEPS[0];

  useEffect(() => {
    if (!packagingIdeaId) {
      setPackagingStepIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setPackagingStepIndex((prev) => (prev + 1) % PACKAGING_PROGRESS_STEPS.length);
    }, 1400);
    return () => window.clearInterval(timer);
  }, [packagingIdeaId]);

  const generateHot = useCallback(async (force = false) => {
    setHotLoading(true);
    setHotError(null);
    if (!force) {
      const cached = loadCachedHotIdeas();
      if (cached.length > 0) {
        setHotIdeas(cached);
        setHotLoading(false);
        return;
      }
    }

    if (!hasKey) {
      setHotError('no-key');
      setHotLoading(false);
      return;
    }

    try {
      setHotIdeas(await ensureHotIdeas(googleAccessToken, force));
    } catch (error) {
      setHotError(String(error));
    } finally {
      setHotLoading(false);
    }
  }, [googleAccessToken, hasKey]);

  const generateNiches = useCallback(async (force = false) => {
    setNicheLoading(true);
    setNicheError(null);
    if (!force) {
      const cached = loadCachedNiches();
      if (cached.length > 0) {
        setNiches(cached);
        setNicheLoading(false);
        return;
      }
    }

    if (!hasKey) {
      setNicheError('no-key');
      setNicheLoading(false);
      return;
    }

    try {
      setNiches(await ensureNicheIdeas(googleAccessToken, force));
    } catch (error) {
      setNicheError(String(error));
    } finally {
      setNicheLoading(false);
    }
  }, [googleAccessToken, hasKey]);

  useEffect(() => {
    void generateHot();
    void generateNiches();
  }, [generateHot, generateNiches]);

  useEffect(() => {
    const eventName = getIdeaFeedEventName();
    const syncIdeaFeed = ((event?: Event) => {
      const detail = (event as CustomEvent<{ key?: string }> | undefined)?.detail;
      if (!detail?.key || detail.key === STORAGE_KEYS.hotIdeas) {
        setHotIdeas(loadCachedHotIdeas());
      }
      if (!detail?.key || detail.key === STORAGE_KEYS.niches) {
        setNiches(loadCachedNiches());
      }
    }) as EventListener;

    window.addEventListener(eventName, syncIdeaFeed);
    return () => window.removeEventListener(eventName, syncIdeaFeed);
  }, []);

  const isInBank = useCallback((id: string) => bank.some((item) => item.idea.id === id), [bank]);

  const toggleBank = useCallback((idea: ProductIdea) => {
    const existing = loadBank();
    if (existing.some((item) => item.idea.id === idea.id)) {
      const updated = existing.filter((item) => item.idea.id !== idea.id);
      saveBank(updated);
      setBank(updated);
      return;
    }

    const updated = [{ idea, savedAt: new Date().toISOString(), launched: 0 }, ...existing];
    saveBank(updated);
    setBank(updated);
  }, []);

  const removeFromBank = useCallback((id: string) => {
    const updated = loadBank().filter((item) => item.idea.id !== id);
    saveBank(updated);
    setBank(updated);
  }, []);

  const updateLaunchCounter = useCallback((ideaId: string) => {
    const existing = loadBank();
    const index = existing.findIndex((item) => item.idea.id === ideaId);
    if (index === -1) return;
    existing[index].launched += 1;
    saveBank(existing);
    setBank(existing);
  }, []);

  const handleBuildIdea = useCallback(async (idea: ProductIdea, source: 'weekly-feed' | 'niche') => {
    setPackagingError(null);
    setPackagingIdeaId(idea.id);
    setPackagingStepIndex(0);
    try {
      const blueprint = await packageSelectedIdea(idea, {
        googleAccessToken,
        language: ru ? 'ru' : 'en',
      });
      updateLaunchCounter(idea.id);

      const intent = buildPackagingIntent(idea, blueprint);
      onAddMessage?.({
        role: 'assistant',
        content: [
          `🧠 ${ru ? 'Идея упакована в Blueprint' : 'Idea packaged into blueprint'}: **${blueprint.appName}**`,
          '',
          `**${ru ? 'Почему купят' : 'Why buyers care'}:** ${idea.marketGap}`,
          `**${ru ? 'Монетизация' : 'Monetization'}:** ${blueprint.monetization.model}`,
          `**${ru ? 'UI-направление' : 'UI direction'}:** ${blueprint.visualTag}`,
          `**${ru ? 'Файлы' : 'Files'}:** ${blueprint.fileArchitecture.length}`,
          '',
          ru
            ? 'Полный blueprint добавлен в context pack. Нажмите Send, чтобы кодер строил по нему.'
            : 'The full blueprint is now in the context pack. Press Send to build from it.',
        ].join('\n'),
      });

      if (onLaunchWithPlan) {
        onLaunchWithPlan(blueprint, intent, source);
      } else {
        onStartBlueprint(intent);
      }
      onClose();
    } catch (error) {
      setPackagingError(String(error));
    } finally {
      setPackagingIdeaId(null);
    }
  }, [googleAccessToken, onAddMessage, onClose, onLaunchWithPlan, onStartBlueprint, ru, updateLaunchCounter]);

  const openIdeaInCodeStudio = useCallback((idea: ProductIdea) => {
    const payload = { title: idea.title, description: idea.pitch };
    try {
      localStorage.setItem(CODE_STUDIO_INPUT_KEY, `${payload.title}: ${payload.description}`);
    } catch {
      // ignore quota issues
    }

    if (onOpenInCodeStudio) {
      onOpenInCodeStudio(payload);
      onClose();
      return;
    }

    if (onLaunchWithPlan) {
      onLaunchWithPlan({
        id: idea.id,
        sourceIdea: idea,
        appName: idea.title,
        description: idea.pitch,
        theme: 'dark-slate',
        visualTag: idea.visualTag,
        packageSummary: idea.marketGap,
        layout: { type: 'dashboard', navigation: 'sidebar' },
        pages: [],
        shadcnComponents: [],
        icons: [],
        authFlow: { type: 'none', onboardingSteps: [] },
        monetization: { model: 'freemium', paywall: { trigger: '', limits: [], upgradeMessage: '' } },
        databaseSchema: { sql: '', tables: [] },
        aiLogic: { features: [] },
        fileArchitecture: [],
        premiumUiDirectives: [],
      }, `${CODE_STUDIO_INTENT_PREFIX}${payload.title}: ${payload.description}`, 'weekly-feed-code-studio');
      onClose();
    }
  }, [onClose, onLaunchWithPlan, onOpenInCodeStudio]);

  const tabStyle = useCallback((tab: Tab): React.CSSProperties => ({
    flex: 1,
    padding: '7px 4px',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    borderRadius: 7,
    background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: activeTab === tab ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.34)',
  }), [activeTab]);

  const renderLoader = (label: string) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'rgba(255,255,255,0.38)' }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: 11 }}>{label}</span>
    </div>
  );

  const renderError = (error: string, retry: () => void) => (
    <div style={{ padding: '20px 14px', textAlign: 'center', color: 'rgba(255,255,255,0.48)', fontSize: 11, lineHeight: 1.5 }}>
      <div style={{ marginBottom: 10 }}>
        {error === 'no-key'
          ? (ru ? 'Настройте API ключ в Settings, чтобы генерировать идеи.' : 'Set an API key in Settings to generate ideas.')
          : error}
      </div>
      <button
        onClick={retry}
        style={{
          padding: '7px 10px',
          borderRadius: 8,
          border: '1px solid rgba(96,165,250,0.35)',
          background: 'rgba(96,165,250,0.14)',
          color: '#60a5fa',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {ru ? 'Повторить' : 'Retry'}
      </button>
    </div>
  );

  const activePackagingIdea = useMemo(
    () => [...hotIdeas, ...niches, ...bank.map((item) => item.idea)].find((idea) => idea.id === packagingIdeaId) ?? null,
    [bank, hotIdeas, niches, packagingIdeaId],
  );

  const renderCard = (idea: ProductIdea, source: 'weekly-feed' | 'niche') => {
    const packaging = packagingIdeaId === idea.id;
    const saved = isInBank(idea.id);

    return (
      <div
        key={idea.id}
        style={{
          borderRadius: 12,
          padding: '12px 12px 11px',
          marginBottom: 8,
          background: 'rgba(255,255,255,0.024)',
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.9)', lineHeight: 1.3 }}>
              {idea.title}
            </div>
            <div style={{ marginTop: 4, fontSize: 10.5, color: 'rgba(255,255,255,0.54)', lineHeight: 1.45 }}>
              {idea.pitch}
            </div>
          </div>
          <button
            onClick={() => toggleBank(idea)}
            title={saved ? (ru ? 'Убрать из банка' : 'Remove from bank') : (ru ? 'Сохранить в банк' : 'Save to bank')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: saved ? '#fbbf24' : 'rgba(255,255,255,0.3)' }}
          >
            {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9.5, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', borderRadius: 999, padding: '3px 7px' }}>
            {idea.visualTag}
          </span>
          {idea.unfairAdvantage && (
            <span style={{ fontSize: 9.5, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', borderRadius: 999, padding: '3px 7px' }}>
              {ru ? 'Unfair Advantage' : 'Unfair Advantage'}
            </span>
          )}
        </div>

        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
          <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{ru ? 'Market gap:' : 'Market gap:'}</strong> {idea.marketGap}
        </div>

        {idea.unfairAdvantage && (
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.46)', lineHeight: 1.45 }}>
            <strong>{ru ? 'Преимущество:' : 'Advantage:'}</strong> {idea.unfairAdvantage}
          </div>
        )}

        {idea.buyerReason && (
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.46)', lineHeight: 1.45 }}>
            <strong>{ru ? 'Почему купят:' : 'Why buy:'}</strong> {idea.buyerReason}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => void handleBuildIdea(idea, source)}
            disabled={packagingIdeaId !== null}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: 8,
              border: '1px solid rgba(74,222,128,0.3)',
              background: 'rgba(74,222,128,0.12)',
              color: '#4ade80',
              fontSize: 10.5,
              fontWeight: 700,
              cursor: packagingIdeaId !== null ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            {packaging ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={11} />}
            {packaging ? (ru ? 'Packaging...' : 'Packaging...') : (ru ? 'Build this' : 'Build this')}
          </button>

          {(onOpenInCodeStudio || onLaunchWithPlan) && (
            <button
              onClick={() => openIdeaInCodeStudio(idea)}
              style={{
                padding: '7px 10px',
                borderRadius: 8,
                border: '1px solid rgba(167,139,250,0.3)',
                background: 'rgba(167,139,250,0.12)',
                color: '#a78bfa',
                fontSize: 10.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Code Studio
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: 56,
          top: 0,
          width: 370,
          height: '100dvh',
          background: '#0b0b11',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 220,
          animation: 'panelSlide 0.22s ease',
        }}
      >
        <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                {ru ? 'Discovery Feed' : 'Discovery Feed'}
              </div>
              <div style={{ marginTop: 3, fontSize: 10, color: 'rgba(255,255,255,0.42)', lineHeight: 1.4 }}>
                {ru
                  ? 'Сначала концепт, потом полная упаковка в blueprint перед кодингом.'
                  : 'Discovery concepts first, full blueprint packaging before coding.'}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 6 }}>
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {freeRemaining > 0 ? (
              <span style={{ fontSize: 10, color: '#4ade80' }}>
                {ru ? `Бесплатных идей осталось: ${freeRemaining}` : `Free ideas left: ${freeRemaining}`}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                {ru ? 'Для генерации нужен ключ или dev-agent' : 'Generation needs an API key or dev-agent'}
              </span>
            )}
          </div>
        </div>

        {activePackagingIdea && (
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(74,222,128,0.05)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#4ade80' }}>
              {ru ? `Packaging: ${activePackagingIdea.title}` : `Packaging: ${activePackagingIdea.title}`}
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.62)' }}>
              {packagingStep}
            </div>
          </div>
        )}

        {packagingError && (
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f87171', fontSize: 10.5 }}>
            {packagingError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, padding: '8px 10px 6px' }}>
          <button style={tabStyle('hot')} onClick={() => setActiveTab('hot')}>
            {ru ? 'Hot Ideas' : 'Hot Ideas'}
          </button>
          <button style={tabStyle('niches')} onClick={() => setActiveTab('niches')}>
            {ru ? 'Trending Niches' : 'Trending Niches'}
          </button>
          <button style={tabStyle('bank')} onClick={() => setActiveTab('bank')}>
            {ru ? `Bank (${bank.length})` : `Bank (${bank.length})`}
          </button>
        </div>

        {activeTab === 'hot' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 6px' }}>
              <button
                onClick={() => void generateHot(true)}
                disabled={hotLoading}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.32)', cursor: hotLoading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}
              >
                <RefreshCw size={10} style={hotLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
                {ru ? 'Обновить' : 'Refresh'}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 14px' }}>
              {hotLoading
                ? renderLoader(ru ? 'Генерируем discovery-концепты...' : 'Generating discovery concepts...')
                : hotError
                  ? renderError(hotError, () => void generateHot(true))
                  : hotIdeas.map((idea) => renderCard(idea, 'weekly-feed'))}
            </div>
          </>
        )}

        {activeTab === 'niches' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 6px' }}>
              <button
                onClick={() => void generateNiches(true)}
                disabled={nicheLoading}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.32)', cursor: nicheLoading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}
              >
                <RefreshCw size={10} style={nicheLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
                {ru ? 'Обновить' : 'Refresh'}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 14px' }}>
              {nicheLoading
                ? renderLoader(ru ? 'Ищем трендовые ниши...' : 'Finding trending niches...')
                : nicheError
                  ? renderError(nicheError, () => void generateNiches(true))
                  : niches.map((idea) => renderCard(idea, 'niche'))}
            </div>
          </>
        )}

        {activeTab === 'bank' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px 14px' }}>
            {bank.length === 0 ? (
              <div style={{ padding: '42px 14px', textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 11 }}>
                {ru ? 'Сохраняйте концепты сюда и упаковывайте позже.' : 'Save concepts here and package them later.'}
              </div>
            ) : bank.map((item) => (
              <div key={item.idea.id} style={{ position: 'relative' }}>
                {renderCard(item.idea, 'weekly-feed')}
                <button
                  onClick={() => removeFromBank(item.idea.id)}
                  title={ru ? 'Удалить из банка' : 'Remove from bank'}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: 10,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(255,255,255,0.24)',
                  }}
                >
                  <Trash2 size={12} />
                </button>
                <div style={{ marginTop: -2, marginBottom: 8, paddingLeft: 2, fontSize: 9, color: 'rgba(255,255,255,0.24)' }}>
                  {ru ? `Сохранено ${new Date(item.savedAt).toLocaleDateString()}` : `Saved ${new Date(item.savedAt).toLocaleDateString()}`}
                  {item.launched > 0 ? ` · ${ru ? `Упаковано ${item.launched}x` : `Packaged ${item.launched}x`}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes panelSlide {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};
