import React from 'react';

interface PricingCardProps {
  name: string;
  price: string;
  features: string[];
  isPopular?: boolean;
  isSelected?: boolean;
  onSelect: () => void;
}

export function PricingCard({ name, price, features, isPopular, isSelected, onSelect }: PricingCardProps) {
  return (
    <div onClick={onSelect} style={{
      padding: '20px', borderRadius: 16, cursor: 'pointer', position: 'relative', transition: '0.15s',
      background: isSelected ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)',
      border: `1.5px solid ${isSelected || isPopular ? '#a78bfa' : 'rgba(255,255,255,0.08)'}`,
    }}>
      {isPopular && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', padding: '3px 12px', borderRadius: 20, background: '#a78bfa', color: '#fff', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>ЛУЧШИЙ ВЫБОР</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e5e5ea' }}>{name}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#a78bfa' }}>{price}</div>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {features.map(f => (
          <li key={f} style={{ fontSize: 13, color: '#9999aa', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: '#4ade80', flexShrink: 0 }}>✓</span>{f}
          </li>
        ))}
      </ul>
    </div>
  );
}
