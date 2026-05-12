import React, { useState } from 'react';

const SOURCES = [
  { id: 'shadcn-ui',    name: 'shadcn/ui',      license: 'MIT', url: 'github.com/shadcn-ui/ui',                    categories: ['primitives','cards','inputs','tabs','dialogs'],           mood: 'universal' },
  { id: 'hyperui',      name: 'HyperUI',         license: 'MIT', url: 'github.com/markmead/hyperui',               categories: ['dashboard','feed','onboarding','navigation','stats'],        mood: 'versatile' },
  { id: 'daisyui',      name: 'daisyUI',          license: 'MIT', url: 'github.com/saadeghi/daisyui',              categories: ['themes','mobile','progress','badges'],                       mood: 'comprehensive' },
  { id: 'arco-design',  name: 'Arco Design',      license: 'MIT', url: 'github.com/arco-design/arco-design',       categories: ['tables','forms','dashboard','enterprise'],                   mood: 'enterprise' },
  { id: 'semi-design',  name: 'Semi Design',       license: 'MIT', url: 'github.com/DouyinFE/semi-design',          categories: ['creator','feed','dark-mode','media'],                        mood: 'creator' },
  { id: 'weui',         name: 'WeUI',             license: 'MIT', url: 'github.com/Tencent/weui',                  categories: ['mobile-nav','lists','mobile-first','touch'],                 mood: 'mobile' },
];

const THEMES = [
  { id: 'neutral',            name: 'Neutral',              mood: 'Calm · Universal',         mode: 'light', bg: '#fafafa',  accent: '#18181b' },
  { id: 'cool-blue',          name: 'Cool Blue',            mood: 'Professional · B2B SaaS',  mode: 'light', bg: '#f8fafc',  accent: '#2563eb' },
  { id: 'fintech-indigo',     name: 'Fintech Indigo',       mood: 'Corporate · Trading',      mode: 'dark',  bg: '#0c0e1a',  accent: '#6366f1' },
  { id: 'clinical-teal',      name: 'Clinical Teal',        mood: 'Medical · Healthcare',     mode: 'light', bg: '#f0fdfa',  accent: '#0d9488' },
  { id: 'playful-coral',      name: 'Playful Coral',        mood: 'Energetic · Consumer',     mode: 'light', bg: '#fff7f5',  accent: '#f97316' },
  { id: 'gaming-neon',        name: 'Gaming Neon',          mood: 'Intense · Esports',        mode: 'dark',  bg: '#050508',  accent: '#8b5cf6' },
  { id: 'luxury-dark-gold',   name: 'Luxury Dark Gold',     mood: 'Premium · Exclusive',      mode: 'dark',  bg: '#09080a',  accent: '#d4af37' },
  { id: 'soft-womens-health', name: "Soft Women's Health",  mood: 'Gentle · Wellness',        mode: 'light', bg: '#fdf8fb',  accent: '#ec4899' },
];

const VARIANTS = ['calm', 'premium-dark', 'playful', 'clinical', 'fintech-corporate', 'creator-social', 'minimal-brutal', 'mobile-soft'];
const SKELETONS = ['saas-dashboard', 'mobile-app', 'landing-page', 'ecommerce', 'social-community'];

const COMPONENTS = {
  primitives: ['button.tsx', 'input.tsx', 'card.tsx', 'badge.tsx', 'avatar.tsx', 'tabs.tsx'],
  cards:      ['stat-card.tsx', 'profile-card.tsx', 'metric-card.tsx', 'list-item.tsx'],
  blocks:     ['dashboard-header.tsx', 'mobile-nav.tsx', 'onboarding-step.tsx', 'feed-item.tsx', 'stats-progress.tsx', 'sidebar-nav.tsx'],
};

type Tab = 'overview' | 'sources' | 'themes' | 'components' | 'variants';

