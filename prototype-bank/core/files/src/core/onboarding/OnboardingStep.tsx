import React from 'react';

interface OnboardingStepProps {
  step: number;
  total: number;
  title: string;
  description: string;
  options?: string[];
  selectedOptions?: string[];
  onSelect?: (option: string) => void;
}

export function OnboardingStep({ step, total, title, description, options, selectedOptions = [], onSelect }: OnboardingStepProps) {
  return (
    <div style={{ padding: '48px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ width: i === step ? 24 : 8, height: 8, borderRadius: 4, background: i === step ? '#a78bfa' : 'rgba(255,255,255,0.15)', transition: '0.2s' }} />
        ))}
      </div>
      <div>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: '#e5e5ea', margin: '0 0 12px', lineHeight: 1.2 }}>{title}</h2>
        <p style={{ fontSize: 15, color: '#6b6b7a', margin: 0, lineHeight: 1.6 }}>{description}</p>
      </div>
      {options && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {options.map(opt => (
            <button key={opt} onClick={() => onSelect?.(opt)} style={{
              padding: '14px 18px', borderRadius: 12, textAlign: 'left', cursor: 'pointer', transition: '0.15s',
              background: selectedOptions.includes(opt) ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1.5px solid ${selectedOptions.includes(opt) ? '#a78bfa' : 'rgba(255,255,255,0.08)'}`,
              color: selectedOptions.includes(opt) ? '#a78bfa' : '#e5e5ea',
              fontSize: 14, fontWeight: 500,
            }}>{opt}</button>
          ))}
        </div>
      )}
    </div>
  );
}
