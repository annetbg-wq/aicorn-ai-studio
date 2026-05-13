/* @jsxRuntime classic */
import React from 'react';
import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';

export interface PremiumComponentProps {
  className?: string;
  title?: string;
  subtitle?: string;
  testId?: string;
}

export interface PremiumPreset {
  id: string;
  layout: string;
  title: string;
  subtitle: string;
  chips?: string[];
  items?: string[];
  accent?: string;
}

const vars = {
  bg: 'var(--vb-bg, var(--background))',
  surface: 'var(--vb-surface, var(--card))',
  text: 'var(--vb-text, var(--foreground))',
  muted: 'var(--vb-text-muted, var(--muted-foreground))',
  accent: 'var(--vb-accent, var(--primary))',
  border: 'var(--vb-border, var(--border))',
  radiusMd: 'var(--vb-radius-md, 16px)',
  radiusLg: 'var(--vb-radius-lg, 24px)',
  shadow: 'var(--vb-shadow-sm, 0 18px 40px color-mix(in srgb, var(--vb-accent, var(--primary)) 10%, transparent))',
  duration: 'var(--vb-duration-base, 180ms)',
};

const containerStyle: CSSProperties = {
  background: vars.surface,
  color: vars.text,
  border: `1px solid ${vars.border}`,
  borderRadius: vars.radiusLg,
  boxShadow: vars.shadow,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  position: 'relative',
  overflow: 'hidden',
  minHeight: 180,
};

const mutedStyle: CSSProperties = {
  color: vars.muted,
  fontSize: 13,
  lineHeight: 1.5,
};

const chipStyle: CSSProperties = {
  padding: '6px 10px',
  borderRadius: 999,
  border: `1px solid ${vars.border}`,
  color: vars.muted,
  background: 'color-mix(in srgb, var(--vb-surface, var(--card)) 85%, var(--vb-accent, var(--primary)) 15%)',
  fontSize: 12,
  fontWeight: 600,
};

const buttonStyle: CSSProperties = {
  border: `1px solid ${vars.border}`,
  borderRadius: vars.radiusMd,
  background: 'color-mix(in srgb, var(--vb-accent, var(--primary)) 20%, var(--vb-surface, var(--card)) 80%)',
  color: vars.text,
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
};

function join(parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ');
}

function Shell({ preset, className, testId, minHeight, children }: { preset: PremiumPreset; className?: string; testId?: string; minHeight?: number; children: any }) {
  return (
    <section
      data-testid={testId ?? preset.id}
      className={className}
      style={{ ...containerStyle, minHeight }}
    >
      {children}
    </section>
  );
}

function Header({ title, subtitle, chips }: { title: string; subtitle: string; chips?: string[] }) {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chips?.map((chip) => (
          <span key={chip} style={chipStyle}>{chip}</span>
        ))}
      </div>
      <div style={{ fontSize: 24, lineHeight: 1.12, fontWeight: 700 }}>{title}</div>
      <p style={{ ...mutedStyle, margin: 0 }}>{subtitle}</p>
    </header>
  );
}

function Lines({ items = [], bullet = true }: { items?: string[]; bullet?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((item) => (
        <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'center', color: vars.text, fontSize: 13 }}>
          {bullet ? <span style={{ width: 8, height: 8, borderRadius: 999, background: vars.accent, display: 'inline-block' }} /> : null}
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function StatRow({ left, right }: { left: string; right: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: vars.muted }}>{left}</span>
      <strong>{right}</strong>
    </div>
  );
}

function MiniBars() {
  const values = [32, 54, 48, 72, 66, 84, 76];
  return (
    <div style={{ display: 'flex', alignItems: 'end', gap: 8, height: 120 }}>
      {values.map((value, index) => (
        <div key={index} style={{ flex: 1, borderRadius: 999, background: `color-mix(in srgb, ${vars.accent} ${40 + index * 6}%, transparent)`, height: `${value}%`, minWidth: 12 }} />
      ))}
    </div>
  );
}

