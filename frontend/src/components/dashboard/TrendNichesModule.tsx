import React from 'react';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { TrendNichesPanel } from './TrendNichesPanel';
import type { ProductBlueprint, TrendNicheIdea } from '../../services/ideaFeedService';

interface TrendNichesModuleProps {
  appLanguage?: string;
  onBack: () => void;
  onSendIdeaToChat: (idea: TrendNicheIdea, founderBrief: string, generationPath: 'skeleton_assembly' | 'blank_canvas') => void;
  onBuildIdea?: (idea: TrendNicheIdea, blueprint: ProductBlueprint, intent: string) => void | Promise<void>;
}

const LABELS: Record<string, Record<string, string>> = {
  en: {
    title: 'Trending niches',
    back: 'Home',
  },
  ru: {
    title: 'Трендовые ниши',
    back: 'Домой',
  },
};

function labelsFor(language?: string): Record<string, string> {
  const lang = (language || 'en').toLowerCase().split('-')[0];
  return LABELS[lang] ?? LABELS.en;
}

export const TrendNichesModule: React.FC<TrendNichesModuleProps> = ({
  appLanguage = 'en',
  onBack,
  onSendIdeaToChat,
  onBuildIdea,
}) => {
  const labels = labelsFor(appLanguage);

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        background: '#f3f4f6',
        padding: '32px 32px 44px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 900, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
            <TrendingUp size={18} />
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 850, color: '#111827', letterSpacing: 0 }}>
            {labels.title}
          </h1>
        </div>
        <button
          onClick={onBack}
          style={{
            height: 34,
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: '#ffffff',
            color: '#374151',
            fontSize: 12,
            fontWeight: 750,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '0 12px',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} />
          {labels.back}
        </button>
      </div>

      <div style={{ width: '100%', maxWidth: 900, margin: '0 auto' }}>
        <TrendNichesPanel
          appLanguage={appLanguage}
          onSendIdeaToChat={onSendIdeaToChat}
          onBuildIdea={onBuildIdea}
        />
      </div>
    </div>
  );
};
