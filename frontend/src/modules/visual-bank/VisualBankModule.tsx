import React, { useMemo, useState } from 'react';
import { loadPremiumComponentBank } from '../../services/PremiumComponentBankService';

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

type Tab = 'premium' | 'overview' | 'sources' | 'themes' | 'variants';

function prettyLabel(value: string): string {
  return value.replace(/-/g, ' ');
}

export function VisualBankModule() {
  const premiumBank = useMemo(() => loadPremiumComponentBank(), []);
  const [tab, setTab] = useState<Tab>('premium');
  const [activeSkeleton, setActiveSkeleton] = useState('saas-dashboard');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filteredComponents = premiumBank.components.filter(component => categoryFilter === 'all' || component.category === categoryFilter);
  const s = { color: 'var(--muted-foreground)', fontSize: 12 } as React.CSSProperties;

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--background)', color: 'var(--foreground)', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ padding: '24px 28px 0', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>🎨 Visual Bank</h2>
        <p style={{ ...s, marginTop: 4, marginBottom: 16 }}>
          File-backed design system with a curated premium component bank, verified source audit, manifests, and live previews.
        </p>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
          {(['premium', 'overview', 'sources', 'themes', 'variants'] as Tab[]).map(t => (
            <button
              key={t}
              data-testid={`visual-bank-tab-${t}`}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
                color: tab === t ? 'var(--foreground)' : 'var(--muted-foreground)',
                textTransform: 'capitalize', marginBottom: -1,
              }}
            >
              {t === 'premium' ? 'Premium Components' : t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 28px' }}>
        {tab === 'premium' && (
          <div data-testid="visual-bank-premium-panel" style={{ display: 'grid', gap: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {[
                { n: String(premiumBank.sources.filter(source => source.allowedForLocalImport).length), l: 'Verified Sources' },
                { n: String(premiumBank.components.length), l: 'Imported Components' },
                { n: String(premiumBank.recipes.length), l: 'Recipes' },
                { n: String(premiumBank.renderSafeComponents.length), l: 'Render-safe previews' },
                { n: String(premiumBank.metadataOnlyComponents.length), l: 'Metadata only' },
                { n: String(premiumBank.errors.length), l: 'Audit errors' },
              ].map(({ n, l }) => (
                <div key={l} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>{n}</div>
                  <div style={{ ...s, marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>

            <section style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Source audit status</h3>
                  <p style={{ ...s, margin: '4px 0 0' }}>Verified license metadata is loaded from source-manifest.json files.</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['all', ...Object.keys(premiumBank.coverage)].map(category => (
                    <button
                      key={category}
                      data-testid={`premium-category-filter-${category}`}
                      onClick={() => setCategoryFilter(category)}
                      style={{
                        padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', cursor: 'pointer',
                        background: categoryFilter === category ? 'var(--primary)' : 'var(--card)',
                        color: categoryFilter === category ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                        fontSize: 12,
                      }}
                    >
                      {category === 'all' ? 'All' : prettyLabel(category)}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                {premiumBank.sources.map(source => (
                  <article key={source.id} data-testid={`premium-source-${source.id}`} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{source.name}</div>
                        <div style={{ ...s, marginTop: 4 }}>{source.license}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: source.allowedForLocalImport ? '#4ade80' : '#f97316' }}>
                        {source.allowedForLocalImport ? 'verified' : 'rejected'}
                      </span>
                    </div>
                    <div style={{ ...s, fontSize: 11 }}>dependency risk: {source.dependencyRisk}</div>
                    <div style={{ ...s, fontSize: 11 }}>license file: {source.licenseFileVerified ? 'verified' : 'missing'}</div>
                    <div style={{ ...s, fontSize: 11 }}>source snapshot: {source.sourceCommitOrVersion}</div>
                    <div style={{ ...s, lineHeight: 1.5 }}>{source.notes.join(' ')}</div>
                  </article>
                ))}
              </div>
            </section>

            <section style={{ display: 'grid', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Categories coverage</h3>
                <p style={{ ...s, margin: '4px 0 0' }}>Loaded from premium-components.registry.json and validated against component manifests.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                {Object.entries(premiumBank.coverage).map(([category, count]) => (
                  <div key={category} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{count}</div>
                    <div style={{ ...s }}>{prettyLabel(category)}</div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ display: 'grid', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Component cards</h3>
                <p style={{ ...s, margin: '4px 0 0' }}>Each card is driven by manifest metadata plus a real preview adapter loaded via import.meta.glob.</p>
              </div>
              <div data-testid="premium-component-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                {filteredComponents.map(component => {
                  const Preview = component.Preview;
                  return (
                    <article key={component.id} data-testid={`premium-component-card-${component.id}`} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', display: 'grid' }}>
                      <div style={{ padding: 12, borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--card) 90%, var(--primary) 10%)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{component.name}</div>
                            <div style={{ ...s, marginTop: 4 }}>{component.id}</div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: component.renderSafe ? '#4ade80' : '#f97316' }}>
                            {component.renderSafe ? 'renderSafe' : 'metadataOnly'}
                          </span>
                        </div>
                      </div>
                      <div style={{ padding: 12, display: 'grid', gap: 12 }}>
                        <div style={{ minHeight: 220, display: 'grid' }}>
                          {Preview ? <Preview /> : <div style={{ ...s }}>No preview adapter loaded.</div>}
                        </div>
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ ...s, fontSize: 11 }}>category: {component.category} · kind: {component.kind}</div>
                          <div style={{ ...s, fontSize: 11 }}>source: {component.source} · license: {component.sourceLicense}</div>
                          <div style={{ ...s, fontSize: 11 }}>dependency risk: {component.dependencyRisk}</div>
                          <div style={{ ...s, fontSize: 11 }}>compatible skeletons: {component.compatibleSkeletons.join(', ')}</div>
                          <div style={{ ...s, fontSize: 11 }}>preview adapter: {component.previewAdapter}</div>
                          <div style={{ ...s, fontSize: 11 }}>file: {component.file}</div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {tab === 'overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 32 }}>
              {[
                { n: String(premiumBank.sources.filter(source => source.allowedForLocalImport).length), l: 'Verified premium sources' },
                { n: String(premiumBank.components.length), l: 'Premium components' },
                { n: String(premiumBank.recipes.length), l: 'Recipes' },
                { n: String(premiumBank.renderSafeComponents.length), l: 'Preview adapters' },
                { n: '8', l: 'Color Themes' },
                { n: '48', l: 'Selected variants' },
              ].map(({ n, l }) => (
                <div key={l} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>{n}</div>
                  <div style={{ ...s, marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Premium Bank Location</h3>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
              {[
                ['prototype-bank/design-packs/premium-components/_sources/', 'Source manifests, verified licenses, and import notes'],
                ['prototype-bank/design-packs/premium-components/_registry/', 'Premium registry plus recipe definitions'],
                ['prototype-bank/design-packs/premium-components/**/manifest.json', 'Real component manifests beside imported components'],
                ['prototype-bank/design-packs/premium-components/preview-adapters/', 'Live preview adapters consumed by PremiumComponentBankService'],
              ].map(([path, desc]) => (
                <div key={path} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <code style={{ fontSize: 12, color: 'var(--primary)', background: 'var(--muted)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{path}</code>
                  <span style={{ ...s, flex: 1 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'sources' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {premiumBank.sources.map(source => (
              <div key={source.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{source.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: source.allowedForLocalImport ? '#4ade80' : '#f97316' }}>
                    {source.license}
                  </span>
                </div>
                <div style={{ ...s, marginBottom: 10, fontSize: 11 }}>{source.repoUrl}</div>
                <div style={{ ...s, fontSize: 11 }}>license verified: {String(source.licenseFileVerified)}</div>
                <div style={{ ...s, fontSize: 11 }}>allowed: {String(source.allowedForLocalImport)}</div>
              </div>
            ))}
          </div>
        )}

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
                </div>
              </div>
            ))}
          </div>
        )}

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