function TinyChart() {
  const points = '0,80 40,58 80,62 120,42 160,44 200,22 240,30';
  return (
    <svg viewBox="0 0 240 100" style={{ width: '100%', height: 110 }}>
      <defs>
        <linearGradient id="premium-chart-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="var(--vb-accent, var(--primary))" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--vb-accent, var(--primary))" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d="M0 90 L240 90" stroke="var(--vb-border, var(--border))" strokeDasharray="4 4" fill="none" />
      <polyline points={points} fill="none" stroke="var(--vb-accent, var(--primary))" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`0,100 ${points} 240,100`} fill="url(#premium-chart-gradient)" />
    </svg>
  );
}

function ProgressRing({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 88, height: 88, borderRadius: 999, border: `8px solid color-mix(in srgb, ${vars.accent} 18%, transparent)`, borderTopColor: vars.accent, transform: 'rotate(-45deg)', display: 'grid', placeItems: 'center' }}>
        <div style={{ transform: 'rotate(45deg)', fontWeight: 700 }}>{label}</div>
      </div>
      <div style={{ display: 'grid', gap: 8, flex: 1 }}>
        <StatRow left="Recovery" right="High" />
        <StatRow left="Energy" right="Stable" />
        <StatRow left="Focus" right="Improving" />
      </div>
    </div>
  );
}

function PhoneFrame({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
      <div style={{ width: 220, borderRadius: 36, border: `1px solid ${vars.border}`, padding: 14, background: vars.bg, boxShadow: vars.shadow }}>
        <div style={{ borderRadius: 28, background: vars.surface, border: `1px solid ${vars.border}`, padding: 14, display: 'grid', gap: 12 }}>
          <div style={{ width: 80, height: 6, borderRadius: 999, background: vars.border, justifySelf: 'center' }} />
          <div style={{ fontWeight: 700 }}>{title}</div>
          <div style={mutedStyle}>{subtitle}</div>
          <MiniBars />
        </div>
      </div>
    </div>
  );
}

function AvatarRow() {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {[0, 1, 2].map((index) => (
        <div key={index} style={{ width: 38, height: 38, borderRadius: 999, background: `color-mix(in srgb, ${vars.accent} ${25 + index * 15}%, transparent)`, border: `1px solid ${vars.border}` }} />
      ))}
    </div>
  );
}