export function VisualBankModule() {
  const [tab, setTab] = useState<Tab>('overview');
  const [activeSkeleton, setActiveSkeleton] = useState('saas-dashboard');

  const s = { color: 'var(--muted-foreground)', fontSize: 12 } as React.CSSProperties;

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--background)', color: 'var(--foreground)', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '24px 28px 0', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>🎨 Visual Bank</h2>
        <p style={{ ...s, marginTop: 4, marginBottom: 16 }}>
          Real file-based design library · 6 MIT sources · 8 themes · 40 visual variants · 17 component files
        </p>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
          {(['overview','sources','themes','components','variants'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
                color: tab === t ? 'var(--foreground)' : 'var(--muted-foreground)',
                textTransform: 'capitalize', marginBottom: -1,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 28px' }}>

        {/* Overview */}
        {tab === 'overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 32 }}>
              {[
                { n: '6', l: 'MIT Sources' },
                { n: '8', l: 'Color Themes' },
                { n: '40', l: 'Visual Variants' },
                { n: '17', l: 'Component TSX' },
                { n: '5', l: 'Skeletons Covered' },
                { n: '~120', l: 'Total Files' },
              ].map(({ n, l }) => (
                <div key={l} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>{n}</div>
                  <div style={{ ...s, marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Bank Location</h3>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
              {[
                ['design-sources/', '12 files — 6 MIT-verified sources with manifest + license'],
                ['design-packs/foundation/', '14 files — tokens.css, typography.css, elevation.css, 8 theme CSS'],
                ['design-packs/surfaces/', '17 files — 6 primitives, 4 cards, 6 blocks (real TSX)'],
                ['design-packs/domain/', '45 files — 5 skeletons × 8 visual variants each'],
                ['design-packs/assets/', '13 files — 8 color ramps, 3 spacing, typography, motion presets'],
              ].map(([path, desc]) => (
                <div key={path} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <code style={{ fontSize: 12, color: 'var(--primary)', background: 'var(--muted)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{path}</code>
                  <span style={{ ...s, flex: 1 }}>{desc}</span>
                </div>
              ))}
            </div>

            <p style={{ ...s, lineHeight: 1.6 }}>
              📂 Showcase: <code style={{ fontSize: 11 }}>prototype-bank/visual-bank-showcase.html</code> — open in browser for full visual proof.
            </p>
          </div>
        )}

        {/* Sources */}
        {tab === 'sources' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {SOURCES.map(src => (
              <div key={src.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{src.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#4ade80', background: 'rgba(74,222,128,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                    {src.license}
                  </span>
                </div>
                <div style={{ ...s, marginBottom: 10, fontSize: 11 }}>{src.url}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {src.categories.map(c => (
                    <span key={c} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}>
                      {c}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: 'var(--muted-foreground)' }}>
                  📁 design-sources/{src.id}/license.md
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Themes */}
        {tab === 'themes' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {THEMES.map(theme => (
              <div key={theme.id} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ height: 72, background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: theme.accent, border: '3px solid rgba(255,255,255,0.2)' }} />
                </div>
                <div style={{ padding: '10px 14px', background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{theme.name}</div>
                  <div style={{ ...s, marginTop: 2 }}>{theme.mood}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 500, marginTop: 6, display: 'inline-block',
                    padding: '2px 8px', borderRadius: 4,
                    background: theme.mode === 'dark' ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.06)',
                    color: theme.mode === 'dark' ? '#a78bfa' : 'var(--muted-foreground)',
                  }}>
                    {theme.mode === 'light' ? '☀ Light' : '🌑 Dark'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Components */}
        {tab === 'components' && (
          <div>
            {(Object.entries(COMPONENTS) as [string, string[]][]).map(([group, files]) => (
              <div key={group} style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, textTransform: 'capitalize' }}>{group}</h3>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  {files.map(f => (
                    <div key={f} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <code style={{ fontSize: 12, color: 'var(--primary)' }}>{f}</code>
                      <span style={{ ...s, flex: 1, fontSize: 11 }}>
                        design-packs/surfaces/{group}/{f}
                      </span>
                      <span style={{ fontSize: 10, color: '#4ade80' }}>TSX</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Variants */}
        {tab === 'variants' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {SKELETONS.map(sk => (
                <button
                  key={sk}
                  onClick={() => setActiveSkeleton(sk)}
                  style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 500, borderRadius: 8,
                    border: '1px solid var(--border)', cursor: 'pointer',
                    background: activeSkeleton === sk ? 'var(--primary)' : 'var(--card)',
                    color: activeSkeleton === sk ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  }}
                >
                  {sk}
                </button>
              ))}
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', ...s, fontSize: 12, fontFamily: 'monospace' }}>
                design-packs/domain/{activeSkeleton}/visual-variants/
              </div>
              {VARIANTS.map(v => (
                <div key={v} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
                  <code style={{ fontSize: 12, color: 'var(--primary)', width: 160 }}>{v}.json</code>
                  <span style={{ ...s, flex: 1, fontSize: 11 }}>
                    Complete spec: theme · spacing · typography · radius · elevation · motion · target users
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default VisualBankModule;