function MediaPlate() {
  return (
    <div style={{ borderRadius: vars.radiusLg, border: `1px solid ${vars.border}`, minHeight: 140, background: 'linear-gradient(135deg, color-mix(in srgb, var(--vb-accent, var(--primary)) 18%, transparent), transparent 55%), color-mix(in srgb, var(--vb-surface, var(--card)) 78%, var(--vb-accent, var(--primary)) 22%)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '12% auto auto 10%', width: 72, height: 72, borderRadius: 999, background: 'color-mix(in srgb, var(--vb-accent, var(--primary)) 22%, transparent)', filter: 'blur(2px)' }} />
      <div style={{ position: 'absolute', right: '12%', bottom: '16%', width: 94, height: 54, borderRadius: vars.radiusMd, border: `1px solid ${vars.border}`, background: vars.surface }} />
    </div>
  );
}

function renderLayout(preset: PremiumPreset, testId?: string, className?: string, overrideTitle?: string, overrideSubtitle?: string) {
  const title = overrideTitle ?? preset.title;
  const subtitle = overrideSubtitle ?? preset.subtitle;
  switch (preset.layout) {
    case 'button':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={150}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button style={buttonStyle}>{preset.accent ?? 'Action'}</button>
            <button style={{ ...buttonStyle, background: 'transparent' }}>Secondary</button>
          </div>
          <Lines items={preset.items} />
        </Shell>
      );
    case 'input':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={170}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', border: `1px solid ${vars.border}`, borderRadius: vars.radiusMd, padding: '12px 14px', background: vars.bg }}>
            <span style={{ color: vars.muted }}>⌘</span>
            <span style={{ color: vars.text, flex: 1 }}>{preset.accent ?? 'Type a query'}</span>
            <span style={{ color: vars.muted, fontSize: 12 }}>Enter</span>
          </div>
          <Lines items={preset.items} />
        </Shell>
      );
    case 'badge':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={150}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(preset.items ?? []).concat([preset.accent ?? 'Badge']).map((chip) => <span key={chip} style={chipStyle}>{chip}</span>)}
          </div>
        </Shell>
      );
    case 'card':
    case 'routineCard':
    case 'insightCard':
    case 'statusPanel':
    case 'creatorCard':
    case 'paywallCard':
      return (
        <Shell preset={preset} className={className} testId={testId}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          {preset.layout in {paywallCard:1, creatorCard:1, insightCard:1} ? <MediaPlate /> : null}
          <Lines items={preset.items} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong>{preset.accent}</strong>
            <button style={{ ...buttonStyle, padding: '10px 14px' }}>{preset.layout === 'paywallCard' ? 'Upgrade' : 'Open'}</button>
          </div>
        </Shell>
      );
    case 'dialog':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={220}>
          <div style={{ borderRadius: vars.radiusLg, border: `1px solid ${vars.border}`, padding: 18, background: vars.bg, display: 'grid', gap: 14, maxWidth: 360 }}>
            <Header title={title} subtitle={subtitle} chips={preset.chips} />
            <Lines items={preset.items} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={{ ...buttonStyle, background: 'transparent' }}>Later</button>
              <button style={buttonStyle}>{preset.accent ?? 'Continue'}</button>
            </div>
          </div>
        </Shell>
      );
    case 'hero':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={300}>
          <div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1.2fr 1fr', alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 16 }}>
              <Header title={title} subtitle={subtitle} chips={preset.chips} />
              <Lines items={preset.items} />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button style={buttonStyle}>{preset.accent ?? 'Start'}</button>
                <button style={{ ...buttonStyle, background: 'transparent' }}>See recipe</button>
              </div>
            </div>
            <MediaPlate />
          </div>
        </Shell>
      );
    case 'featureGrid':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={260}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            {(preset.items ?? []).map((item) => (
              <div key={item} style={{ border: `1px solid ${vars.border}`, borderRadius: vars.radiusMd, padding: 14, display: 'grid', gap: 8, background: vars.bg }}>
                <strong>{item}</strong>
                <span style={mutedStyle}>Premium spacing, real manifests, live previews.</span>
              </div>
            ))}
          </div>
        </Shell>
      );
    case 'pricing':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={280}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            {(preset.items ?? []).map((item, index) => (
              <div key={item} style={{ border: `1px solid ${vars.border}`, borderRadius: vars.radiusMd, padding: 16, background: index === 1 ? 'color-mix(in srgb, var(--vb-accent, var(--primary)) 14%, var(--vb-surface, var(--card)) 86%)' : vars.bg, display: 'grid', gap: 10 }}>
                <strong>{item}</strong>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{index * 24 + 19}$</div>
                <span style={mutedStyle}>Clean feature framing for premium plans.</span>
                <button style={buttonStyle}>{index === 1 ? preset.accent ?? 'Choose' : 'Select'}</button>
              </div>
            ))}
          </div>
        </Shell>
      );
    case 'testimonial':
    case 'reviewBlock':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={240}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <AvatarRow />
          <Lines items={preset.items} bullet={false} />
          <strong>{preset.accent}</strong>
        </Shell>
      );
    case 'cta':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={200}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={buttonStyle}>{preset.accent ?? 'Start now'}</button>
            <span style={mutedStyle}>Uses real files, manifests, and preview adapters.</span>
          </div>
          <Lines items={preset.items} />
        </Shell>
      );
    case 'kpi':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={170}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
            <div>
              <div style={{ ...mutedStyle, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 34, fontWeight: 800 }}>{preset.accent}</div>
              <div style={mutedStyle}>{subtitle}</div>
            </div>
            <span style={chipStyle}>{preset.chips?.[0] ?? 'Live'}</span>
          </div>
          <MiniBars />
        </Shell>
      );
    case 'chartShell':
    case 'analyticsChart':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={260}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <TinyChart />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {(preset.items ?? []).map((item) => <StatRow key={item} left={item} right={(preset.accent ?? 'Premium') + ' ▴'} />)}
          </div>
        </Shell>
      );
    case 'tableBlock':
    case 'comparisonTable':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={250}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'grid', gap: 8 }}>
            {(preset.items ?? []).map((item, index) => (
              <div key={item} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr', gap: 10, border: `1px solid ${vars.border}`, borderRadius: vars.radiusMd, padding: 12, background: index === 0 ? 'color-mix(in srgb, var(--vb-accent, var(--primary)) 10%, var(--vb-surface, var(--card)) 90%)' : vars.bg }}>
                <strong>{item}</strong>
                <span style={{ color: vars.muted }}>Included</span>
                <span style={{ color: vars.text }}>Premium</span>
              </div>
            ))}
          </div>
        </Shell>
      );
    case 'filterBar':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={180}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...buttonStyle, flex: 1, justifyContent: 'space-between', background: vars.bg }}><span>{preset.accent ?? 'Search'}</span><span style={{ color: vars.muted }}>⌘K</span></div>
            {(preset.items ?? []).map((item) => <span key={item} style={chipStyle}>{item}</span>)}
          </div>
        </Shell>
      );
    case 'activityFeed':
    case 'feedItem':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={240}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          {preset.layout === 'feedItem' ? <MediaPlate /> : null}
          <div style={{ display: 'grid', gap: 12 }}>
            {(preset.items ?? []).map((item) => (
              <div key={item} style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: vars.accent, marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 14 }}>{item}</div>
                  <div style={mutedStyle}>{preset.accent ?? 'Moments ago'}</div>
                </div>
              </div>
            ))}
          </div>
        </Shell>
      );
    case 'phoneShell':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={320}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <PhoneFrame title={title} subtitle={subtitle} />
        </Shell>
      );
    case 'onboarding':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={290}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <MediaPlate />
          <Lines items={preset.items} />
          <button style={buttonStyle}>{preset.accent ?? 'Continue'}</button>
        </Shell>
      );
    case 'bottomNav':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={170}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
            {(preset.items ?? []).map((item) => (
              <div key={item} style={{ border: `1px solid ${vars.border}`, borderRadius: vars.radiusMd, padding: 10, textAlign: 'center', fontSize: 12 }}>{item}</div>
            ))}
          </div>
        </Shell>
      );
    case 'progressCard':
    case 'progressRing':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={240}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <ProgressRing label={preset.accent ?? '78%'} />
          <Lines items={preset.items} />
        </Shell>
      );
    case 'productCard':
      return (
        <Shell preset={preset} className={className} testId={testId}>
          <MediaPlate />
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <Lines items={preset.items} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{preset.accent}</strong>
            <button style={buttonStyle}>Add to cart</button>
          </div>
        </Shell>
      );
    case 'productGrid':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={290}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            {(preset.items ?? []).map((item) => (
              <div key={item} style={{ display: 'grid', gap: 10, border: `1px solid ${vars.border}`, borderRadius: vars.radiusMd, padding: 12, background: vars.bg }}>
                <MediaPlate />
                <strong>{item}</strong>
                <span style={mutedStyle}>Curated premium merch with local-only media fallback.</span>
              </div>
            ))}
          </div>
        </Shell>
      );
    case 'checkoutSummary':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={220}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          {(preset.items ?? []).map((item) => {
            const parts = item.split(' ');
            return <StatRow key={item} left={parts.slice(0, -1).join(' ')} right={parts[parts.length - 1]} />;
          })}
          <button style={buttonStyle}>{preset.accent ?? 'Pay now'}</button>
        </Shell>
      );
    case 'profileHeader':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={260}>
          <MediaPlate />
          <AvatarRow />
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <Lines items={preset.items} />
          <button style={buttonStyle}>{preset.accent ?? 'Follow'}</button>
        </Shell>
      );
    case 'reactionRow':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={160}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(preset.items ?? []).map((item) => <button key={item} style={{ ...buttonStyle, background: 'transparent', padding: '10px 12px' }}>{item}</button>)}
          </div>
        </Shell>
      );
    case 'animatedBackground':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={220}>
          <motion.div initial={{ opacity: 0.5, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2 }} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <motion.div animate={{ x: [0, 30, -20, 0], y: [0, -18, 22, 0] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} style={{ position: 'absolute', left: '10%', top: '14%', width: 160, height: 160, borderRadius: 999, background: 'color-mix(in srgb, var(--vb-accent, var(--primary)) 18%, transparent)', filter: 'blur(6px)' }} />
            <motion.div animate={{ x: [0, -24, 18, 0], y: [0, 16, -12, 0] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }} style={{ position: 'absolute', right: '12%', bottom: '12%', width: 150, height: 150, borderRadius: 999, background: 'color-mix(in srgb, var(--vb-accent, var(--primary)) 14%, transparent)', filter: 'blur(8px)' }} />
          </motion.div>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <Lines items={preset.items} />
          <strong style={{ marginTop: 'auto' }}>{preset.accent}</strong>
        </Shell>
      );
    case 'revealCard':
      return (
        <motion.div whileHover={{ y: -6, scale: 1.01 }} transition={{ duration: 0.22 }}>
          <Shell preset={preset} className={className} testId={testId} minHeight={210}>
            <Header title={title} subtitle={subtitle} chips={preset.chips} />
            <Lines items={preset.items} />
            <div style={{ marginTop: 'auto', color: vars.accent, fontWeight: 700 }}>{preset.accent}</div>
          </Shell>
        </motion.div>
      );
    case 'marquee':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={180}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ overflow: 'hidden', borderRadius: vars.radiusMd, border: `1px solid ${vars.border}`, padding: 10 }}>
            <motion.div animate={{ x: ['0%', '-50%'] }} transition={{ duration: 12, ease: 'linear', repeat: Infinity }} style={{ display: 'flex', gap: 12, width: 'max-content' }}>
              {[...(preset.items ?? []), ...(preset.items ?? [])].map((item, index) => <span key={`${item}-${index}`} style={chipStyle}>{item}</span>)}
            </motion.div>
          </div>
        </Shell>
      );
    case 'kpiGroup':
      return (
        <Shell preset={preset} className={className} testId={testId} minHeight={220}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            {(preset.items ?? []).map((item, index) => (
              <div key={item} style={{ border: `1px solid ${vars.border}`, borderRadius: vars.radiusMd, padding: 12, background: vars.bg }}>
                <div style={mutedStyle}>{item}</div>
                <div style={{ fontWeight: 800, fontSize: 26, marginTop: 8 }}>{['42%', '128k', '63'][index] ?? preset.accent}</div>
              </div>
            ))}
          </div>
        </Shell>
      );
    default:
      return (
        <Shell preset={preset} className={className} testId={testId}>
          <Header title={title} subtitle={subtitle} chips={preset.chips} />
          <Lines items={preset.items} />
        </Shell>
      );
  }
}

export function PremiumPresetRenderer({ preset, className, title, subtitle, testId }: PremiumComponentProps & { preset: PremiumPreset }) {
  return renderLayout(preset, testId, className, title, subtitle);
}

export function premiumPreviewThemeVars(): CSSProperties {
  return {
    ['--vb-bg' as any]: 'var(--background)',
    ['--vb-surface' as any]: 'var(--card)',
    ['--vb-text' as any]: 'var(--foreground)',
    ['--vb-text-muted' as any]: 'var(--muted-foreground)',
    ['--vb-accent' as any]: 'var(--primary)',
    ['--vb-border' as any]: 'var(--border)',
    ['--vb-radius-md' as any]: '16px',
    ['--vb-radius-lg' as any]: '24px',
    ['--vb-shadow-sm' as any]: '0 18px 40px color-mix(in srgb, var(--primary) 14%, transparent)',
    ['--vb-duration-base' as any]: '180ms',
  };
}
